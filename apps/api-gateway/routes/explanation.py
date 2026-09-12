import json
import os
from pathlib import Path
import re
import time

from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types


router = APIRouter(tags=["explanation"])


def _find_reference_file() -> Path | None:
    candidates = [
        Path(__file__).resolve().parents[3] / "toefl-sample" / "explaination_expected_section1.md" if len(Path(__file__).resolve().parents) > 3 else None,
        Path(__file__).resolve().parents[2] / "toefl-sample" / "explaination_expected_section1.md" if len(Path(__file__).resolve().parents) > 2 else None,
        Path.cwd() / "toefl-sample" / "explaination_expected_section1.md",
        Path(__file__).resolve().parent / "toefl-sample" / "explaination_expected_section1.md",
    ]
    for c in candidates:
        if c and c.exists():
            return c
    return None


def _load_reference_explanations(max_examples: int = 3) -> str:
    ref_file = _find_reference_file()
    if not ref_file:
        return ""
    try:
        source = ref_file.read_text(encoding="utf-8")
    except OSError:
        return ""

    blocks = re.split(r"(?=^## Question\s+\d+)", source, flags=re.MULTILINE)
    selected = [b.strip() for b in blocks if b.strip()][:max_examples]
    return "\n\n".join(selected)


def _create_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
    if api_key.startswith("AIza"):
        return genai.Client(api_key=api_key)

    project = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT")
    location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
    if not project:
        raise RuntimeError("Configure a Gemini API key or GOOGLE_CLOUD_PROJECT for Vertex AI")
    return genai.Client(vertexai=True, project=project, location=location)


def _build_prompt(payload: dict) -> str:
    question_number = int(payload.get("active_question_number") or 0)
    question_text = str(payload.get("question_text") or "").strip()
    correct_letter = str(payload.get("correct_option_letter") or "").strip().upper()
    user_letter = str(payload.get("user_selected_letter") or "").strip().upper()
    transcript = str(payload.get("isolated_transcript_block") or "").strip()
    options = payload.get("options_array") or {}
    reference_examples = _load_reference_explanations(3)

    return f"""You are an expert TOEFL ITP listening tutor. Produce a complete, question-specific explanation using only the supplied transcript evidence.

GUIDELINES:
1. Output pure plain text only for all string values. Despite the JSON keys ending in "_html", you must NOT use any tag syntax, markdown, or formatting whatsoever.
2. Synthesize `main_explanation_html` into exactly 1 direct sentence (under 40 words) connecting the clue directly to the answer. Start directly with the evidence (e.g., "By pointing out [clue], the speaker implies [meaning]." or "The [speaker] states [clue], which means [meaning].").
3. Do not recap the dialogue turn-by-turn or write setup phrases (e.g., do not write "The man states X. In response, the woman points out Y.").
4. Write distractor reasons (10-25 words) by directly contrasting the option against the transcript context (e.g., "The dialogue is about X, not Y."). Do not write meta-commentary like "The woman does not suggest".
5. In `dialogue_blocks`, include only one short supporting quote from the dialogue.
6. Set `closing_analysis_html` to an empty string "".
7. Return valid JSON only, matching the exact schema below.

REFERENCE EXAMPLES:
{reference_examples}

FEW-SHOT EXAMPLE 1:
Input:
{{
  "question_number": 1,
  "question_text": "What does the woman mean?",
  "options": {{
    "A": "She is studying math at the library.",
    "B": "She does not know where the building is.",
    "C": "The math building is located near the library.",
    "D": "The library is closed right now."
  }},
  "correct_option_letter": "C",
  "user_selected_letter": "C",
  "transcript": "Man: Do you know where the math building is?\\nWoman: It's right across the street from the main library.\\nNarrator: What does the woman mean?"
}}

Output:
{{
  "question_metadata": {{
    "question_number": 1,
    "question_text": "What does the woman mean?",
    "user_was_correct": true
  }},
  "options_status": [
    {{"letter": "A", "text": "She is studying math at the library.", "is_correct_choice": false, "is_user_answer": false}},
    {{"letter": "B", "text": "She does not know where the building is.", "is_correct_choice": false, "is_user_answer": false}},
    {{"letter": "C", "text": "The math building is located near the library.", "is_correct_choice": true, "is_user_answer": true}},
    {{"letter": "D", "text": "The library is closed right now.", "is_correct_choice": false, "is_user_answer": false}}
  ],
  "explanation_payload": {{
    "header_title": "Why (C)?",
    "main_explanation_html": "The woman states the building is \\"across the street from the main library,\\" which means the math building is located near the library.",
    "dialogue_blocks": [
      {{
        "speaker_name": "Woman",
        "speaker_gender": "female",
        "introduction_label": "The woman gives directions:",
        "quote_text_html": "It's right across the street from the main library."
      }}
    ],
    "distractor_analysis": [
      {{"letter": "A", "text": "She is studying math at the library.", "reason": "The dialogue is only about asking for directions, not what the woman is studying."}},
      {{"letter": "B", "text": "She does not know where the building is.", "reason": "The woman explicitly provides the location, proving she knows where the building is."}},
      {{"letter": "D", "text": "The library is closed right now.", "reason": "The library's operating hours are never mentioned in the transcript."}}
    ],
    "closing_analysis_html": ""
  }}
}}

CURRENT INPUT:
{json.dumps({
    "question_number": question_number,
    "question_text": question_text,
    "options": options,
    "correct_option_letter": correct_letter,
    "user_selected_letter": user_letter,
    "transcript": transcript,
}, ensure_ascii=True)}

JSON OUTPUT:
"""


def _parse_json(text: str) -> dict:
    value = str(text or "").strip()
    start = value.find("{")
    end = value.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("Gemini did not return a JSON object")
    parsed = json.loads(value[start : end + 1])
    if not isinstance(parsed.get("question_metadata"), dict):
        raise ValueError("Missing question_metadata")
    if not isinstance(parsed.get("options_status"), list):
        raise ValueError("Missing options_status")
    if not isinstance(parsed.get("explanation_payload"), dict):
        raise ValueError("Missing explanation_payload")
    return parsed


def _is_retryable(exc: Exception) -> bool:
    message = str(exc or "").upper()
    return any(marker in message for marker in ("429", "RESOURCE_EXHAUSTED", "503", "UNAVAILABLE", "TIMEOUT"))


@router.post("/toefl-explanation-json")
def generate_toefl_explanation(payload: dict) -> dict:
    transcript = str(payload.get("isolated_transcript_block") or "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript evidence is required")

    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    try:
        client = _create_client()
        last_error = None
        for attempt, delay in enumerate((1.0, 2.0, 4.0, 8.0, 0.0)):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=_build_prompt(payload),
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.2,
                    ),
                )
                return _parse_json(response.text or "")
            except Exception as exc:
                last_error = exc
                if attempt >= 4 or (not _is_retryable(exc) and not isinstance(exc, (ValueError, json.JSONDecodeError))):
                    raise
                time.sleep(delay)

        raise last_error or RuntimeError("Gemini generation failed")
    except HTTPException:
        raise
    except Exception as exc:
        message = re.sub(r"AIza[\w-]+", "[redacted]", str(exc))
        status_code = 429 if "429" in message or "RESOURCE_EXHAUSTED" in message.upper() else 502
        raise HTTPException(status_code=status_code, detail=f"Gemini generation failed: {message}") from exc