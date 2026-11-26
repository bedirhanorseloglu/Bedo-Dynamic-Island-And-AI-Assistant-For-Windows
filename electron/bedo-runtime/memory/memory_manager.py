"""
Kalıcı bellek — JSON dosyasına kaydedilir.
Alp Ünlü tarafından yapılmıştır — @alppunlu
"""

import json
import re
import unicodedata
from pathlib import Path

from memory.mem0_layer import (
    delete_semantic_memories_matching,
    get_all_semantic_memories,
    record_conversation_turn_async,
    remember_fact_async,
    search_semantic_memories,
)

BASE_DIR    = Path(__file__).resolve().parent.parent
MEMORY_FILE = BASE_DIR / "memory" / "memory.json"


def load_memory() -> dict:
    try:
        if MEMORY_FILE.exists():
            with open(MEMORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def update_memory(data: dict):
    mem = load_memory()
    _deep_merge(mem, data)
    _write_memory(mem)
    _mirror_update_to_mem0(data)


def _mirror_update_to_mem0(data: dict):
    """Yapılandırılmış kayıtları (rehber hariç) arka planda Mem0 semantik katmanına da yansıtır."""
    if not isinstance(data, dict):
        return
    for category, items in data.items():
        if category == "whatsapp_contacts":
            continue
        if isinstance(items, dict):
            for key, val in items.items():
                text_val = _entry_value_text(val).strip()
                if text_val:
                    remember_fact_async(
                        f"{category} / {key}: {text_val}",
                        category=str(category),
                        key=str(key),
                    )
        else:
            text_val = _entry_value_text(items).strip()
            if text_val:
                remember_fact_async(f"{category}: {text_val}", category=str(category))


def remember_conversation_turn(user_text: str, assistant_text: str = "") -> bool:
    """Konuşma turundan tercih/alışkanlık çıkarımı için Mem0'yu arka planda besler."""
    return record_conversation_turn_async(user_text, assistant_text)


def search_memory(query: str, limit: int = 5) -> str:
    """Hem Mem0 semantik hafızasında hem de yerel JSON hafızasında akıllı arama yapar."""
    q = (query or "").strip()
    if not q:
        return "Hafızada aramak için bir sorgu belirtilmedi."

    lines: list[str] = []
    seen_norm: set[str] = set()

    # 1) Mem0 semantik hafıza sonuçları
    sem_hits = search_semantic_memories(q, limit=limit)
    for hit in sem_hits:
        text = str(hit.get("memory") or "").strip()
        norm = _normalize_text(text)
        if text and norm not in seen_norm:
            seen_norm.add(norm)
            lines.append(f"- {text}")

    # 2) Yerel JSON hafıza eşleşmeleri (tamamlayıcı / yedek)
    mem = load_memory()
    needle = _normalize_text(q)
    if mem and needle:
        for cat, bucket in mem.items():
            if cat == "whatsapp_contacts":
                continue
            if isinstance(bucket, dict):
                for item_key, item_val in bucket.items():
                    if _entry_matches(needle, cat, item_key, item_val):
                        entry_line = f"{cat}/{item_key}: {_entry_value_text(item_val)}"
                        norm = _normalize_text(entry_line)
                        if norm not in seen_norm:
                            seen_norm.add(norm)
                            lines.append(f"- {entry_line}")
            elif _entry_matches(needle, cat, cat, bucket):
                entry_line = f"{cat}: {_entry_value_text(bucket)}"
                norm = _normalize_text(entry_line)
                if norm not in seen_norm:
                    seen_norm.add(norm)
                    lines.append(f"- {entry_line}")

    if not lines:
        return f"Hafızada '{q}' ile ilgili bir kayıt bulunamadı."
    return "Hafızadan bulunan ilgili bilgiler:\n" + "\n".join(lines[: max(1, limit * 2)])


def _write_memory(mem: dict):
    MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(MEMORY_FILE, "w", encoding="utf-8") as f:
        json.dump(mem, f, indent=2, ensure_ascii=False)


def _deep_merge(base: dict, update: dict):
    for k, v in update.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


def _normalize_text(text: str) -> str:
    text = (text or "").strip().casefold()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.replace("ı", "i")
    return " ".join(text.split())


def _entry_value_text(value) -> str:
    if isinstance(value, dict):
        base = value.get("value")
        if base is not None:
            return str(base)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _tokenize_text(text: str) -> list[str]:
    normalized = _normalize_text(text)
    return [token for token in re.split(r"[^a-z0-9]+", normalized) if token]


def _entry_matches(needle: str, category: str, item_key: str, item_value) -> bool:
    haystacks = [
        _normalize_text(category),
        _normalize_text(item_key),
        _normalize_text(_entry_value_text(item_value)),
    ]
    if any(needle in hay for hay in haystacks):
        return True

    tokens = [tok for tok in _tokenize_text(needle) if len(tok) >= 3]
    if not tokens:
        return False

    entry_tokens: list[str] = []
    for hay in haystacks:
        entry_tokens.extend(_tokenize_text(hay))

    matched = 0
    for token in tokens:
        if any(token in entry_token or entry_token in token for entry_token in entry_tokens):
            matched += 1

    if len(tokens) == 1:
        return matched == 1
    return matched >= min(2, len(tokens))


def delete_memory(category: str = "", key: str = "", match_text: str = "") -> str:
    mem = load_memory()
    category = (category or "").strip()
    key = (key or "").strip()
    match_text = (match_text or "").strip()
    semantic_query = match_text or (f"{category} {key}".strip())

    if not mem:
        sem_removed = delete_semantic_memories_matching(semantic_query)
        if sem_removed > 0:
            return f"Semantik hafizadan {sem_removed} kayit kaldirildi."
        return "Hafizada silinecek bir kayit yok."

    if category and key:
        bucket = mem.get(category)
        if isinstance(bucket, dict) and key in bucket:
            val_text = _entry_value_text(bucket[key])
            del bucket[key]
            if not bucket:
                mem.pop(category, None)
            _write_memory(mem)
            delete_semantic_memories_matching(f"{category} {key} {val_text}")
            return f"{category}/{key} hafizadan kaldirildi."
        sem_removed = delete_semantic_memories_matching(semantic_query)
        if sem_removed > 0:
            return f"Semantik hafizadan {sem_removed} kayit kaldirildi."
        return "Bu hafiza kaydini bulamadim."

    needle = _normalize_text(match_text or key)
    if not needle:
        return "Silmek icin category/key veya match_text gerekli."

    for cat, bucket in list(mem.items()):
        if not isinstance(bucket, dict):
            if _entry_matches(needle, cat, cat, bucket):
                del mem[cat]
                _write_memory(mem)
                delete_semantic_memories_matching(semantic_query)
                return f"{cat} hafizadan kaldirildi."
            continue

        for item_key, item_value in list(bucket.items()):
            if _entry_matches(needle, cat, item_key, item_value):
                del bucket[item_key]
                if not bucket:
                    mem.pop(cat, None)
                _write_memory(mem)
                delete_semantic_memories_matching(semantic_query)
                return f"{cat}/{item_key} hafizadan kaldirildi."

    sem_removed = delete_semantic_memories_matching(semantic_query)
    if sem_removed > 0:
        return f"Semantik hafizadan {sem_removed} kayit kaldirildi."
    return "Eslestigim bir hafiza kaydi bulamadim."


def format_memory_for_prompt(memory: dict, include_semantic: bool = True) -> str:
    sections: list[str] = []

    if memory:
        lines = ["[KULLANICI HAKKINDA BİLGİLER]"]
        for category, items in memory.items():
            if isinstance(items, dict):
                for key, val in items.items():
                    if category == "whatsapp_contacts" and isinstance(val, dict):
                        display_name = val.get("display_name", key)
                        value = val.get("value", "")
                        aliases = val.get("aliases", [])
                        alias_str = ""
                        if isinstance(aliases, list) and aliases:
                            alias_str = f" aliases={', '.join(str(a) for a in aliases)}"
                        lines.append(f"  {category}/{display_name}: {value}{alias_str}")
                    else:
                        value = val.get("value", val) if isinstance(val, dict) else val
                        lines.append(f"  {category}/{key}: {value}")
            else:
                lines.append(f"  {category}: {items}")
        sections.append("\n".join(lines))

    if include_semantic:
        semantic_items = get_all_semantic_memories(limit=15)
        if semantic_items:
            sem_lines = ["[ÖĞRENİLMİŞ SEMANTİK HAFIZA]"]
            for item in semantic_items:
                txt = str(item.get("memory") or "").strip()
                if txt:
                    sem_lines.append(f"  - {txt}")
            if len(sem_lines) > 1:
                sections.append("\n".join(sem_lines))

    return "\n\n".join(sections)
