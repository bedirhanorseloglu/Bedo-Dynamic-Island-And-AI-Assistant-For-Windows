"""
Uygulama, klasör ve dosya açma — Windows için çok katmanlı çözümleyici.

Sırasıyla:
1. Doğal dil / Türkçe ek temizleme
2. Doğrudan dosya/klasör yolu + bilinen Windows kullanıcı klasörleri (OneDrive dahil)
3. Masaüstü / İndirilenler / Belgeler içinde alt klasör ve kısayol (.lnk) arama
4. Bilinen uygulama alias'ları ve URI şemaları (ms-settings:, vb.)
5. PATH (shutil.which) ve Windows Registry App Paths
6. Başlat Menüsü (.lnk) + Windows Get-StartApps (UWP/Store dahil)
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path

try:
    import winreg
except ImportError:
    winreg = None


APP_ALIASES = {
    "edge": "msedge",
    "microsoft edge": "msedge",
    "chrome": "chrome",
    "google chrome": "chrome",
    "comet": "Comet",
    "firefox": "firefox",
    "brave": "brave",
    "opera": "opera",
    "terminal": "wt",
    "windows terminal": "wt",
    "cmd": "cmd",
    "komut istemi": "cmd",
    "powershell": "powershell",
    "explorer": "explorer",
    "dosya gezgini": "explorer",
    "file explorer": "explorer",
    "bu bilgisayar": "explorer",
    "spotify": "Spotify",
    "vscode": "code",
    "vs code": "code",
    "visual studio code": "code",
    "code": "code",
    "cursor": "Cursor",
    "discord": "Discord",
    "slack": "Slack",
    "whatsapp": "WhatsApp",
    "telegram": "Telegram",
    "zoom": "Zoom",
    "steam": "Steam",
    "obs": "obs64",
    "vlc": "vlc",
    "notepad": "notepad",
    "notlar": "notepad",
    "not defteri": "notepad",
    "word": "winword",
    "excel": "excel",
    "powerpoint": "powerpnt",
    "calculator": "calc",
    "hesap makinesi": "calc",
    "task manager": "taskmgr",
    "görev yöneticisi": "taskmgr",
    "settings": "ms-settings:",
    "ayarlar": "ms-settings:",
    "paint": "mspaint",
    "snipping tool": "SnippingTool",
    "ekran alıntısı": "SnippingTool",
    "photos": "ms-photos:",
    "fotoğraflar": "ms-photos:",
    "maps": "bingmaps:",
    "haritalar": "bingmaps:",
    "mail": "outlookmail:",
    "calendar": "outlookcal:",
    "takvim": "outlookcal:",
    "store": "ms-windows-store:",
    "mağaza": "ms-windows-store:",
    "notion": "Notion",
}

URI_SCHEMES = (
    "ms-settings:",
    "ms-photos:",
    "bingmaps:",
    "outlookmail:",
    "outlookcal:",
    "ms-windows-store:",
    "mswindowsmusic:",
)

_TR_SUFFIX_RE = re.compile(r"['’](?:ı|i|u|ü|yı|yi|yu|yü|da|de|ta|te|dan|den|a|e)$", re.IGNORECASE)
_NOISE_WORDS_RE = re.compile(
    r"\b(?:klasörünü|klasörü|klasör|dosyasını|dosyası|uygulamasını|uygulaması|programını|programı)\b",
    re.IGNORECASE,
)


def _fold_key(text: str) -> str:
    return (
        str(text or "")
        .replace("İ", "i")
        .replace("I", "i")
        .replace("ı", "i")
        .replace("\u0307", "")
        .lower()
    )


def _clean_target_name(raw: str) -> str:
    text = str(raw or "").strip().strip('"').strip("'")
    text = _TR_SUFFIX_RE.sub("", text).strip()
    cleaned = _NOISE_WORDS_RE.sub("", text).strip()
    return cleaned or text


def _read_shell_folder(value_name: str) -> Path | None:
    if winreg is None:
        return None
    subkey = r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, subkey) as key:
            val, _ = winreg.QueryValueEx(key, value_name)
            if val:
                p = Path(os.path.expandvars(str(val)))
                if p.exists():
                    return p
    except OSError:
        pass
    return None


def _get_special_folders() -> dict[str, Path]:
    home = Path.home()
    onedrive = Path(os.environ.get("OneDrive") or (home / "OneDrive"))

    def _pick(reg_name: str | None, *candidates: Path) -> Path:
        if reg_name:
            reg_path = _read_shell_folder(reg_name)
            if reg_path is not None:
                return reg_path
        for c in candidates:
            if c.exists():
                return c
        return candidates[-1]

    desktop = _pick("Desktop", onedrive / "Masaüstü", onedrive / "Desktop", home / "Desktop", home / "Masaüstü")
    documents = _pick("Personal", onedrive / "Belgeler", onedrive / "Documents", home / "Documents")
    downloads = _pick("{374DE290-123F-4565-9164-39C4925E467B}", home / "Downloads", onedrive / "İndirilenler", home / "İndirilenler")
    pictures = _pick("My Pictures", onedrive / "Resimler", onedrive / "Pictures", home / "Pictures")
    music = _pick("My Music", home / "Music", home / "Müzik")
    videos = _pick("My Video", home / "Videos", home / "Videolar")

    return {
        "masaüstü": desktop,
        "masaüstünü": desktop,
        "masaüstüne": desktop,
        "masaustu": desktop,
        "masaustunu": desktop,
        "desktop": desktop,
        "indirilenler": downloads,
        "indirilenleri": downloads,
        "downloads": downloads,
        "belgeler": documents,
        "belgeleri": documents,
        "belgelerim": documents,
        "belgelerimi": documents,
        "documents": documents,
        "resimler": pictures,
        "resimleri": pictures,
        "fotoğraflar": pictures,
        "pictures": pictures,
        "müzik": music,
        "müziği": music,
        "muzik": music,
        "music": music,
        "videolar": videos,
        "videoları": videos,
        "videos": videos,
        "kullanıcı": home,
        "kullanici": home,
        "home": home,
    }


def _resolve_folder_or_path(raw: str) -> Path | None:
    expanded = os.path.expandvars(os.path.expanduser(str(raw or "").strip().strip('"')))
    if expanded:
        p = Path(expanded)
        if p.exists():
            return p

    cleaned = _clean_target_name(raw)
    low = _fold_key(cleaned)
    folders = _get_special_folders()

    if low in folders and folders[low].exists():
        return folders[low]

    # "Masaüstündeki X" veya doğrudan Masaüstü / İndirilenler / Belgeler içindeki alt klasör
    sub_query = re.sub(r"^(?:masaüstündeki|masaustundeki|indirilenlerdeki|belgelerdeki)\s+", "", low).strip()
    if sub_query:
        for base in (folders["desktop"], folders["downloads"], folders["documents"], folders["home"]):
            if not base.exists():
                continue
            try:
                for entry in base.iterdir():
                    if _fold_key(entry.name) == sub_query or _fold_key(entry.stem) == sub_query:
                        return entry
            except OSError:
                continue
            try:
                for entry in base.iterdir():
                    if sub_query in _fold_key(entry.name) and not entry.name.startswith("."):
                        return entry
            except OSError:
                continue

    return None


def _find_registry_app_path(exe_name: str) -> str | None:
    if winreg is None:
        return None
    candidates = [exe_name]
    if not exe_name.lower().endswith(".exe"):
        candidates.append(f"{exe_name}.exe")

    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for cand in candidates:
            subkey = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\{cand}"
            try:
                with winreg.OpenKey(root, subkey) as key:
                    val, _ = winreg.QueryValueEx(key, "")
                    if val:
                        path_str = os.path.expandvars(str(val).strip().strip('"'))
                        if os.path.exists(path_str):
                            return path_str
            except OSError:
                continue
    return None


def _find_start_menu_shortcut(query: str) -> Path | None:
    low = query.lower().strip()
    if not low:
        return None

    roots = [
        Path(os.environ.get("ProgramData", r"C:\ProgramData")) / "Microsoft" / "Windows" / "Start Menu" / "Programs",
        Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs",
    ]
    folders = _get_special_folders()
    roots.append(folders["desktop"])

    partial_match: Path | None = None
    for root in roots:
        if not root or not root.exists():
            continue
        try:
            for item in root.rglob("*"):
                if item.suffix.lower() not in {".lnk", ".url"}:
                    continue
                stem = item.stem.lower()
                if stem == low:
                    return item
                if partial_match is None and (stem.startswith(low) or low in stem):
                    partial_match = item
        except OSError:
            continue
    return partial_match


def _find_start_app_id(query: str) -> tuple[str, str] | None:
    low = query.lower().strip()
    if not low:
        return None
    ps_script = (
        "Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress"
    )
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", ps_script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=6,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if res.returncode != 0 or not res.stdout.strip():
            return None
        data = json.loads(res.stdout)
        if isinstance(data, dict):
            data = [data]
        partial: tuple[str, str] | None = None
        for item in data or []:
            name = str(item.get("Name") or "")
            app_id = str(item.get("AppID") or "")
            if not name or not app_id:
                continue
            nlow = name.lower()
            if nlow == low:
                return name, app_id
            if partial is None and (nlow.startswith(low) or low in nlow):
                partial = (name, app_id)
        return partial
    except Exception:
        return None


def open_app(app_name: str) -> str:
    if not app_name or not str(app_name).strip():
        return "Uygulama veya klasör adı belirtilmedi."

    raw = str(app_name).strip()
    cleaned = _clean_target_name(raw)
    normalized = _fold_key(cleaned)

    # 1. Doğrudan dosya / klasör / bilinen Windows klasörü
    path_target = _resolve_folder_or_path(raw)
    if path_target is not None:
        try:
            os.startfile(str(path_target))
            return f"{path_target.name or raw} açıldı."
        except Exception as e:
            return f"'{raw}' açılamadı: {e}"

    resolved = APP_ALIASES.get(normalized, cleaned)

    # 2. URI scheme (ms-settings:, ms-photos: vb.)
    if any(resolved.lower().startswith(scheme) for scheme in URI_SCHEMES):
        try:
            os.startfile(resolved)
            return f"{cleaned} açıldı."
        except Exception as e:
            return f"'{raw}' açılamadı: {e}"

    # 3. PATH'teki executable veya Registry App Paths
    exe_path = shutil.which(resolved) or _find_registry_app_path(resolved)
    if exe_path:
        try:
            subprocess.Popen([exe_path], shell=False)
            return f"{cleaned} açıldı."
        except Exception as e:
            return f"'{raw}' açılamadı: {e}"

    # 4. Başlat Menüsü veya Masaüstü kısayolu (.lnk / .url)
    shortcut = _find_start_menu_shortcut(cleaned) or _find_start_menu_shortcut(resolved)
    if shortcut is not None:
        try:
            os.startfile(str(shortcut))
            return f"{shortcut.stem} açıldı."
        except Exception as e:
            return f"'{raw}' açılamadı: {e}"

    # 5. Windows Get-StartApps (Store/UWP ve kayıtlı uygulamalar)
    start_app = _find_start_app_id(cleaned) or _find_start_app_id(resolved)
    if start_app is not None:
        app_title, app_id = start_app
        try:
            subprocess.Popen(["explorer.exe", f"shell:AppsFolder\\{app_id}"], shell=False)
            return f"{app_title} açıldı."
        except Exception as e:
            return f"'{raw}' açılamadı: {e}"

    # 6. Son çare: Windows shell start / os.startfile
    try:
        result = subprocess.run(
            f'start "" "{resolved}"',
            shell=True,
            capture_output=True,
            text=True,
            timeout=8,
        )
        if result.returncode == 0:
            return f"{cleaned} açıldı."
    except Exception:
        pass

    try:
        os.startfile(resolved)
        return f"{cleaned} açıldı."
    except Exception as e:
        return f"'{raw}' bulunamadı veya açılamadı: {e}"
