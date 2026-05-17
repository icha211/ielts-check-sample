from typing import List, Literal, Optional

from pydantic import BaseModel, Field


ModuleName = Literal["reading", "listening", "writing", "speaking"]


class HealthResponse(BaseModel):
    ok: bool = True
    service: str


class ChatRequest(BaseModel):
    module: ModuleName
    message: str = Field(min_length=1)
    explanation_id: Optional[str] = None
    session_id: Optional[str] = None
    history: List[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    route: str = "chat-service"


class EvaluationRequest(BaseModel):
    module: ModuleName
    prompt_title: Optional[str] = None
    submission_text: Optional[str] = None
    transcript: Optional[str] = None
    score: Optional[float] = None
    metadata: dict = Field(default_factory=dict)


class EvaluationResponse(BaseModel):
    summary: str
    estimated_band: Optional[float] = None
    strengths: List[str] = Field(default_factory=list)
    improvements: List[str] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)
    route: str = "eval-service"