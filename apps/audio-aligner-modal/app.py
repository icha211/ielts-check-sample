"""Deployable WhisperX forced-aligner for Modal.

Deploy:
    modal deploy apps/audio-aligner-modal/app.py

The generated web URL goes into WHISPERX_ALIGNER_URL for the API gateway.
"""

from __future__ import annotations

import os
import re
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

import modal

app = modal.App("ielts-check-whisperx-aligner")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("whisperx", "fastapi[standard]")
)


def _words(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", str(value or "").lower()))


def _score(left: str, right: str) -> float:
    source = _words(left)
    target = _words(right)
    if not source or not target:
        return 0.0
    return len(source & target) / len(source | target)


def _download_audio(audio_url: str, destination: str) -> None:
    request = urllib.request.Request(
        audio_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; IELTS-Check-WhisperX/1.0)",
            "Accept": "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=900) as response, open(destination, "wb") as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)


def _transcript_rows(raw_text: str) -> list[dict[str, Any]]:
    rows = []
    question = 0
    speaker_pattern = re.compile(
        r"(?:\[[^\]]+\]\s*)?(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?"
        r"(Man|Woman|Narrator|Narr|Speaker\s*[A-Z]|Professor|Student|Host|Interviewer)"
        r"\s*:\s*(.+)",
        re.IGNORECASE,
    )
    for raw_line in str(raw_text or "").splitlines():
        line = raw_line.strip()
        opening = re.match(r"<Question\s+(\d+)", line, re.IGNORECASE)
        if opening:
            question = int(opening.group(1))
            continue
        if re.match(r"</Question", line, re.IGNORECASE):
            question = 0
            continue
        match = speaker_pattern.match(line)
        if match and question:
            rows.append({"questionNumber": question, "speaker": match.group(1), "text": match.group(2).strip()})
    return rows


@app.function(image=image, gpu="T4", timeout=900)
@modal.fastapi_endpoint(method="POST")
def align(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        import whisperx
    except ImportError as exc:
        raise RuntimeError("WhisperX is not installed in the worker image") from exc

    audio_url = str(payload.get("audio_url") or "").strip()
    transcript_text = str(payload.get("transcript_text") or "")
    if not audio_url or not transcript_text:
        raise ValueError("audio_url and transcript_text are required")

    suffix = Path(audio_url.split("?")[0]).suffix or ".mp3"
    fd, audio_path = tempfile.mkstemp(prefix="review-audio-", suffix=suffix)
    os.close(fd)
    _download_audio(audio_url, audio_path)

    model = whisperx.load_model("base", device="cuda", compute_type="float16")
    transcribed = model.transcribe(audio_path)
    language = transcribed.get("language", "en")
    align_model, metadata = whisperx.load_align_model(language_code=language, device="cuda")
    aligned = whisperx.align(transcribed["segments"], align_model, metadata, audio_path, device="cuda")
    whisper_segments = aligned.get("segments", [])

    rows = _transcript_rows(transcript_text)
    output = []
    cursor = 0
    for row in rows:
        best = None
        best_score = -1.0
        for index in range(cursor, len(whisper_segments)):
            candidate = whisper_segments[index]
            candidate_score = _score(row["text"], candidate.get("text", ""))
            if candidate_score > best_score:
                best = candidate
                best_score = candidate_score
                cursor = index + 1
            if candidate_score >= 0.9:
                break
        if best is None:
            continue
        output.append({
            "questionNumber": row["questionNumber"],
            "speaker": row["speaker"],
            "text": row["text"],
            "start": round(float(best.get("start", 0.0)), 3),
            "end": round(float(best.get("end", 0.0)), 3),
            "confidence": round(max(0.0, best_score), 3),
        })

    return {"provider": "whisperx", "segments": output}
