"""
Mem0 Semantik Kalıcı Hafıza Katmanı (Bedo).

- Konuşmalardan kullanıcı tercihlerini, alışkanlıklarını, projelerini ve tekrar eden
  bilgileri otomatik olarak çıkarıp yerel on-disk Qdrant vektör deposunda saklar.
- `mem0ai` kurulu değilse, API anahtarı yoksa veya ağ/disk hatası olursa mevcut
  statik JSON hafızayı bozmadan sessizce devre dışı kalır (graceful degradation).
- Tüm yazma işlemleri tek bir arka plan işçi kuyruğu üzerinden seri olarak yürütülür;
  sesli asistan gecikmesini etkilemez ve yerel Qdrant dosya kilidi çakışmasını önler.
"""

from __future__ import annotations

import os
import queue
import re
import threading
import time
from pathlib import Path
from typing import Any

from app_config import get_app_config_value

os.environ.setdefault("MEM0_TELEMETRY", "false")

try:
    from mem0 import Memory as _Mem0Memory  # type: ignore[reportMissingImports]

    MEM0_SDK_AVAILABLE = True
except Exception:
    _Mem0Memory = None
    MEM0_SDK_AVAILABLE = False

BASE_DIR = Path(__file__).resolve().parent.parent
MEMORY_DIR = BASE_DIR / "memory"
MEM0_QDRANT_DIR = MEMORY_DIR / "mem0_qdrant"
MEM0_HISTORY_DB = MEMORY_DIR / "mem0_history.db"

DEFAULT_USER_ID = (os.environ.get("BEDO_MEMORY_USER_ID") or "bedo_primary_user").strip() or "bedo_primary_user"

_TRIVIAL_TURNS = {
    "evet", "hayir", "hayır", "tamam", "ok", "okay", "peki", "olur", "olmaz",
    "tesekkurler", "teşekkürler", "tesekkur", "teşekkür", "sagol", "sağol",
    "merhaba", "selam", "hey", "bedo", "hey bedo", "gule gule", "güle güle",
    "iyi geceler", "gunaydin", "günaydın", "sus", "dur", "kapat", "uyku",
    "yes", "no", "thanks", "thank you", "hi", "hello", "bye", "stop",
}

_CLIENT_LOCK = threading.RLock()
_MEM0_CLIENT: Any = None
_MEM0_PROVIDER: str = ""
_INIT_FAILED_UNTIL: float = 0.0
_INIT_COOLDOWN_SEC: float = 120.0
_DISCOVERED_LLM_MODELS: dict[str, str] = {}

_DEFAULT_MODELS = {
    "gemini": "gemini-4-hydrogen",
    "openai": "gpt-6-sol",
    "anthropic": "claude-haiku-5-5",
}


def _discover_latest_model(provider: str, api_key: str) -> str:
    """API üzerinden mevcut en güncel modeli dinamik keşfeder; erişilemezse 2026 güncel varsayılanına düşer."""
    if provider in _DISCOVERED_LLM_MODELS:
        return _DISCOVERED_LLM_MODELS[provider]
    fallback = _DEFAULT_MODELS[provider]
    try:
        from actions import rag as _rag

        if provider == "gemini":
            from google import genai as _genai  # type: ignore[reportMissingImports]

            client = _genai.Client(api_key=api_key)
            names = [getattr(m, "name", "") for m in client.models.list() if getattr(m, "name", "")]
            ranked = _rag.rank_gemini_models(names)
            # Hafıza çıkarımı için hızlı/verimli güncel model (hydrogen / neon / flash) tercih et
            picked = next(
                (m for m in ranked if any(tag in m.lower() for tag in ("hydrogen", "neon", "flash"))),
                ranked[0] if ranked else None,
            )
            if picked:
                _DISCOVERED_LLM_MODELS[provider] = picked
                return picked
        elif provider == "openai":
            resp = _rag._http_json(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=5.0,
            )
            ids = [m.get("id", "") for m in resp.get("data", []) if isinstance(m, dict)]
            picked = next(
                (m for m in ids if "sol" in m.lower() and m.lower().startswith("gpt-6")),
                None,
            ) or _rag.select_latest_openai_model(ids)
            if picked:
                _DISCOVERED_LLM_MODELS[provider] = picked
                return picked
        elif provider == "anthropic":
            resp = _rag._http_json(
                "https://api.anthropic.com/v1/models",
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                timeout=5.0,
            )
            ids = [m.get("id", "") for m in resp.get("data", []) if isinstance(m, dict)]
            picked = next(
                (m for m in ids if "haiku-5" in m.lower() or "sonnet-5" in m.lower()),
                None,
            ) or _rag.select_latest_anthropic_model(ids)
            if picked:
                _DISCOVERED_LLM_MODELS[provider] = picked
                return picked
    except Exception:
        pass
    return fallback

_WRITE_QUEUE: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue(maxsize=64)
_WORKER_STARTED = False
_WORKER_LOCK = threading.Lock()
_LAST_TURN_SIG = ""


def _resolve_api_keys() -> dict[str, str]:
    gemini_key = (
        (os.environ.get("BEDO_GEMINI_API_KEY") or "").strip()
        or (os.environ.get("GEMINI_API_KEY") or "").strip()
        or (os.environ.get("GOOGLE_API_KEY") or "").strip()
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


def _build_mem0_config(keys: dict[str, str], discover: bool = True) -> tuple[str, dict[str, Any]] | tuple[None, None]:
    """Mevcut API anahtarlarına göre yerel on-disk Qdrant + Mem0 yapılandırması üretir."""
    MEM0_QDRANT_DIR.mkdir(parents=True, exist_ok=True)
    MEM0_HISTORY_DB.parent.mkdir(parents=True, exist_ok=True)

    if keys.get("gemini"):
        gemini_key = keys["gemini"]
        os.environ.setdefault("GEMINI_API_KEY", gemini_key)
        llm_model = (
            (os.environ.get("BEDO_MEM0_GEMINI_MODEL") or "").strip()
            or (_discover_latest_model("gemini", gemini_key) if discover else _DEFAULT_MODELS["gemini"])
        )
        embed_model = (os.environ.get("BEDO_MEM0_GEMINI_EMBED") or "models/gemini-embedding-001").strip()
        qdrant_path = MEM0_QDRANT_DIR / "gemini"
        qdrant_path.mkdir(parents=True, exist_ok=True)
        return "gemini", {
            "llm": {
                "provider": "gemini",
                "config": {
                    "model": llm_model,
                    "temperature": 0.1,
                    "api_key": gemini_key,
                },
            },
            "embedder": {
                "provider": "gemini",
                "config": {
                    "model": embed_model,
                    "embedding_dims": 768,
                    "api_key": gemini_key,
                },
            },
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "collection_name": "bedo_semantic_memory_gemini",
                    "path": str(qdrant_path),
                    "on_disk": True,
                    "embedding_model_dims": 768,
                },
            },
            "history_db_path": str(MEM0_HISTORY_DB),
        }

    if keys.get("openai"):
        openai_key = keys["openai"]
        os.environ.setdefault("OPENAI_API_KEY", openai_key)
        llm_model = (
            (os.environ.get("BEDO_MEM0_OPENAI_MODEL") or "").strip()
            or (_discover_latest_model("openai", openai_key) if discover else _DEFAULT_MODELS["openai"])
        )
        embed_model = (os.environ.get("BEDO_MEM0_OPENAI_EMBED") or "text-embedding-3-small").strip()
        qdrant_path = MEM0_QDRANT_DIR / "openai"
        qdrant_path.mkdir(parents=True, exist_ok=True)
        return "openai", {
            "llm": {
                "provider": "openai",
                "config": {
                    "model": llm_model,
                    "temperature": 0.1,
                    "api_key": openai_key,
                },
            },
            "embedder": {
                "provider": "openai",
                "config": {
                    "model": embed_model,
                    "api_key": openai_key,
                },
            },
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "collection_name": "bedo_semantic_memory_openai",
                    "path": str(qdrant_path),
                    "on_disk": True,
                    "embedding_model_dims": 1536,
                },
            },
            "history_db_path": str(MEM0_HISTORY_DB),
        }

    if keys.get("anthropic"):
        anthropic_key = keys["anthropic"]
        os.environ.setdefault("ANTHROPIC_API_KEY", anthropic_key)
        llm_model = (
            (os.environ.get("BEDO_MEM0_CLAUDE_MODEL") or "").strip()
            or (_discover_latest_model("anthropic", anthropic_key) if discover else _DEFAULT_MODELS["anthropic"])
        )
        embed_model = (os.environ.get("BEDO_MEM0_FASTEMBED_MODEL") or "BAAI/bge-small-en-v1.5").strip()
        qdrant_path = MEM0_QDRANT_DIR / "claude_fastembed"
        qdrant_path.mkdir(parents=True, exist_ok=True)
        return "claude", {
            "llm": {
                "provider": "anthropic",
                "config": {
                    "model": llm_model,
                    "temperature": 0.1,
                    "api_key": anthropic_key,
                },
            },
            "embedder": {
                "provider": "fastembed",
                "config": {
                    "model": embed_model,
                },
            },
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "collection_name": "bedo_semantic_memory_claude",
                    "path": str(qdrant_path),
                    "on_disk": True,
                    "embedding_model_dims": 384,
                },
            },
            "history_db_path": str(MEM0_HISTORY_DB),
        }

    return None, None


def _get_client() -> Any:
    """Mem0 istemcisini güvenli, lazy ve thread-safe şekilde başlatır."""
    global _MEM0_CLIENT, _MEM0_PROVIDER, _INIT_FAILED_UNTIL

    if not MEM0_SDK_AVAILABLE or _Mem0Memory is None:
        return None
    if os.environ.get("BEDO_DISABLE_MEM0", "").strip().lower() in {"1", "true", "yes"}:
        return None

    with _CLIENT_LOCK:
        if _MEM0_CLIENT is not None:
            return _MEM0_CLIENT
        if time.monotonic() < _INIT_FAILED_UNTIL:
            return None

        keys = _resolve_api_keys()
        provider, cfg = _build_mem0_config(keys)
        if not provider or not cfg:
            return None

        try:
            _MEM0_CLIENT = _Mem0Memory.from_config(cfg)
            _MEM0_PROVIDER = provider
            print(f"[Mem0] Semantik hafıza katmanı hazır ({provider}, on-disk Qdrant).")
            return _MEM0_CLIENT
        except Exception as exc:
            _INIT_FAILED_UNTIL = time.monotonic() + _INIT_COOLDOWN_SEC
            print(f"[Mem0] Başlatılamadı (JSON yedek aktif kalır): {exc}")
            return None


def reset_mem0_client() -> None:
    """API anahtarı değiştiğinde önbellekteki Mem0 istemcisini sıfırlar."""
    global _MEM0_CLIENT, _MEM0_PROVIDER, _INIT_FAILED_UNTIL
    with _CLIENT_LOCK:
        _MEM0_CLIENT = None
        _MEM0_PROVIDER = ""
        _INIT_FAILED_UNTIL = 0.0
        _DISCOVERED_LLM_MODELS.clear()


def is_mem0_available() -> bool:
    """Mem0 SDK kurulu ve en az bir desteklenen API anahtarı varsa True döner."""
    if not MEM0_SDK_AVAILABLE:
        return False
    if os.environ.get("BEDO_DISABLE_MEM0", "").strip().lower() in {"1", "true", "yes"}:
        return False
    keys = _resolve_api_keys()
    return bool(keys.get("gemini") or keys.get("openai") or keys.get("anthropic"))


def _normalize_mem0_results(raw: Any) -> list[dict[str, Any]]:
    """Mem0 v0.x (list) ve v1.x ({'results': [...]}) dönüş biçimlerini tek tipe normalize eder."""
    if raw is None:
        return []
    items = raw.get("results", []) if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            mem_text = str(item.get("memory") or item.get("text") or "").strip()
            if not mem_text:
                continue
            out.append({
                "id": str(item.get("id") or ""),
                "memory": mem_text,
                "score": float(item.get("score") or 0.0),
                "metadata": item.get("metadata") if isinstance(item.get("metadata"), dict) else {},
            })
        elif isinstance(item, str) and item.strip():
            out.append({"id": "", "memory": item.strip(), "score": 0.0, "metadata": {}})
    return out


def _is_worth_extracting(user_text: str) -> bool:
    clean = re.sub(r"[^\wçğıöşüÇĞİÖŞÜ\s]", " ", (user_text or "").strip().lower())
    clean = " ".join(clean.split())
    if len(clean) < 8:
        return False
    if clean in _TRIVIAL_TURNS:
        return False
    return True


def _ensure_worker() -> None:
    global _WORKER_STARTED
    if _WORKER_STARTED:
        return
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        t = threading.Thread(target=_worker_loop, name="bedo-mem0-worker", daemon=True)
        t.start()
        _WORKER_STARTED = True


def _worker_loop() -> None:
    while True:
        try:
            op, payload = _WRITE_QUEUE.get()
        except Exception:
            continue
        try:
            client = _get_client()
            if client is None:
                continue
            with _CLIENT_LOCK:
                if op == "add_messages":
                    client.add(
                        payload["messages"],
                        user_id=payload.get("user_id", DEFAULT_USER_ID),
                        metadata=payload.get("metadata"),
                    )
                elif op == "add_fact":
                    client.add(
                        payload["text"],
                        user_id=payload.get("user_id", DEFAULT_USER_ID),
                        metadata=payload.get("metadata"),
                        infer=False,
                    )
        except Exception as exc:
            print(f"[Mem0] Arka plan yazma atlandı ({op}): {exc}")
        finally:
            try:
                _WRITE_QUEUE.task_done()
            except Exception:
                pass


def record_conversation_turn_async(
    user_text: str,
    assistant_text: str = "",
    metadata: dict[str, Any] | None = None,
    user_id: str = DEFAULT_USER_ID,
) -> bool:
    """Tamamlanan konuşma turunu arka planda Mem0'ya aktarır (0 ms ana iş parçacığı gecikmesi)."""
    global _LAST_TURN_SIG
    u = str(user_text or "").strip()
    a = str(assistant_text or "").strip()
    if not _is_worth_extracting(u):
        return False
    if not is_mem0_available():
        return False

    sig = f"{u[:160]}|{a[:80]}"
    if sig == _LAST_TURN_SIG:
        return False
    _LAST_TURN_SIG = sig

    messages = [{"role": "user", "content": u}]
    if a:
        messages.append({"role": "assistant", "content": a[:600]})

    _ensure_worker()
    try:
        _WRITE_QUEUE.put_nowait((
            "add_messages",
            {
                "messages": messages,
                "user_id": user_id or DEFAULT_USER_ID,
                "metadata": metadata or {"source": "conversation"},
            },
        ))
        return True
    except queue.Full:
        return False


def remember_fact_async(
    text: str,
    category: str = "notes",
    key: str = "",
    user_id: str = DEFAULT_USER_ID,
) -> bool:
    """Açık `save_memory` kayıtlarını arka planda Mem0 vektör katmanına da yansıtır."""
    clean = str(text or "").strip()
    if not clean or not is_mem0_available():
        return False
    _ensure_worker()
    try:
        _WRITE_QUEUE.put_nowait((
            "add_fact",
            {
                "text": clean,
                "user_id": user_id or DEFAULT_USER_ID,
                "metadata": {"source": "explicit", "category": category, "key": key},
            },
        ))
        return True
    except queue.Full:
        return False


def search_semantic_memories(
    query: str,
    limit: int = 5,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict[str, Any]]:
    """Mem0 semantik hafızasında doğal dil sorgusu yapar."""
    q = str(query or "").strip()
    if not q:
        return []
    client = _get_client()
    if client is None:
        return []
    try:
        with _CLIENT_LOCK:
            raw = client.search(query=q, user_id=user_id or DEFAULT_USER_ID, limit=max(1, int(limit)))
        return _normalize_mem0_results(raw)
    except Exception as exc:
        print(f"[Mem0] Arama hatası: {exc}")
        return []


def get_all_semantic_memories(
    limit: int = 20,
    user_id: str = DEFAULT_USER_ID,
) -> list[dict[str, Any]]:
    """Sistem istemi (system prompt) için öğrenilmiş semantik hafıza özetlerini getirir."""
    client = _get_client()
    if client is None:
        return []
    try:
        with _CLIENT_LOCK:
            raw = client.get_all(user_id=user_id or DEFAULT_USER_ID, limit=max(1, int(limit)))
        return _normalize_mem0_results(raw)[: max(1, int(limit))]
    except Exception as exc:
        print(f"[Mem0] Listeleme hatası: {exc}")
        return []


def delete_semantic_memories_matching(
    match_text: str,
    limit: int = 3,
    user_id: str = DEFAULT_USER_ID,
) -> int:
    """`delete_memory` çağrısında Mem0'daki eşleşen kayıtları da temizler."""
    q = str(match_text or "").strip()
    if not q:
        return 0
    client = _get_client()
    if client is None:
        return 0
    deleted = 0
    try:
        hits = search_semantic_memories(q, limit=limit, user_id=user_id)
        with _CLIENT_LOCK:
            for hit in hits:
                mem_id = hit.get("id")
                score = float(hit.get("score") or 0.0)
                if mem_id and (score == 0.0 or score >= 0.35):
                    try:
                        client.delete(memory_id=mem_id)
                        deleted += 1
                    except Exception:
                        pass
    except Exception as exc:
        print(f"[Mem0] Silme hatası: {exc}")
    return deleted
