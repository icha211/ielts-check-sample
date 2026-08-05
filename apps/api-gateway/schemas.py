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


class DeveloperUploadUrlRequest(BaseModel):
    object_key: str = Field(min_length=1, alias="objectKey")
    file_name: str = Field(min_length=1, alias="fileName")
    file_type: str = Field(min_length=1, alias="fileType")
    # Backward-compatible optional fields (ignored by strict canonical flow).
    set_id: Optional[str] = Field(default=None, alias="setId")
    part_number: Optional[int] = Field(default=None, alias="partNumber")


class DeveloperUploadUrlResponse(BaseModel):
    upload_url: str = Field(alias="uploadUrl")
    object_key: str = Field(alias="objectKey")
    object_url: str = Field(alias="objectUrl")
    expires_in: int = Field(alias="expiresIn")


class DeveloperUploadProxyResponse(BaseModel):
    object_key: str = Field(alias="objectKey")
    object_url: str = Field(alias="objectUrl")
    content_type: str = Field(alias="contentType")
    size: int


class DeveloperEnsureAudioFolderRequest(BaseModel):
    set_id: str = Field(min_length=1, alias="setId")
    test_type: Optional[str] = Field(default=None, alias="testType")


class DeveloperEnsureAudioFolderResponse(BaseModel):
    set_id: str = Field(alias="setId")
    folder_key: str = Field(alias="folderKey")
    folder_url: str = Field(alias="folderUrl")
    marker_key: str = Field(alias="markerKey")
    created_at: str = Field(alias="createdAt")


class PlaybackTelemetryEvent(BaseModel):
    event: Literal["loadeddata", "fallback_activated", "audio_error"]
    set_id: str = Field(min_length=1, alias="setId")
    part_key: str = Field(min_length=1, alias="partKey")
    source: str = Field(min_length=1)
    attempted_url: str = Field(min_length=1, alias="attemptedUrl")
    timestamp: str = Field(min_length=1)
    user_agent: str = Field(default="", alias="userAgent")