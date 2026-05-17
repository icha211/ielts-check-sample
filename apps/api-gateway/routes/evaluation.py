from fastapi import APIRouter

from schemas import EvaluationRequest, EvaluationResponse


router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("", response_model=EvaluationResponse)
def evaluate(payload: EvaluationRequest) -> EvaluationResponse:
    summary = (
        f"Evaluation gateway stub received module={payload.module}. "
        "Connect this route to services/eval-service next."
    )
    return EvaluationResponse(summary=summary)