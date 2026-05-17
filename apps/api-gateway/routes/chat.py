from fastapi import APIRouter

from schemas import ChatRequest, ChatResponse


router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    reply = (
        f"Chat gateway stub received module={payload.module}. "
        "Connect this route to services/chat-service next."
    )
    return ChatResponse(reply=reply)