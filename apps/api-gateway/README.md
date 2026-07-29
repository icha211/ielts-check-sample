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