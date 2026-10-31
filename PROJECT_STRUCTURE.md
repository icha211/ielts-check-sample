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

## Community page

`toefl-sample/social.html` uses `social.css` and `social.js` without a build step.
It shares the existing Firebase Auth account, opt-in `partnerDirectory` profiles
and presence, and `message.html?to=<uid>` messaging flow. Study-buddy matches rank
the learner's saved CEFR level; missing levels are not replaced by invented scores.

Shared Realtime Database data lives in `community_posts`, `community_likes`,
`community_comments`, and `community_members`. Feeds and comment lists load the
latest 100 records. The sidebar displays an HTML/CSS tutor promotion
instead of the group membership panel, with selectable, localized text and a
disabled button. The promotion fills the sidebar width and its desktop bottom
tracks the post composer using ResizeObserver, growing if needed to keep text
visible. On smaller screens it uses natural height.
Only the decorative tutor illustration is an image.
Group selection remains available in the post composer.
The composer has a borderless writing area, live character count and an
audience shortcut that focuses the existing group selector. Groups organize
posts without restricting their visibility or replies. Only authors can edit
posts; authors and verified developers can remove posts/comments. Announcements
are developer-only. Removed posts are retained but hidden and cannot receive new
comments or likes.

Attachments are limited to 20 MB (PNG, JPEG, WebP, MP4, WebM), stored at
`community/<uid>/<postId>/attachment`. Post edits preserve existing attachments.
Uploads that fail to publish are cleaned up. Publish **both database and Storage
rules before using the new page**:

```powershell
firebase deploy --only database,storage
node --test toefl-sample\community.test.js
```

`community-rules.test.js` additionally runs when
`FIREBASE_DATABASE_EMULATOR_HOST` is set; use the `demo-toefl-messaging` emulator
project to run it alongside the existing messaging-rule tests. No production
data is seeded and no sample users or activity counts are displayed.

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