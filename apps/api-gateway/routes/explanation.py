import json
import os
from pathlib import Path
import re
import time

from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types


router = APIRouter(tags=["explanation"])


_REFERENCE_EXPLANATIONS_PATH = (
    Path(__file__).resolve().parents[3]
    / "toefl-sample"
    / "explaination_expected_section1.md"
)


def _load_reference_explanations() -> str:
    try:
        source = _REFERENCE_EXPLANATIONS_PATH.read_text(encoding="utf-8")
    except OSError:
        return ""

    compact_examples = []
    question_blocks = re.findall(
        r"^## Question\s+(\d+)\s*$([\s\S]*?)(?=^## Question\s+\d+\s*$|\Z)",
        source,
        flags=re.MULTILINE,
    )
    for question_number, block in question_blocks:
        answer_match = re.search(r"\*\*Correct Answer:\*\*\s*([^\n]+)", block)
        explanation_match = re.search(
            r"\*\*EXPLAINATION\*\*\s*([\s\S]*?)(?=\n\s*\*\*WHY THE OTHER OPTION IS INCORRECT\*\*)",
            block,
        )
        distractor_match = re.search(
            r"\*\s+\*\*\(([A-D])\)\s+([^:]+):\*\*\s*([^\n]+)",
            block,
        )

        def compact_text(value: str, limit: int) -> str:
            text = re.sub(r"\s+", " ", str(value or "")).strip()
            return text if len(text) <= limit else text[: limit - 3].rstrip() + "..."

        answer = compact_text(answer_match.group(1) if answer_match else "", 150)
        explanation = compact_text(explanation_match.group(1) if explanation_match else "", 190)
        distractor = ""
        if distractor_match:
            distractor = "wrong " + distractor_match.group(1) + ": " + compact_text(distractor_match.group(3), 120)

        compact_examples.append(
            "Q{} | answer: {} | explanation: {}{}".format(
                question_number,
                answer,
                explanation,
                " | " + distractor if distractor else "",
            )
        )

    return "\n".join(compact_examples)


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

    return f"""You are an expert TOEFL ITP listening tutor. Produce a complete, question-specific explanation using only the supplied transcript evidence.

GUIDELINES:
1. Format all strings as raw, unformatted plain text only.
2. Begin `main_explanation_html` immediately with the transcript evidence (e.g., "The woman states...", "The man indicates...").
3. Keep `main_explanation_html` to 1-2 direct sentences (under 50 words) linking the speaker's statement directly to the correct answer choice.
4. Write concise, objective distractor reasons (10-25 words each) explaining specifically why each incorrect option fails based on the dialogue.
5. In `dialogue_blocks`, include only one short supporting quote from the dialogue.
6. Return valid JSON only, matching the exact schema below.

FEW-SHOT EXAMPLE:
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
    "main_explanation_html": "The woman states the building is across the street from the main library, which means the math building is located near the library.",
    "dialogue_blocks": [
      {{
        "speaker_name": "Woman",
        "speaker_gender": "female",
        "introduction_label": "The woman gives directions:",
        "quote_text_html": "It's right across the street from the main library."
      }}
    ],
    "distractor_analysis": [
      {{"letter": "A", "text": "She is studying math at the library.", "reason": "The dialogue is only about asking for directions; it does not mention what the woman is studying."}},
      {{"letter": "B", "text": "She does not know where the building is.", "reason": "She explicitly gives the location, proving she knows where the building is."}},
      {{"letter": "D", "text": "The library is closed right now.", "reason": "There is no mention of the library operating hours or it being closed."}}
    ],
    "closing_analysis_html": "Option (C) is the only choice supported by the woman's statement."
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