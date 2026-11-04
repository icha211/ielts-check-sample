import json
import logging
import os
import urllib.error
import urllib.request
from contextvars import ContextVar
from datetime import datetime, timezone
from functools import lru_cache

from fastapi import HTTPException
from firebase_admin import firestore
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError
from google import genai
from google.genai import types
from google.genai.errors import APIError
from httpx import TransportError

from auth import _firebase_app
from config import settings


logger = logging.getLogger(__name__)
current_ai_uid: ContextVar[str | None] = ContextVar("ai_uid", default=None)
MAX_JSON_BYTES = 32768
MAX_AUDIO_BYTES = 2 * 1024 * 1024


class AiBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        protected = {
            settings.api_prefix + path for path in (
                "/chat", "/evaluation", "/toefl-explanation-json", "/translate-explanation", "/developer/align-transcript"
            )
        }
        if scope["type"] != "http" or scope["path"].rstrip("/") not in protected:
            return await self.app(scope, receive, send)
        chunks = []
        length = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            length += len(chunk)
            if length > MAX_JSON_BYTES:
                body = b'{"detail":"AI request is too large"}'
                await send({"type": "http.response.start", "status": 413, "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body", "body": body})
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)


@lru_cache(maxsize=1)
def _quota_client():
    return firestore.client(app=_firebase_app())


def reserve_generation(uid: str) -> None:
    if not uid:
        raise HTTPException(status_code=401, detail="Sign in before using AI")
    if not settings.ai_enabled:
        raise HTTPException(status_code=503, detail="AI is temporarily disabled")
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    minute = now.strftime("%H:%M")
    try:
        client = _quota_client()
        control = client.collection("aiUsageControl").document("current")
        usage = client.collection("aiUsageDays").document(day)

        @firestore.transactional
        def reserve(transaction):
            control_data = control.get(transaction=transaction).to_dict() or {}
            if control_data.get("enabled") is not True:
                raise HTTPException(status_code=503, detail="AI is temporarily disabled")
            data = usage.get(transaction=transaction).to_dict() or {}
            users = data.get("users", {})
            user = users.get(uid, {})
            daily = user.get("count", 0)
            minute_count = user.get("minuteCount", 0) if user.get("minute") == minute else 0
            if data.get("count", 0) >= settings.ai_daily_global_limit:
                raise HTTPException(status_code=429, detail="Platform AI daily limit reached", headers={"Retry-After": "3600"})
            if daily >= settings.ai_daily_user_limit:
                raise HTTPException(status_code=429, detail="Your AI daily limit is reached", headers={"Retry-After": "3600"})
            if minute_count >= settings.ai_minute_user_limit:
                raise HTTPException(status_code=429, detail="Please wait before sending another AI request", headers={"Retry-After": "60"})
            users[uid] = {"count": daily + 1, "minute": minute, "minuteCount": minute_count + 1}
            transaction.set(usage, {"count": data.get("count", 0) + 1, "users": users})

        reserve(client.transaction(max_attempts=5))
    except (GoogleAPICallError, GoogleAuthError, ValueError, TypeError) as exc:
        logger.error("AI quota service unavailable: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="AI usage controls unavailable") from exc


def validate_payload(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="A JSON object is required")
    if len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) > MAX_JSON_BYTES:
        raise HTTPException(status_code=413, detail="AI request is too large")
    return payload


def _gemini_client() -> genai.Client:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    options = types.HttpOptions(timeout=settings.ai_timeout_seconds * 1000, retry_options=types.HttpRetryOptions(attempts=1))
    if key:
        return genai.Client(api_key=key, http_options=options)
    project = os.getenv("GOOGLE_CLOUD_PROJECT") or settings.firebase_project_id
    if not project:
        raise HTTPException(status_code=503, detail="AI provider is not configured")
    return genai.Client(vertexai=True, project=project, location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"), http_options=options)


def generate_text(prompt: str, uid: str | None = None, *, json_output: bool = False) -> str:
    if not prompt.strip() or len(prompt) > settings.ai_max_prompt_chars:
        raise HTTPException(status_code=413, detail="AI prompt is empty or too large")
    if settings.ai_provider == "deepseek" and not settings.deepseek_benchmark_approved:
        raise HTTPException(status_code=503, detail="DeepSeek migration requires benchmark approval")
    reserve_generation(uid or current_ai_uid.get() or "")
    try:
        if settings.ai_provider == "deepseek":
            key = os.getenv("DEEPSEEK_API_KEY")
            if not key:
                raise HTTPException(status_code=503, detail="AI provider is not configured")
            payload = {
                "model": settings.deepseek_model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": settings.ai_max_output_tokens,
                "thinking": {"type": "disabled"},
                "temperature": 0.2,
            }
            if json_output:
                payload["response_format"] = {"type": "json_object"}
            request = urllib.request.Request(
                "https://api.deepseek.com/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=settings.ai_timeout_seconds) as response:
                raw = response.read(131073)
            if len(raw) > 131072:
                raise ValueError("Provider response exceeds limit")
            result = json.loads(raw)
            choice = result["choices"][0]
            if choice.get("finish_reason") == "length":
                raise ValueError("Provider output was truncated")
            text = choice["message"]["content"]
        else:
            with _gemini_client() as client:
                response = client.models.generate_content(
                    model=os.getenv("GEMINI_MODEL", "gemini-3.5-flash"), contents=prompt,
                    config=types.GenerateContentConfig(
                        max_output_tokens=settings.ai_max_output_tokens, temperature=0.2,
                        response_mime_type="application/json" if json_output else "text/plain",
                    ),
                )
                text = response.text
                if response.candidates and str(response.candidates[0].finish_reason).endswith("MAX_TOKENS"):
                    raise ValueError("Provider output was truncated")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Provider returned an empty response")
        return text
    except (APIError, TransportError, urllib.error.URLError, TimeoutError, ValueError, KeyError, IndexError, TypeError, GoogleAuthError) as exc:
        logger.error("AI generation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="AI provider could not complete the request") from exc


def generate_audio(audio: bytes, mime_type: str, prompt: str, uid: str) -> str:
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio transcription supports files up to 2 MB in the beta")
    if not mime_type.startswith("audio/") or not prompt.strip() or len(prompt) > settings.ai_max_prompt_chars:
        raise HTTPException(status_code=400, detail="An audio MIME type is required")
    reserve_generation(uid)
    try:
        with _gemini_client() as client:
            response = client.models.generate_content(
                model=os.getenv("GEMINI_TRANSCRIBE_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.5-flash")),
                contents=[types.Part.from_text(text=prompt), types.Part.from_bytes(data=audio, mime_type=mime_type)],
                config=types.GenerateContentConfig(max_output_tokens=settings.ai_max_output_tokens),
            )
            if not response.text:
                raise ValueError("Empty transcription")
            return response.text
    except (APIError, TransportError, GoogleAuthError, ValueError) as exc:
        logger.error("Audio transcription failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Audio transcription failed") from exc
