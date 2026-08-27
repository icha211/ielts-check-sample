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
from difflib import SequenceMatcher
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

          
def _tokens(value: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(value or "").lower())


def _score(left: str, right: str) -> float:
    source = _words(left)
    target = _words(right)
    if not source or not target:
        return 0.0
    return len(source & target) / len(source | target)


def _align_rows_to_words(rows: list[dict[str, Any]], word_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    cursor = 0
    for row in rows:
        target = " ".join(_tokens(row["text"]))
        target_count = max(1, len(_tokens(row["text"])))
        best = None
        best_score = 0.0
        for start_index in range(cursor, len(word_segments)):
            for length in range(max(1, target_count - 5), target_count + 7):
                end_index = start_index + length
                window = word_segments[start_index:end_index]
                if not window:
                    continue
                candidate_text = " ".join(str(item.get("word", item.get("text", ""))) for item in window)
                score = SequenceMatcher(None, target, " ".join(_tokens(candidate_text))).ratio()
                if score > best_score:
                    best_score = score
                    best = (start_index, window)
        if not best:
            continue
        start_index, window = best
        cursor = start_index + len(window)
        output.append({
            "questionNumber": row["questionNumber"],
            "speaker": row["speaker"],
            "text": row["text"],
            "start": round(float(window[0].get("start", 0.0)), 3),
            "end": round(float(window[-1].get("end", window[-1].get("start", 0.0))), 3),
            "confidence": round(best_score, 3),
        })
    return output


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
    last_question = 0
    saw_question_block = False
    pending_range: tuple[float, float] | None = None
    speaker_pattern = re.compile(
        r"(?:\[[^\]]+\]\s*)?(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?"
        r"(Student\s*A\s*\(Man\)|Student\s*B\s*\(Woman\)|Man|Woman|Narrator|Narr|Speaker\s*[A-Z]|Professor|Student|Host|Interviewer)"
        r"\s*:\s*(.+)",
        re.IGNORECASE,
    )
    for raw_line in str(raw_text or "").splitlines():
        line = re.sub(r"\*{1,2}", "", raw_line).strip()
        opening = re.match(r"<Question\s+(\d+)", line, re.IGNORECASE)
        if opening:
            question = int(opening.group(1))
            last_question = question
            saw_question_block = True
            continue
        if re.match(r"</Question", line, re.IGNORECASE):
            question = 0
            continue
        legacy = re.match(r"Question\s*(\d+)\b", line, re.IGNORECASE)
        if legacy:
            question = int(legacy.group(1))
            last_question = question
            saw_question_block = True
            continue
        timing = re.match(r"^(\d{1,2}:\d{2}(?:[:.]\d{1,3})?)\s*-\s*(\d{1,2}:\d{2}(?:[:.]\d{1,3})?)$", line)
        if timing:
            def timestamp_seconds(value: str) -> float:
                parts = value.replace(',', '.').split(':')
                if len(parts) == 3 and '.' in parts[2]:
                    return (float(parts[0]) * 60) + float(parts[1]) + (float(parts[2]) / 100)
                if len(parts) == 2:
                    return (float(parts[0]) * 60) + float(parts[1])
                return float(parts[0])
            pending_range = (timestamp_seconds(timing.group(1)), timestamp_seconds(timing.group(2)))
            continue
        match = speaker_pattern.match(line)
        if match and (question or not saw_question_block or last_question):
            speaker = re.sub(r".*\((Man|Woman)\).*", r"\1", match.group(1), flags=re.IGNORECASE)
            row = {"questionNumber": question or last_question or 1, "speaker": speaker, "text": match.group(2).strip()}
            if pending_range:
                row["start"], row["end"] = pending_range
                pending_range = None
            rows.append(row)
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
    word_segments = aligned.get("word_segments", [])

    rows = _transcript_rows(transcript_text)
    if rows and all("start" in row and "end" in row for row in rows):
        return {
            "provider": "whisperx-explicit-timestamps",
            "segments": [
                {
                    **row,
                    "start": round(float(row["start"]), 3),
                    "end": round(float(row["end"]), 3),
                    "confidence": 1.0,
                }
                for row in rows
            ],
        }

    if word_segments:
        aligned_rows = _align_rows_to_words(rows, word_segments)
        if rows and len(aligned_rows) < max(1, (len(rows) + 1) // 2):
            raise RuntimeError("Transcript does not match enough spoken words in this audio")
        return {"provider": "whisperx", "segments": aligned_rows}

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
