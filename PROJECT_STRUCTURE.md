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
Explore keeps the shared top header but hides the study-navigation sidebar and
its layout gutter only on this page. A responsive left profile rail uses the
current account photo/name, public community bio/location and saved learner
level, with Profile/Message/Explore links and a signed-out invitation. It stacks
above the feed on mobile and is hidden entirely in embedded profile feeds.
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
transparent areas painted white. Video uploads are disabled. Compression
failures stop publication and appear in the composer.
Private-media download CORS failures are separate from upload size: the Storage
bucket must allow the deployed site's origin to read encrypted attachment bytes.
All post photos, including existing public/friends-only posts and profile embeds,
use 4:5 as a maximum height-to-width proportion. Taller photos (such as 9:16)
offer Crop to fill or Whole image inside a 4:5 frame. Shorter photos (square or
landscape) fill the width at their natural ratio without padding or forced cropping.
The composer and owner Edit post share fit buttons for tall photos, a
vertical-position slider for cropping, percentage readout and Reset.
The scaled preview uses the same crop as the feed without altering the original.
`imageFormat`, `imageFit`, `imageX` and `imageY` are validated post metadata, not
destructive image edits. Legacy format/fit values remain stored but the display
policy overrides format; saved fit choices and vertical positions are retained.
Embedded profile feeds use the same display policy;
Existing videos retain their sizing and playback controls, but new community
uploads accept only PNG, JPEG and WebP pictures in both the composer and service.
Deploy framing rules before
publishing the client.

### Tutor Check marketplace

`toefl-sample/tutor-check.html`, `tutor-check.css` and `tutor-check.js` implement
the course marketplace using the shared Quick Check navigation component,
adjusted on this page for marketplace search/actions and role-specific student
or teacher navigation. Teacher home opens a separate live teaching dashboard;
student home continues to use the learner dashboard.
`js/tutor-model.js` contains validation, IDR pricing and filters;
`js/tutor-service.js` owns Firebase subscriptions and writes. No demo listings
are inserted; the catalogue starts empty until teachers publish real courses.
On Marketplace browse only, filters replace navigation links inside the shared
sidebar; detail and teacher-studio views restore role-specific navigation.
The navbar is retained. The Marketplace filter card stays fixed on the left
on desktop without a collapse control, with Price Range, Teacher and Rating
only. On mobile it stays expanded after the course introduction/categories,
with a jump link to matching courses instead of using a drawer.
Price ranges support multiple selections and use exclusive upper bounds.
Rating uses a single native radio group with All ratings to clear the threshold.
Filter rows, selects and card actions have at least 44px targets. Matching counts
are announced politely; active selections can be removed individually or cleared
together. Live card refreshes preserve keyboard focus, and teacher options update
only when their public data changes.
Detail and studio views retain the original navigation collapse and drawer.
There is no separate filter column in the
catalogue. The marketplace shows four course cards per row at 1100px and wider,
three on narrower desktop screens, two on tablets and one on phones.
Cards include preview media, live public teacher identity, ratings, accepted
student totals, IDR prices/discounts, cart and two synchronized favorite buttons.
Removable active-filter chips and a
selection count keep filter state visible; All courses clears only the
category, while Reset all clears all filters and sorting. Course details open
as shareable `?course=<id>` pages with browser back/forward support and live
overview, learning outcomes, curriculum, real reviews, teacher profile and
enrollment panels.
The student detail view pairs the course preview and teacher/rating statistics
with a purchase card, teacher summary and review breakdown. Overview includes
learning outcomes and the first three curriculum items; the curriculum and
reviews tabs expose the full content. Prices remain in IDR. Discounts use the
teacher's saved original price; no countdown, certification, bestseller badge
or public enrollment count is invented. On mobile, purchase actions follow
the course introduction, before the tabbed content. Profile links open the
course owner's public profile.

Course creation and editing use a full-page, in-place editor built with the same
detail renderer as the learner view, not a modal form. Teachers edit the title,
category, format, overview, schedule and IDR prices at their display positions;
outcomes and curriculum items can be added, edited, reordered or removed.
Preview media can be replaced or removed. Changes remain local until Save or
Publish succeeds; cancelling or navigating away warns about unsaved changes.
The editor also exposes pause/publish and archive controls (archive preserves
enrollments and reviews). Teacher information links to the shared profile editor;
learner reviews and platform enrollment/payment FAQs remain read-only.
Run `node --test toefl-sample/tutor.test.js` for marketplace regressions.

`functions/` contains the Node 22 Firebase Realtime Database triggers for
Marketplace public data. `tutor_course_stats/<course>/students` is the only
public aggregate field; its event-revision ledger is private, and client writes
to the aggregate and `tutor_public_teachers` are denied. Retried/out-of-order
enrollment events do not double-count students. Public teacher identity contains
only profile name and photo; user records and enrollment identities stay private.
Deploy rules and functions before the new client:
`firebase deploy --only database,functions`.
For existing courses and teachers, run `npm --prefix functions run backfill:marketplace`
with Application Default Credentials and `FIREBASE_DATABASE_URL` set to the
intended project's database URL. This is an administrative operation; verify
the target first. Missing aggregates display "Student count unavailable", not
zero. This backend is plain JavaScript with no compilation step. CI uses Node 22,
`npm --prefix functions run check` and `npm --prefix functions test`.
Trigger integration and database privacy checks:
`firebase emulators:exec --only database,functions,auth --project demo-toefl-messaging "node --test functions/emulator.test.js toefl-sample/tutor-rules.test.js"`.
The hero reuses existing tutor artwork. Teachers can upload a PNG, JPEG or WebP
image, or an MP4/WebM preview video up to 60 seconds and 20 MB. Preview media is
publicly readable under `tutor-courses/<uid>/`; only its owner can upload or
delete it. Teachers must have permission to use their media.

Teacher accounts use a marketplace-specific layout on the existing
`toefl-sample/profile.html`, implemented by `profile-teacher.js` and
`profile-teacher.css`. Student profiles retain their community layout.
Teacher tabs expose live published courses, real learner reviews, self-reported
experience/qualification and teaching approach. The existing bio editor,
account settings, connection requests, messaging and community feed are reused.
Teacher profiles retain the shared navigation sidebar, desktop collapse control
and mobile menu access, alongside the teacher-specific enrollment panel.
`tutor-brand.css` shares neutral surfaces and responsive card sizing between
Tutor Check and teacher profiles, without restyling student profiles. The
marketplace uses the blue palette from its course design; teacher profiles
retain their teal accent. Mobile teacher tabs wrap so all sections remain
visible; enrollment sits after profile content rather than displacing it.
`tutor_profiles/<uid>` holds public teaching details with teacher-only owner
writes. Individual `tutor_roles/<uid>` values are public for profile routing;
the whole role directory remains unreadable. No developer privileges change.
Teacher ratings aggregate actual course reviews, including paused courses'
existing reviews; reviewer counts are unique reviewers, not enrollment counts.
No verified/certified badge or fabricated student total is displayed.
Booking links to `tutor-check.html?teacher=<uid>` for course enrollment requests;
`course=<id>` opens a specific published course and `studio=1` opens the
owner's teacher studio. No appointment calendar, hourly rate or payments
are implied. Deploy the updated database rules before releasing these profiles.
Owners can clear `tutor_profiles/<uid>` using a confirmation dialog and recreate
it later; the account, community bio, courses and learner records are unaffected.
Owner-only Add course widgets in the profile Overview and Courses tabs link to
`tutor-check.html?studio=1&create=1`, opening the existing course editor once the
teacher account and catalogue have loaded. Visitors and students do not see them.
Course deletion is archival: `archived: true` requires `published: false`.
The studio supports publish/pause/archive and restoration as paused; archived
courses cannot be edited until restored. Hard deletion remains forbidden.
Enrollment status filters expose pending requests and accepted learners; direct
learner messaging and profile links reuse the existing connection workflow.

Sign-up, email activation, email sign-in and Google sign-in offer Student or
Teacher. Self-service `tutor_roles/<uid>` is a marketplace capability only,
not a Firebase developer/custom-token role. Existing teacher accounts are not
downgraded by signing in with Student selected. Teachers publish/edit only their
own courses without developer approval; pausing hides a listing from browsing
and rejects new enrollment requests. Catalogue data is public even when paused,
so course fields must not include private material.

`tutor_courses` and `tutor_reviews` are live public catalogues.
`tutor_library/<uid>/{cart,favorites}` is owner-only.
`tutor_requests` is private and query-readable only by the student's `studentId`
or teacher's `teacherId`. Requests snapshot the current IDR price and move from
pending to accepted/declined (teacher) or cancelled (student). They do not charge
money, deliver paid course material or imply payment has occurred. Existing
requests are not duplicated; failures remain in the cart with explicit errors.
Only accepted learners can write a review; displayed ratings use actual reviews,
not fabricated sales counts or verification badges. Open course details update
with live requests/reviews while preserving review drafts and keyboard focus.
Request participants can
open each other's existing profiles to connect/message.

Deploy `database.rules.json` and `storage.rules` before releasing course preview
uploads. Validate with `node --test toefl-sample/tutor.test.js`; run
`toefl-sample/tutor-rules.test.js` against a database emulator for authorization.
Enrollment and course previews still do not process payments.

The Explore composer uses a single post-body field without a separate title.
A short body excerpt remains as required title metadata for storage and sharing;
feed cards display the body without a duplicate heading. Upload-size guidance
opens from the Lucide info button beside Photo and closes on another click,
an outside click or Escape.

Shared Realtime Database data lives in `community_posts`, `community_likes`,
`community_comments`, and `community_members`. Feeds and comment lists load the
latest 100 records. The sidebar displays an HTML/CSS tutor promotion
instead of the group membership panel, with selectable, localized text and a
teacher-registration link. The promotion fills the sidebar width at natural content height,
without stretching to match the composer. Explore uses a centered 1248px outer
container, a feed capped at 640px, 24px column gaps and 15px/1.7 post body text.
Side columns move below/before the feed at narrower breakpoints; mobile gutters
are 12px. Compact welcome artwork and promotion sizing keep posts the primary
content, while reaction controls retain at least 44px vertical touch targets.
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