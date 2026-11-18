"""
Gerçek zamanlı yapay zekâ tabanlı mikrofon gürültü engelleme (RNNoise).

Hem 'Hey Bedo' uyandırma dinleyicisi hem de Gemini Live ses akışı için
arka plan gürültüsünü (fan, klavye, ortam uğultusu) gerçek zamanlı temizler
ve sinir ağı tabanlı konuşma olasılığı (speech_prob) döner.
"""

from __future__ import annotations

import numpy as np

try:
    from pyrnnoise import RNNoise  # type: ignore[reportMissingImports]
except Exception:
    RNNoise = None


class RealTimeSpeechDenoiser:
    """16 kHz mono int16 PCM akışını gerçek zamanlı temizler."""

    def __init__(self, sample_rate: int = 16000) -> None:
        self.sample_rate = int(sample_rate)
        self._denoiser = RNNoise(sample_rate=self.sample_rate) if RNNoise is not None else None

    @property
    def enabled(self) -> bool:
        return self._denoiser is not None

    def process(self, pcm_bytes: bytes) -> tuple[bytes, float]:
        """Ham int16 PCM verisini temizler ve (temiz_pcm, max_speech_prob) döner."""
        if not pcm_bytes or self._denoiser is None:
            return pcm_bytes, 0.0

        samples = np.frombuffer(pcm_bytes, dtype=np.int16)
        if samples.size == 0:
            return pcm_bytes, 0.0

        frames: list[np.ndarray] = []
        max_prob = 0.0
        for speech_prob, out_chunk in self._denoiser.denoise_chunk(samples[np.newaxis, :], partial=False):
            try:
                p = float(np.max(speech_prob))
                if p > max_prob:
                    max_prob = p
            except Exception:
                pass
            frames.append(np.asarray(out_chunk, dtype=np.int16).reshape(-1))

        if not frames:
            return pcm_bytes, max_prob

        return np.concatenate(frames).tobytes(), max_prob


class PitchPreservingTimeScaler:
    """Perdeyi (ses tonunu) bozmadan int16 mono PCM akışını hızlandırır (WSOLA)."""

    def __init__(self, speed: float = 1.15, sample_rate: int = 24000) -> None:
        self.speed = max(0.5, min(2.0, float(speed)))
        self.sample_rate = int(sample_rate)
        self._win_len = 480  # 20ms @ 24kHz
        self._syn_hop = self._win_len // 2  # 240 samples (10ms)
        self._ana_hop = max(1, int(round(self._syn_hop * self.speed)))
        self._search = 96  # ±4ms faz hizalama penceresi
        self._window = np.hanning(self._win_len + 1)[:-1].astype(np.float32)
        self._in_buf = np.zeros(0, dtype=np.float32)
        self._tail = np.zeros(self._syn_hop, dtype=np.float32)
        self._pos = 0
        self._started = False

    def reset(self) -> None:
        self._in_buf = np.zeros(0, dtype=np.float32)
        self._tail = np.zeros(self._syn_hop, dtype=np.float32)
        self._pos = 0
        self._started = False

    def process(self, pcm_bytes: bytes) -> bytes:
        if not pcm_bytes or abs(self.speed - 1.0) < 0.01:
            return pcm_bytes
        samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            return b""
        self._in_buf = np.concatenate((self._in_buf, samples))

        out_chunks: list[np.ndarray] = []
        if not self._started:
            if self._in_buf.size < self._win_len:
                return b""
            first = self._in_buf[: self._win_len] * self._window
            out_chunks.append(first[: self._syn_hop])
            self._tail = first[self._syn_hop :].copy()
            self._pos = self._ana_hop
            self._started = True

        need = self._win_len + self._search
        while self._pos + need <= self._in_buf.size:
            lo = max(0, self._pos - self._search)
            hi = min(self._in_buf.size - self._win_len, self._pos + self._search)
            best_pos = self._pos
            if hi > lo:
                # Vektörel WSOLA benzerlik araması (tail ile en iyi örtüşen faz)
                candidates = np.lib.stride_tricks.sliding_window_view(
                    self._in_buf[lo : hi + self._syn_hop], self._syn_hop
                )
                scores = candidates @ self._tail
                best_pos = lo + int(np.argmax(scores))

            frame = self._in_buf[best_pos : best_pos + self._win_len] * self._window
            mixed = self._tail + frame[: self._syn_hop]
            out_chunks.append(mixed)
            self._tail = frame[self._syn_hop :].copy()
            self._pos = best_pos + self._ana_hop

        keep_from = max(0, self._pos - self._search)
        if keep_from > 0:
            self._in_buf = self._in_buf[keep_from:]
            self._pos -= keep_from

        if not out_chunks:
            return b""
        joined = np.clip(np.concatenate(out_chunks), -32768.0, 32767.0).astype(np.int16)
        return joined.tobytes()

    def flush(self) -> bytes:
        if abs(self.speed - 1.0) < 0.01:
            return b""
        parts: list[np.ndarray] = []
        if self._started:
            parts.append(self._tail)
        if self._pos < self._in_buf.size:
            parts.append(self._in_buf[self._pos :])
        self.reset()
        if not parts:
            return b""
        joined = np.clip(np.concatenate(parts), -32768.0, 32767.0).astype(np.int16)
        return joined.tobytes()
