import os
import re
import uuid
import json
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone
from urllib.parse import quote

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from config import build_r2_endpoint, settings
from schemas import (
    DeveloperEnsureAudioFolderRequest,
    DeveloperEnsureAudioFolderResponse,
    DeveloperUploadProxyResponse,
    DeveloperUploadUrlRequest,
    DeveloperUploadUrlResponse,
    PlaybackTelemetryEvent,
    AlignTranscriptRequest,
    AlignTranscriptResponse,
)


router = APIRouter(prefix="/developer", tags=["developer"])

_ALLOWED_EXTENSIONS = {".mp3"}
_ALLOWED_AUDIO_PARTS = {1, 2, 3}
_ALLOWED_AUDIO_OBJECT_KEY_RE = re.compile(
    r"^audio/listening/sets/[A-Za-z0-9_-]+/part_([0-9]+)\.mp3$",
    re.IGNORECASE,
)
_ALLOWED_QUESTION_AUDIO_OBJECT_KEY_RE = re.compile(
    r"^audio/listening/sets/[A-Za-z0-9_-]+/question_set/part_1/q_([0-9]{1,2})\.mp3$",
    re.IGNORECASE,
)
_ALLOWED_GROUP_AUDIO_OBJECT_KEY_RE = re.compile(
    r"^audio/listening/sets/[A-Za-z0-9_-]+/question_set/part_([23])/q_([0-9]{2})-([0-9]{2})\.mp3$",
    re.IGNORECASE,
)
# Part B/C explanation audio is grouped per conversation/talk.
_ALLOWED_AUDIO_GROUPS = {
    2: {(31, 34), (35, 38)},
    3: {(39, 42), (43, 46), (47, 50)},
}
DEFAULT_R2_PUBLIC_BASE_URL = "https://pub-1975cb14188340238a5d6d34750e4880.r2.dev"


def _alignment_text_score(left: str, right: str) -> float:
    def words(value: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", str(value or "").lower()))
    source = words(left)
    target = words(right)
    if not source or not target:
        return 0.0
    return len(source & target) / len(source | target)


def _parse_transcript_for_alignment(raw_text: str) -> list[dict]:
    rows = []
    current_question = 0
    saw_question_block = False
    for raw_line in str(raw_text or "").splitlines():
        line = re.sub(r"\*{1,2}", "", raw_line).strip()
        opening = re.match(r"<Question\s+(\d+)", line, re.IGNORECASE)
        if opening:
            current_question = int(opening.group(1))
            saw_question_block = True
            continue
        if re.match(r"</Question", line, re.IGNORECASE):
            current_question = 0
            continue
        legacy = re.match(r"Question\s*(\d+)\b", line, re.IGNORECASE)
        if legacy:
            current_question = int(legacy.group(1))
            saw_question_block = True
            continue
        speaker = re.match(r"(?:\[[^\]]+\]\s*)?(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?(Man|Woman|Narrator|Narr|Speaker\s*[A-Z]|Professor|Student|Host|Interviewer)\s*:\s*(.+)", line, re.IGNORECASE)
        if speaker and (current_question > 0 or not saw_question_block):
            rows.append({
                "questionNumber": current_question or 1,
                "speaker": speaker.group(1),
                "text": speaker.group(2).strip(),
            })
    return rows


def _request_whisperx_alignment(audio_url: str, transcript_text: str) -> dict | None:
    aligner_url = settings.whisperx_aligner_url or os.getenv("WHISPERX_ALIGNER_URL")
    if not aligner_url or not transcript_text.strip():
        return None
    body = json.dumps({"audio_url": audio_url, "transcript_text": transcript_text}).encode("utf-8")
    request = urllib.request.Request(
        aligner_url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=900) as response:
            result = json.loads(response.read().decode("utf-8"))
        return result if isinstance(result, dict) else None
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"[WhisperX] automatic upload alignment failed: {exc}")
        return None


@router.post("/align-transcript", response_model=AlignTranscriptResponse)
def align_transcript(payload: AlignTranscriptRequest) -> AlignTranscriptResponse:
    aligner_url = settings.whisperx_aligner_url or os.getenv("WHISPERX_ALIGNER_URL")
    if not aligner_url:
        raise HTTPException(status_code=503, detail="WHISPERX_ALIGNER_URL is not configured")

    request_body = json.dumps({
        "audio_url": payload.audio_url,
        "transcript_text": payload.transcript_text,
    }).encode("utf-8")
    request = urllib.request.Request(
        aligner_url,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=900) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HTTPException(status_code=502, detail=f"WhisperX alignment failed: {detail[:500]}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise HTTPException(status_code=504, detail=f"WhisperX alignment timed out: {exc}") from exc

    segments = result.get("segments", [])
    if not isinstance(segments, list):
        raise HTTPException(status_code=502, detail="WhisperX returned an invalid segment list")
    return AlignTranscriptResponse(provider="whisperx", segments=segments)


def _sanitize_filename(name: str) -> str:
    base = os.path.basename(str(name or "").strip())
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", base).strip("-.")
    return cleaned or "audio-file"


def _split_extension(name: str) -> tuple[str, str]:
    stem, ext = os.path.splitext(name)
    return stem, ext.lower()


def _sanitize_set_id(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return re.sub(r"[^A-Za-z0-9_-]+", "-", raw).strip("-")


def _build_folder_object_key(set_id: str, part_number: int, file_name: str) -> str:
    """Build object key for a folder-based audio upload.
    
    Format: audio/listening/sets/{setId}/part_{partNumber}.mp3
    """
    if not set_id or part_number not in _ALLOWED_AUDIO_PARTS:
        raise ValueError("setId and partNumber (1-3) are required for folder uploads")
    
    safe_name = _sanitize_filename(file_name)
    _, ext = _split_extension(safe_name)
    if ext not in _ALLOWED_EXTENSIONS:
        ext = ".mp3"
    
    return f"audio/listening/sets/{set_id}/part_{part_number}{ext}"


def _build_object_key(file_name: str) -> str:
    safe_name = _sanitize_filename(file_name)
    stem, ext = _split_extension(safe_name)
    if ext not in _ALLOWED_EXTENSIONS:
        ext = ".mp3"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    suffix = uuid.uuid4().hex[:12]
    return f"audio/listening/{timestamp}-{suffix}-{stem}{ext}"


def _get_r2_client():
    missing = []
    if not settings.r2_account_id:
        missing.append("R2_ACCOUNT_ID")
    if not settings.r2_bucket_name:
        missing.append("R2_BUCKET_NAME")
    if not settings.r2_access_key_id:
        missing.append("R2_ACCESS_KEY_ID")
    if not settings.r2_secret_access_key:
        missing.append("R2_SECRET_ACCESS_KEY")

    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Missing R2 configuration: {', '.join(missing)}",
        )

    return boto3.client(
        "s3",
        endpoint_url=build_r2_endpoint(settings.r2_account_id),
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region_name,
        config=Config(signature_version="s3v4"),
    )


def _build_object_url(object_key: str) -> str:
    base = (settings.r2_public_base_url or DEFAULT_R2_PUBLIC_BASE_URL).rstrip("/")
    return f"{base}/{quote(object_key)}"


def _build_folder_url(set_id: str) -> str:
    folder_path = f"audio/listening/sets/{set_id}/"
    base = (settings.r2_public_base_url or DEFAULT_R2_PUBLIC_BASE_URL).rstrip("/")
    return f"{base}/{quote(folder_path)}"


def _validate_allowed_audio_object_key(object_key: str) -> str:
    key = str(object_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="objectKey is required")

    if match := _ALLOWED_AUDIO_OBJECT_KEY_RE.match(key):
        part_no = int(match.group(1))
        if part_no not in _ALLOWED_AUDIO_PARTS:
            raise HTTPException(status_code=400, detail="Only part_1..part_3 are playable")
        return key

    if question_match := _ALLOWED_QUESTION_AUDIO_OBJECT_KEY_RE.match(key):
        question_no = int(question_match.group(1))
        if question_no < 1 or question_no > 30:
            raise HTTPException(status_code=400, detail="Only Part A question audio q_01..q_30 is playable")
        return key

    if group_match := _ALLOWED_GROUP_AUDIO_OBJECT_KEY_RE.match(key):
        part_no = int(group_match.group(1))
        group_range = (int(group_match.group(2)), int(group_match.group(3)))
        if group_range not in _ALLOWED_AUDIO_GROUPS.get(part_no, set()):
            raise HTTPException(status_code=400, detail="Unsupported explanation audio group range")
        return key

    raise HTTPException(status_code=400, detail="objectKey must match audio/listening/sets/{setId}/part_{1-3}.mp3, .../question_set/part_1/q_{01-30}.mp3, or .../question_set/part_{2-3}/q_{range}.mp3")


def _build_proxy_audio_url(request: Request, object_key: str) -> str:
    forwarded_proto = str(request.headers.get("x-forwarded-proto") or "").strip().split(",")[0].strip()
    forwarded_host = str(request.headers.get("x-forwarded-host") or request.headers.get("host") or "").strip().split(",")[0].strip()
    if forwarded_host:
        scheme = forwarded_proto or request.url.scheme or "https"
        base = f"{scheme}://{forwarded_host}".rstrip("/")
    else:
        base = str(request.base_url).rstrip("/")
    return f"{base}{settings.api_prefix}/developer/audio-proxy?objectKey={quote(object_key)}"


@router.post("/ensure-audio-folder", response_model=DeveloperEnsureAudioFolderResponse)
def ensure_audio_folder(payload: DeveloperEnsureAudioFolderRequest) -> DeveloperEnsureAudioFolderResponse:
    set_id = _sanitize_set_id(payload.set_id)
    if not set_id:
        raise HTTPException(status_code=400, detail="setId is required")

    folder_key = f"audio/listening/sets/{set_id}/"
    marker_key = f"{folder_key}.folder"

    try:
        client = _get_r2_client()
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=marker_key,
            Body=b"",
            ContentType="text/plain",
        )
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create audio folder marker: {exc}") from exc

    return DeveloperEnsureAudioFolderResponse(
        setId=set_id,
        folderKey=folder_key,
        folderUrl=_build_folder_url(set_id),
        markerKey=marker_key,
        createdAt=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/upload-url", response_model=DeveloperUploadUrlResponse)
def create_upload_url(payload: DeveloperUploadUrlRequest) -> DeveloperUploadUrlResponse:
    file_type = str(payload.file_type).strip().lower()
    if not file_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="fileType must be an audio MIME type")

    # Canonical contract: caller must provide exact playable objectKey.
    object_key = _validate_allowed_audio_object_key(payload.object_key)

    try:
        client = _get_r2_client()
        upload_url = client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": object_key,
                "ContentType": payload.file_type,
            },
            ExpiresIn=int(settings.r2_presign_expire_seconds),
            HttpMethod="PUT",
        )
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate presigned URL: {exc}") from exc

    return DeveloperUploadUrlResponse(
        uploadUrl=upload_url,
        objectKey=object_key,
        objectUrl=_build_object_url(object_key),
        expiresIn=int(settings.r2_presign_expire_seconds),
    )


@router.post("/upload-proxy", response_model=DeveloperUploadProxyResponse)
async def upload_audio_proxy(
    file: UploadFile = File(...),
    object_key: str = Form(..., alias="objectKey"),
    file_name: str | None = Form(default=None, alias="fileName"),
    file_type: str | None = Form(default=None, alias="fileType"),
    set_id: str | None = Form(default=None, alias="setId"),
    part_number: int | None = Form(default=None, alias="partNumber"),
    transcript_text: str | None = Form(default=None, alias="transcriptText"),
) -> DeveloperUploadProxyResponse:
    incoming_name = str(file_name or file.filename or "audio-file")
    incoming_type = str(file_type or file.content_type or "audio/mpeg").strip().lower()

    if not incoming_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="fileType must be an audio MIME type")

    # Canonical contract: objectKey comes from frontend mapping (set + part), never rewritten.
    canonical_object_key = _validate_allowed_audio_object_key(object_key)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        client = _get_r2_client()
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=canonical_object_key,
            Body=data,
            ContentType=incoming_type,
        )
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload file to R2: {exc}") from exc

    alignment = _request_whisperx_alignment(_build_object_url(canonical_object_key), str(transcript_text or ""))

    return DeveloperUploadProxyResponse(
        objectKey=canonical_object_key,
        objectUrl=_build_object_url(canonical_object_key),
        contentType=incoming_type,
        size=len(data),
        alignment=alignment,
    )


@router.get("/audio-url")
def get_audio_url(
    request: Request,
    object_key: str = Query(..., alias="objectKey", min_length=1),
):
    """Get preferred proxy URL and direct fallback URL for a playable audio part."""
    key = _validate_allowed_audio_object_key(object_key)
    public_url = _build_object_url(key)
    proxy_url = _build_proxy_audio_url(request, key)
    
    return {
        "objectKey": key,
        "audioUrl": proxy_url,
        "fallbackUrl": public_url,
        "source": "proxy-first",
        "expiresIn": 3600,  # For compatibility, but public URLs don't expire
    }


@router.get("/audio-proxy")
def stream_audio_proxy(
    object_key: str = Query(..., alias="objectKey", min_length=1),
    range_header: str | None = Header(default=None, alias="Range"),
):
    """Proxy audio bytes from R2 and preserve byte-range seeking support."""
    key = _validate_allowed_audio_object_key(object_key)

    get_params = {
        "Bucket": settings.r2_bucket_name,
        "Key": key,
    }
    if range_header:
        get_params["Range"] = range_header

    try:
        client = _get_r2_client()
        response = client.get_object(**get_params)
    except HTTPException:
        raise
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"NoSuchKey", "404", "NotFound"}:
            raise HTTPException(status_code=404, detail="Audio object not found") from exc
        if code in {"InvalidRange", "416"}:
            raise HTTPException(status_code=416, detail="Invalid Range") from exc
        raise HTTPException(status_code=500, detail=f"Failed to fetch audio object: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch audio object: {exc}") from exc

    status_code = 206 if range_header and response.get("ContentRange") else 200
    content_type = str(response.get("ContentType") or "audio/mpeg")
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=300",
        "Content-Type": content_type,
    }
    if response.get("ContentLength") is not None:
        headers["Content-Length"] = str(response["ContentLength"])
    if response.get("ContentRange"):
        headers["Content-Range"] = str(response["ContentRange"])

    stream = response["Body"].iter_chunks(chunk_size=64 * 1024)
    return StreamingResponse(stream, status_code=status_code, headers=headers, media_type=content_type)


@router.get("/audio-exists")
def get_audio_exists(
    object_key: str = Query(..., alias="objectKey", min_length=1),
):
    key = _validate_allowed_audio_object_key(object_key)
    try:
        client = _get_r2_client()
        client.head_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
        )
        return {
            "objectKey": key,
            "exists": True,
            "error": "",
        }
    except HTTPException:
        raise
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return {
                "objectKey": key,
                "exists": False,
                "error": "",
            }
        raise HTTPException(status_code=500, detail=f"Failed to check audio object: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to check audio object: {exc}") from exc


@router.post("/audio-playback-event")
def record_audio_playback_event(payload: PlaybackTelemetryEvent):
    data = payload.model_dump(by_alias=True)
    print("[AudioTelemetry]", data)
    return {
        "ok": True,
        "received": data["event"],
    }


@router.get("/audio-folder-contents")
def get_audio_folder_contents(
    set_id: str = Query(..., alias="setId", min_length=1),
):
    """List actual files in an R2 audio folder (for validating manually uploaded files)."""
    set_id = _sanitize_set_id(set_id)
    folder_prefix = f"audio/listening/sets/{set_id}/"
    
    try:
        client = _get_r2_client()
        response = client.list_objects_v2(
            Bucket=settings.r2_bucket_name,
            Prefix=folder_prefix,
        )
        
        files = []
        if "Contents" in response:
            for obj in response["Contents"]:
                key = obj["Key"]
                # Skip the .folder marker file
                if not key.endswith(".folder"):
                    files.append({
                        "key": key,
                        "name": os.path.basename(key),
                        "size": obj.get("Size", 0),
                        "lastModified": obj.get("LastModified", "").isoformat() if obj.get("LastModified") else "",
                        "url": _build_object_url(key),
                    })
        
        # Log for debugging
        print(f"[Audio Folder Contents] setId={set_id}, prefix={folder_prefix}, found={len(files)} files")
        if files:
            print(f"  Files: {[f['name'] for f in files]}")
        
        return {
            "setId": set_id,
            "folderPrefix": folder_prefix,
            "fileCount": len(files),
            "files": files,
        }
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list folder contents: {exc}") from exc
