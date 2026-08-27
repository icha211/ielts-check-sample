from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


QUESTION_START_RE = re.compile(r"^\s*(\d{1,3})[.)]\s*(.*)$")
OPTION_START_RE = re.compile(r"^\s*[\[(]?([A-D])[\])\.:\-]\s*(.*)$", re.IGNORECASE)
SPEAKER_RE = re.compile(
    r"^\s*(Man|Woman|Narrator|Speaker\s*[A-Z]|Host|Interviewer|Professor|Student)\s*:\s*(.+)$",
    re.IGNORECASE,
)


def _norm_line(line: str) -> str:
    return re.sub(r"\s+", " ", (line or "").strip())


def parse_smart_input(raw_text: str) -> Dict[str, Any]:
    if not isinstance(raw_text, str):
        raise TypeError("raw_text must be a string")

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return {"questions": [], "warnings": ["Input is empty"], "raw": raw_text}

    lines = text.split("\n")
    blocks: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for line in lines:
        m = QUESTION_START_RE.match(line)
        if m:
            if current:
                blocks.append(current)
            current = {
                "question_number": int(m.group(1)),
                "raw_lines": [],
            }
            tail = _norm_line(m.group(2))
            if tail:
                current["raw_lines"].append(tail)
            continue

        if current is not None:
            current["raw_lines"].append(line)

    if current:
        blocks.append(current)

    if not blocks:
        raise ValueError("No question blocks detected. Expected numbering like '1.'")

    out_questions: List[Dict[str, Any]] = []
    warnings: List[str] = []

    for block in blocks:
        options: List[Dict[str, str]] = []
        transcript: List[Dict[str, str]] = []
        current_option: Optional[Dict[str, str]] = None
        current_utt: Optional[Dict[str, str]] = None

        for raw_line in block["raw_lines"]:
            line = _norm_line(raw_line)
            if not line:
                continue

            opt = OPTION_START_RE.match(line)
            if opt:
                current_option = {
                    "letter": opt.group(1).upper(),
                    "text": _norm_line(opt.group(2)),
                }
                options.append(current_option)
                current_utt = None
                continue

            sp = SPEAKER_RE.match(line)
            if sp:
                speaker = _norm_line(sp.group(1)).title()
                text_part = _norm_line(sp.group(2))
                current_utt = {"speaker": speaker, "text": text_part}
                transcript.append(current_utt)
                current_option = None
                continue

            if current_option is not None:
                current_option["text"] = _norm_line(f"{current_option['text']} {line}")
                continue

            if current_utt is not None:
                current_utt["text"] = _norm_line(f"{current_utt['text']} {line}")

        q_obj = {
            "question_number": block["question_number"],
            "options": [f"({x['letter']}) {x['text']}" for x in options],
            "transcript": transcript,
        }

        if not q_obj["options"]:
            warnings.append(f"Question {q_obj['question_number']}: no options detected")
        if not q_obj["transcript"]:
            warnings.append(f"Question {q_obj['question_number']}: no transcript lines detected")

        out_questions.append(q_obj)

    return {
        "questions": out_questions,
        "warnings": warnings,
        "raw": raw_text,
    }


@dataclass
class AudioReviewSegment:
    speaker: str
    text: str
    start: Optional[float]
    end: Optional[float]


@dataclass
class AudioReviewQuestion:
    question_number: int
    options: List[str]
    transcripts: List[AudioReviewSegment]


@dataclass
class AudioReviewPayload:
    test_id: str
    set_id: str
    question_data: List[AudioReviewQuestion]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "test_id": self.test_id,
            "set_id": self.set_id,
            "question_data": [
                {
                    "question_number": q.question_number,
                    "options": q.options,
                    "transcripts": [
                        {
                            "speaker": t.speaker,
                            "text": t.text,
                            "start": t.start,
                            "end": t.end,
                        }
                        for t in q.transcripts
                    ],
                }
                for q in self.question_data
            ],
        }


def build_audio_review_payload(
    test_id: str,
    set_id: str,
    aligned_questions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    data: List[AudioReviewQuestion] = []

    for question in aligned_questions:
        transcripts = []
        for t in question.get("transcripts", []) or []:
            transcripts.append(
                AudioReviewSegment(
                    speaker=str(t.get("speaker", "Narrator")),
                    text=str(t.get("text", "")),
                    start=float(t["start"]) if t.get("start") is not None else None,
                    end=float(t["end"]) if t.get("end") is not None else None,
                )
            )

        data.append(
            AudioReviewQuestion(
                question_number=int(question.get("question_number", 0)),
                options=[str(opt) for opt in (question.get("options", []) or [])],
                transcripts=transcripts,
            )
        )

    payload = AudioReviewPayload(
        test_id=test_id,
        set_id=set_id,
        question_data=data,
    )

    return payload.to_dict()


def pretty_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, indent=2)
