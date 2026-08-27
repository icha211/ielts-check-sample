#!/usr/bin/env python3
"""
WhisperX alignment script for audio-review pipeline.

Expected JSON input:
{
  "audio_url": "https://.../file.mp3",
  "questions": [
    {
      "question_number": 1,
      "options": ["(A)...", "(B)...", "(C)...", "(D)..."],
      "transcript": [{"speaker":"Man","text":"..."}]
    }
  ]
}

Output JSON shape:
{
  "audio_url": "...",
  "questions": [
    {
      "question_number": 1,
      "options": [...],
      "transcripts": [
        {"speaker":"Man","text":"...","start":0.0,"end":2.3}
      ]
    }
  ]
}
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Dict, List, Any


def _normalize_text(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> List[str]:
    norm = _normalize_text(text)
    return [tok for tok in norm.split(" ") if tok]


def _jaccard(left: str, right: str) -> float:
    lset = set(_tokenize(left))
    rset = set(_tokenize(right))
    if not lset or not rset:
        return 0.0
    inter = len(lset.intersection(rset))
    union = len(lset.union(rset))
    return inter / union if union else 0.0


def _download_audio(audio_url: str) -> str:
    suffix = Path(audio_url.split("?")[0]).suffix or ".mp3"
    fd, local_path = tempfile.mkstemp(prefix="whisperx-audio-", suffix=suffix)
    os.close(fd)
    urllib.request.urlretrieve(audio_url, local_path)
    return local_path


def _flatten_transcript(questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for q in questions:
      lines = q.get("transcript", []) or []
      for idx, line in enumerate(lines):
        out.append(
          {
            "question_number": q.get("question_number"),
            "transcript_index": idx,
            "speaker": line.get("speaker", "Narrator"),
            "text": line.get("text", ""),
          }
        )
    return out


def _map_segments(lines: List[Dict[str, Any]], segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mapped: List[Dict[str, Any]] = []
    cursor = 0

    for line in lines:
        best = None
        best_score = -1.0

        for i in range(cursor, len(segments)):
            seg = segments[i]
            score = _jaccard(line["text"], seg.get("text", ""))
            if score > best_score:
                best_score = score
                best = (i, seg)
            if score >= 0.92:
                break

        if best is None or best_score < 0.25:
            for i, seg in enumerate(segments):
                score = _jaccard(line["text"], seg.get("text", ""))
                if score > best_score:
                    best_score = score
                    best = (i, seg)

        if best is None:
            mapped.append(
                {
                    **line,
                    "start": None,
                    "end": None,
                    "confidence": 0.0,
                }
            )
            continue

        idx, seg = best
        cursor = max(cursor, idx + 1)
        mapped.append(
            {
                **line,
                "start": round(float(seg.get("start", 0.0)), 3),
                "end": round(float(seg.get("end", 0.0)), 3),
                "confidence": round(float(best_score), 3),
            }
        )

    return mapped


def _rehydrate(questions: List[Dict[str, Any]], mapped: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in mapped:
        key = str(row.get("question_number"))
        grouped.setdefault(key, []).append(row)

    out: List[Dict[str, Any]] = []
    for q in questions:
        key = str(q.get("question_number"))
        lines = grouped.get(key, [])
        lines = sorted(lines, key=lambda x: x.get("transcript_index", 0))
        out.append(
            {
                **q,
                "transcripts": [
                    {
                        "speaker": line.get("speaker"),
                        "text": line.get("text"),
                        "start": line.get("start"),
                        "end": line.get("end"),
                    }
                    for line in lines
                ],
            }
        )
    return out


def run_alignment(audio_url: str, questions: List[Dict[str, Any]]) -> Dict[str, Any]:
    try:
        import whisperx  # type: ignore
    except Exception as exc:
        raise RuntimeError(
            "whisperx is not installed. Install with: pip install whisperx"
        ) from exc

    local_audio_path = _download_audio(audio_url)
    device = "cuda"
    compute_type = "float16"

    if os.name == "nt":
        # Most Windows local setups are CPU-only.
        device = "cpu"
        compute_type = "int8"

    model = whisperx.load_model("base", device=device, compute_type=compute_type)
    transcribed = model.transcribe(local_audio_path)

    language = transcribed.get("language", "en")
    align_model, metadata = whisperx.load_align_model(language_code=language, device=device)
    aligned = whisperx.align(transcribed["segments"], align_model, metadata, local_audio_path, device=device)

    segments = aligned.get("segments", [])
    flattened = _flatten_transcript(questions)
    mapped = _map_segments(flattened, segments)
    aligned_questions = _rehydrate(questions, mapped)

    return {
        "audio_url": audio_url,
        "questions": aligned_questions,
        "segment_count": len(segments),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="WhisperX aligner for question transcripts")
    parser.add_argument("--input", required=True, help="Path to input JSON")
    parser.add_argument("--output", required=True, help="Path to output JSON")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        payload = json.load(f)

    audio_url = payload.get("audio_url")
    questions = payload.get("questions")

    if not audio_url or not isinstance(questions, list):
        raise ValueError("Invalid input payload: audio_url and questions[] are required")

    result = run_alignment(audio_url, questions)

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=True, indent=2)

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as err:  # noqa: BLE001
        print(f"[whisperx_aligner] ERROR: {err}", file=sys.stderr)
        raise
