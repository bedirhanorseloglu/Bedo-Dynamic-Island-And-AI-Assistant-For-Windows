#!/usr/bin/env python3
"""
Bedo Headless Bridge — TwoCode Electron Sidecar Giriş Noktası.

Tkinter UI açmadan Bedo (JarvisLive) çekirdeğini ve "Hey Bedo" wake-word
dinleyicisini başlatır; stdin/stdout üzerinden JSON Lines protokolü ile
TwoCode Electron ana sürecine bağlanır.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from bridge_ui import BridgeUI


def _configure_utf8_stdio(redirect_prints_to_stderr: bool = True) -> None:
    if hasattr(sys.__stdout__, "reconfigure"):
        sys.__stdout__.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    if redirect_prints_to_stderr:
        sys.stdout = sys.stderr


def _stdin_loop(ui: BridgeUI) -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as exc:
            ui.write_debug(f"Geçersiz JSON komutu: {exc}", level="ERROR")
            continue

        keep_going = ui.handle_command(cmd)
        if not keep_going:
            break


def main(argv: list[str] | None = None) -> int:
    _configure_utf8_stdio()

    parser = argparse.ArgumentParser(description="Bedo Headless Bridge")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Gemini Live bağlantısı açmadan sadece bridge stdin/stdout döngüsünü çalıştırır.",
    )
    parser.add_argument(
        "--start-paused",
        action="store_true",
        help="Başlangıçta Gemini Live oturumunu duraklatılmış (wake-word bekler) başlatır.",
    )
    parser.add_argument(
        "--no-wake",
        action="store_true",
        help="Offline 'Hey Bedo' dinleyicisini devre dışı bırakır.",
    )
    parser.add_argument(
        "--enable-clap",
        action="store_true",
        help="Çift alkış tetikleyicisini açar (varsayılan kapalı).",
    )
    args = parser.parse_args(argv)

    ui = BridgeUI()
    if args.start_paused:
        ui.paused = True

    ui.emit(
        "ready",
        dry_run=args.dry_run,
        paused=ui.paused,
        wake_enabled=not args.no_wake,
        speaker_volume=round(ui.speaker_volume, 3),
        speaker_muted=ui.speaker_muted,
    )

    if args.dry_run:
        _stdin_loop(ui)
        return 0

    from main import JarvisLive, get_api_key
    from wake_word import WakeManager, _wake_log

    stdin_thread = threading.Thread(target=_stdin_loop, args=(ui,), daemon=True, name="BedoStdin")
    stdin_thread.start()

    ui.wait_for_api_key(check_fn=get_api_key)
    if ui._shutdown_requested.is_set():
        return 0

    bedo = JarvisLive(ui)
    bedo._paused = ui.paused

    wake_manager = None
    orig_pause_cb = ui.on_pause_toggle

    def _wrapped_pause_toggle(paused: bool) -> None:
        _wake_log(f"bridge._wrapped_pause_toggle(paused={paused})")
        if orig_pause_cb:
            orig_pause_cb(paused)
        if wake_manager:
            if paused:
                def _resume_after_mic_release() -> None:
                    bedo.wait_mic_released(timeout=1.5)
                    if ui.paused:
                        wake_manager.resume()
                threading.Thread(target=_resume_after_mic_release, daemon=True, name="WakeResumeHandoff").start()
            else:
                wake_manager.pause()

    ui.on_pause_toggle = _wrapped_pause_toggle

    def _on_mute_change(effectively_muted: bool) -> None:
        _wake_log(f"bridge._on_mute_change(effectively_muted={effectively_muted})")
        if wake_manager:
            wake_manager.set_muted(effectively_muted)

    ui.on_mute_change = _on_mute_change

    def _on_wake(source: str, transcript: str) -> None:
        _wake_log(f"bridge._on_wake(source={source}, transcript={transcript!r}, muted={ui.is_effectively_muted()}, paused={ui.paused})")
        if ui.is_effectively_muted():
            return
        if wake_manager:
            wake_manager.pause()
        ui.wake_up(source=source, transcript=transcript)
        if ui.paused:
            ui.handle_command({"cmd": "set_paused", "paused": False})

    if not args.no_wake:
        try:
            wake_manager = WakeManager(
                models_dir=BASE_DIR / "models",
                on_wake=_on_wake,
                enable_voice=True,
                enable_clap=bool(args.enable_clap),
            )
            wake_status = wake_manager.start()
            ui.emit("wake_status", **wake_status)
            if ui.is_effectively_muted():
                wake_manager.set_muted(True)
            if not ui.paused:
                wake_manager.pause()
        except Exception as exc:
            ui.write_debug(f"WakeManager başlatılamadı: {exc}", level="WARN")
            wake_manager = None

    try:
        asyncio.run(bedo.run())
    except KeyboardInterrupt:
        pass
    finally:
        if wake_manager:
            wake_manager.stop()
        ui.emit("stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
