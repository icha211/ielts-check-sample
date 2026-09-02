import json
import os
import re
import time

from fastapi import APIRouter, HTTPException
from google import genai
from google.genai import types


router = APIRouter(tags=["explanation"])


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

    return f"""You are a TOEFL ITP listening tutor. Produce a concise explanation using only the supplied transcript evidence.

Rules:
- Return valid JSON only, matching the requested schema.
- Do not invent dialogue or facts.
- Quote only lines present in the transcript.
- Use <mark style=\"background-color: #FFDE00; color: #000000; font-weight: 500;\">...</mark> around decisive words.
- Include one or two dialogue blocks that directly support the correct answer.

Input:
{json.dumps({
    "question_number": question_number,
    "question_text": question_text,
    "options": options,
    "correct_option_letter": correct_letter,
    "user_selected_letter": user_letter,
    "transcript": transcript,
}, ensure_ascii=True)}

Required JSON schema:
{{
  "question_metadata": {{
    "question_number": {question_number},
    "question_text": "question text",
    "user_was_correct": {str(user_letter == correct_letter).lower()}
  }},
  "options_status": [
    {{"letter":"A","text":"option text","is_correct_choice":false,"is_user_answer":false}}
  ],
  "explanation_payload": {{
    "header_title": "Why ({correct_letter})?",
    "main_explanation_html": "clear evidence-based explanation",
    "dialogue_blocks": [
      {{
        "speaker_name": "speaker name from transcript",
        "speaker_gender": "male, female, or neutral",
        "introduction_label": "brief introduction",
        "quote_text_html": "exact supporting quote"
      }}
    ],
    "closing_analysis_html": "brief conclusion connecting evidence to the correct option"
  }}
}}
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

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
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