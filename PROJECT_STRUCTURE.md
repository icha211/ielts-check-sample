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

`toefl-sample/profile.html` retains all account controls and adds a social profile.
The shared sidebar's Social group is ordered Profile, Message, Explore. Explore
uses a globe icon and opens `social.html`; the header links are Home and Explore.
Owners open private account controls from the profile header in a responsive
modal panel, not beneath the feed. Escape, the close button or the backdrop closes
the panel; native dialog focus trapping keeps keyboard navigation inside it.
Use `profile.html?uid=<uid>` to view another learner. The banner, tabs, recent
activity, contribution milestones and connection requests use actual Firebase
data. Recent-post counts reflect the latest 100 accessible community posts,
not lifetime totals; private posts remain restricted to approved friends.
The Posts tab embeds the existing community page in an author-filtered mode,
reusing the composer, reactions, comments, editing and encrypted-media handling
without maintaining a second implementation. The same-origin embed auto-sizes
and follows the parent theme; other-user profiles never show account controls.

Public bio, location and interests live in `community_profiles/<uid>`, with
owner-only writes. Sharing connections is opt-in (off by default).
`community_connections/<uid>/<peer>` is an authenticated, rules-validated
connection index; accept/remove operations update it alongside message contacts.
Existing mutual connections are indexed when their owner visits a profile.
Other learners' connections and mutual counts are shown only when shared.
Profiles without shared details use explicit empty states, not sample identities.
Deploy database rules before using the profile's bio and connection features.

`toefl-sample/social.html` uses `social.css` and `social.js` without a build step.
It shares the existing Firebase Auth account, opt-in `partnerDirectory` profiles
and presence, and `message.html?to=<uid>` messaging flow. Study-buddy matches rank
the learner's saved CEFR level; missing levels are not replaced by invented scores.

The shared navbar bell combines accepted message requests and new posts from
approved connections. It reads the latest 100 public posts and 20 private posts
per friend, never subscribes to strangers' private feeds, and clears protected
notifications when a connection is removed or the account changes. Post links
open Explore at the post. Only posts created since connection acceptance appear.
Opening the panel marks existing notifications seen; later arrivals stay unread.
The existing owner-only `notification_state/<uid>/acceptedSeenAt` field is the
shared bell watermark for both notification types, preserving deployed rules.
This is an in-app feed, not an email or browser push notification service.
The bell also watches likes and the latest 20 comments on the current user's
posts in the loaded public/private feeds. Own reactions are excluded; removing
a reaction, comment or post removes its alert. All bell items share the read
watermark. New likes store server timestamps instead of booleans; existing
boolean likes still count and can be removed, but cannot produce dated alerts.
Deploy the updated database rules before publishing the timestamped-like client.

Post pictures over 2 MB are compressed with the shared account-photo helper
before uploading or encrypting private media. PNG/JPEG/WebP sources up to 40 MB
are accepted; smaller pictures stay unchanged. Re-encoding produces JPEG, with
transparent areas painted white. Videos retain their 20 MB limit and are not
compressed. Compression failures stop publication and appear in the composer.
Private-media download CORS failures are separate from upload size: the Storage
bucket must allow the deployed site's origin to read encrypted attachment bytes.

Shared Realtime Database data lives in `community_posts`, `community_likes`,
`community_comments`, and `community_members`. Feeds and comment lists load the
latest 100 records. The sidebar displays an HTML/CSS tutor promotion
instead of the group membership panel, with selectable, localized text and a
disabled button. The promotion fills the sidebar width and its desktop bottom
tracks the post composer using ResizeObserver, growing if needed to keep text
visible. On smaller screens it uses natural height.
Only the decorative tutor illustration is an image.
The composer has a borderless writing area and live character count, without
category or group dropdowns. Its icon-only tools retain localized accessible
labels and hover/focus tooltips; audience uses a globe or lock icon.
New posts use the general feed; the question action
sets the category internally. Editing retains the original category and group.
Audience offers Public (including signed-out readers) or Friends only.
Friends are mutual `message_contacts` connections with status `connected`.
Private posts are stored at `community_private_posts/<author>/<post>`; reactions
and comments use `community_private_likes` and `community_private_comments`
with the same author/post nesting. Firebase rules enforce access, and removing
a connection removes those posts from the current feed. Existing posts are public.
Audience is immutable after publishing; create a new post to choose a different
audience. Signed-out visitors can read public posts but cannot post or react.

Private attachments are encrypted in the browser with a fresh AES-256-GCM key
and random 96-bit IV. Only ciphertext is uploaded to
`community-private/<uid>/<post>/attachment`; the key, IV and original MIME type
are stored in the friend-protected post. Download links alone cannot decrypt
these attachments. Decrypted object URLs are revoked when posts leave the feed
or the account changes. Friends can save or share content they already received;
removing a friendship cannot erase their copies. This is not end-to-end
encryption against the database operator. Deploy both database and Storage
rules before using the new audience controls.

Only authors can edit
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