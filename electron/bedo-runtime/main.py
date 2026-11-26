#!/usr/bin/env python3
"""
JARVIS Windows — Gercek zamanli sesli yardimci cekirdegi
Windows ortamina uyarlanmis calisma akisi
macOS surumunden tam ozellik paritesiyle portlanmistir.
"""

import asyncio
from collections import deque
import datetime
import math
import struct
import threading
import traceback
import os
import time
import re
from pathlib import Path

import pyaudio  # type: ignore[reportMissingModuleSource]
from google import genai  # type: ignore[reportMissingImports]
from google.genai import types  # type: ignore[reportMissingImports]

from app_config import get_app_config_value
from ui import JarvisUI
from memory.memory_manager import (
    load_memory,
    update_memory,
    delete_memory,
    format_memory_for_prompt,
    search_memory,
    remember_conversation_turn,
)
from actions.open_app import open_app
from actions.sys_info  import sys_info
from actions.calendar import get_calendar_events, add_calendar_event, delete_calendar_event
from actions.reminders import get_reminders, add_reminder
from actions.browser   import browser_control
from actions.shell     import shell_run
from actions.whatsapp  import send_whatsapp_message, save_whatsapp_contact
from actions.media     import play_media
from actions.weather   import get_weather_summary
from actions.screen_vision import analyze_screen
from actions.youtube_stats import get_youtube_channel_report
from actions.system_control import system_control
from actions.ui_control import ui_control
from actions.file_ops import find_and_open, create_folder
from actions.island import handle_island_control
from actions.rag import web_search_answer, local_rag_query
from audio_clean import PitchPreservingTimeScaler, RealTimeSpeechDenoiser

try:
    from wakeup_listener import WakeGestureListener
except Exception:  # pyaudio yoksa veya mikrofon erisimi yoksa uygulama yine acilsin
    WakeGestureListener = None

# ── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).resolve().parent
PROMPT_PATH     = BASE_DIR / "core" / "prompt.txt"


# ── WebcamStreamer ──────────────────────────────────────────────────────────
class WebcamStreamer:
    """
    Webcam'dan sürekli kare çeker ve en güncel JPEG'i bellekte tutar.
    AI için aynalanmamış yüksek çözünürlüklü (1024px) kare, UI önizlemesi için
    aynalı hafif (480px) kare üretir.
    """

    JPEG_QUALITY = 72
    AI_JPEG_QUALITY = 85
    MAX_DIM      = 480
    AI_MAX_DIM   = 1024
    WARMUP       = 6

    def __init__(self):
        self._latest: bytes | None = None
        self._latest_ai: bytes | None = None
        self._lock   = threading.Lock()
        self._active = False
        self._thread: threading.Thread | None = None

    @property
    def is_active(self) -> bool:
        return self._active

    def get_latest_frame(self) -> bytes | None:
        """UI önizlemesi için aynalı en güncel kareyi döner."""
        with self._lock:
            return self._latest

    def get_latest_ai_frame(self) -> bytes | None:
        """Gemini AI için aynalanmamış yüksek çözünürlüklü kareyi döner."""
        with self._lock:
            return self._latest_ai or self._latest

    def start(self) -> str:
        with self._lock:
            if self._active:
                return "already_active"
            self._active = True
            self._latest = None
            self._latest_ai = None
        t = threading.Thread(target=self._run, daemon=True)
        self._thread = t
        t.start()
        return "ok"

    def stop(self):
        with self._lock:
            self._active = False
            self._latest = None
            self._latest_ai = None

    def _run(self):
        try:
            import cv2
        except ImportError:
            print("[Webcam] opencv-python yüklü değil.")
            with self._lock:
                self._active = False
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[Webcam] Kamera açılamadı.")
            with self._lock:
                self._active = False
            return

        # HD çözünürlük ve otomatik odaklama iste (destekleyen kameralarda netliği artırır)
        try:
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
            cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
        except Exception:
            pass

        # Isınma — sensörün otomatik pozlaması oturuncaya kadar bekle
        for _ in range(self.WARMUP):
            cap.read()

        enc_ui = [cv2.IMWRITE_JPEG_QUALITY, self.JPEG_QUALITY]
        enc_ai = [cv2.IMWRITE_JPEG_QUALITY, self.AI_JPEG_QUALITY]

        try:
            while True:
                with self._lock:
                    if not self._active:
                        break

                ret, frame = cap.read()
                if not ret:
                    break

                h, w = frame.shape[:2]

                # 1) AI karesi: aynalanmamış (yazılar düz okunur), yüksek çözünürlüklü
                ai_frame = frame
                if max(h, w) > self.AI_MAX_DIM:
                    s_ai = self.AI_MAX_DIM / max(h, w)
                    ai_frame = cv2.resize(frame, (int(w * s_ai), int(h * s_ai)), interpolation=cv2.INTER_AREA)
                ok_ai, buf_ai = cv2.imencode(".jpg", ai_frame, enc_ai)

                # 2) UI önizleme karesi: aynalı, hafif
                ui_frame = cv2.flip(frame, 1)
                if max(h, w) > self.MAX_DIM:
                    s_ui = self.MAX_DIM / max(h, w)
                    ui_frame = cv2.resize(ui_frame, (int(w * s_ui), int(h * s_ui)), interpolation=cv2.INTER_AREA)
                ok_ui, buf_ui = cv2.imencode(".jpg", ui_frame, enc_ui)

                if ok_ui or ok_ai:
                    with self._lock:
                        if ok_ui:
                            self._latest = buf_ui.tobytes()
                        if ok_ai:
                            self._latest_ai = buf_ai.tobytes()

                # ~33 FPS yakala → 24 FPS UI her zaman taze kare bulur
                time.sleep(0.03)
        finally:
            cap.release()
            with self._lock:
                self._active = False
                self._latest = None
            print("[Webcam] Kamera serbest bırakıldı.")


CONTROL_TOKEN_RE = re.compile(r"<ctrl\d+>", re.IGNORECASE)

# ── Model ───────────────────────────────────────────────────────────────────
LIVE_MODEL = "models/gemini-2.5-flash-native-audio-latest"

# ── Audio ───────────────────────────────────────────────────────────────────
FORMAT           = pyaudio.paInt16
CHANNELS         = 1
SEND_SAMPLE_RATE = 16000
RECV_SAMPLE_RATE = 24000
PLAYBACK_SPEED   = 1.16
PLAYBACK_RATE    = RECV_SAMPLE_RATE
CHUNK_SIZE       = 960  # 60ms @ 16kHz (RNNoise 160-örnek ve WebRTC VAD 480-örnek ile tam hizalı)
pya              = pyaudio.PyAudio()

# ── Tool tanımları — paylaşılan modülden ────────────────────────────────────
from tool_defs import TOOL_DECLARATIONS


def get_api_key() -> str:
    cfg_key = str(get_app_config_value("gemini_api_key", "") or "").strip()
    if cfg_key:
        return cfg_key
    return (os.environ.get("BEDO_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") or "").strip()


def load_system_prompt() -> str:
    try:
        return PROMPT_PATH.read_text(encoding="utf-8")
    except Exception:
        return (
            "Sen Bedo'sun — Windows'ta çalışan kişisel AI asistanı. "
            "Türkçe konuş. Kısa ve net yanıtlar ver. "
            "Araçları kullanarak görevleri tamamla, asla taklit etme."
        )


class JarvisLive:
    def __init__(self, ui: JarvisUI):
        self.ui             = ui
        self.session        = None
        self.audio_in_queue = None
        self.out_queue      = None
        self._loop          = None
        self._is_speaking   = False
        self._speaking_lock = threading.Lock()
        self._music_proc    = None
        self._webcam_streamer = WebcamStreamer()
        self._pending_text_commands: list[str] = []

        self.ui.on_text_command  = self._on_text_command
        self.ui.on_pause_toggle  = self._on_pause_toggle
        self.ui.on_effects_state_change = self._on_effects_state_change
        self.ui.on_webcam_toggle = self._on_webcam_toggle_ui
        self._paused             = False
        self._resume_event       = None
        self._pause_event        = None
        self._mic_released       = threading.Event()
        self._mic_released.set()

    def wait_mic_released(self, timeout: float = 1.5) -> bool:
        return self._mic_released.wait(timeout=timeout)

    def _on_pause_toggle(self, paused: bool):
        self._paused = paused
        if paused:
            self._stop_music()
            if self._pause_event is not None and self._loop is not None:
                try:
                    self._loop.call_soon_threadsafe(self._pause_event.set)
                except Exception:
                    pass
        elif self._resume_event is not None and self._loop is not None:
            try:
                self._loop.call_soon_threadsafe(self._resume_event.set)
            except Exception:
                pass

    def _on_effects_state_change(self, enabled: bool):
        if not enabled:
            self._stop_music()

    def _on_webcam_toggle_ui(self, activate: bool):
        if activate:
            status = self._webcam_streamer.start()
            self.ui.set_webcam_active(status == "ok" or status == "already_active")
        else:
            self._webcam_streamer.stop()
            self.ui.set_webcam_active(False)

    def _focus_ui_section_for_tool(self, tool_name: str, args: dict):
        if tool_name == "sys_info":
            query = str(args.get("query", "")).strip().lower()
            if query in {"time", "saat", "zaman", "date", "tarih"}:
                self.ui.focus_panel("time", duration_ms=5200)
            else:
                self.ui.focus_panel("system", duration_ms=5200)
        elif tool_name == "get_weather":
            self.ui.focus_panel("weather", duration_ms=5600)

    def _on_text_command(self, text: str):
        clean = str(text or "").strip()
        if not clean:
            return
        if self._paused:
            if hasattr(self.ui, "handle_command"):
                self.ui.handle_command({"cmd": "set_paused", "paused": False})
            else:
                self._paused = False
        self.ui.write_log(f"Siz: {clean}")
        self.ui.set_state("THINKING")
        if not self._loop or not self.session:
            self._pending_text_commands.append(clean)
            return
        fut = asyncio.run_coroutine_threadsafe(
            self.session.send_client_content(
                turns=[types.Content(role="user", parts=[types.Part.from_text(text=clean)])],
                turn_complete=True,
            ),
            self._loop,
        )

        def _on_text_done(f):
            try:
                f.result()
            except Exception as exc:
                self.ui.write_log(f"ERR: Metin komutu gönderilemedi: {exc}")
                self.ui.set_state("LISTENING")

        fut.add_done_callback(_on_text_done)

    async def _interrupt_audio(self):
        try:
            if self.audio_in_queue:
                while not self.audio_in_queue.empty():
                    try:
                        self.audio_in_queue.get_nowait()
                    except Exception:
                        break
            if self.session:
                await self.session.send_realtime_input(audio_stream_end=True)
            self.set_speaking(False)
        except Exception:
            pass

    def _stop_music(self):
        proc = self._music_proc
        if proc and proc.poll() is None:
            try:
                proc.terminate()
            except Exception:
                pass
        self._music_proc = None

    def set_speaking(self, value: bool):
        with self._speaking_lock:
            self._is_speaking = value
        if value:
            self.ui.set_state("SPEAKING")
        else:
            self.ui.set_state("LISTENING")

    def speak_error(self, tool_name: str, error: str):
        short = str(error)[:120]
        self.ui.write_log(f"ERR: {tool_name} — {short}")
        self.ui.write_debug(f"{tool_name}: {short}", level="ERROR")
        self.ui.set_state("ERROR")

    @staticmethod
    def _result_looks_like_error(result) -> bool:
        text = str(result or "").strip().lower()
        if not text:
            return False
        error_markers = (
            "hata",
            "error",
            "alinamadi",
            "alınamadı",
            "bulunamadi",
            "bulunamadı",
            "acilamadi",
            "açılamadı",
            "tamamlanamadi",
            "tamamlanamadı",
            "gecersiz",
            "geçersiz",
            "izin gerekiyor",
            "izin gerekli",
            "baglanti",
            "bağlantı",
            "gerekli.",
        )
        return any(marker in text for marker in error_markers)

    @staticmethod
    def _should_play_success_sfx(tool_name: str, args: dict, result) -> bool:
        action_tools = {
            "open_app",
            "add_calendar_event",
            "add_reminder",
            "delete_calendar_event",
            "remove_calendar_event",
        }
        if tool_name in action_tools:
            return True

        if tool_name == "send_whatsapp_message":
            text = str(result or "").lower()
            if bool(args.get("send_now", False)):
                return "gönderildi" in text or "gonderildi" in text
            return False

        return False

    @staticmethod
    def _clean_transcript_text(text: str, preserve_edges: bool = False) -> tuple[str, bool]:
        raw = str(text or "")
        had_noise = False
        if CONTROL_TOKEN_RE.search(raw):
            had_noise = True
            raw = CONTROL_TOKEN_RE.sub(" ", raw)
        cleaned = []
        for ch in raw:
            if ch in "\n\r\t" or ord(ch) >= 32:
                cleaned.append(ch)
            else:
                had_noise = True
        joined = "".join(cleaned)
        if preserve_edges:
            return re.sub(r"[ \t]+", " ", joined), had_noise
        normalized = " ".join(joined.split())
        return normalized.strip(), had_noise

    def _build_config(self) -> types.LiveConnectConfig:
        import datetime
        memory  = load_memory()
        mem_str = format_memory_for_prompt(memory)
        sys_p   = load_system_prompt()
        now     = datetime.datetime.now()
        time_ctx = f"[ŞU ANKİ ZAMAN]\n{now.strftime('%A, %d %B %Y — %H:%M')}\n\n"

        parts = [time_ctx]
        if mem_str:
            parts.append(mem_str + "\n\n")
        parts.append(sys_p)

        return types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            output_audio_transcription={},
            input_audio_transcription={},
            system_instruction="\n".join(parts),
            tools=[{"google_search": {}}, {"function_declarations": TOOL_DECLARATIONS}],
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_HIGH,
                    silence_duration_ms=450,
                )
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=(os.environ.get("BEDO_VOICE") or str(get_app_config_value("voice", "Charon") or "Charon")).strip()
                    )
                )
            ),
        )

    async def _execute_tool(self, fc) -> types.FunctionResponse:
        name = fc.name
        args = dict(fc.args or {})
        print(f"[JARVIS] 🔧 {name} {args}")
        self.ui.set_state("THINKING")

        loop   = asyncio.get_event_loop()
        result = "Tamam."
        had_exception = False

        async def _progress_notifier() -> None:
            try:
                await asyncio.sleep(3.5)
                if hasattr(self.ui, "emit"):
                    self.ui.emit("thinking_progress", text="Hâlâ araştırıyorum...")
                await asyncio.sleep(4.5)
                if hasattr(self.ui, "emit"):
                    self.ui.emit("thinking_progress", text="Biraz daha sürüyor, kontrol ediyorum...")
            except asyncio.CancelledError:
                pass

        progress_task = asyncio.create_task(_progress_notifier())

        try:
            if name == "sleep_assistant":
                if hasattr(self.ui, "go_to_sleep"):
                    self.ui.go_to_sleep(delay_sec=0.0)
                result = "Uyku moduna geçildi. Sessiz kal, veda etme."

            elif name == "save_memory":
                cat = args.get("category", "notes")
                key = args.get("key", "")
                val = args.get("value", "")
                if key and val:
                    update_memory({cat: {key: {"value": val}}})
                    print(f"[Memory] 💾 {cat}/{key} = {val}")
                result = "ok"

            elif name == "delete_memory":
                result = delete_memory(
                    args.get("category", ""),
                    args.get("key", ""),
                    args.get("match_text", ""),
                )

            elif name == "search_memory":
                result = await loop.run_in_executor(
                    None,
                    lambda: search_memory(
                        args.get("query", ""),
                        int(args.get("limit", 5) or 5),
                    ),
                )

            elif name == "open_app":
                r = await loop.run_in_executor(
                    None, lambda: open_app(args.get("app_name", "")))
                result = r or f"{args.get('app_name')} açıldı."

            elif name == "sys_info":
                self._focus_ui_section_for_tool(name, args)
                r = await loop.run_in_executor(
                    None, lambda: sys_info(args.get("query", "all")))
                result = r or "Bilgi alındı."

            elif name == "get_weather":
                self._focus_ui_section_for_tool(name, args)
                r = await loop.run_in_executor(
                    None, lambda: get_weather_summary(args.get("location") or None))
                result = r or "Hava durumu bilgisi alindi."

            elif name == "get_calendar_events":
                r = await loop.run_in_executor(
                    None,
                    lambda: get_calendar_events(
                        args.get("query", "today"),
                        int(args.get("limit", 6) or 6),
                    ),
                )
                result = r or "Takvim bilgisi alindi."

            elif name == "add_calendar_event":
                r = await loop.run_in_executor(
                    None,
                    lambda: add_calendar_event(
                        args.get("title", ""),
                        args.get("start_iso", ""),
                        args.get("end_iso", ""),
                        args.get("notes", ""),
                        args.get("location", ""),
                        args.get("calendar_name", ""),
                        bool(args.get("all_day", False)),
                    ),
                )
                result = r or "Takvim etkinligi eklendi."

            elif name == "delete_calendar_event":
                r = await loop.run_in_executor(
                    None,
                    lambda: delete_calendar_event(
                        args.get("title", ""),
                        args.get("start_iso", ""),
                        args.get("calendar_name", ""),
                        bool(args.get("delete_all_matches", False)),
                    ),
                )
                result = r or "Takvim etkinligi silindi."

            elif name == "get_reminders":
                r = await loop.run_in_executor(
                    None,
                    lambda: get_reminders(
                        args.get("query", "upcoming"),
                        int(args.get("limit", 8) or 8),
                        args.get("list_name", ""),
                    ),
                )
                result = r or "Animsatici bilgisi alindi."

            elif name == "add_reminder":
                r = await loop.run_in_executor(
                    None,
                    lambda: add_reminder(
                        args.get("title", ""),
                        args.get("due_iso", ""),
                        args.get("notes", ""),
                        args.get("list_name", ""),
                        args.get("priority", ""),
                        bool(args.get("all_day", False)),
                    ),
                )
                result = r or "Animsatici eklendi."

            elif name == "browser_control":
                r = await loop.run_in_executor(
                    None, lambda: browser_control(
                        args.get("action"),
                        args.get("url"),
                        args.get("query")
                    ))
                result = r or "Tamam."

            elif name == "shell_run":
                r = await loop.run_in_executor(
                    None, lambda: shell_run(args.get("command", "")))
                result = r or "Komut çalıştırıldı."

            elif name == "toggle_webcam":
                action = str(args.get("action", "start")).strip().lower()
                if action == "start":
                    status = self._webcam_streamer.start()
                    if status == "ok":
                        self.ui.set_webcam_active(True)
                        result = (
                            "Webcam akışı başlatıldı. "
                            "Artık kameranı görüyorum — dilediğin zaman soru sorabilirsin."
                        )
                    elif status == "already_active":
                        result = "Webcam zaten açık, görüntü alıyorum."
                    else:
                        result = "Webcam başlatılamadı: opencv-python yüklü değil."
                else:
                    self._webcam_streamer.stop()
                    self.ui.set_webcam_active(False)
                    result = "Webcam akışı durduruldu."

            elif name == "play_media":
                r = await loop.run_in_executor(
                    None,
                    lambda: play_media(
                        args.get("query", ""),
                        args.get("provider", "auto"),
                        bool(args.get("autoplay", True)),
                    ),
                )
                result = r or "Medya oynatma başlatıldı."

            elif name == "get_youtube_channel_report":
                r = await loop.run_in_executor(
                    None,
                    lambda: get_youtube_channel_report(
                        args.get("query", "overview"),
                        args.get("handle", ""),
                        int(args.get("video_limit", 6) or 6),
                    ),
                )
                result = r or "YouTube kanal raporu alindi."

            elif name == "analyze_screen":
                r = await loop.run_in_executor(
                    None,
                    lambda: analyze_screen(
                        args.get("query", "Ekranda ne var?"),
                        args.get("target", "active_window"),
                    ),
                )
                result = r or "Ekran analizi tamamlandi."

            elif name == "send_whatsapp_message":
                r = await loop.run_in_executor(
                    None,
                    lambda: send_whatsapp_message(
                        args.get("message", ""),
                        args.get("phone_number", ""),
                        args.get("recipient_name", ""),
                        bool(args.get("send_now", False)),
                        args.get("app_target", "auto"),
                    ),
                )
                result = r or "WhatsApp işlemi tamamlandı."

            elif name == "save_whatsapp_contact":
                r = await loop.run_in_executor(
                    None,
                    lambda: save_whatsapp_contact(
                        args.get("display_name", ""),
                        args.get("phone_number", ""),
                        args.get("aliases", ""),
                    ),
                )
                result = r or "WhatsApp kişisi kaydedildi."

            elif name == "system_control":
                r = await loop.run_in_executor(
                    None,
                    lambda: system_control(
                        args.get("action", ""),
                        str(args.get("value", "") or ""),
                    ),
                )
                result = r or "Sistem kontrol işlemi tamamlandı."

            elif name == "ui_control":
                r = await loop.run_in_executor(
                    None,
                    lambda: ui_control(
                        args.get("action", ""),
                        str(args.get("keys", "") or ""),
                        str(args.get("text", "") or ""),
                        int(args.get("amount", 0) or 0),
                    ),
                )
                result = r or "UI kontrol işlemi tamamlandı."

            elif name == "find_and_open":
                r = await loop.run_in_executor(
                    None,
                    lambda: find_and_open(
                        args.get("query", ""),
                        bool(args.get("open_first", True)),
                        str(args.get("search_root", "") or ""),
                    ),
                )
                result = r or "Arama tamamlandı."

            elif name == "create_folder":
                r = await loop.run_in_executor(
                    None,
                    lambda: create_folder(
                        args.get("name", ""),
                        str(args.get("location", "desktop") or "desktop"),
                    ),
                )
                result = r or "Klasör oluşturuldu."

            elif name == "island_control":
                r = await loop.run_in_executor(
                    None,
                    lambda: handle_island_control(
                        self.ui,
                        args.get("action", ""),
                        str(args.get("value", "") or ""),
                    ),
                )
                result = r or "Ada kontrol işlemi tamamlandı."

            elif name == "web_search_answer":
                r = await loop.run_in_executor(
                    None,
                    lambda: web_search_answer(
                        args.get("query", ""),
                        api_key=get_api_key(),
                        detail=str(args.get("detail", "concise") or "concise"),
                    ),
                )
                result = r or "Canlı arama sonucu alınamadı."

            elif name == "local_rag_query":
                r = await loop.run_in_executor(
                    None,
                    lambda: local_rag_query(
                        args.get("query", ""),
                        str(args.get("scope", "all") or "all"),
                        detail=str(args.get("detail", "concise") or "concise"),
                    ),
                )
                result = r or "Yerel belgelerde sonuç bulunamadı."

            else:
                result = f"Bilinmeyen araç: {name}"

        except Exception as e:
            result = f"Hata: {e}"
            had_exception = True
            traceback.print_exc()
            self.speak_error(name, e)
        finally:
            progress_task.cancel()

        tool_failed = self._result_looks_like_error(result)
        if tool_failed:
            if not had_exception:
                self.ui.set_state("ERROR")
        elif self._should_play_success_sfx(name, args, result):
            self.ui.play_success_sfx()

        if not tool_failed:
            self.ui.set_state("LISTENING")

        print(f"[JARVIS] 📤 {name} → {str(result)[:80]}")
        return types.FunctionResponse(
            id=fc.id, name=name,
            response={"result": result}
        )

    async def _send_realtime(self):
        while True:
            msg = await self.out_queue.get()
            if isinstance(msg, dict) and msg.get("audio_stream_end"):
                await self.session.send_realtime_input(audio_stream_end=True)
            else:
                await self.session.send_realtime_input(media=msg)

    async def _stream_webcam_frames(self):
        """
        Webcam aktifken her 1.5s'de EN GÜNCEL kareyi session'a gönderir.
        Queue'suz 'latest frame' yaklaşımı: model hep şimdiki görüntüyü görür.
        """
        _last_sent: bytes | None = None
        while True:
            if not self._webcam_streamer.is_active:
                await asyncio.sleep(0.2)
                continue

            jpeg = self._webcam_streamer.get_latest_ai_frame()
            if jpeg is None or jpeg is _last_sent:
                await asyncio.sleep(0.2)
                continue

            _last_sent = jpeg
            try:
                await self.session.send_realtime_input(
                    media={"data": jpeg, "mime_type": "image/jpeg"}
                )
            except Exception as e:
                print(f"[Webcam] Frame gönderilemedi: {e}")

            # 1.0 saniye bekle — model her zaman taze HD kare alır
            await asyncio.sleep(1.0)

    async def _update_ui_webcam_preview(self):
        """UI önizlemesini ~24 FPS günceller. AI akışından bağımsız."""
        frame_interval = 1.0 / 24.0   # ~0.0417 sn → 24 FPS
        while True:
            if self._webcam_streamer.is_active:
                jpeg = self._webcam_streamer.get_latest_frame()
                if jpeg:
                    self.ui.update_webcam_preview(jpeg)
            await asyncio.sleep(frame_interval)

    async def _listen_audio(self):
        print("[JARVIS] 🎤 Mikrofon başladı")
        try:
            import webrtcvad  # type: ignore[reportMissingImports]
            vad = webrtcvad.Vad(1)
        except Exception:
            vad = None

        denoiser = RealTimeSpeechDenoiser(sample_rate=SEND_SAMPLE_RATE)

        stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT, channels=CHANNELS,
            rate=SEND_SAMPLE_RATE, input=True,
            frames_per_buffer=CHUNK_SIZE,
        )
        self._mic_released.clear()
        speech_hangover_until = 0.0
        frame_bytes = 960  # 30ms @ 16kHz 16-bit mono
        pre_roll: deque[bytes] = deque(maxlen=2)  # ~120ms ön tampon (ilk hece/ünsüz kaybını önler)
        was_sending_speech = False
        try:
            while not self._paused:
                raw_data = await asyncio.to_thread(
                    stream.read, CHUNK_SIZE, exception_on_overflow=False)
                if self._paused:
                    break
                with self._speaking_lock:
                    jarvis_speaking = self._is_speaking
                effectively_muted = (
                    self.ui.is_effectively_muted()
                    if hasattr(self.ui, "is_effectively_muted")
                    else self.ui.muted
                )
                if not jarvis_speaking and not effectively_muted and not self._paused:
                    data, rnnoise_prob = denoiser.process(raw_data)
                    if hasattr(self.ui, "update_mic_level"):
                        count = len(data) // 2
                        if count > 0:
                            shorts = struct.unpack(f"{count}h", data)
                            rms = math.sqrt(sum(s * s for s in shorts) / count)
                            self.ui.update_mic_level(min(1.0, rms / 2800.0))

                    has_speech = rnnoise_prob >= 0.38
                    if not has_speech and vad is not None and len(raw_data) >= frame_bytes:
                        for off in range(0, len(raw_data) - frame_bytes + 1, frame_bytes):
                            if vad.is_speech(raw_data[off : off + frame_bytes], SEND_SAMPLE_RATE):
                                has_speech = True
                                break
                    elif not denoiser.enabled and vad is None:
                        has_speech = True

                    now_m = time.monotonic()
                    if has_speech:
                        speech_hangover_until = now_m + 0.34
                    elif now_m <= speech_hangover_until:
                        has_speech = True

                    if has_speech:
                        if not was_sending_speech and pre_roll:
                            for pr in pre_roll:
                                await self.out_queue.put({"data": pr, "mime_type": "audio/pcm"})
                            pre_roll.clear()
                        was_sending_speech = True
                        await self.out_queue.put({"data": data, "mime_type": "audio/pcm"})
                    else:
                        was_sending_speech = False
                        pre_roll.append(data)
                        # Gemini Live sunucu VAD'sinin konuşma bitişini algılaması için saf dijital sessizlik gönder
                        await self.out_queue.put({"data": b"\x00" * len(data), "mime_type": "audio/pcm"})
                elif was_sending_speech:
                    was_sending_speech = False
                    pre_roll.clear()
                    await self.out_queue.put({"audio_stream_end": True})
        except Exception as e:
            print(f"[JARVIS] ❌ Mikrofon: {e}")
            raise
        finally:
            try:
                stream.stop_stream()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass
            self._mic_released.set()

    async def _receive_audio(self):
        print("[JARVIS] 👂 Alım başladı")
        out_buf, in_buf = [], []
        output_noise = False
        output_noise_samples = []
        try:
            while True:
                async for response in self.session.receive():
                    if response.data:
                        self.audio_in_queue.put_nowait(response.data)

                    if response.server_content:
                        sc = response.server_content

                        if getattr(sc, "interrupted", False):
                            if self.audio_in_queue:
                                while not self.audio_in_queue.empty():
                                    try:
                                        self.audio_in_queue.get_nowait()
                                    except Exception:
                                        break
                                self.audio_in_queue.put_nowait(None)
                            out_buf = []
                            in_buf = []
                            output_noise = False
                            output_noise_samples = []
                            self.set_speaking(False)

                        if sc.output_transcription and sc.output_transcription.text:
                            self.set_speaking(True)
                            raw_txt = sc.output_transcription.text
                            if raw_txt:
                                txt, had_noise = self._clean_transcript_text(raw_txt, preserve_edges=True)
                                if had_noise:
                                    output_noise = True
                                    if len(output_noise_samples) < 4:
                                        output_noise_samples.append(raw_txt.strip())
                                if txt:
                                    out_buf.append(txt)
                                    if hasattr(self.ui, "update_assistant_transcript"):
                                        live_out = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(out_buf))).strip()
                                        if live_out:
                                            self.ui.update_assistant_transcript(live_out, final=False)

                        # Fallback: capture non-thought text parts if model_turn emits written text
                        if getattr(sc, "model_turn", None) and getattr(sc.model_turn, "parts", None):
                            for part in sc.model_turn.parts:
                                if getattr(part, "thought", False):
                                    continue
                                part_text = getattr(part, "text", None)
                                if part_text and part_text.strip():
                                    existing = re.sub(r"[ \t]+", " ", "".join(out_buf)).strip()
                                    clean_part = part_text.strip()
                                    if clean_part and clean_part not in existing:
                                        out_buf.append(("\n" if out_buf and clean_part.startswith(("*", "-", "#", "1.")) else (" " if out_buf else "")) + clean_part)
                                        if hasattr(self.ui, "update_assistant_transcript"):
                                            live_out = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(out_buf))).strip()
                                            if live_out:
                                                self.ui.update_assistant_transcript(live_out, final=False)

                        if sc.input_transcription and sc.input_transcription.text:
                            raw_in = sc.input_transcription.text
                            if raw_in:
                                txt, _ = self._clean_transcript_text(raw_in, preserve_edges=True)
                                if txt:
                                    is_new_turn = len(in_buf) == 0
                                    in_buf.append(txt)
                                    self.ui.mark_user_activity(True)
                                    if hasattr(self.ui, "update_user_transcript"):
                                        live_in = re.sub(r"\s+", " ", "".join(in_buf)).strip()
                                        if live_in:
                                            try:
                                                self.ui.update_user_transcript(live_in, final=False, new_turn=is_new_turn)
                                            except TypeError:
                                                self.ui.update_user_transcript(live_in, final=False)

                        if sc.turn_complete:
                            # Sentinel: ses kuyrugundaki tum chunk'lar calindiktan
                            # sonra SPEAKING -> LISTENING gecisi yapilsin (yanki onlenir).
                            self.audio_in_queue.put_nowait(None)

                            full_in = re.sub(r"\s+", " ", "".join(in_buf)).strip()
                            if full_in:
                                if hasattr(self.ui, "update_user_transcript"):
                                    self.ui.update_user_transcript(full_in, final=True)
                                try:
                                    self.ui.write_log(f"Siz: {full_in}", source="voice")
                                except TypeError:
                                    self.ui.write_log(f"Siz: {full_in}")
                            in_buf = []

                            full_out = re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(out_buf))).strip()
                            if full_out:
                                if hasattr(self.ui, "update_assistant_transcript"):
                                    self.ui.update_assistant_transcript(full_out, final=True)
                                self.ui.write_log(f"JARVIS: {full_out}")
                                if output_noise_samples:
                                    self.ui.write_debug(
                                        "Kısmen filtrelenen ses transcripti: " + " | ".join(output_noise_samples),
                                        level="WARN",
                                    )
                            elif output_noise:
                                if output_noise_samples:
                                    self.ui.write_debug(
                                        "Filtrelenen ham transcript: " + " | ".join(output_noise_samples),
                                        level="WARN",
                                    )
                            if full_in:
                                remember_conversation_turn(full_in, full_out)
                            out_buf = []
                            output_noise = False
                            output_noise_samples = []

                    if response.tool_call:
                        fn_responses = []
                        for fc in response.tool_call.function_calls:
                            print(f"[JARVIS] 📞 {fc.name}")
                            fr = await self._execute_tool(fc)
                            fn_responses.append(fr)
                        await self.session.send_tool_response(
                            function_responses=fn_responses)

        except Exception as e:
            print(f"[JARVIS] ❌ Alım: {e}")
            traceback.print_exc()
            raise

    @staticmethod
    def _apply_speaker_gain(pcm_bytes: bytes, volume: float, muted: bool) -> bytes:
        if muted or volume <= 0.001 or not pcm_bytes:
            return b""
        if volume >= 0.999:
            return pcm_bytes
        try:
            import numpy as _np
            samples = _np.frombuffer(pcm_bytes, dtype=_np.int16).astype(_np.float32)
            _np.clip(samples * volume, -32768.0, 32767.0, out=samples)
            return samples.astype(_np.int16).tobytes()
        except Exception:
            import array as _array
            arr = _array.array("h")
            arr.frombytes(pcm_bytes)
            for i in range(len(arr)):
                v = int(arr[i] * volume)
                arr[i] = 32767 if v > 32767 else (-32768 if v < -32768 else v)
            return arr.tobytes()

    async def _play_audio(self):
        print("[JARVIS] 🔊 Ses çalma başladı")
        scaler = PitchPreservingTimeScaler(
            speed=PLAYBACK_SPEED,
            sample_rate=RECV_SAMPLE_RATE,
        )
        stream = await asyncio.to_thread(
            pya.open,
            format=FORMAT, channels=CHANNELS,
            rate=PLAYBACK_RATE, output=True,
        )
        try:
            while True:
                chunk = await self.audio_in_queue.get()
                if chunk is None:
                    # turn_complete sentinel — kalan tamponu çal, dinlemeye geç
                    tail = scaler.flush()
                    if tail:
                        vol = float(getattr(self.ui, "speaker_volume", 1.0))
                        spk_muted = bool(getattr(self.ui, "speaker_muted", False))
                        out = self._apply_speaker_gain(tail, vol, spk_muted)
                        if out:
                            await asyncio.to_thread(stream.write, out)
                    self.set_speaking(False)
                    continue
                self.set_speaking(True)
                scaled = scaler.process(chunk)
                if scaled:
                    vol = float(getattr(self.ui, "speaker_volume", 1.0))
                    spk_muted = bool(getattr(self.ui, "speaker_muted", False))
                    out = self._apply_speaker_gain(scaled, vol, spk_muted)
                    if out:
                        await asyncio.to_thread(stream.write, out)
        except Exception as e:
            print(f"[JARVIS] ❌ Ses: {e}")
            raise
        finally:
            scaler.reset()
            self.set_speaking(False)
            stream.close()

    async def run(self):
        import gc
        self._loop = asyncio.get_running_loop()
        self._resume_event = asyncio.Event()
        self._pause_event = asyncio.Event()
        connect_attempts = 0
        was_paused = False
        while True:
            # Duraklatılmışsa bağlanma, uyandırma olayını 0 ms gecikmeyle bekle
            if self._paused:
                if not was_paused:
                    was_paused = True
                    gc.collect()
                self._resume_event.clear()
                if self._paused:
                    try:
                        await asyncio.wait_for(self._resume_event.wait(), timeout=0.5)
                    except asyncio.TimeoutError:
                        pass
                continue
            was_paused = False
            self._pause_event.clear()

            try:
                # Client'ı her bağlanışta yeniden oluştur ve anahtarı tazeden oku.
                # Böylece yeni girilen API anahtarı anında geçerli olur; ilk
                # deneme başarısız olsa bile otomatik tekrar (3sn) kendini onarır.
                client = genai.Client(
                    api_key=get_api_key(),
                    http_options={"api_version": "v1alpha"}
                )
                print("[JARVIS] 🔌 Bağlanıyor...")
                self.ui.set_state("INITIALISING")
                config = self._build_config()

                async with client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
                    self.session        = session
                    self._loop          = asyncio.get_running_loop()
                    self.audio_in_queue = asyncio.Queue()
                    self.out_queue      = asyncio.Queue(maxsize=10)

                    print("[JARVIS] ✅ Bağlandı.")
                    connect_attempts = 0          # başarılı bağlantı → sayaç sıfırla
                    self.ui.set_state("LISTENING")
                    self.ui.write_log("SYS: JARVIS hazır. Dinliyorum...")

                    if self._pending_text_commands:
                        pending = list(self._pending_text_commands)
                        self._pending_text_commands.clear()
                        self.ui.set_state("THINKING")
                        for queued_text in pending:
                            await self.session.send_client_content(
                                turns=[types.Content(role="user", parts=[types.Part.from_text(text=queued_text)])],
                                turn_complete=True,
                            )

                    tasks = [
                        asyncio.create_task(self._send_realtime()),
                        asyncio.create_task(self._listen_audio()),
                        asyncio.create_task(self._receive_audio()),
                        asyncio.create_task(self._play_audio()),
                        asyncio.create_task(self._stream_webcam_frames()),
                        asyncio.create_task(self._update_ui_webcam_preview()),
                        asyncio.create_task(self._pause_event.wait()),
                    ]
                    try:
                        done, pending_tasks = await asyncio.wait(
                            tasks, return_when=asyncio.FIRST_COMPLETED
                        )
                        for t in done:
                            if not t.cancelled() and t.exception() is not None:
                                if not self._paused:
                                    raise t.exception()
                    finally:
                        for t in tasks:
                            if not t.done():
                                t.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)
                        self.session = None

            except Exception as e:
                if self._paused:
                    continue
                print(f"[JARVIS] ⚠️ {e}")
                traceback.print_exc()
                self.set_speaking(False)
                # Webcam akışını durdur — yeni session'da yeniden başlayacak
                if self._webcam_streamer.is_active:
                    self._webcam_streamer.stop()
                    self.ui.set_webcam_active(False)

                connect_attempts += 1
                # İlk birkaç deneme sessiz: yeni girilen API anahtarı Google
                # tarafında saniyeler içinde aktifleşebilir. Kullanıcıya hemen
                # "hatalı anahtar" göstermeyip kısa aralıkla otomatik tekrar dene.
                if connect_attempts <= 3:
                    self.ui.set_state("INITIALISING")
                    print(f"[JARVIS] 🔄 Bağlanmayı tekrar deniyor ({connect_attempts}/3)...")
                    await asyncio.sleep(2)
                else:
                    self.ui.write_log(
                        f"ERR: JARVIS baglanamiyor — API anahtarini ve internet "
                        f"baglantisini kontrol et. ({e})"
                    )
                    self.ui.set_state("ERROR")
                    print("[JARVIS] 🔄 5 saniyede yeniden bağlanıyor...")
                    await asyncio.sleep(5)


def main():
    if os.environ.get("TERM_PROGRAM") == "vscode":
        print("[JARVIS] VS Code icinden baslatildi.")

    ui = JarvisUI()

    def runner():
        ui.wait_for_api_key()
        jarvis = JarvisLive(ui)
        try:
            asyncio.run(jarvis.run())
        except KeyboardInterrupt:
            print("\n🔴 Kapatılıyor...")

    threading.Thread(target=runner, daemon=True).start()

    # Çift alkış ile uyandırma (Windows bonus): pencereyi öne getirir. Çevresel
    # ses veya JARVIS'in kendi sesi mikrofona girince yanlış tetiklenip pencereyi
    # sürekli öne çıkarabildiği için varsayılan KAPALI. İstersen True yap.
    ENABLE_CLAP_WAKE = False
    if ENABLE_CLAP_WAKE and WakeGestureListener is not None:
        try:
            wake_listener = WakeGestureListener(on_wake=ui.wake_up)
            wake_listener.start()
        except Exception as exc:
            print(f"[Wake] Alkış dinleyici başlatılamadı: {exc}")

    ui.root.mainloop()


if __name__ == "__main__":
    main()
