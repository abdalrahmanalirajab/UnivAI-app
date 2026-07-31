r"""Generate and align the embedded landing-page voice.

Run this script with the UnivAI root virtual environment. It uses the local
Kokoro model and cached Faster Whisper model:

    ..\.venv\Scripts\python.exe scripts\generate_landing_voice.py
"""

from __future__ import annotations

import base64
import io
import json
import re
import tempfile
from pathlib import Path

import soundfile as sf
from faster_whisper import WhisperModel
from kokoro_onnx import Kokoro


APP_ROOT = Path(__file__).resolve().parents[1]
VOICE_ROOT = APP_ROOT.parent / "UnivAI-live" / "models" / "kokoro"
PAYLOAD_PATH = (
    APP_ROOT
    / "app"
    / "components"
    / "landing"
    / "quadratic-answer-audio.json"
)
TIMING_PATH = (
    APP_ROOT
    / "app"
    / "components"
    / "landing"
    / "quadratic-answer-timing.json"
)

ANSWER = (
    "Sure, the quadratic equation is based on finding the values that make "
    "a second-degree polynomial equal to zero."
)
VOICE = "am_michael"


def normalize(word: str) -> str:
    return re.sub(r"[^a-z0-9]", "", word.lower())


def merge_alignment(
    display_words: list[str],
    aligned: list[dict[str, str | float]],
) -> list[dict[str, str | float]]:
    merged: list[dict[str, str | float]] = []
    aligned_index = 0

    for display_word in display_words:
        target = normalize(display_word)
        pieces: list[dict[str, str | float]] = []
        combined = ""

        while aligned_index < len(aligned) and len(combined) < len(target):
            piece = aligned[aligned_index]
            pieces.append(piece)
            combined += normalize(str(piece["spoken"]))
            aligned_index += 1

        if combined != target:
            raise RuntimeError(
                f"Could not align {display_word!r}; received "
                f"{[piece['spoken'] for piece in pieces]}"
            )

        merged.append(
            {
                "word": display_word,
                "start": pieces[0]["start"],
                "end": pieces[-1]["end"],
            }
        )

    if aligned_index != len(aligned):
        raise RuntimeError(
            f"Unexpected trailing alignment: {aligned[aligned_index:]}"
        )

    return merged


def main() -> None:
    kokoro = Kokoro(
        str(VOICE_ROOT / "kokoro-v1.0.onnx"),
        str(VOICE_ROOT / "voices-v1.0.bin"),
    )
    samples, sample_rate = kokoro.create(
        ANSWER,
        voice=VOICE,
        speed=0.96,
        lang="en-us",
    )

    audio_buffer = io.BytesIO()
    sf.write(
        audio_buffer,
        samples,
        sample_rate,
        format="WAV",
        subtype="PCM_16",
    )
    audio_bytes = audio_buffer.getvalue()

    with tempfile.TemporaryDirectory(prefix="univai-voice-") as temp_dir:
        audio_path = Path(temp_dir) / "quadratic-answer.wav"
        audio_path.write_bytes(audio_bytes)

        whisper = WhisperModel(
            "large-v3",
            device="cuda",
            compute_type="float16",
            local_files_only=True,
        )
        segments, _ = whisper.transcribe(
            str(audio_path),
            language="en",
            beam_size=5,
            word_timestamps=True,
            vad_filter=False,
            condition_on_previous_text=False,
            initial_prompt=ANSWER,
        )
        aligned = [
            {
                "spoken": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
            }
            for segment in segments
            for word in (segment.words or [])
        ]
        payload = {
            "mimeType": "audio/wav",
            "base64": base64.b64encode(audio_bytes).decode("ascii"),
        }

    display_words = ANSWER.split()
    timing = merge_alignment(display_words, aligned)
    TIMING_PATH.write_text(
        json.dumps(timing, indent=2) + "\n",
        encoding="utf-8",
    )
    PAYLOAD_PATH.write_text(
        json.dumps(payload, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    print(
        f"Saved embedded {VOICE} audio {PAYLOAD_PATH} "
        f"({len(samples) / sample_rate:.2f}s)"
    )
    print(f"Saved {TIMING_PATH} ({len(timing)} aligned words)")


if __name__ == "__main__":
    main()
