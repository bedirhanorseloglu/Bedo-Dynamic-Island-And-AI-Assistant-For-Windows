"""
Bedo Headless Bridge UI Adaptörü.

Tkinter penceresi (ui.py) açmadan JarvisLive çekirdeğinin ihtiyaç duyduğu
tüm UI arayüzünü sağlar ve olayları JSON Lines (JSONL) olarak stdout'a aktarır.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import threading
import time
from typing import Any, Callable


class BridgeUI:
    """JarvisUI ile uyumlu, penceresiz (headless) Electron köprü adaptörü."""

    def __init__(
        self,
        emit_fn: Callable[[dict[str, Any]], None] | None = None,
        webcam_min_interval: float = 0.035,
    ):
        self._emit_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._emit_fn = emit_fn or self._default_emit
        self._webcam_min_interval = max(0.03, float(webcam_min_interval))
        self._last_webcam_emit = 0.0
        self._last_mic_emit = 0.0

        self.muted: bool = False
        self.system_mic_muted: bool = False
        self.paused: bool = False
        self.speaking: bool = False
        self.webcam_active: bool = False
        self._state: str = "INITIALISING"
        self._api_key_ready = threading.Event()
        self._shutdown_requested = threading.Event()

        # JarvisLive tarafından bağlanan callback'ler
        self.on_text_command: Callable[[str], None] | None = None
        self.on_pause_toggle: Callable[[bool], None] | None = None
        self.on_mute_change: Callable[[bool], None] | None = None
        self.on_effects_state_change: Callable[[bool], None] | None = None
        self.on_webcam_toggle: Callable[[bool], None] | None = None
        self.on_wake_trigger: Callable[[str], None] | None = None
        self.island_state: dict[str, Any] = {}

    def is_effectively_muted(self) -> bool:
        return bool(self.muted or self.system_mic_muted)

    @staticmethod
    def _default_emit(payload: dict[str, Any]) -> None:
        line = json.dumps(payload, ensure_ascii=False)
        out = sys.__stdout__ or sys.stdout
        out.write(line + "\n")
        out.flush()

    def emit(self, event_type: str, **data: Any) -> None:
        payload = {"type": event_type, "ts": time.time(), **data}
        with self._emit_lock:
            self._emit_fn(payload)

    # ── JarvisUI uyumlu metodlar ────────────────────────────────────────────

    def set_state(self, state: str) -> None:
        normalized = str(state or "").strip().upper() or "INITIALISING"
        with self._state_lock:
            changed = normalized != self._state
            self._state = normalized
            self.speaking = normalized == "SPEAKING"
        if changed:
            self.emit("state", state=normalized)

    def get_state(self) -> str:
        with self._state_lock:
            return self._state

    def write_log(self, text: str, source: str | None = None) -> None:
        raw = str(text or "")
        if raw.startswith("JARVIS:"):
            raw = "Bedo:" + raw[len("JARVIS:") :]
        elif raw.startswith("SYS: JARVIS"):
            raw = raw.replace("SYS: JARVIS", "SYS: Bedo", 1)
        elif raw.startswith("ERR: JARVIS"):
            raw = raw.replace("ERR: JARVIS", "ERR: Bedo", 1)

        role = "system"
        if raw.startswith("Siz:"):
            role = "user"
            self.mark_user_activity(True)
        elif raw.startswith("Bedo:"):
            role = "assistant"
        elif raw.startswith("ERR:"):
            role = "error"

        extra = {"source": source} if source else {}
        self.emit("log", text=raw, role=role, **extra)

    def write_debug(self, text: str, level: str = "INFO") -> None:
        self.emit("debug", text=str(text or ""), level=str(level or "INFO").upper())

    def set_webcam_active(self, active: bool) -> None:
        flag = bool(active)
        with self._state_lock:
            self.webcam_active = flag
        self.emit("webcam_state", active=flag)

    def update_webcam_preview(self, jpeg_bytes: bytes | None) -> None:
        if not jpeg_bytes:
            return
        now = time.monotonic()
        if now - self._last_webcam_emit < self._webcam_min_interval:
            return
        self._last_webcam_emit = now
        encoded = base64.b64encode(jpeg_bytes).decode("ascii")
        self.emit("webcam_frame", jpeg_b64=encoded)

    def focus_panel(self, section: str, duration_ms: int = 4200) -> None:
        sec = str(section or "").strip().lower()
        if not sec:
            return
        self.emit("focus_panel", section=sec, duration_ms=int(duration_ms))

    def mark_user_activity(self, active: bool = True) -> None:
        self.emit("user_activity", active=bool(active))

    def update_user_transcript(self, text: str, final: bool = False, new_turn: bool = False) -> None:
        """Kullanıcının söylediklerini konuşma bitmesini beklemeden anlık olarak UI'a aktarır."""
        clean = str(text or "").strip()
        if clean:
            self.emit("user_transcript", text=clean, final=bool(final), new_turn=bool(new_turn))

    def update_assistant_transcript(self, text: str, final: bool = False) -> None:
        """Bedo'nun söylediklerini konuşma sırasında anlık olarak UI'a aktarır."""
        clean = str(text or "").strip()
        if clean:
            self.emit("assistant_transcript", text=clean, final=bool(final))

    def update_mic_level(self, level: float) -> None:
        """Mikrofon ses seviyesini (0.0-1.0) ~10 Hz ile UI'a aktarır."""
        now = time.monotonic()
        if now - self._last_mic_emit < 0.09:
            return
        self._last_mic_emit = now
        clamped = max(0.0, min(1.0, float(level)))
        self.emit("mic_level", level=round(clamped, 3))

    def play_success_sfx(self) -> None:
        self.emit("sfx", name="success")

    def wake_up(self, source: str = "wake_word", transcript: str = "") -> None:
        """Bedo uyandırıldığında (Hey Bedo veya çift alkış) Electron'a bildirir."""
        self.emit("wake", source=source, transcript=transcript)
        if self.on_wake_trigger:
            self.on_wake_trigger(source)

    def go_to_sleep(self, delay_sec: float = 0.0) -> None:
        """Adayı kapatıp uyku moduna geçer (delay_sec <= 0 ise anında)."""
        delay = float(delay_sec or 0.0)
        if delay <= 0.0:
            self.emit("sleep")
            self.handle_command({"cmd": "set_paused", "paused": True})
            return

        def _delayed():
            time.sleep(delay)
            self.emit("sleep")
            self.handle_command({"cmd": "set_paused", "paused": True})
        threading.Thread(target=_delayed, daemon=True, name="BedoSleepDelay").start()

    def send_island_action(self, action: str, value: str = "") -> None:
        """Dynamic Island arayüzüne (medya, odak, sekme, görev, not) aksiyon gönderir."""
        self.emit("island_action", action=str(action or ""), value=str(value or ""))

    def wait_for_api_key(self, check_fn: Callable[[], str] | None = None, poll_interval: float = 0.25) -> str:
        """API anahtarı hazır olana kadar bekler."""
        while not self._shutdown_requested.is_set():
            env_key = (os.environ.get("BEDO_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()
            if env_key:
                self._api_key_ready.set()
                return env_key
            if check_fn is not None:
                val = str(check_fn() or "").strip()
                if val:
                    self._api_key_ready.set()
                    return val
            self._api_key_ready.wait(timeout=poll_interval)
        return ""

    # ── Electron -> Python komut işleme ─────────────────────────────────────

    def handle_command(self, cmd: dict[str, Any]) -> bool:
        """
        Electron'dan gelen tek bir JSON komutunu işler.
        Shutdown komutu gelirse False döner, diğer durumlarda True.
        """
        if not isinstance(cmd, dict):
            return True

        action = str(cmd.get("cmd") or cmd.get("type") or "").strip().lower()

        if action == "ping":
            self.emit("pong", state=self.get_state(), muted=self.muted, paused=self.paused)
            return True

        if action == "text_command":
            text = str(cmd.get("text") or "").strip()
            if text and self.on_text_command:
                self.on_text_command(text)
            return True

        if action == "set_muted":
            self.muted = bool(cmd.get("muted", False))
            if self.on_mute_change:
                self.on_mute_change(self.is_effectively_muted())
            self.emit("mute_state", muted=self.muted)
            return True

        if action == "set_system_mic_muted":
            self.system_mic_muted = bool(cmd.get("muted", False))
            if self.on_mute_change:
                self.on_mute_change(self.is_effectively_muted())
            self.emit("system_mic_mute_state", system_mic_muted=self.system_mic_muted)
            return True

        if action == "set_paused":
            self.paused = bool(cmd.get("paused", False))
            if self.on_pause_toggle:
                self.on_pause_toggle(self.paused)
            self.emit("pause_state", paused=self.paused)
            return True

        if action == "set_webcam":
            active = bool(cmd.get("active", False))
            if self.on_webcam_toggle:
                self.on_webcam_toggle(active)
            return True

        if action == "set_api_key":
            key = str(cmd.get("api_key") or "").strip()
            if key:
                os.environ["BEDO_GEMINI_API_KEY"] = key
                self._api_key_ready.set()
                try:
                    from actions.rag import clear_rag_caches
                    clear_rag_caches()
                except Exception:
                    pass
                self.emit("api_key_updated", ok=True)
            return True

        if action == "set_provider_keys":
            g = str(cmd.get("gemini_api_key") or "").strip()
            o = str(cmd.get("openai_api_key") or "").strip()
            a = str(cmd.get("anthropic_api_key") or "").strip()
            if g:
                os.environ["BEDO_GEMINI_API_KEY"] = g
                self._api_key_ready.set()
            if o:
                os.environ["BEDO_OPENAI_API_KEY"] = o
            if a:
                os.environ["BEDO_ANTHROPIC_API_KEY"] = a
            try:
                from actions.rag import clear_rag_caches
                clear_rag_caches()
            except Exception:
                pass
            self.emit("api_key_updated", ok=True)
            return True

        if action == "set_voice":
            voice = str(cmd.get("voice") or "").strip()
            if voice:
                os.environ["BEDO_VOICE"] = voice
                self.emit("voice_updated", voice=voice)
            return True

        if action == "island_state":
            raw_state = cmd.get("state")
            if isinstance(raw_state, dict):
                self.island_state = dict(raw_state)
            return True

        if action == "shutdown":
            self._shutdown_requested.set()
            self._api_key_ready.set()
            self.emit("shutting_down")
            return False

        self.write_debug(f"Bilinmeyen bridge komutu: {action}", level="WARN")
        return True
