"""
Bedo Offline Wake-Word ("Hey Bedo") ve Çift Alkış Yöneticisi.

Vosk ile internet/API kotası harcamadan "Hey Bedo" ifadesini dinler.
Aktif oturum başladığında mikrofonu serbest bırakır (pause) ve uyku moduna
dönüldüğünde tekrar dinlemeye başlar (resume).
"""

from __future__ import annotations

import audioop
import gc
import json
import re
import threading
import time
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable

_DEBUG_LOG_PATH = Path(__file__).resolve().parent / "wake-debug.log"


def _wake_log(msg: str) -> None:
    try:
        ts = time.strftime("%H:%M:%S")
        with open(_DEBUG_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] {msg}\n")
    except Exception:
        pass

try:
    import pyaudio  # type: ignore[reportMissingModuleSource]
except Exception:
    pyaudio = None

try:
    import numpy as np
except Exception:
    np = None

try:
    import webrtcvad  # type: ignore[reportMissingImports]
except Exception:
    webrtcvad = None

try:
    from faster_whisper import WhisperModel  # type: ignore[reportMissingImports]
except Exception:
    WhisperModel = None

try:
    from audio_clean import RealTimeSpeechDenoiser
except Exception:
    RealTimeSpeechDenoiser = None

try:
    from vosk import KaldiRecognizer, Model, SetLogLevel  # type: ignore[reportMissingImports]
except Exception:
    KaldiRecognizer = None
    Model = None
    SetLogLevel = None

try:
    from wakeup_listener import WakeGestureListener
except Exception:
    WakeGestureListener = None


DEFAULT_MODEL_NAME = "vosk-model-small-tr-0.3"
DEFAULT_MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip"

SAMPLE_RATE = 16000
CHUNK_SIZE = 1600  # 100ms (hızlı uyandırma algılama)

# Yalnızca "Bedo" (ve Vosk/Whisper için en yakın fonetik karşılıkları)
WAKE_PHRASES = (
    "bedo",
    "bedoo",
    "beydo",
    "bedu",
    "be do",
    "bi do",
    "be du",
    "bi du",
    "ve do",
    "ve du",
    "bedir",
    "bedirhan",
    "vedat",
    "bede",
    "be de o",
)

# Whisper BPE tabanlı olduğundan "bedo" ve yakın Türkçe BPE bölünmelerini eşleştir
_WHISPER_WAKE_PHRASES = (
    "bedo",
    "bedoo",
    "beydo",
    "bedu",
    "be do",
    "bedir",
    "bedirhan",
)


def match_whisper_wake_phrase(text: str) -> bool:
    norm = normalize_transcript(text)
    if not norm:
        return False
    for phrase in _WHISPER_WAKE_PHRASES:
        if re.search(rf"(^|\s){re.escape(phrase)}(\s|$)", norm):
            return True
    return False

# vosk-model-small-tr-0.3 sözlüğünde gerçekten bulunan 'Bedo' fonetik karşılıkları
_VOSK_GRAMMAR_PHRASES = [
    "be do",
    "bi do",
    "be du",
    "bi du",
    "ve do",
    "ve du",
    "bedir",
    "bedirhan",
    "vedat",
    "bede",
    "be de o",
    "hey be do",
    "hey bi do",
    "hey bedir",
    "[unk]",
]


def normalize_transcript(text: str) -> str:
    cleaned = re.sub(r"[^\w\sçğıöşü]", " ", (text or "").lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", cleaned).strip()


def match_wake_phrase(text: str) -> bool:
    """Verilen transkript içinde 'Hey Bedo' / 'Bedo' uyandırma ifadesi var mı kontrol eder."""
    norm = normalize_transcript(text)
    if not norm:
        return False

    words = norm.split()
    compact = norm.replace(" ", "")
    for phrase in WAKE_PHRASES:
        p_words = phrase.split()
        if len(p_words) == 1:
            if p_words[0] in words:
                return True
        else:
            if phrase in norm or phrase.replace(" ", "") in compact:
                return True
    return False


def ensure_vosk_model(models_dir: Path, model_name: str = DEFAULT_MODEL_NAME) -> Path:
    """Vosk model dizinini doğrular; yoksa indirip çıkarır."""
    models_dir.mkdir(parents=True, exist_ok=True)
    target_dir = models_dir / model_name
    if target_dir.exists() and ((target_dir / "final.mdl").exists() or (target_dir / "conf").exists()):
        return target_dir

    zip_path = models_dir / f"{model_name}.zip"
    if not zip_path.exists():
        urllib.request.urlretrieve(DEFAULT_MODEL_URL, zip_path)

    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(models_dir)

    if zip_path.exists():
        try:
            zip_path.unlink()
        except OSError:
            pass

    if not target_dir.exists():
        raise FileNotFoundError(f"Vosk modeli bulunamadı: {target_dir}")
    return target_dir


class WakeWordListener:
    """Vosk tabanlı offline 'Hey Bedo' dinleyicisi."""

    def __init__(
        self,
        model_path: Path,
        on_wake: Callable[[str], None],
        cooldown_sec: float = 2.0,
    ):
        self.model_path = Path(model_path)
        self._on_wake = on_wake
        self._cooldown_sec = cooldown_sec
        self._last_trigger = 0.0
        self._running = False
        self._paused = threading.Event()
        self._whisper_model = None
        self._stream_closed = threading.Event()
        self._stream_closed.set()
        self._thread: threading.Thread | None = None
        self._model = None

    def _to_safe_model_path(self) -> str:
        raw = str(self.model_path.resolve())
        try:
            import ctypes
            buf = ctypes.create_unicode_buffer(512)
            res = ctypes.windll.kernel32.GetShortPathNameW(raw, buf, len(buf))
            if res and buf.value:
                return buf.value
        except Exception:
            pass
        return raw

    def _load_model(self):
        if Model is None:
            raise RuntimeError("vosk paketi yüklü değil.")
        if SetLogLevel is not None:
            SetLogLevel(-1)
        if self._model is None:
            self._model = Model(self._to_safe_model_path())
        return self._model

    def _load_whisper_model(self):
        if WhisperModel is None or webrtcvad is None or np is None:
            return None
        if self._whisper_model is None:
            self._whisper_model = WhisperModel(
                "tiny",
                device="cpu",
                compute_type="int8",
                cpu_threads=2,
                num_workers=1,
                local_files_only=False,
            )
            try:
                # İlk "Bedo" seslenişinde cold-start gecikmesi olmaması için modeli ısıt
                list(self._whisper_model.transcribe(np.zeros(4800, dtype=np.float32), language="tr", beam_size=1)[0])
            except Exception:
                pass
            gc.collect()
        return self._whisper_model

    @staticmethod
    def _transcribe_whisper(whisper_model, pcm_bytes: bytes) -> str:
        audio_f32 = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _ = whisper_model.transcribe(
            audio_f32,
            language="tr",
            initial_prompt="Bedo.",
            beam_size=1,
            vad_filter=False,
            without_timestamps=True,
            condition_on_previous_text=False,
        )
        valid_texts: list[str] = []
        for seg in segments:
            if getattr(seg, "no_speech_prob", 0.0) >= 0.50:
                continue
            if getattr(seg, "avg_logprob", 0.0) <= -1.05:
                continue
            t = (seg.text or "").strip()
            if t:
                valid_texts.append(t)
        return " ".join(valid_texts).strip()

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._paused.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="WakeWordBedo")
        self._thread.start()

    def pause(self) -> None:
        """Aktif Gemini Live oturumu mikrofonu kullanırken dinlemeyi duraklatır ve stream kapanana kadar bekler."""
        _wake_log(f"WakeWordListener.pause() called (same_thread={threading.current_thread() is self._thread})")
        self._paused.set()
        if threading.current_thread() is not self._thread:
            self._stream_closed.wait(timeout=1.2)

    def resume(self) -> None:
        """Uyku moduna dönüldüğünde tekrar 'Hey Bedo' dinlemeye başlar."""
        _wake_log("WakeWordListener.resume() called")
        self._paused.clear()

    def stop(self) -> None:
        self._running = False
        self._paused.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.5)
        self._thread = None

    def _maybe_trigger(self, text: str, *, strict_whisper: bool = False) -> bool:
        if text:
            _wake_log(f"Transcript({ 'whisper' if strict_whisper else 'vosk' }): {text!r}")
        matched = match_whisper_wake_phrase(text) if strict_whisper else match_wake_phrase(text)
        if not matched:
            return False
        now = time.monotonic()
        if now - self._last_trigger < self._cooldown_sec:
            _wake_log(f"Matched {text!r} but skipped by cooldown")
            return False
        self._last_trigger = now
        _wake_log(f"TRIGGERED on {text!r}")
        self._on_wake(text)
        return True

    def _loop(self) -> None:
        if pyaudio is None:
            _wake_log("pyaudio is None, exiting _loop")
            return

        whisper_model = None
        try:
            whisper_model = self._load_whisper_model()
        except Exception as exc:
            _wake_log(f"Whisper load failed: {exc}")
            whisper_model = None

        vosk_model = None
        if whisper_model is None:
            vosk_model = self._load_model()

        _wake_log(f"_loop started: whisper={whisper_model is not None}, vosk={vosk_model is not None}")

        frame_bytes = 960  # 30ms @ 16kHz int16 mono
        min_speech_bytes = int(0.20 * SAMPLE_RATE * 2)
        early_peek_bytes = int(0.38 * SAMPLE_RATE * 2)
        max_speech_bytes = int(1.08 * SAMPLE_RATE * 2)
        overlap_bytes = int(0.38 * SAMPLE_RATE * 2)
        hangover_frames = 3  # 90ms sessizlik sonrası anında işle
        min_voiced_frames = 4  # En az 120ms gerçek insan konuşması (klavye tıkırtılarını ele)
        pa = pyaudio.PyAudio()

        try:
          while self._running:
            if self._paused.is_set():
                time.sleep(0.15)
                continue

            denoiser = RealTimeSpeechDenoiser(sample_rate=SAMPLE_RATE) if (whisper_model is not None and RealTimeSpeechDenoiser is not None) else None
            stream = None
            rec = None
            vad = None
            if whisper_model is not None:
                vad = webrtcvad.Vad(2)
            else:
                try:
                    rec = KaldiRecognizer(vosk_model, SAMPLE_RATE, json.dumps(_VOSK_GRAMMAR_PHRASES))
                except Exception:
                    rec = KaldiRecognizer(vosk_model, SAMPLE_RATE)

            try:
                read_frames = 1024 if (whisper_model is not None and vad is not None) else CHUNK_SIZE
                stream = pa.open(
                    format=pyaudio.paInt16,
                    channels=1,
                    rate=SAMPLE_RATE,
                    input=True,
                    frames_per_buffer=read_frames,
                )
                self._stream_closed.clear()
                _wake_log("Mic stream opened for wake-word")
                residual = bytearray()
                speech_buf = bytearray()
                active_speech = False
                silence_frames = 0
                voiced_frames = 0
                early_peeked = False
                logged_first_audio = False

                while self._running and not self._paused.is_set():
                    data = stream.read(read_frames, exception_on_overflow=False)
                    rms_val = audioop.rms(data, 2)
                    if rms_val == 0:
                        continue
                    if not logged_first_audio:
                        logged_first_audio = True
                        _wake_log(f"First non-zero audio frame received (rms={rms_val})")
                    if whisper_model is not None and vad is not None:
                        # Gürültü/klavye kapısı: önce RMS, ardından RNNoise insan sesi olasılığı
                        if not active_speech and rms_val < 115:
                            continue
                        residual.extend(data)
                        while len(residual) >= frame_bytes:
                            raw_frame = bytes(residual[:frame_bytes])
                            del residual[:frame_bytes]
                            clean_frame = raw_frame
                            if denoiser is not None and denoiser.enabled:
                                clean_frame, speech_prob = denoiser.process(raw_frame)
                                if not active_speech and speech_prob < 0.30:
                                    continue
                            is_speech = vad.is_speech(raw_frame, SAMPLE_RATE)
                            if is_speech:
                                active_speech = True
                                silence_frames = 0
                                voiced_frames += 1
                                speech_buf.extend(clean_frame)
                            elif active_speech:
                                silence_frames += 1
                                speech_buf.extend(clean_frame)
                                if silence_frames >= hangover_frames:
                                    triggered = False
                                    if voiced_frames >= min_voiced_frames and len(speech_buf) >= min_speech_bytes:
                                        text = self._transcribe_whisper(whisper_model, bytes(speech_buf))
                                        triggered = self._maybe_trigger(text, strict_whisper=True)
                                    speech_buf.clear()
                                    active_speech = False
                                    silence_frames = 0
                                    voiced_frames = 0
                                    early_peeked = False
                                    if triggered:
                                        break
                            if not early_peeked and voiced_frames >= min_voiced_frames and len(speech_buf) >= early_peek_bytes:
                                early_peeked = True
                                text = self._transcribe_whisper(whisper_model, bytes(speech_buf))
                                if self._maybe_trigger(text, strict_whisper=True):
                                    speech_buf.clear()
                                    active_speech = False
                                    silence_frames = 0
                                    voiced_frames = 0
                                    early_peeked = False
                                    break
                            if len(speech_buf) >= max_speech_bytes:
                                triggered = False
                                if voiced_frames >= min_voiced_frames:
                                    text = self._transcribe_whisper(whisper_model, bytes(speech_buf))
                                    triggered = self._maybe_trigger(text, strict_whisper=True)
                                if triggered:
                                    speech_buf.clear()
                                    active_speech = False
                                    silence_frames = 0
                                    voiced_frames = 0
                                    early_peeked = False
                                    break
                                # Medya/sürekli ses akışında kelime sınırda bölünmesin diye son 0.38sn'yi koru
                                if len(speech_buf) > overlap_bytes:
                                    del speech_buf[:-overlap_bytes]
                                silence_frames = 0
                                voiced_frames = min_voiced_frames
                                early_peeked = True
                    elif rec is not None:
                        if rec.AcceptWaveform(data):
                            res = json.loads(rec.Result() or "{}")
                            if self._maybe_trigger(res.get("text", "")):
                                rec.Reset()
                        else:
                            partial = json.loads(rec.PartialResult() or "{}")
                            if self._maybe_trigger(partial.get("partial", "")):
                                rec.Reset()
            except Exception as exc:
                _wake_log(f"_loop inner exception: {exc!r}")
                time.sleep(0.4)
            finally:
                if stream is not None:
                    try:
                        stream.stop_stream()
                        stream.close()
                    except Exception:
                        pass
                self._stream_closed.set()
                _wake_log("Mic stream closed for wake-word")
        finally:
            try:
                pa.terminate()
            except Exception:
                pass
            _wake_log("_loop exited")


class WakeManager:
    """'Hey Bedo' (Vosk) ve opsiyonel Çift Alkış tetikleyicilerini birlikte yönetir."""

    def __init__(
        self,
        models_dir: Path,
        on_wake: Callable[[str, str], None],
        enable_voice: bool = True,
        enable_clap: bool = True,
    ):
        self.models_dir = Path(models_dir)
        self._on_wake = on_wake
        self.enable_voice = enable_voice
        self.enable_clap = enable_clap
        self._voice: WakeWordListener | None = None
        self._clap: WakeGestureListener | None = None
        self._paused = False
        self._muted = False

    def _sync_state(self) -> None:
        should_pause = self._paused or self._muted
        if should_pause:
            if self._voice:
                self._voice.pause()
            if self._clap:
                self._clap.stop()
        else:
            if self._voice:
                self._voice.resume()
            if self._clap and self.enable_clap:
                self._clap.start()

    def start(self) -> dict[str, bool]:
        status = {"voice": False, "clap": False}
        has_whisper = WhisperModel is not None and webrtcvad is not None and np is not None
        if self.enable_voice and (has_whisper or Model is not None):
            model_dir = self.models_dir if has_whisper else ensure_vosk_model(self.models_dir)
            self._voice = WakeWordListener(
                model_path=model_dir,
                on_wake=lambda txt: self._on_wake("wake_word", txt),
            )
            self._voice.start()
            status["voice"] = True

        if self.enable_clap and WakeGestureListener is not None:
            self._clap = WakeGestureListener(
                on_wake=lambda: self._on_wake("clap", ""),
            )
            self._clap.start()
            status["clap"] = True

        self._sync_state()
        return status

    def pause(self) -> None:
        self._paused = True
        self._sync_state()

    def resume(self) -> None:
        self._paused = False
        self._sync_state()

    def set_muted(self, muted: bool) -> None:
        self._muted = bool(muted)
        self._sync_state()

    def stop(self) -> None:
        if self._voice:
            self._voice.stop()
        if self._clap:
            self._clap.stop()
