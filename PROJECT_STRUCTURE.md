# Non-Breaking Project Structure

This repository now uses an additive structure for future AI work.

Current production-like website flow remains unchanged:

- Root HTML pages stay at the repository root.
- `toefl-sample/` stays in place.
- `ai_review_server.py` stays in place.
- `data_storage_server.py` stays in place.
- Existing `storage-sync.js` and `toefl-sample/toefl-storage-sync.js` stay in place.

These files are still the active website/runtime surface. Do not move them until a dedicated migration phase is planned and the relative paths are updated together.

## New Additive Structure

- `apps/`
  - Future API gateway or web-app wrappers.
- `services/`
  - Runtime AI services: evaluation, chat, speech, recommendation, RLHF orchestration.
- `ml/`
  - Training, datasets, reward modeling, PPO, evaluation, LoRA adapters.
- `shared/`
  - Common schemas, rubrics, prompts, utilities.
- `infra/`
  - Docker and local orchestration assets.
- `docs/architecture/`
  - Architecture and migration notes.

## Migration Guardrails

1. Do not relocate existing HTML, JS, or Python runtime files during scaffold setup.
2. Any future move of website files must be done together with path updates and smoke testing.
3. New AI code should be added under `apps/`, `services/`, `ml/`, `shared/`, or `infra/` first.
4. Shared contracts should be defined before replacing the current review/storage endpoints.

## Recommended Next Moves

1. Define shared request/response schemas in `shared/schemas`.
2. Add a FastAPI gateway under `apps/api-gateway`.
3. Build evaluation/chat services behind the gateway before touching the current pages.
4. Migrate frontend pages one integration point at a time.