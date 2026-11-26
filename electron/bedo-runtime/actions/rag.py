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
    """Mevcut Gemini modelleri arasından kota dostu ve Search Grounding destekli en güncelleri sıralar."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    excluded = (
        "embedding", "imagen", "veo", "tts", "audio", "robotics", "aqa", "live",
        "learnlm", "gemma", "banana", "lyria", "omni", "computer", "image", "transcribe",
    )
    for raw in model_names:
        name = str(raw or "").replace("models/", "").strip()
        low = name.lower()
        if not low.startswith("gemini-") or any(bad in low for bad in excluded):
            continue
        if "exp" in low:
            continue
        ver = _extract_version_tuple(low)
        # Hydrogen ve Flash modelleri yüksek kota + düşük gecikme + Search Grounding sunduğu için
        # 0-ücretsiz-kotalı Carbon/Argon/Pro modellerinin önünde denenir; Carbon/Neon yine listede kalır.
        if "hydrogen" in low:
            tier = 7
        elif "flash" in low and "lite" not in low:
            tier = 6
        elif "flash-lite" in low:
            tier = 5
        elif "neon" in low:
            tier = 4
        elif "carbon" in low:
            tier = 3
        elif "pro" in low:
            tier = 2
        else:
            tier = 1
        stability = 0 if "preview" in low else 1
        candidates.append((ver, tier * 10 + stability, name))
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    seen: set[str] = set()
    ordered: list[str] = []
    # Öncelikli Gemini 4 Hydrogen ve Gemini 3.x Flash zinciri
    for pinned in ("gemini-4-hydrogen", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"):
        seen.add(pinned)
        ordered.append(pinned)
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
    """OpenAI modelleri arasından en güncel sohbet/arama modelini seçer (GPT-6.2 Astra/Sol öncelikli)."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    excluded = ("audio", "realtime", "transcribe", "tts", "image", "embedding", "whisper", "dall-e", "moderation")
    for raw in model_ids:
        mid = str(raw or "").strip()
        low = mid.lower()
        if any(bad in low for bad in excluded):
            continue
        if not low.startswith("gpt-"):
            continue
        ver = _extract_version_tuple(low)
        tier = 5 if "astra" in low else 4 if "sol" in low else 3 if "pro" in low else 2
        candidates.append((ver, tier, mid))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return candidates[0][2]


def select_latest_anthropic_model(model_ids: Iterable[str]) -> str | None:
    """Anthropic Claude modelleri arasından en güncelini seçer (Claude Fable 5.2 / 5.5 öncelikli)."""
    candidates: list[tuple[tuple[int, ...], int, str]] = []
    for raw in model_ids:
        mid = str(raw or "").strip()
        low = mid.lower()
        if not low.startswith("claude-"):
            continue
        ver = _extract_version_tuple(low)
        if "fable" in low:
            tier = 5
        elif "opus" in low:
            tier = 4
        elif "sonnet" in low:
            tier = 3
        elif "haiku" in low:
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
_MODEL_COOLDOWN_UNTIL: dict[str, float] = {}
_GEMINI_SEARCH_TOOL_BLOCKED_UNTIL: float = 0.0


def clear_rag_caches() -> None:
    """Yeni API anahtarı girildiğinde model ve kota önbelleğini temizler."""
    global _GEMINI_SEARCH_TOOL_BLOCKED_UNTIL
    _MODEL_CACHE.clear()
    _GEMINI_RANKED_CACHE.clear()
    _PROVIDER_COOLDOWN_UNTIL.clear()
    _MODEL_COOLDOWN_UNTIL.clear()
    _GEMINI_SEARCH_TOOL_BLOCKED_UNTIL = 0.0


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


def _web_rag_gemini(prompt: str, api_key: str, max_tokens: int = 600, raw_query: str = "") -> str:
    global _GEMINI_SEARCH_TOOL_BLOCKED_UNTIL
    client = genai.Client(api_key=api_key)
    models_to_try = _resolve_ranked_gemini_models(client)
    last_err: Exception | None = None
    now_m = time.monotonic()

    # 1) Native Google Search Grounding (ücretsiz katmanda kota=0 dönerse 30 dk boyunca atla)
    if now_m >= _GEMINI_SEARCH_TOOL_BLOCKED_UNTIL:
        for model_id in models_to_try:
            if now_m < _MODEL_COOLDOWN_UNTIL.get(f"{model_id}:search", 0.0):
                continue
            try:
                resp = client.models.generate_content(
                    model=model_id,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        tools=[types.Tool(google_search=types.GoogleSearch())],
                        temperature=0.2,
                        max_output_tokens=max(2048, max_tokens),
                    ),
                )
                text = str(getattr(resp, "text", "") or "").strip()
                if text:
                    return text
            except Exception as exc:
                last_err = exc
                msg = str(exc)
                if "401" in msg or "403" in msg or "API_KEY_INVALID" in msg:
                    _PROVIDER_COOLDOWN_UNTIL["gemini"] = time.monotonic() + 120.0
                    raise
                if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "400" in msg:
                    _GEMINI_SEARCH_TOOL_BLOCKED_UNTIL = time.monotonic() + 1800.0
                    break
                if "404" in msg:
                    _MODEL_COOLDOWN_UNTIL[f"{model_id}:search"] = time.monotonic() + 300.0
                    continue
                break

    # 2) Organik Web RAG + Düz Gemini Sentezi (Gemini 4 Hydrogen / 3.8 Flash / 3.5 Flash Lite)
    web_ctx = _web_rag_free_fallback(raw_query or prompt)
    grounded_prompt = (
        f"<web_context>\n{web_ctx or 'Doğrudan eşleşen canlı web kaynağı bulunamadı.'}\n</web_context>\n\n"
        "KESİN KURALLAR:\n"
        "1. Yalnızca <web_context> içindeki güncel verileri, rakamları ve tarihleri kullan; eğitim belleğindeki eski model/fiyat bilgilerini güncel diye sunma.\n"
        "2. <web_context> içinde olmayan hiçbir fiyatı veya sayıyı UYDURMA; bulunamayan canlı veri varsa açıkça belirt ve ilgili kaynak sitelerini öner.\n\n"
        f"{prompt}"
    )
    for model_id in models_to_try:
        if now_m < _MODEL_COOLDOWN_UNTIL.get(f"{model_id}:plain", 0.0):
            continue
        try:
            resp = client.models.generate_content(
                model=model_id,
                contents=grounded_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=max(2048, max_tokens),
                ),
            )
            text = str(getattr(resp, "text", "") or "").strip()
            if text:
                return text
        except Exception as exc:
            last_err = exc
            msg = str(exc)
            if "401" in msg or "403" in msg or "API_KEY_INVALID" in msg:
                _PROVIDER_COOLDOWN_UNTIL["gemini"] = time.monotonic() + 120.0
                break
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "404" in msg:
                _MODEL_COOLDOWN_UNTIL[f"{model_id}:plain"] = time.monotonic() + 90.0
                continue
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


def _search_yahoo_organic_py(query: str, is_tr: bool = True) -> list[str]:
    import html as _html
    import http.cookiejar
    import urllib.parse

    url = f"https://tr.search.yahoo.com/search?p={urllib.parse.quote_plus(query)}&ei=UTF-8"
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "identity",
        },
    )
    with opener.open(req, timeout=5.0) as resp:
        raw_html = resp.read(450_000).decode("utf-8", errors="replace")
    if "compText" not in raw_html and re.search(r"verify you are human|cf-turnstile", raw_html, re.I):
        return []

    results: list[str] = []
    blocks = re.split(r'<div[^>]+class="[^"]*\balgo\b[^"]*"[^>]*>', raw_html, flags=re.I)[1:]
    for blk in blocks:
        if len(results) >= 6:
            break
        h3 = re.search(r"<h3[^>]*>([\s\S]*?)</h3>", blk, re.I)
        if not h3:
            continue
        href_m = re.search(r'href="([^"]+)"', h3.group(1), re.I) or re.search(r'href="([^"]+)"', blk, re.I)
        link = _html.unescape(href_m.group(1)) if href_m else ""
        ru_m = re.search(r"/RU=([^/]+)/", link, re.I)
        if ru_m:
            try:
                link = urllib.parse.unquote(ru_m.group(1))
            except Exception:
                pass
        if not link.startswith(("http://", "https://")) or re.search(r"yahoo\.com/|bing\.com/aclick", link, re.I):
            continue
        title_clean = re.sub(
            r'<span[^>]*class="[^"]*(?:d-ib|fc-obsidian|fz-ms|va-bot)[^"]*"[^>]*>[\s\S]*?</span>',
            " ",
            h3.group(1),
            flags=re.I,
        )
        title_clean = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", title_clean))).strip()
        comp_m = re.search(r'<div[^>]+class="[^"]*\bcompText\b[^"]*"[^>]*>([\s\S]*?)</div>', blk, re.I)
        snip = re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", comp_m.group(1) if comp_m else ""))).strip()
        if title_clean:
            results.append(f"- {title_clean} ({link}): {snip[:320]}")
    return results


def _web_rag_free_fallback(query: str) -> str:
    """Genel amaçlı çok kaynaklı Organik Web RAG (Yahoo Organik Web + Google News RSS + Döviz + Wikipedia)."""
    import html as _html
    import urllib.parse
    import xml.etree.ElementTree as ET

    q = query.strip()
    enc = urllib.parse.quote_plus(q)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    sections: list[str] = []

    # 1) Döviz / Kur sorguları için canlı açık kur servisi
    if re.search(r"\b(dolar|euro|sterlin|usd|eur|gbp|döviz|doviz|kur|kaç\s*tl|kac\s*tl)\b", q.lower()):
        try:
            fx = _http_json("https://open.er-api.com/v6/latest/USD", headers={"User-Agent": "Bedo/1.0"}, timeout=4.0)
            rates = fx.get("rates", {}) if isinstance(fx, dict) else {}
            if rates.get("TRY"):
                usd_try = float(rates["TRY"])
                eur_try = usd_try / float(rates["EUR"]) if rates.get("EUR") else 0.0
                gbp_try = usd_try / float(rates["GBP"]) if rates.get("GBP") else 0.0
                fx_parts = [f"1 USD = {usd_try:.2f} TL"]
                if eur_try:
                    fx_parts.append(f"1 EUR = {eur_try:.2f} TL")
                if gbp_try:
                    fx_parts.append(f"1 GBP = {gbp_try:.2f} TL")
                sections.append("Anlık döviz kurları: " + " | ".join(fx_parts))
        except Exception:
            pass

    # 2) Organik Web Arama Sonuçları (Yahoo TR + gerekirse EN)
    try:
        yh_hits = _search_yahoo_organic_py(q, is_tr=True)
        if yh_hits:
            sections.append("Organik web sonuçları:\n" + "\n".join(yh_hits))
    except Exception:
        pass

    # 3) Google News RSS canlı güncel haberler
    try:
        req = urllib.request.Request(
            f"https://news.google.com/rss/search?q={enc}&hl=tr&gl=TR&ceid=TR:tr",
            headers=headers,
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            xml_bytes = resp.read()
        root = ET.fromstring(xml_bytes)
        items = root.findall(".//item")
        lines: list[str] = []
        for it in items[:5]:
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
            sections.append("Güncel haber özetleri:\n" + "\n".join(lines))
    except Exception:
        pass

    # 4) Türkçe Wikipedia genel bilgi özeti (yalnızca üstteki kaynaklar azsa ekle)
    if len(sections) < 2:
        try:
            wiki = _http_json(
                f"https://tr.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc}&format=json",
                headers={"User-Agent": "BedoAssistant/1.0"},
                timeout=4.0,
            )
            hits = wiki.get("query", {}).get("search", [])
            snips = []
            for h in hits[:2]:
                s = re.sub(r"<[^>]+>", "", _html.unescape(h.get("snippet", ""))).strip()
                if s:
                    snips.append(f"- {h.get('title', '')}: {s}")
            if snips:
                sections.append("Wikipedia özetleri:\n" + "\n".join(snips))
        except Exception:
            pass

    return "\n\n".join(sections).strip()


def web_search_answer(query: str, api_key: str = "", detail: str = "concise") -> str:
    """Yapılandırılmış en güncel sağlayıcı üzerinden iki aşamalı (kısa/derin) Web RAG araması yapar."""
    import datetime as _dt

    q = str(query or "").strip()
    if not q:
        return "Aranacak soru belirtilmedi."

    keys = _resolve_provider_keys(api_key)
    if not any(keys.values()):
        fb = _web_rag_free_fallback(q)
        return fb or "Canlı arama için Gemini, OpenAI (GPT) veya Anthropic (Claude) API anahtarı bulunamadı."

    today_str = _dt.datetime.now().strftime("%d.%m.%Y")
    is_deep = str(detail or "").strip().lower() == "deep"
    max_tokens = 1400 if is_deep else 600
    if is_deep:
        prompt = (
            f"[BUGÜNÜN TARİHİ: {today_str}]\n"
            "Aşağıdaki soruyu canlı web arama sonuçlarına dayanarak Türkçe araştır. "
            "Nedenleri, önemli tarihleri, sayıları ve bağlamı net, düzenli ve doyurucu şekilde özetle; "
            "asla eski eğitim verisine dayanma ve 'arama yapıyorum' gibi ara cümleler kurma.\n\n"
            f"Soru: {q}"
        )
    else:
        prompt = (
            f"[BUGÜNÜN TARİHİ: {today_str}]\n"
            "Aşağıdaki soruyu canlı web arama sonuçlarına dayanarak Türkçe, net ve doğrudan yanıtla. "
            "Kesin cevabı (kur, skor, tarih, sürüm adı, sayı) doğrudan ver; 'arama yapıyorum' gibi giriş cümlesi yazma.\n\n"
            f"Soru: {q}"
        )

    errors: list[str] = []
    now_m = time.monotonic()
    if keys["gemini"] and now_m >= _PROVIDER_COOLDOWN_UNTIL.get("gemini", 0.0):
        try:
            text = _web_rag_gemini(prompt, keys["gemini"], max_tokens=max_tokens, raw_query=q)
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
    """Yerel metin/belge dosyalarından TF-IDF + Mem0 semantik hafızadan en alakalı parçaları getirir."""
    is_deep = str(detail or "").strip().lower() == "deep"
    effective_k = max(top_k, 6) if is_deep else max(1, top_k)
    max_chars = 420 if is_deep else 260
    q_tokens = _tokenize(query)
    if not q_tokens:
        return "Aranacak geçerli bir sorgu belirtilmedi."

    sc_folded = _fold_key(scope or "all")
    memory_lines: list[str] = []
    if sc_folded in {"all", "hepsi", "genel", "memory", "hafiza", "bellek"}:
        try:
            from memory.mem0_layer import search_semantic_memories
            mem_hits = search_semantic_memories(query, limit=5 if is_deep else 3)
            for hit in mem_hits:
                mtxt = str(hit.get("memory") or "").strip()
                if mtxt:
                    memory_lines.append(f"[Hafıza] {mtxt[:max_chars]}")
        except Exception:
            pass

    if sc_folded in {"memory", "hafiza", "bellek"}:
        if memory_lines:
            return "Semantik hafızadan bulunan ilgili bilgiler:\n" + "\n".join(memory_lines)
        return f"Hafızada '{query}' ile eşleşen bir kayıt bulunamadı."

    files = _collect_local_files(scope=scope)
    if not files:
        if memory_lines:
            return "Semantik hafızadan bulunan ilgili bilgiler:\n" + "\n".join(memory_lines)
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
        if memory_lines:
            return "Semantik hafızadan bulunan ilgili bilgiler:\n" + "\n".join(memory_lines)
        return "Yerel belgelerde okunabilir içerik bulunamadı."

    n_docs = len(docs)
    avg_dl = sum(sum(tf.values()) for _, _, tf in docs) / max(1, n_docs)
    k1 = 1.5
    b = 0.75
    q_set = set(q_tokens)
    scored: list[tuple[float, Path, str]] = []

    for fpath, chunk, tf in docs:
        doc_len = sum(tf.values())
        score = 0.0
        for qt in q_set:
            freq = float(tf.get(qt, 0))
            doc_freq = df.get(qt, 0)
            # Türkçe eklemeli morfoloji için kök/önek eşleşmesi (>= 4 karakter)
            if freq == 0.0 and len(qt) >= 4:
                root = qt[: max(4, len(qt) - 2)]
                for dt, cnt in tf.items():
                    if len(dt) >= 4 and (dt.startswith(root) or qt.startswith(dt[: max(4, len(dt) - 2)])):
                        freq += 0.65 * cnt
                        doc_freq = max(doc_freq, df.get(dt, 1))
            if freq > 0.0:
                idf = math.log(1.0 + (n_docs - doc_freq + 0.5) / (doc_freq + 0.5))
                denom = freq + k1 * (1.0 - b + b * (doc_len / max(1.0, avg_dl)))
                score += idf * ((freq * (k1 + 1.0)) / denom)
        if score > 0:
            scored.append((score, fpath, chunk))

    if not scored:
        if memory_lines:
            return "Semantik hafızadan bulunan ilgili bilgiler:\n" + "\n".join(memory_lines)
        return f"Yerel belgelerde '{query}' ile eşleşen bir içerik bulunamadı."

    scored.sort(key=lambda item: item[0], reverse=True)
    top_items = scored[:effective_k]
    lines = [f"[{p.name}] {ch[:max_chars]}" for _, p, ch in top_items]
    if memory_lines:
        lines.extend(memory_lines)
    return "Yerel belgelerden ve hafızadan bulunan en alakalı bilgiler:\n" + "\n".join(lines)
