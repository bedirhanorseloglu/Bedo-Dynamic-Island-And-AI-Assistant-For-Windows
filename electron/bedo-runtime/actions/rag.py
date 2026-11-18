"""
Dinamik Model Keşifli Çoklu Sağlayıcı Canlı Web RAG ve Yerel Belge RAG.

- Hiçbir model adını statik olarak sabitlemez; API üzerinden mevcut en güncel modeli
  otomatik keşfeder (Gemini / OpenAI GPT / Anthropic Claude).
- Kullanıcı Gemini, OpenAI (GPT) veya Anthropic (Claude) anahtarlarından hangisini
  eklediyse canlı web araması (RAG) onun üzerinden otomatik çalışır.
- local_rag_query: Masaüstü, Belgeler veya İndirilenler içindeki yerel belgelerden
  TF-IDF benzerliğiyle en alakalı parçaları getirir.
"""

from __future__ import annotations

import json
import math
import os
import re
import time
import urllib.request
from collections import Counter, deque
from pathlib import Path
from typing import Iterable

from google import genai  # type: ignore[reportMissingImports]
from google.genai import types  # type: ignore[reportMissingImports]

from actions.open_app import _fold_key, _get_special_folders
from app_config import get_app_config_value

_TEXT_EXTS = {".txt", ".md", ".markdown", ".csv", ".json", ".log", ".py", ".js", ".jsx", ".ts"}
_SKIP_DIRS = {
    "windows", "$recycle.bin", "node_modules", ".git", "__pycache__",
    "venv", ".venv", "appdata", "dist", "build",
}

_MODEL_CACHE: dict[str, str] = {}


def _extract_version_tuple(model_id: str) -> tuple[int, ...]:
    # Tarih eklerini (-20260101 veya -2026-01-01) sürüm numarası sanmamak için temizle
    cleaned = re.sub(r"[-_]?20\d{2}(?:[-_]?\d{2}){2}\b", "", model_id or "")
    nums = [int(x) for x in re.findall(r"\d+", cleaned)]
    return tuple(nums[:4]) if nums else (0,)


def rank_gemini_models(model_names: Iterable[str]) -> list[str]:
    """Mevcut Gemini modelleri arasından canlı arama için en güncelden başlayarak sıralı liste döner."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    excluded = ("embedding", "imagen", "veo", "tts", "audio", "robotics", "aqa", "live")
    for raw in model_names:
        name = str(raw or "").replace("models/", "").strip()
        low = name.lower()
        if not low.startswith("gemini-") or any(bad in low for bad in excluded):
            continue
        ver = _extract_version_tuple(low)
        if "carbon" in low:
            tier = 5
        elif "argon" in low:
            tier = 4
        elif "flash" in low and "lite" not in low:
            tier = 3
        elif "pro" in low:
            tier = 2
        else:
            tier = 1
        stability = 0 if ("exp" in low or "preview" in low) else 1
        candidates.append((ver, tier * 10 + stability, name))
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    seen: set[str] = set()
    ordered: list[str] = []
    for _, _, name in candidates:
        if name not in seen:
            seen.add(name)
            ordered.append(name)
    return ordered


def select_latest_gemini_model(model_names: Iterable[str]) -> str | None:
    """Mevcut Gemini modelleri arasından canlı arama destekleyen en güncelini seçer."""
    ranked = rank_gemini_models(model_names)
    return ranked[0] if ranked else None


def select_latest_openai_model(model_ids: Iterable[str]) -> str | None:
    """OpenAI modelleri arasından en güncel sohbet/arama modelini seçer."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    excluded = ("audio", "realtime", "transcribe", "tts", "image", "embedding", "whisper", "dall-e", "moderation")
    for raw in model_ids:
        mid = str(raw or "").strip()
        low = mid.lower()
        if any(bad in low for bad in excluded):
            continue
        if not (low.startswith("gpt-") or low.startswith("o3") or low.startswith("o4")):
            continue
        ver = _extract_version_tuple(low)
        bonus = 3 if "gpt-6" in low else 2 if ("gpt-5" in low or "gpt-4" in low) else 1
        candidates.append((ver, bonus, mid))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def select_latest_anthropic_model(model_ids: Iterable[str]) -> str | None:
    """Anthropic Claude modelleri arasından en güncelini seçer."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    for raw in model_ids:
        mid = str(raw or "").strip()
        low = mid.lower()
        if not low.startswith("claude-"):
            continue
        ver = _extract_version_tuple(low)
        if "opus" in low:
            tier = 4
        elif "fable" in low:
            tier = 3
        elif "sonnet" in low:
            tier = 2
        else:
            tier = 1
        candidates.append((ver, tier, mid))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


_GEMINI_RANKED_CACHE: list[str] = []
_PROVIDER_COOLDOWN_UNTIL: dict[str, float] = {}


def clear_rag_caches() -> None:
    """Yeni API anahtarı girildiğinde model ve kota önbelleğini temizler."""
    _MODEL_CACHE.clear()
    _GEMINI_RANKED_CACHE.clear()
    _PROVIDER_COOLDOWN_UNTIL.clear()


def _resolve_ranked_gemini_models(client: genai.Client) -> list[str]:
    if _GEMINI_RANKED_CACHE:
        return list(_GEMINI_RANKED_CACHE)
    try:
        names: list[str] = []
        for m in client.models.list():
            methods = getattr(m, "supported_actions", None) or getattr(m, "supported_generation_methods", None) or []
            if methods and not any("generate" in str(a).lower() for a in methods):
                continue
            m_name = getattr(m, "name", "")
            if m_name:
                names.append(m_name)
        ranked = rank_gemini_models(names)
        if ranked:
            top = ranked[:8]
            if "gemini-flash-latest" not in top:
                top.append("gemini-flash-latest")
            _GEMINI_RANKED_CACHE[:] = top
            return list(top)
    except Exception:
        pass
    return ["gemini-flash-latest"]


def _http_json(url: str, headers: dict[str, str], payload: dict | None = None, timeout: float = 15.0) -> dict:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if payload is not None else "GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def _web_rag_gemini(prompt: str, api_key: str, max_tokens: int = 200) -> str:
    client = genai.Client(api_key=api_key)
    models_to_try = _resolve_ranked_gemini_models(client)
    last_err: Exception | None = None
    for model_id in models_to_try:
        try:
            resp = client.models.generate_content(
                model=model_id,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    temperature=0.2,
                    max_output_tokens=max_tokens,
                ),
            )
            text = str(getattr(resp, "text", "") or "").strip()
            if text:
                return text
        except Exception as exc:
            last_err = exc
            msg = str(exc)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "401" in msg or "403" in msg:
                _PROVIDER_COOLDOWN_UNTIL["gemini"] = time.monotonic() + 120.0
                break
            continue
    if last_err is not None:
        raise last_err
    return ""


def _web_rag_openai(prompt: str, api_key: str, max_tokens: int = 200) -> str:
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    model_id = _MODEL_CACHE.get("openai")
    if not model_id:
        models_resp = _http_json("https://api.openai.com/v1/models", headers=headers, timeout=8.0)
        ids = [m.get("id", "") for m in models_resp.get("data", []) if isinstance(m, dict)]
        model_id = select_latest_openai_model(ids)
        if not model_id:
            raise RuntimeError("Kullanılabilir güncel OpenAI modeli bulunamadı.")
        _MODEL_CACHE["openai"] = model_id

    try:
        resp = _http_json(
            "https://api.openai.com/v1/responses",
            headers=headers,
            payload={
                "model": model_id,
                "tools": [{"type": "web_search_preview"}],
                "input": prompt,
            },
            timeout=20.0,
        )
        if resp.get("output_text"):
            return str(resp["output_text"]).strip()
        for item in resp.get("output", []):
            for content in item.get("content", []):
                if content.get("text"):
                    return str(content["text"]).strip()
    except Exception:
        pass

    chat = _http_json(
        "https://api.openai.com/v1/chat/completions",
        headers=headers,
        payload={
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": max_tokens,
        },
        timeout=20.0,
    )
    return str(chat.get("choices", [{}])[0].get("message", {}).get("content", "") or "").strip()


def _web_rag_anthropic(prompt: str, api_key: str, max_tokens: int = 200, max_uses: int = 2) -> str:
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    model_id = _MODEL_CACHE.get("anthropic")
    if not model_id:
        models_resp = _http_json("https://api.anthropic.com/v1/models", headers=headers, timeout=8.0)
        ids = [m.get("id", "") for m in models_resp.get("data", []) if isinstance(m, dict)]
        model_id = select_latest_anthropic_model(ids)
        if not model_id:
            raise RuntimeError("Kullanılabilir güncel Claude modeli bulunamadı.")
        _MODEL_CACHE["anthropic"] = model_id

    resp = _http_json(
        "https://api.anthropic.com/v1/messages",
        headers=headers,
        payload={
            "model": model_id,
            "max_tokens": max_tokens,
            "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": max_uses}],
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=20.0,
    )
    texts = [blk.get("text", "") for blk in resp.get("content", []) if isinstance(blk, dict) and blk.get("type") == "text"]
    return "\n".join(t for t in texts if t).strip()


def _resolve_provider_keys(explicit_gemini_key: str = "") -> dict[str, str]:
    gemini_key = (
        (explicit_gemini_key or "").strip()
        or (os.environ.get("BEDO_GEMINI_API_KEY") or "").strip()
        or (os.environ.get("GEMINI_API_KEY") or "").strip()
        or str(get_app_config_value("gemini_api_key", "") or "").strip()
    )
    openai_key = (
        (os.environ.get("BEDO_OPENAI_API_KEY") or "").strip()
        or (os.environ.get("OPENAI_API_KEY") or "").strip()
        or str(get_app_config_value("openai_api_key", "") or "").strip()
    )
    anthropic_key = (
        (os.environ.get("BEDO_ANTHROPIC_API_KEY") or "").strip()
        or (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
        or str(get_app_config_value("anthropic_api_key", "") or "").strip()
    )
    return {"gemini": gemini_key, "openai": openai_key, "anthropic": anthropic_key}


def _web_rag_free_fallback(query: str) -> str:
    """Sağlayıcı API kotası dolduğunda veya anahtar yoksa genel amaçlı ücretsiz Web RAG yedeği."""
    import html as _html
    import urllib.parse
    import xml.etree.ElementTree as ET

    q = query.strip()
    enc = urllib.parse.quote_plus(q)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    # 1) Google News RSS canlı güncel arama sonuçları (+ sayfa özeti)
    try:
        req = urllib.request.Request(
            f"https://news.google.com/rss/search?q={enc}&hl=tr&gl=TR&ceid=TR:tr",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
        items = root.findall(".//item")
        lines: list[str] = []
        for it in items[:6]:
            title = (it.findtext("title") or "").strip()
            pub = (it.findtext("pubDate") or "").strip()
            desc = re.sub(r"<[^>]+>", "", _html.unescape(it.findtext("description") or "")).strip()
            if title:
                entry = f"- {title}"
                if pub:
                    entry += f" ({pub})"
                if desc and desc != title:
                    entry += f": {desc[:220]}"
                lines.append(entry)
        if lines:
            return "Canlı arama özetleri:\n" + "\n".join(lines)
    except Exception:
        pass

    # 3) Türkçe Wikipedia genel bilgi özeti
    try:
        wiki = _http_json(
            f"https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc}&format=json",
            headers={"User-Agent": "BedoAssistant/1.0"},
            timeout=6.0,
        )
        hits = wiki.get("query", {}).get("search", [])
        if hits:
            snips = []
            for h in hits[:3]:
                s = re.sub(r"<[^>]+>", "", _html.unescape(h.get("snippet", ""))).strip()
                if s:
                    snips.append(f"- {h.get('title', '')}: {s}")
            if snips:
                return "Wikipedia özetleri:\n" + "\n".join(snips)
    except Exception:
        pass

    return ""


def web_search_answer(query: str, api_key: str = "", detail: str = "concise") -> str:
    """Yapılandırılmış en güncel sağlayıcı üzerinden iki aşamalı (kısa/derin) Web RAG araması yapar."""
    q = str(query or "").strip()
    if not q:
        return "Aranacak soru belirtilmedi."

    keys = _resolve_provider_keys(api_key)
    if not any(keys.values()):
        return "Canlı arama için Gemini, OpenAI (GPT) veya Anthropic (Claude) API anahtarı bulunamadı."

    is_deep = str(detail or "").strip().lower() == "deep"
    max_tokens = 900 if is_deep else 180
    if is_deep:
        prompt = (
            "Aşağıdaki soruyu canlı web arama sonuçlarına dayanarak Türkçe araştır. "
            "Nedenleri, önemli tarihleri, sayıları ve bağlamı net, düzenli ve doyurucu şekilde özetle; "
            "kaynaklarda net yoksa tahmin yürütme.\n\n"
            f"Soru: {q}"
        )
    else:
        prompt = (
            "Aşağıdaki soruyu canlı web arama sonuçlarına dayanarak Türkçe, tek veya en fazla iki net cümleyle yanıtla. "
            "Doğrudan kesin cevabı (skor, tarih, isim, sayı) ver; gereksiz giriş veya ek yorum yapma. "
            "Kaynaklarda net yoksa tahmin yürütme.\n\n"
            f"Soru: {q}"
        )

    errors: list[str] = []
    now_m = time.monotonic()
    if keys["gemini"] and now_m >= _PROVIDER_COOLDOWN_UNTIL.get("gemini", 0.0):
        try:
            text = _web_rag_gemini(prompt, keys["gemini"], max_tokens=max_tokens)
            if text:
                return text
        except Exception as exc:
            errors.append(f"Gemini: {exc}")

    if keys["openai"] and now_m >= _PROVIDER_COOLDOWN_UNTIL.get("openai", 0.0):
        try:
            text = _web_rag_openai(prompt, keys["openai"], max_tokens=max_tokens)
            if text:
                return text
        except Exception as exc:
            if "401" in str(exc) or "429" in str(exc):
                _PROVIDER_COOLDOWN_UNTIL["openai"] = time.monotonic() + 120.0
            errors.append(f"OpenAI: {exc}")

    if keys["anthropic"] and now_m >= _PROVIDER_COOLDOWN_UNTIL.get("anthropic", 0.0):
        try:
            text = _web_rag_anthropic(
                prompt,
                keys["anthropic"],
                max_tokens=max_tokens,
                max_uses=4 if is_deep else 2,
            )
            if text:
                return text
        except Exception as exc:
            if "401" in str(exc) or "429" in str(exc):
                _PROVIDER_COOLDOWN_UNTIL["anthropic"] = time.monotonic() + 120.0
            errors.append(f"Claude: {exc}")

    fallback = _web_rag_free_fallback(q)
    if fallback:
        return fallback

    if errors:
        return f"Canlı web araması başarısız oldu: {' | '.join(errors)}"
    return "Arama sonucunda net bir yanıt bulunamadı."


def _tokenize(text: str) -> list[str]:
    folded = _fold_key(text)
    return [t for t in re.findall(r"[a-z0-9]+", folded) if len(t) >= 2]


def _chunk_text(text: str, chunk_size: int = 420, overlap: int = 80) -> list[str]:
    clean = re.sub(r"\s+", " ", text or "").strip()
    if not clean:
        return []
    chunks: list[str] = []
    start = 0
    step = max(80, chunk_size - overlap)
    while start < len(clean):
        chunks.append(clean[start : start + chunk_size])
        start += step
        if len(chunks) >= 40:
            break
    return chunks


def _collect_local_files(scope: str = "all", max_files: int = 60) -> list[Path]:
    folders = _get_special_folders()
    home = Path.home()
    roots: list[Path] = []

    sc = _fold_key(scope or "all")
    if sc and sc not in {"all", "hepsi", "genel"}:
        candidate = Path(os.path.expandvars(os.path.expanduser(scope.strip())))
        if candidate.exists():
            if candidate.is_file():
                return [candidate]
            roots.append(candidate)

    if not roots:
        if "desktop" in sc or "masaustu" in sc:
            roots = [folders["desktop"], home / "OneDrive" / "Masaüstü", home / "Desktop"]
        elif "download" in sc or "indirilen" in sc:
            roots = [folders["downloads"]]
        elif "doc" in sc or "belge" in sc:
            roots = [folders["documents"]]
        else:
            roots = [folders["desktop"], folders["documents"], folders["downloads"]]

    seen: set[str] = set()
    files: list[Path] = []
    queue: deque[Path] = deque(r for r in roots if r.exists())
    visited: set[str] = set()

    while queue and len(files) < max_files:
        cur = queue.popleft()
        cur_k = str(cur).lower()
        if cur_k in visited:
            continue
        visited.add(cur_k)
        try:
            with os.scandir(cur) as it:
                for entry in it:
                    name = entry.name
                    if name.startswith(".") or name.lower() in _SKIP_DIRS:
                        continue
                    p = Path(entry.path)
                    if entry.is_dir(follow_symlinks=False):
                        queue.append(p)
                    elif entry.is_file(follow_symlinks=False) and p.suffix.lower() in _TEXT_EXTS:
                        pk = str(p).lower()
                        if pk not in seen and entry.stat().st_size <= 512_000:
                            seen.add(pk)
                            files.append(p)
                            if len(files) >= max_files:
                                break
        except OSError:
            continue
    return files


def local_rag_query(query: str, scope: str = "all", top_k: int = 3, detail: str = "concise") -> str:
    """Yerel metin/belge dosyalarından TF-IDF benzerliğiyle en alakalı parçaları getirir."""
    is_deep = str(detail or "").strip().lower() == "deep"
    effective_k = max(top_k, 6) if is_deep else max(1, top_k)
    max_chars = 420 if is_deep else 260
    q_tokens = _tokenize(query)
    if not q_tokens:
        return "Aranacak geçerli bir sorgu belirtilmedi."

    files = _collect_local_files(scope=scope)
    if not files:
        return "Belirtilen konumda taranabilecek metin belgesi bulunamadı."

    docs: list[tuple[Path, str, Counter[str]]] = []
    df: Counter[str] = Counter()

    for fpath in files:
        try:
            raw = fpath.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for ch in _chunk_text(raw):
            toks = _tokenize(ch)
            if not toks:
                continue
            tf = Counter(toks)
            docs.append((fpath, ch, tf))
            for tok in tf:
                df[tok] += 1

    if not docs:
        return "Yerel belgelerde okunabilir içerik bulunamadı."

    n_docs = len(docs)
    q_set = set(q_tokens)
    scored: list[tuple[float, Path, str]] = []

    for fpath, chunk, tf in docs:
        score = 0.0
        for qt in q_set:
            if qt in tf:
                idf = math.log((n_docs + 1) / (df[qt] + 1)) + 1.0
                score += tf[qt] * idf
        if score > 0:
            scored.append((score, fpath, chunk))

    if not scored:
        return f"Yerel belgelerde '{query}' ile eşleşen bir içerik bulunamadı."

    scored.sort(key=lambda item: item[0], reverse=True)
    top_items = scored[:effective_k]
    lines = [f"[{p.name}] {ch[:max_chars]}" for _, p, ch in top_items]
    return "Yerel belgelerden bulunan en alakalı bilgiler:\n" + "\n".join(lines)
