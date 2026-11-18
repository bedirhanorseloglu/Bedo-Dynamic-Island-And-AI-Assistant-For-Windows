"""
Windows Sistem & Medya & Pencere Kontrolü.

Ses seviyesi, parlaklık, medya tuşları, pencere/masaüstü yönetimi,
ekran görüntüsü, ekran kilitleme ve uygulama kapatma işlemlerini yürütür.
"""

from __future__ import annotations

import ctypes
import datetime
import subprocess
from pathlib import Path

from actions.open_app import APP_ALIASES, _clean_target_name, _fold_key, _get_special_folders

# Windows Virtual-Key kodları
_VK_VOLUME_MUTE = 0xAD
_VK_VOLUME_DOWN = 0xAE
_VK_VOLUME_UP = 0xAF
_VK_MEDIA_NEXT_TRACK = 0xB0
_VK_MEDIA_PREV_TRACK = 0xB1
_VK_MEDIA_PLAY_PAUSE = 0xB3
_KEYEVENTF_KEYUP = 0x0002


def _tap_vk(vk_code: int, times: int = 1) -> None:
    user32 = ctypes.windll.user32
    for _ in range(max(1, times)):
        user32.keybd_event(vk_code, 0, 0, 0)
        user32.keybd_event(vk_code, 0, _KEYEVENTF_KEYUP, 0)


def _set_volume_percent(percent: int) -> str:
    pct = max(0, min(100, int(percent)))
    # 50 adım üzerinden mutlak 0'a çekip hedefe çıkar (ek bağımlılık gerektirmez)
    _tap_vk(_VK_VOLUME_DOWN, times=50)
    steps = round(pct / 2)
    if steps > 0:
        _tap_vk(_VK_VOLUME_UP, times=steps)
    return f"Ses seviyesi yaklaşık %{pct} olarak ayarlandı."


def _set_brightness_percent(percent: int) -> str:
    pct = max(0, min(100, int(percent)))
    ps = (
        f"(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods)"
        f".WmiSetBrightness(1, {pct})"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        timeout=6,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if res.returncode == 0:
        return f"Ekran parlaklığı %{pct} yapıldı."
    return "Parlaklık ayarı bu ekranda desteklenmiyor veya değiştirilemedi."


def _adjust_brightness(delta: int) -> str:
    ps = (
        "$b = (Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightness).CurrentBrightness; "
        f"$next = [Math]::Max(0, [Math]::Min(100, $b + ({delta}))); "
        "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(1, $next); "
        "Write-Output $next"
    )
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        timeout=6,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if res.returncode == 0 and res.stdout.strip():
        return f"Ekran parlaklığı %{res.stdout.strip().splitlines()[-1]} yapıldı."
    return "Ekran parlaklığı değiştirilemedi."


def _close_app(app_name: str) -> str:
    cleaned = _clean_target_name(app_name)
    norm = _fold_key(cleaned)
    exe = APP_ALIASES.get(norm, cleaned)
    if exe.endswith(":"):
        return f"'{cleaned}' kapatılamaz."
    if not exe.lower().endswith(".exe"):
        exe_target = f"{exe}.exe"
    else:
        exe_target = exe

    res = subprocess.run(
        ["taskkill", "/IM", exe_target, "/F"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=6,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if res.returncode == 0:
        return f"{cleaned} kapatıldı."
    return f"{cleaned} çalışmıyor veya kapatılamadı."


def _take_screenshot() -> str:
    import mss
    from PIL import Image

    desktop = _get_special_folders()["desktop"]
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = desktop / f"EkranGoruntusu_{stamp}.png"
    with mss.mss() as sct:
        shot = sct.grab(sct.monitors[1])
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        img.save(str(out_path))
    return f"Ekran görüntüsü Masaüstüne kaydedildi: {out_path.name}"


def system_control(action: str, value: str = "") -> str:
    act = _fold_key(action).replace(" ", "_")
    val = str(value or "").strip()

    if act in {"volume_up", "ses_artir", "sesi_ac"}:
        steps = max(1, min(25, int(val) // 2)) if val.isdigit() else 5
        _tap_vk(_VK_VOLUME_UP, times=steps)
        return "Ses artırıldı."

    if act in {"volume_down", "ses_azalt", "sesi_kis"}:
        steps = max(1, min(25, int(val) // 2)) if val.isdigit() else 5
        _tap_vk(_VK_VOLUME_DOWN, times=steps)
        return "Ses azaltıldı."

    if act in {"volume_mute", "mute", "sessiz", "sustur"}:
        _tap_vk(_VK_VOLUME_MUTE, times=1)
        return "Ses durumu değiştirildi (sessiz/açık)."

    if act in {"volume_set", "ses_ayarla"}:
        digits = "".join(ch for ch in val if ch.isdigit())
        if not digits:
            return "Ses yüzdesi belirtilmedi."
        return _set_volume_percent(int(digits))

    if act in {"brightness_set", "parlaklik_ayarla"}:
        digits = "".join(ch for ch in val if ch.isdigit())
        if not digits:
            return "Parlaklık yüzdesi belirtilmedi."
        return _set_brightness_percent(int(digits))

    if act in {"brightness_up", "parlaklik_artir"}:
        return _adjust_brightness(15)

    if act in {"brightness_down", "parlaklik_azalt"}:
        return _adjust_brightness(-15)

    if act in {"media_play_pause", "play_pause", "duraklat", "devam_et"}:
        _tap_vk(_VK_MEDIA_PLAY_PAUSE, times=1)
        return "Medya oynat/duraklat tuşuna basıldı."

    if act in {"media_next", "next_track", "sonraki_sarki"}:
        _tap_vk(_VK_MEDIA_NEXT_TRACK, times=1)
        return "Sonraki parçaya geçildi."

    if act in {"media_prev", "prev_track", "onceki_sarki"}:
        _tap_vk(_VK_MEDIA_PREV_TRACK, times=1)
        return "Önceki parçaya geçildi."

    if act in {"minimize_all", "show_desktop", "masaustunu_goster"}:
        import pyautogui
        pyautogui.hotkey("win", "d")
        return "Tüm pencereler küçültüldü, masaüstü gösteriliyor."

    if act in {"close_window", "pencereyi_kapat"}:
        import pyautogui
        pyautogui.hotkey("alt", "f4")
        return "Aktif pencere kapatıldı."

    if act in {"switch_window", "pencere_degistir"}:
        import pyautogui
        pyautogui.hotkey("alt", "tab")
        return "Pencere değiştirildi."

    if act in {"lock_screen", "ekrani_kilitle"}:
        ctypes.windll.user32.LockWorkStation()
        return "Ekran kilitlendi."

    if act in {"screenshot", "ekran_goruntusu"}:
        return _take_screenshot()

    if act in {"close_app", "uygulama_kapat"}:
        if not val:
            return "Kapatılacak uygulama adı belirtilmedi."
        return _close_app(val)

    return f"Bilinmeyen sistem kontrol eylemi: {action}"
