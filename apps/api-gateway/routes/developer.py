import os
import re
import uuid
from datetime import datetime, timezone
from urllib.parse import quote

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from config import build_r2_endpoint, settings
from schemas import (
    DeveloperEnsureAudioFolderRequest,
    DeveloperEnsureAudioFolderResponse,
    DeveloperUploadProxyResponse,
    DeveloperUploadUrlRequest,
    DeveloperUploadUrlResponse,
)


router = APIRouter(prefix="/developer", tags=["developer"])

_ALLOWED_EXTENSIONS = {".mp3", ".m4a"}
DEFAULT_R2_PUBLIC_BASE_URL = "https://pub-1975cb14188340238a5d6d34750e4880.r2.dev"


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

    safe_name = _sanitize_filename(payload.file_name)
    _, ext = _split_extension(safe_name)
    if ext and ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .mp3 and .m4a files are supported")

    object_key = _build_object_key(safe_name)

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
    file_name: str | None = Form(default=None, alias="fileName"),
    file_type: str | None = Form(default=None, alias="fileType"),
) -> DeveloperUploadProxyResponse:
    incoming_name = str(file_name or file.filename or "audio-file")
    incoming_type = str(file_type or file.content_type or "audio/mpeg").strip().lower()

    if not incoming_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="fileType must be an audio MIME type")

    safe_name = _sanitize_filename(incoming_name)
    _, ext = _split_extension(safe_name)
    if ext and ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .mp3 and .m4a files are supported")

    object_key = _build_object_key(safe_name)

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    try:
        client = _get_r2_client()
        client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=object_key,
            Body=data,
            ContentType=incoming_type,
        )
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to upload file to R2: {exc}") from exc

    return DeveloperUploadProxyResponse(
        objectKey=object_key,
        objectUrl=_build_object_url(object_key),
        contentType=incoming_type,
        size=len(data),
    )


@router.get("/audio-url")
def get_audio_url(
    object_key: str = Query(..., alias="objectKey", min_length=1),
):
    try:
        client = _get_r2_client()
        signed_url = client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": object_key,
            },
            ExpiresIn=int(settings.r2_read_expire_seconds),
            HttpMethod="GET",
        )
    except HTTPException:
        raise
    except (ClientError, BotoCoreError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate signed audio URL: {exc}") from exc

    return {
        "objectKey": object_key,
        "audioUrl": signed_url,
        "expiresIn": int(settings.r2_read_expire_seconds),
    }


@router.get("/audio-exists")
def get_audio_exists(
    object_key: str = Query(..., alias="objectKey", min_length=1),
):
    try:
        client = _get_r2_client()
        client.head_object(
            Bucket=settings.r2_bucket_name,
            Key=object_key,
        )
        return {
            "objectKey": object_key,
            "exists": True,
            "error": "",
        }
    except HTTPException:
        raise
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return {
                "objectKey": object_key,
                "exists": False,
                "error": "",
            }
        raise HTTPException(status_code=500, detail=f"Failed to check audio object: {exc}") from exc
    except BotoCoreError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to check audio object: {exc}") from exc


@router.get("/audio-folder-contents")
def get_audio_folder_contents(
    set_id: str = Query(..., alias="setId", min_length=1),
):
    """List actual files in an R2 audio folder (for validating manually uploaded files)."""
    set_id = _sanitize_set_id(set_id)
    folder_prefix = f"toefl-test-assets/audio/listening/sets/{set_id}/"
    
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
