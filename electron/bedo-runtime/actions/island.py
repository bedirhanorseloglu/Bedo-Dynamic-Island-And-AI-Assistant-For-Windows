"""
TwoCode Dynamic Island (Ada) durumu okuma ve kontrol aracı.

Bedo'nun ada içindeki medya oturumuna, odak sayacına, görevlere,
notlara ve ada sekmelerine doğrudan erişmesini sağlar.
"""

from __future__ import annotations

from typing import Any

from actions.system_control import system_control

_TAB_ALIASES = {
    "home": "home",
    "ana": "home",
    "anasayfa": "home",
    "music": "music",
    "muzik": "music",
    "müzik": "music",
    "medya": "music",
    "weather": "weather",
    "hava": "weather",
    "timer": "timer",
    "zamanlayici": "timer",
    "zamanlayıcı": "timer",
    "sayac": "timer",
    "sayaç": "timer",
    "focus": "focus",
    "odak": "focus",
    "pomodoro": "focus",
    "drop": "drop",
    "dropshelf": "drop",
    "notes": "notes",
    "not": "notes",
    "notlar": "notes",
    "calendar": "calendar",
    "takvim": "calendar",
    "health": "health",
    "saglik": "health",
    "sağlık": "health",
}


def _normalize_action(action: str) -> str:
    return (
        str(action or "")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )


def _format_media_label(media: dict[str, Any]) -> str:
    title = str(media.get("title") or "").strip()
    artist = str(media.get("artist") or "").strip()
    if title and artist:
        return f"{title} — {artist}"
    return title or artist or "Bilinmeyen parça"


def handle_island_control(ui: Any, action: str, value: str = "") -> str:
    """Ada içi durum okuma ve kontrol aksiyonlarını yürütür."""
    act = _normalize_action(action)
    val = str(value or "").strip()
    state: dict[str, Any] = dict(getattr(ui, "island_state", {}) or {})
    media: dict[str, Any] = dict(state.get("media") or {})
    has_bridge = hasattr(ui, "send_island_action")

    if act == "get_state":
        parts: list[str] = []
        mode = str(state.get("mode") or "idle")
        parts.append(f"Ada modu: {mode}")
        if media.get("hasSession"):
            status = "çalıyor" if media.get("isPlaying") else "duraklatılmış"
            parts.append(f"Medya ({status}): {_format_media_label(media)}")
        else:
            parts.append("Aktif medya oturumu yok.")
        focus = dict(state.get("focus") or {})
        if focus:
            f_status = "çalışıyor" if focus.get("running") else "duraklatılmış"
            parts.append(f"Odak sayacı: {focus.get('minutes', 25)} dk ({f_status})")
        todos = list(state.get("todos") or [])
        pending = [t for t in todos if not t.get("done")]
        parts.append(f"Bekleyen görev sayısı: {len(pending)}")
        return " | ".join(parts)

    if act == "media_status":
        if not media.get("hasSession"):
            return "Şu anda açık bir medya oturumu bulunmuyor."
        status = "çalıyor" if media.get("isPlaying") else "duraklatılmış"
        return f"Şu anki medya ({status}): {_format_media_label(media)}."

    if act in {"media_play", "play", "resume", "devam_et"}:
        if media.get("hasSession") and media.get("isPlaying"):
            return f"Şu anda zaten çalıyor: {_format_media_label(media)}."
        if has_bridge:
            ui.send_island_action("media_play", "")
            if media.get("hasSession"):
                return f"Devam ettiriliyor: {_format_media_label(media)}."
            return "Medya oynatılıyor."
        return system_control("media_play_pause")

    if act in {"media_pause", "pause", "duraklat", "durdur"}:
        if media.get("hasSession") and not media.get("isPlaying"):
            return f"Medya zaten duraklatılmış: {_format_media_label(media)}."
        if has_bridge:
            ui.send_island_action("media_pause", "")
            if media.get("hasSession"):
                return f"Duraklatıldı: {_format_media_label(media)}."
            return "Medya duraklatıldı."
        return system_control("media_play_pause")

    if act in {"media_next", "next", "sonraki"}:
        if has_bridge:
            ui.send_island_action("media_next", "")
            return "Sonraki parçaya geçildi."
        return system_control("media_next")

    if act in {"media_prev", "prev", "onceki"}:
        if has_bridge:
            ui.send_island_action("media_prev", "")
            return "Önceki parçaya geçildi."
        return system_control("media_prev")

    if act == "open_tab":
        tab_key = _TAB_ALIASES.get(_normalize_action(val), _normalize_action(val) or "home")
        if has_bridge:
            ui.send_island_action("open_tab", tab_key)
            return f"Adada '{tab_key}' sekmesi açıldı."
        return "Ada arayüzü bağlı değil."

    if act in {"focus_start", "focus_pause", "focus_reset"}:
        if has_bridge:
            ui.send_island_action(act, val)
            labels = {
                "focus_start": "Odak sayacı başlatıldı.",
                "focus_pause": "Odak sayacı duraklatıldı.",
                "focus_reset": "Odak sayacı sıfırlandı.",
            }
            return labels[act]
        return "Ada arayüzü bağlı değil."

    if act == "todo_list":
        todos = list(state.get("todos") or [])
        if not todos:
            return "Adada kayıtlı görev bulunmuyor."
        pending = [str(t.get("text") or "").strip() for t in todos if not t.get("done") and t.get("text")]
        if not pending:
            return "Tüm görevler tamamlanmış görünüyor."
        preview = ", ".join(pending[:6])
        return f"Bekleyen {len(pending)} görev var: {preview}"

    if act == "todo_add":
        if not val:
            return "Eklenecek görev metni belirtilmedi."
        if has_bridge:
            ui.send_island_action("todo_add", val)
            return f"Ada görev listesine eklendi: '{val}'."
        return "Ada arayüzü bağlı değil."

    if act == "note_add":
        if not val:
            return "Eklenecek not metni belirtilmedi."
        if has_bridge:
            ui.send_island_action("note_add", val)
            return f"Ada notlarına eklendi: '{val}'."
        return "Ada arayüzü bağlı değil."

    return f"Bilinmeyen ada kontrol eylemi: {action}"
