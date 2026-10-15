# Copilot Instructions

## Architecture

Static multi-page website (plain HTML/JS at repo root, plus `toefl-sample/`) for IELTS/TOEFL practice, with several loosely coupled backends:

- **Frontend**: root `*.html` pages (`index.html`, `developer-*.html`, `listening-test.html`, …) and `toefl-sample/`. No bundler; deployed via Firebase Hosting (`public: "."`, see `firebase.json`) and GitHub Pages (`.github/workflows/pages.yml`). Client sync helpers: `storage-sync.js`, `study-plan-firestore-sync.js`, `toefl-sample/toefl-storage-sync.js`. Runtime config in `api/runtime-config.js`.
- **Legacy Python servers (active runtime)**: `ai_review_server.py` (AI review, uses `google-genai`) and `data_storage_server.py` — stdlib `http.server`, run directly with `python <file>`. See `SERVER-STARTUP-GUIDE.md`, `PERSISTENT_STORAGE_SETUP.md`, `CLOUDFLARE_R2_SETUP.md` (audio assets in R2).
- **`apps/api-gateway/`**: FastAPI gateway (`main.py`, `routes/{chat,evaluation,explanation,health,developer}.py`, `services/audio_review_pipeline.py`). Run: `uvicorn main:app --reload --host 127.0.0.1 --port 8000` from that directory. `apps/audio-aligner-modal/` is a Modal app.
- **`functions/`**: Firebase Cloud Functions (TypeScript, Express in `src/app.ts`, routes under `src/routes`). All non-health routes require Firebase auth; user-scoped routes enforce `auth.uid === uid`; problem-set admin routes require `token.role === "developer"`.
- **Additive scaffolding**: `services/`, `ml/`, `shared/`, `infra/`, `docs/architecture/` for new AI work.
- Firebase rules live at the root (`firestore.rules`, `database.rules.json`, `storage.rules`).

## Commands

Mirrors CI (`.github/workflows/ci.yml`):

```
# Python (3.11)
pip install -r requirements.txt -r apps/api-gateway/requirements.txt
python -m py_compile ai_review_server.py data_storage_server.py

# Cloud Functions (Node 20), from functions/
npm ci
npm run lint
npm test                              # vitest run
npx vitest run tests/api-auth.test.ts # single file
npx vitest run -t "name substring"    # single test
npm run build                         # tsc
npm run serve                         # firebase emulator
```

There is no Python test suite or frontend build.

## Conventions

- **Do not move or rename root HTML/JS/Python runtime files** or `toefl-sample/` (`PROJECT_STRUCTURE.md`): relative paths depend on them. Any migration must update paths together and be smoke-tested.
- New AI/backend code goes under `apps/`, `services/`, `ml/`, `shared/`, or `infra/`; define shared schemas (`shared/schemas`) before replacing existing review/storage endpoints.
- Firebase hosting ignores `functions/`, `apps/`, `.github/` and dotfiles, so don't reference them from pages.
- `apps/api-gateway/.env` and `env.yaml` hold configuration; never commit or echo secrets.
- UI/design work: project skills exist in `.agents/skills/` and `.github/skills/` (design, motion, animation review).
