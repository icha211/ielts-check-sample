import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from auth import require_signed_in
from ai_runtime import generate_text, validate_payload

from schemas import EvaluationRequest, EvaluationResponse


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("", response_model=EvaluationResponse)
def evaluate(payload: EvaluationRequest, user: dict = Depends(require_signed_in)) -> EvaluationResponse:
    data = validate_payload(payload.model_dump())
    if not payload.submission_text and not payload.transcript:
        raise HTTPException(status_code=400, detail="A submission or transcript is required")
    text = generate_text(
        "You are an IELTS coach. Return JSON with summary, estimated_band (number or null), "
        "strengths, improvements and next_steps (string arrays). Scores are practice estimates, not official results.\n"
        + json.dumps(data), user["uid"], json_output=True,
    )
    try:
        return EvaluationResponse.model_validate(json.loads(text))
    except (ValueError, ValidationError) as exc:
        logging.getLogger(__name__).warning("Invalid AI evaluation response")
        raise HTTPException(status_code=502, detail="AI returned an invalid evaluation") from exc