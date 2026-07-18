# Quick Check Cloud Functions (Phase 1 Scaffold)

This folder contains the Phase 1 serverless API scaffold for Firebase Functions using TypeScript.

## Implemented routes

- `GET /api/health`
- `POST /api/chat`
- `POST /api/evaluation`
- `POST /api/submissions/start`
- `POST /api/submissions/:submissionId/submit`
- `GET /api/study-plans/:uid`
- `POST /api/study-plans/upsert`
- `POST /api/problem-sets` (developer-only)
- `PUT /api/problem-sets/:setId` (developer-only)

## Auth and authorization

- Bearer token required for all non-health routes.
- User-scoped routes enforce `request.auth.uid === uid` from body/params.
- Problem-set admin routes enforce `request.auth.token.role === "developer"`.

## Commands

- `npm ci`
- `npm run lint`
- `npm test`
- `npm run build`
