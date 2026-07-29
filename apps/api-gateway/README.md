# API Gateway

This is the future public backend entrypoint for AI features.

Keep the current root Python servers in place until frontend migration is ready.

## Entry Point

- `main.py`: FastAPI application bootstrap.

## Planned Responsibilities

- Health and readiness endpoints.
- Unified evaluation routes for reading, listening, writing, and speaking.
- Chat routes for explanation pages.
- Future auth and request orchestration.

## Run Later

When FastAPI dependencies are installed, the intended local command is:

`uvicorn main:app --reload --host 127.0.0.1 --port 8000`

## Audio upload env notes

For Cloudflare R2 audio upload/playback routes (`/api/developer/*`), configure:

- `IELTS_API_R2_ACCOUNT_ID`
- `IELTS_API_R2_BUCKET_NAME`
- `IELTS_API_R2_ACCESS_KEY_ID`
- `IELTS_API_R2_SECRET_ACCESS_KEY`
- `IELTS_API_R2_PUBLIC_BASE_URL` (recommended for globally playable public URLs)
- `IELTS_API_CORS_ALLOW_ORIGINS` (comma-separated; use `*` for broad access)