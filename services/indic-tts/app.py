import io
import json
import os
import re
import threading
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf
from TTS.utils.synthesizer import Synthesizer

SUPPORTED_LANGUAGES = {
    "bn": "bn",
    "gu": "gu",
    "hi": "hi",
    "kn": "kn",
    "ml": "ml",
    "mr": "mr",
    "ta": "ta",
    "te": "te",
}
MODEL_ROOT = Path(os.environ.get("INDIC_TTS_MODEL_ROOT", Path(__file__).parent / "models"))
HOST = os.environ.get("INDIC_TTS_HOST", "127.0.0.1")
PORT = int(os.environ.get("INDIC_TTS_PORT", "8001"))
USE_CUDA = os.environ.get("INDIC_TTS_USE_CUDA", "0").lower() in {"1", "true", "yes"}
DEFAULT_SPEAKER_NAME = os.environ.get("INDIC_TTS_SPEAKER_NAME", "female").strip() or "female"
TARGET_SAMPLE_RATE = 22050

_synthesizers: dict[str, Synthesizer] = {}
_synthesizer_lock = threading.Lock()


def normalize_tts_text(text: str, language: str, aggressive: bool = False) -> str:
    if language != "hi":
        return text.strip()

    digit_words = {
        "०": "शून्य",
        "१": "एक",
        "२": "दो",
        "३": "तीन",
        "४": "चार",
        "५": "पाँच",
        "६": "छह",
        "७": "सात",
        "८": "आठ",
        "९": "नौ",
    }
    ascii_digit_words = (
        "शून्य",
        "एक",
        "दो",
        "तीन",
        "चार",
        "पाँच",
        "छह",
        "सात",
        "आठ",
        "नौ",
    )

    normalized = text.strip()
    normalized = re.sub(r"\.\s*\. +\s*।?", "।", normalized)
    normalized = re.sub(r"\.\s*\.+\s*।?", "।", normalized)
    normalized = re.sub(r"(?:।\s*){2,}", "।", normalized)
    normalized = re.sub(r"\.{2,}", "।", normalized)
    normalized = re.sub(r"\.(?=\s|$)", "।", normalized)
    normalized = re.sub(r"\bA\s*/\s*B\b", "ए और बी", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"[०-९]", lambda match: digit_words[match.group(0)], normalized)
    normalized = re.sub(
        r"[0-9]",
        lambda match: ascii_digit_words[int(match.group(0))],
        normalized,
    )
    normalized = re.sub(r"[\[\]{}<>|~^*_+=\\]", " ", normalized)
    if aggressive:
        normalized = re.sub(r"[A-Za-z]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def model_paths(language: str) -> dict[str, Path]:
    root = MODEL_ROOT / SUPPORTED_LANGUAGES[language]
    return {
        "model": root / "fastpitch" / "best_model.pth",
        "config": root / "fastpitch" / "config.json",
        "speakers": root / "fastpitch" / "speakers.pth",
        "vocoder": root / "hifigan" / "best_model.pth",
        "vocoder_config": root / "hifigan" / "config.json",
    }


def _resolve_speaker_name(language: str, synthesizer: Synthesizer) -> str:
    configured = os.environ.get("INDIC_TTS_SPEAKER_NAME", "").strip()
    if configured:
        return configured

    try:
        speaker_names = getattr(synthesizer, "speaker_names", None)
        if isinstance(speaker_names, (list, tuple)) and speaker_names:
            preferred = ["female", "female_1", "female_0", "speaker_1", "speaker_0", "male", "male_1"]
            for name in preferred:
                if str(name) in [str(item) for item in speaker_names]:
                    return str(name)
            return str(speaker_names[0])
    except Exception:
        pass

    return DEFAULT_SPEAKER_NAME


def get_synthesizer(language: str) -> Synthesizer:
    cached = _synthesizers.get(language)
    if cached is not None:
        return cached

    with _synthesizer_lock:
        cached = _synthesizers.get(language)
        if cached is not None:
            return cached
        paths = model_paths(language)
        missing = [str(path) for path in paths.values() if not path.is_file()]
        if missing:
            raise RuntimeError(
                f"Indic-TTS model is missing for '{language}'. Missing: {', '.join(missing)}"
            )
        synthesizer = Synthesizer(
            tts_checkpoint=str(paths["model"]),
            tts_config_path=str(paths["config"]),
            tts_speakers_file=str(paths["speakers"]),
            vocoder_checkpoint=str(paths["vocoder"]),
            vocoder_config=str(paths["vocoder_config"]),
            use_cuda=USE_CUDA,
        )
        _synthesizers[language] = synthesizer
        return synthesizer


def synthesize(text: str, language: str, speaker_name: str | None = None) -> bytes:
    synthesizer = get_synthesizer(language)
    selected_speaker = speaker_name or _resolve_speaker_name(language, synthesizer)

    waveform = synthesizer.tts(
        normalize_tts_text(text, language),
        speaker_name=selected_speaker,
    )

    samples = np.asarray(waveform, dtype=np.float32)
    samples = np.squeeze(samples)

    if samples.ndim != 1:
        raise RuntimeError(
            f"Indic-TTS returned an unsupported audio shape: {samples.shape}"
        )

    if samples.size == 0 or not np.isfinite(samples).all():
        raise RuntimeError("Indic-TTS generated invalid or empty audio.")

    if np.abs(samples).max() < 1e-5:
        raise RuntimeError("Indic-TTS generated a near-silent waveform instead of intelligible speech.")

    sample_rate = int(getattr(synthesizer, "output_sample_rate", TARGET_SAMPLE_RATE) or TARGET_SAMPLE_RATE)
    if sample_rate <= 0:
        raise RuntimeError("Indic-TTS reported an invalid output sample rate.")
    if sample_rate != TARGET_SAMPLE_RATE:
        raise RuntimeError(
            f"Indic-TTS sample rate mismatch: expected {TARGET_SAMPLE_RATE} Hz but got {sample_rate} Hz."
        )

    output = io.BytesIO()
    sf.write(
        output,
        samples,
        sample_rate,
        format="WAV",
        subtype="PCM_16",
    )

    wav = output.getvalue()
    if len(wav) < 44 or not wav.startswith(b"RIFF") or not wav[8:12] == b"WAVE":
        raise RuntimeError("Indic-TTS produced invalid WAV bytes.")

    return wav


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._json(HTTPStatus.OK, {"status": "ok", "provider": "ai4bharat-indic-tts-v1"})
            return
        self._json(HTTPStatus.NOT_FOUND, {"detail": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/synthesize":
            self._json(HTTPStatus.NOT_FOUND, {"detail": "Not found."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 32_000:
                raise ValueError("Request text is missing or too large.")

            content_type = self.headers.get("Content-Type", "")
            raw_body = self.rfile.read(length)
            print(f"[Indic-TTS] request content-type: {content_type!r}", flush=True)
            print(f"[Indic-TTS] raw request body bytes: {raw_body[:200]!r}", flush=True)
            body_text = raw_body.decode("utf-8")
            print(f"[Indic-TTS] decoded request body: {body_text!r}", flush=True)

            payload = json.loads(body_text)
            text = payload.get("text")
            language = payload.get("language")
            speaker_name = payload.get("speakerName")
            if not isinstance(text, str) or not text.strip():
                raise ValueError("'text' must be a non-empty string.")
            if not isinstance(language, str) or language not in SUPPORTED_LANGUAGES:
                raise ValueError("This language does not have a configured Indic-TTS v1 checkpoint.")
            if speaker_name is not None and (not isinstance(speaker_name, str) or not speaker_name.strip()):
                raise ValueError("'speakerName' must be a non-empty string when provided.")

            print("[Indic-TTS] received text repr:", repr(text), flush=True)
            print("[Indic-TTS] received text codepoints:", [hex(ord(ch)) for ch in text[:100]], flush=True)

            audio = synthesize(text.strip(), language, speaker_name=speaker_name.strip() if isinstance(speaker_name, str) else None)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except (json.JSONDecodeError, ValueError) as error:
            self._json(HTTPStatus.BAD_REQUEST, {"detail": str(error)})
        except Exception as error:  # noqa: BLE001
            print("\n===== INDIC TTS ERROR =====", flush=True)
            traceback.print_exc()
            print("===========================\n", flush=True)
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"detail": str(error)})

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[Indic-TTS] {format % args}", flush=True)


def main() -> None:
    print(f"[Indic-TTS] model root: {MODEL_ROOT}", flush=True)
    print(f"[Indic-TTS] listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
