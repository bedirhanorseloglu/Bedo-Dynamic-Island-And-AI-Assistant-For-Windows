"""
Bilgisayar Geneli Dosya & Klasör Arama, Açma ve Oluşturma.
"""

from __future__ import annotations

import os
import time
from collections import deque
from pathlib import Path

from actions.open_app import _clean_target_name, _fold_key, _get_special_folders

_SKIP_DIRS = {
    "windows", "$recycle.bin", "system volume information", "programdata",
    "appdata", "node_modules", ".git", "__pycache__", "venv", ".venv",
}


def find_and_open(
    query: str,
    open_first: bool = True,
    search_root: str = "",
    max_results: int = 8,
    timeout_sec: float = 4.5,
) -> str:
    raw = str(query or "").strip()
    cleaned = _clean_target_name(raw)
    needle = _fold_key(cleaned)
    if not needle:
        return "Aranacak dosya veya klasör adı belirtilmedi."

    folders = _get_special_folders()
    roots: list[Path] = []
    if search_root:
        sr = Path(os.path.expandvars(os.path.expanduser(search_root.strip())))
        if sr.exists():
            roots.append(sr)
    if not roots:
        home = Path.home()
        raw_roots = [
            folders["desktop"],
            home / "OneDrive" / "Masaüstü",
            home / "OneDrive" / "Desktop",
            home / "Desktop",
            folders["downloads"],
            folders["documents"],
            folders["pictures"],
            folders["videos"],
            folders["music"],
        ]
        seen_roots: set[str] = set()
        for r in raw_roots:
            key = str(r).lower()
            if key not in seen_roots and r.exists():
                seen_roots.add(key)
                roots.append(r)

    exact_matches: list[Path] = []
    partial_matches: list[Path] = []
    deadline = time.monotonic() + timeout_sec

    # Breadth-First Search (BFS): Masaüstü/Belgeler kök klasörleri milisaniyeler içinde bulunur
    queue: deque[Path] = deque(r for r in roots if r.exists())
    visited: set[str] = set()

    while queue and time.monotonic() <= deadline:
        current = queue.popleft()
        cur_key = str(current).lower()
        if cur_key in visited:
            continue
        visited.add(cur_key)

        try:
            with os.scandir(current) as it:
                entries = list(it)
        except OSError:
            continue

        subdirs: list[Path] = []
        for entry in entries:
            name = entry.name
            if name.startswith(".") or name.lower() in _SKIP_DIRS:
                continue
            full_p = Path(entry.path)
            folded = _fold_key(name)
            stem_folded = _fold_key(Path(name).stem)
            if folded == needle or stem_folded == needle:
                exact_matches.append(full_p)
            elif needle in folded:
                partial_matches.append(full_p)
            if entry.is_dir(follow_symlinks=False):
                subdirs.append(full_p)

        if exact_matches and open_first:
            break
        if len(exact_matches) + len(partial_matches) >= max_results * 2:
            break
        queue.extend(subdirs)

    matches = (exact_matches + partial_matches)[:max_results]
    if not matches:
        return f"'{cleaned}' ile eşleşen dosya veya klasör bulunamadı."

    if open_first:
        target = matches[0]
        try:
            os.startfile(str(target))
            return f"Bulundu ve açıldı: {target}"
        except Exception as e:
            return f"Bulundu ({target}) ancak açılamadı: {e}"

    listed = "\n".join(f"- {m}" for m in matches)
    return f"Bulunan sonuçlar:\n{listed}"


def create_folder(name: str, location: str = "desktop") -> str:
    folder_name = _clean_target_name(name)
    if not folder_name:
        return "Oluşturulacak klasör adı belirtilmedi."

    folders = _get_special_folders()
    loc_key = _fold_key(location)
    base = folders.get(loc_key)
    if base is None:
        candidate = Path(os.path.expandvars(os.path.expanduser(str(location or ""))))
        base = candidate if candidate.exists() else folders["desktop"]

    target = base / folder_name
    try:
        target.mkdir(parents=True, exist_ok=True)
        return f"Klasör oluşturuldu: {target}"
    except Exception as e:
        return f"Klasör oluşturulamadı: {e}"
