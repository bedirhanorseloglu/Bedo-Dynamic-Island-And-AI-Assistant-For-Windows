"""
Klavye Kısayolları, Metin Yazma ve Kaydırma (UI Otomasyonu).

Aktif pencerede yeni sekme açma, kapatma, kopyalama/yapıştırma,
Türkçe karakter destekli metin yazma ve sayfa kaydırma işlemlerini yapar.
"""

from __future__ import annotations

import time

try:
    import pyautogui
    pyautogui.FAILSAFE = False
except Exception:
    pyautogui = None

try:
    import pyperclip
except Exception:
    pyperclip = None


_ALLOWED_KEYS = {
    "ctrl", "alt", "shift", "win", "enter", "return", "esc", "escape",
    "space", "tab", "backspace", "delete", "up", "down", "left", "right",
    "home", "end", "pageup", "pagedown",
    "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
    *[chr(c) for c in range(ord("a"), ord("z") + 1)],
    *[str(d) for d in range(10)],
}


def ui_control(action: str, keys: str = "", text: str = "", amount: int = 0) -> str:
    if pyautogui is None:
        return "UI otomasyon modülü (pyautogui) yüklü değil."

    act = str(action or "").strip().lower()

    if act == "hotkey":
        parts = [p.strip().lower() for p in str(keys or "").replace("-", "+").split("+") if p.strip()]
        if not parts or any(p not in _ALLOWED_KEYS for p in parts):
            return f"Geçersiz veya desteklenmeyen kısayol: {keys}"
        # Güvenlik: kritik sistem kesintilerini (ctrl+alt+del vb.) engelle
        if set(parts) >= {"ctrl", "alt", "delete"}:
            return "Bu sistem kısayolu güvenlik nedeniyle engellendi."
        pyautogui.hotkey(*parts)
        return f"Kısayol uygulandı: {'+'.join(parts)}"

    if act == "press":
        key = str(keys or "").strip().lower()
        if key not in _ALLOWED_KEYS:
            return f"Geçersiz tuş: {keys}"
        pyautogui.press(key)
        return f"'{key}' tuşuna basıldı."

    if act == "type_text":
        msg = str(text or "")
        if not msg:
            return "Yazılacak metin belirtilmedi."
        if pyperclip is not None:
            pyperclip.copy(msg)
            time.sleep(0.05)
            pyautogui.hotkey("ctrl", "v")
        else:
            pyautogui.write(msg, interval=0.02)
        return "Metin aktif alana yazıldı."

    if act == "scroll":
        clicks = int(amount) if amount else -450
        pyautogui.scroll(clicks)
        direction = "yukarı" if clicks > 0 else "aşağı"
        return f"Sayfa {direction} kaydırıldı."

    return f"Bilinmeyen UI kontrol eylemi: {action}"
