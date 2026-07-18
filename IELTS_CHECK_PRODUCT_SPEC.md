# IELTS Check / Quick Check — Architecture Audit, Gap Analysis, and Delivery Spec

Audit scope: `C:\Users\icha\ielts-check-sample`  
Audit date: 2026-07-17

---

## 1) ARCHITECTURAL DIAGNOSTICS & CODE AUDIT

### 1.1 Current Repository File Tree (tracked footprint)

```text
.
|-- .github
|   `-- skills
|       |-- emil-design-eng
|       |   `-- SKILL.md
|       |-- improve-animations
|       |   `-- SKILL.md
|       `-- review-animations
|           `-- SKILL.md
|-- .vscode
|   `-- mcp.json
|-- apps
|   |-- api-gateway
|   |   |-- routes
|   |   |   |-- __init__.py
|   |   |   |-- chat.py
|   |   |   |-- evaluation.py
|   |   |   `-- health.py
|   |   |-- __init__.py
|   |   |-- config.py
|   |   |-- main.py
|   |   |-- README.md
|   |   |-- requirements.txt
|   |   `-- schemas.py
|   `-- README.md
|-- asset
|   `-- icon
|       |-- blue-book.png
|       |-- calender.png
|       |-- closed-hide-tracker.png
|       |-- correct.svg
|       |-- dots-nine 1.svg
|       |-- draft.png
|       |-- expand-hide-tracker.png
|       |-- expand.png
|       |-- explaination.svg
|       |-- headset.png
|       |-- highlight.svg
|       |-- key.png
|       |-- light.png
|       |-- lightbulb1.svg
|       |-- lightbulb2.svg
|       |-- Line 12.svg
|       |-- logo.png
|       |-- menu.png
|       |-- multiple-book.png
|       |-- open-book.png
|       |-- paper-pencil.png
|       |-- pause 1.svg
|       |-- pin.png
|       |-- play.svg
|       |-- playtranscribe.svg
|       |-- stopwatch.png
|       |-- timer.svg
|       `-- Vector.svg
|-- asst
|   `-- icon
|       |-- Ask AIQC tab.svg
|       |-- audio-volume.svg
|       |-- backward 10 second.svg
|       |-- closed-questionnavigation-icon.svg
|       |-- corner-inside.svg
|       |-- correct.svg
|       |-- dots-nine 1.svg
|       |-- exit.svg
|       |-- explaination tab.png
|       |-- explaination.svg
|       |-- forward 10 second.svg
|       |-- fullscreen frame.svg
|       |-- highlight.svg
|       |-- icondarkmode.svg
|       |-- instruction.svg
|       |-- issue.svg
|       |-- less.svg
|       |-- lightbulb1.svg
|       |-- lightbulb2.svg
|       |-- lightmode.svg
|       |-- Line 12.svg
|       |-- menu frame.svg
|       |-- more.svg
|       |-- night.svg
|       |-- pause 1.svg
|       |-- pauseaudio.svg
|       |-- play-instruction.svg
|       |-- play.svg
|       |-- playicon-instruction.svg
|       |-- playtranscribe.svg
|       |-- previousbutton.svg
|       |-- questionnav-instruction.svg
|       |-- questionnavigator.svg
|       |-- QuickCheckLogo.png
|       |-- right arrow next.svg
|       |-- speaker-instruction.svg
|       |-- stepbystep tab.png
|       |-- submit.svg
|       |-- textsize.svg
|       |-- time-instruction.svg
|       |-- timer-header.svg
|       |-- timer.svg
|       |-- touch-fullscreenicon.png
|       |-- touch-menu.svg
|       |-- touch-menuicon.png
|       |-- touch-submiticon.svg
|       |-- untouch-submiticon.svg
|       |-- up.svg
|       `-- Vector.svg
|-- data
|   `-- report_issue_queue.jsonl
|-- docs
|   `-- architecture
|       |-- README.md
|       `-- TOEFL_ITP_DATASET_SCHEMA.md
|-- infra
|   `-- README.md
|-- ml
|   `-- README.md
|-- services
|   `-- README.md
|-- shared
|   `-- README.md
|-- toefl-sample
|   |-- css
|   |   |-- developer.css
|   |   |-- editor.css
|   |   |-- explaination.css
|   |   `-- theme.css
|   |-- js
|   |   `-- developer.js
|   |-- audio-server-sync.js
|   |-- daily-practice.html
|   |-- developer.html
|   |-- index.html
|   |-- roadmap.html
|   |-- section 1-answered.html
|   |-- section 1.html
|   |-- section 2-answered.html
|   |-- section 2.html
|   |-- section 3-answered.html
|   |-- section 3.html
|   |-- study-plan.html
|   `-- toefl-storage-sync.js
|-- ai_review_server.py
|-- AUDIO_SYNC_SOLUTION.md
|-- data_storage_server.py
|-- developer-create-listening.html
|-- developer-create-speaking.html
|-- developer-create-writing.html
|-- developer-create.html
|-- developer-edit-listening.html
|-- developer-edit-speaking.html
|-- developer-edit-writing.html
|-- developer-edit.html
|-- developer.html
|-- full-package-test.html
|-- IELTS_CHECK_PRODUCT_SPEC.md
|-- index.html
|-- listening-test.html
|-- PERSISTENT_STORAGE_SETUP.md
|-- practice-day.html
|-- PROJECT_STRUCTURE.md
|-- reading-test-answered.html
|-- reading-test.html
|-- requirements.txt
|-- rich-editor-color-palette.js
|-- SHARING_QUESTIONS_BETWEEN_MACHINES.md
|-- speaking-test.html
|-- start-servers-background.bat
|-- start-servers-hidden.vbs
|-- stop-servers.ps1
|-- storage-sync.js
|-- study-plan-schedule.html
|-- study-plan.html
|-- study-progress.html
|-- test.html
`-- writing-test.html
```

### 1.2 Current Routing and Layering Diagnosis

- **Routing model is multi-page HTML (MPA), not SPA**: heavy `<a href="...html">` and `window.location.href` navigation across `index.html`, `study-plan.html`, `practice-day.html`, and all test pages.
- **Frontend state mostly localStorage + RTDB direct fetch**, not centralized auth-aware API orchestration.
- **Backend split in two active local Python HTTP servers**:
  - `data_storage_server.py` for problems/audio/transcript JSON+file persistence.
  - `ai_review_server.py` for Gemini explanation/review/translations + issue reporting.
- **Future FastAPI gateway exists but is scaffold-level** under `apps/api-gateway` (stub routes).
- **Firebase production infra files are missing**: no `firebase.json`, `.firebaserc`, `firestore.rules`, `storage.rules`, or Cloud Functions project.

### 1.3 Structural Integrity Table

| File Path | Current Architectural Integrity Status | Action Mandated |
|---|---|---|
| `index.html` | Needs Refactor | Move dashboard data hydration to authenticated API + Firestore; remove implicit local-only assumptions. |
| `study-plan.html` | Needs Refactor | Replace localStorage plan persistence with `studyPlans/{uid}` + daily tasks subcollection. |
| `study-plan-schedule.html` | Needs Refactor | Bind schedule to backend query filters by month/date and user. |
| `practice-day.html` | Needs Refactor | Connect daily module launches to server-managed session lifecycle (`in_progress`, `submitted`, `locked`). |
| `study-progress.html` | Needs Refactor | Replace client-aggregated metrics with backend-calculated analytics snapshots. |
| `listening-test.html` | Needs Refactor | Route submission to secure endpoint with signed user context; remove local score trust. |
| `reading-test.html` | Needs Refactor | Same as above; remove client-only progression integrity checks. |
| `writing-test.html` | Needs Refactor | Add authenticated submission write + AI review pipeline trigger event. |
| `speaking-test.html` | Needs Refactor | Move transcript + speaking scoring to secure backend service and Storage path controls. |
| `full-package-test.html` | Needs Refactor | Convert to single mock-test session orchestrator (Listening -> Structure -> Reading lockstep). |
| `developer.html` | Needs Refactor | Enforce role-based access (developer claim) server-side; remove client-trust gating. |
| `developer-create*.html` / `developer-edit*.html` | Needs Refactor | Migrate CRUD to secured admin APIs; prevent direct public RTDB mutation. |
| `toefl-sample/index.html` | Needs Refactor | Integrate with core dashboard data contracts; avoid duplicate navigation logic. |
| `toefl-sample/section 1.html` | Needs Refactor | Convert dev/test mode state to backend session + role-aware permissions. |
| `toefl-sample/section 1-answered.html` | Needs Refactor | Keep transcript UX improvements, but bind to canonical submission/review IDs from backend. |
| `toefl-sample/section 2*.html` | Needs Refactor | Same as section 1 with structure module contracts. |
| `toefl-sample/section 3*.html` | Needs Refactor | Same as section 1 with reading module contracts. |
| `toefl-sample/toefl-storage-sync.js` | Needs Refactor | Replace hardcoded Firebase URL/bucket and direct client writes with API gateway and tokenized access. |
| `storage-sync.js` | Needs Refactor | Remove root-level direct RTDB write model; use user-scoped APIs + rules. |
| `toefl-sample/audio-server-sync.js` | Needs Refactor | Stop local host fallback in production; use signed upload/download URLs. |
| `data_storage_server.py` | Needs Refactor | Replace local JSON/file persistence with Firestore + Cloud Storage; tighten CORS and auth. |
| `ai_review_server.py` | Needs Refactor | Move into Cloud Functions/Run; enforce auth, rate-limit, and centralized logging/trace IDs. |
| `apps/api-gateway/main.py` | Needs Refactor | Remove unrelated ML/deepspeed imports; keep clean FastAPI bootstrap only. |
| `apps/api-gateway/routes/chat.py` | Missing Skeleton | Implement real chat orchestration service call + request validation + auth. |
| `apps/api-gateway/routes/evaluation.py` | Missing Skeleton | Implement scoring/evaluation orchestration + persistence + retries. |
| `apps/api-gateway/routes/health.py` | Stable | Keep, add dependency checks (Firestore, Storage, Gemini reachability). |
| `apps/api-gateway/schemas.py` | Needs Refactor | Expand contracts for submissions, reviews, study plans, and referrals. |
| `docs/architecture/*` | Stable | Keep as planning references; align docs with final infra implementation. |
| `requirements.txt` + `apps/api-gateway/requirements.txt` | Needs Refactor | Pin production deps with secure minimal set and separate dev/prod constraints. |
| `.github/workflows/*` | Missing Skeleton | Add CI pipeline (lint, tests, security checks, deploy gates). |
| `firebase.json`, `.firebaserc`, rules/index files | Missing Skeleton | Required for Hosting, Functions, Firestore/Storage security and deploy flow. |
| `data/report_issue_queue.jsonl` | Needs Refactor | Treat as temporary local queue only; production must use durable queue + redaction policy. |

### 1.4 Explicit High-Risk / Hardcoded / Unsafe Items To Revise Immediately

1. **Hardcoded Firebase RTDB endpoints in client code**
   - `storage-sync.js:6`
   - `toefl-sample/toefl-storage-sync.js:16`
   - Must move to environment-driven backend config; client should not own raw DB base URL writes.

2. **Hardcoded Storage bucket/public path assumptions**
   - `toefl-sample/toefl-storage-sync.js:17-18`
   - Replace with signed URL workflow and backend broker.

3. **Open CORS (`*`) on production-grade data/AI endpoints**
   - `data_storage_server.py:381`
   - `ai_review_server.py:697`, `ai_review_server.py:708`
   - Restrict origins per env and enforce auth tokens.

4. **Client-side trust for AI host and localhost fallback**
   - `listening-test.html:444`, `reading-test.html:826`, `writing-test.html:134`, `speaking-test.html:160`
   - Replace with server-discovered API base and strict trusted host list.

5. **Developer role not server-enforced in active pages**
   - Current pattern uses page routing and local mode toggles; must use auth claims + backend authorization guards.

6. **FastAPI gateway entrypoint polluted with unrelated/broken imports**
   - `apps/api-gateway/main.py:1-24` (torch/deepspeed/dschat imports and typos)
   - Must be deleted from gateway bootstrap immediately.

7. **Local JSON/flat-file persistence for critical data**
   - `data_storage_server.py` writes `problems.json`, `daily_tests.json`, `test_results.json`, and local audio files.
   - Must migrate to Firestore + Cloud Storage with transactional safeguards.

8. **Local issue queue file in runtime**
   - `ai_review_server.py:22` and write path around queue logic.
   - Production path must be managed queue (Pub/Sub/Firestore queue) with PII controls.

9. **Mixed hardcoded UI arrays and locale labels**
   - Example: `toefl-sample/js/developer.js:25-32` (`MONTH_LABELS`, difficulty labels) and scattered module lists.
   - Move to shared configuration documents or typed constants package.

10. **No CI/CD guardrails present**
    - No `.github/workflows` found; blocks production readiness and security baseline.

---

## 2) TECH STACK SUITABILITY & HIGH-CONCURRENCY SCALING EVALUATION

### 2.1 Current Stack Fit for High Concurrency

- **Firebase (Auth + Firestore + Storage + Hosting)** is suitable for high-volume student traffic when data access is normalized, indexed, and partitioned by user/session keys.
- **Gemini API integration** is suitable for AI review/explanations, but requires strict rate limiting, queueing, and fallback behavior to avoid throttling during synchronized exam submission windows.
- **Current implementation state is not yet high-concurrency safe** because active flows still rely on:
  - direct client writes to RTDB/localStorage,
  - local Python single-process servers,
  - open CORS and host fallbacks,
  - and non-centralized session locking.

### 2.2 Multi-Network Global Reliability Diagnosis

Observed risk areas:
- Localhost-dependent AI/data host assumptions (`127.0.0.1`, `localhost`) create fragile behavior across different laptops, firewalls, and ISP NAT behavior.
- Browser-direct RTDB patterns increase client/network variance and make policy enforcement difficult.
- Large timed-test audio delivery can degrade on mobile networks if not aggressively cached and region-optimized.

Required reliability posture:
- Serve frontend from Firebase Hosting + CDN with immutable hashed assets.
- Broker all data/AI writes through authenticated serverless endpoints (no client direct write paths for critical entities).
- Use signed Storage URLs with bounded TTL and resumable range requests for audio.
- Deploy backend in region pairs close to target audience; use graceful failover for AI endpoints.

### 2.3 Bottleneck Map During Simultaneous Mock Test Execution

1. **Firestore contention and hot documents**
   - Risk: many users writing to same counters/documents.
   - Mitigation: append-only `userSubmissions` writes + distributed counters + per-user/per-session document patterns.

2. **Composite query/index misses**
   - Risk: dashboard and progress pages issuing multi-field queries without indexes.
   - Mitigation: predefine composite indexes for common dimensions:
     - `(uid, module, submittedAt desc)`
     - `(uid, mode, status, startedAt desc)`
     - `(uid, monthKey, updatedAt desc)`

3. **Gemini API quota/rate exhaustion**
   - Risk: spike at submission boundaries.
   - Mitigation:
     - per-user and global token bucket limits,
     - queue-based async AI generation,
     - retry with jitter/backoff,
     - model fallback tier,
     - cached response reuse for deterministic prompts.

4. **Audio streaming pressure**
   - Risk: simultaneous listening sections cause Storage egress burst.
   - Mitigation:
     - pre-generated CDN-cacheable assets,
     - `Cache-Control: public, max-age=31536000, immutable` for versioned audio,
     - partial-content support and prefetch hints.

5. **Serverless cold starts under exam peaks**
   - Risk: request latency spikes for first invocation.
   - Mitigation:
     - min instances on critical functions (`submission`, `evaluation`, `entitlement`),
     - small function bundles,
     - isolated AI orchestration worker from sync request path.

### 2.4 Explicit Architecture Recommendations for Production Scale

- Introduce **exam-session state machine** in backend (`created -> in_progress -> submitted -> graded -> locked`) and reject out-of-order mutations.
- Use **idempotency keys** for submission endpoints to prevent duplicate score writes.
- Add **regional API gateways** with edge routing and latency-aware health fallback.
- Add **observability SLOs**:
  - P95 submit latency,
  - AI review completion latency,
  - audio start latency,
  - Firestore read/write error rates.
- Add **disaster controls**:
  - daily Firestore exports,
  - Storage lifecycle/version policies,
  - queue replay for failed AI jobs.

---

## 3) PRODUCTION-READY FIRESTORE SPECIFICATION (EXPLICIT TYPING)

> Canonical collection names required by spec: `users`, `problemSets`, `userSubmissions`, `aiReviews`, `studyPlans`, `referrals`.

### 2.1 `users` (document id = `uid`)

```ts
type UserRole = "user" | "developer";
type SubscriptionTier = "trial" | "free" | "basic" | "pro" | "enterprise";
type AccountStatus = "active" | "suspended" | "deleted";

interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  targetExam: "IELTS" | "TOEFL_ITP";
  targetScore: number | null;
  targetExamDate: Timestamp | null;
  trialStartedAt: Timestamp | null;
  trialEndsAt: Timestamp | null;
  subscriptionTier: SubscriptionTier;
  subscriptionActive: boolean;
  referralCode: string | null;
  referredByCode: string | null;
  onboardingCompleted: boolean;
  preferences: Map<string, string | number | boolean>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActiveAt: Timestamp;
}
```

### 2.2 `problemSets` (document id = `setId`)

```ts
type ModuleType = "listening" | "structure" | "reading" | "writing" | "speaking";
type DifficultyLevel = 1 | 2 | 3; // 1 easy, 2 medium, 3 hard
type SetStatus = "draft" | "published" | "archived";

interface ProblemItem {
  questionId: string;
  questionType: string;
  prompt: string;
  options: Map<string, string>; // A/B/C/D
  correctAnswer: string;
  transcriptRef: string | null;
  passageRef: string | null;
  tags: Array<string>;
  metadata: Map<string, string | number | boolean>;
}

interface ProblemSetDoc {
  setId: string;
  module: ModuleType;
  title: string;
  description: string;
  difficultyLevel: DifficultyLevel;
  status: SetStatus;
  scheduledDate: Timestamp | null;
  durationSeconds: number;
  itemCount: number;
  items: Array<ProblemItem>;
  audioStoragePath: string | null; // gs://... or bucket path
  transcriptStoragePath: string | null;
  createdByUid: string;
  updatedByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null;
}
```

### 2.3 `userSubmissions` (document id = `submissionId`)

```ts
type SubmissionMode = "practice" | "mock_test";
type SubmissionStatus = "in_progress" | "submitted" | "graded" | "locked";

interface AnswerEntry {
  questionId: string;
  selectedAnswer: string | Array<string> | null;
  isCorrect: boolean | null;
  responseTimeMs: number;
  confidence: number | null; // 1-5
}

interface UserSubmissionDoc {
  submissionId: string;
  uid: string;
  module: ModuleType;
  mode: SubmissionMode;
  setId: string;
  difficultyLevel: DifficultyLevel;
  status: SubmissionStatus;
  startedAt: Timestamp;
  submittedAt: Timestamp | null;
  durationSeconds: number;
  scoreRaw: number | null;
  scoreScaled: number | null;
  accuracyPercent: number | null;
  answers: Array<AnswerEntry>;
  weakSubskills: Array<string>;
  speakingAudioPath: string | null;
  speakingTranscript: string | null;
  metadata: Map<string, string | number | boolean>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 2.4 `aiReviews` (document id = `reviewId`)

```ts
interface AIReviewDoc {
  reviewId: string;
  submissionId: string;
  uid: string;
  module: ModuleType;
  geminiModel: string;
  promptVersion: string;
  estimatedBand: number | null;
  summary: string;
  strengths: Array<string>;
  improvements: Array<string>;
  nextSteps: Array<string>;
  weaknessFlags: Array<string>;
  recommendationSlots: Array<Map<string, string | number | boolean>>;
  timelineExplanation: Map<string, string | number | boolean>;
  tokenUsage: Map<string, number>;
  latencyMs: number;
  createdAt: Timestamp;
}
```

### 2.5 `studyPlans` (document id = `${uid}_${yyyyMM}`)

```ts
type DailyTaskStatus = "pending" | "completed" | "skipped";

interface DailyTask {
  taskId: string;
  module: ModuleType;
  targetSetId: string | null;
  difficultyLevel: DifficultyLevel;
  status: DailyTaskStatus;
  completedSubmissionId: string | null;
}

interface DailyPlan {
  date: string; // YYYY-MM-DD
  tasks: Array<DailyTask>; // expected 3 tasks/day
  completionPercent: number;
  colorFlag: "none" | "green" | "yellow" | "red";
  aiSuggestion: string | null;
}

interface StudyPlanDoc {
  planId: string;
  uid: string;
  monthKey: string; // YYYY-MM
  targetScore: number;
  projectedScore: number | null;
  days: Array<DailyPlan>;
  monthlyCompletionPercent: number;
  streakDays: number;
  generatedBy: "system" | "ai" | "user";
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### 2.6 `referrals` (document id = `referralCode`)

```ts
type ReferralStatus = "active" | "expired" | "disabled";

interface ReferralRedemption {
  uid: string;
  redeemedAt: Timestamp;
  rewardGranted: boolean;
  rewardType: string | null; // discount/free_unlock/etc
}

interface ReferralDoc {
  referralCode: string;
  ownerUid: string;
  status: ReferralStatus;
  totalInvites: number;
  totalSuccessfulSignups: number;
  totalRewardsGranted: number;
  maxRedemptions: number | null;
  expiresAt: Timestamp | null;
  redemptions: Array<ReferralRedemption>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## 4) STRATEGIC FIVE-PHASE DEVELOPMENT ROADMAP

### Phase 1 — Foundation, Contracts, and Security Baseline

- [x] Create Firebase project scaffolding files:
  - `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`
- [x] Stand up Cloud Functions Node/TypeScript app (`functions/`):
  - Routes: `/api/health`, `/api/evaluation`, `/api/chat`, `/api/submissions`, `/api/study-plans`
- [x] Clean and harden gateway bootstrap:
  - `apps/api-gateway/main.py` (remove non-gateway imports and broken dependencies)
- [x] Enforce auth and role claims in API layer:
  - `request.auth.uid == uid` for user-scoped writes
  - `request.auth.token.role == "developer"` for problem bank admin APIs
- [x] Add CI skeleton:
  - `.github/workflows/ci.yml` (lint/test/security checks)

Security updates:
- Firestore document-level rules for all six required collections.
- Storage path rules: speaking uploads only by owner uid; shared audio read by signed URL/token.

### Phase 2 — Data Model Migration and Backend Ownership

- [ ] Migrate local JSON + RTDB direct writes to Firestore collections:
  - from `storage-sync.js`, `toefl-sample/toefl-storage-sync.js`, `data_storage_server.py`
- [ ] Introduce canonical repositories/services:
  - `functions/src/repos/problemSetsRepo.ts`
  - `functions/src/repos/submissionsRepo.ts`
  - `functions/src/repos/studyPlansRepo.ts`
- [ ] Replace local file audio persistence with Cloud Storage object paths and metadata docs.
- [ ] Add migration scripts to convert existing local/RTDB payloads into Firestore format.

Backend route triggers:
- `POST /api/problem-sets` (developer)
- `PUT /api/problem-sets/:setId` (developer)
- `POST /api/submissions/start`
- `POST /api/submissions/:id/submit`

Security updates:
- Strict write validations (schema + ownership + role checks).
- Reject direct client-side raw DB endpoint access in production builds.

### Phase 3 — Mock Test Engine and Frontend Route Coherence

- [ ] Build consolidated mock session flow (Listening -> Structure -> Reading lock):
  - `full-package-test.html` (or migrate to SPA route `/mock-test`)
- [ ] Add resume/lock protection and anti-reentry logic server-side.
- [ ] Standardize navigation contracts across:
  - `index.html`, `study-plan.html`, `practice-day.html`, `study-progress.html`
- [ ] Remove duplicated state logic per-page and centralize into shared client module.

Target frontend files:
- `full-package-test.html`
- `listening-test.html`
- `reading-test.html`
- `writing-test.html`
- `speaking-test.html`

Backend route triggers:
- `POST /api/mock-sessions`
- `PATCH /api/mock-sessions/:id/progress`
- `POST /api/mock-sessions/:id/finalize`

Security updates:
- Session state transitions validated server-side only.
- Prevent direct score mutation from client.

### Phase 4 — AI Review + Recommendation + Study Planner Intelligence

- [ ] Consolidate AI review logic now spread in `ai_review_server.py` into serverless functions.
- [ ] Persist AI outputs in `aiReviews` linked by `submissionId`.
- [ ] Implement recommendation engine updates to dashboard slots and daily plans.
- [ ] Upgrade study planner to dynamic 3-task/day generation from performance data.

Target files:
- `functions/src/ai/reviewService.ts`
- `functions/src/ai/recommendationService.ts`
- `study-progress.html`
- `study-plan.html`
- `practice-day.html`

Backend route triggers:
- `POST /api/evaluation`
- `POST /api/recommendations/recompute`
- `POST /api/study-plans/generate-month`

Security updates:
- Rate limiting middleware for Gemini endpoints.
- Audit logging per AI request (uid, model, latency, token usage, outcome).

### Phase 5 — Billing, Referral, Tiering, and Production Ops

- [ ] Implement trial and tier lifecycle (`users.subscription*`, `referrals` redemption workflow).
- [ ] Implement entitlement checks on premium routes and problem set access.
- [ ] Implement referral discount/unlock policy engine.
- [ ] Production hardening:
  - Error tracking (Cloud Logging + alerting)
  - Caching headers on static/audio assets
  - Backup/export policy and recovery runbook

Target files:
- `functions/src/billing/*`
- `functions/src/referrals/*`
- `firestore.rules`, `storage.rules`
- `firebase.json` (hosting headers incl. CDN cache policy)

Backend route triggers:
- `POST /api/referrals/redeem`
- `GET /api/entitlements`
- `POST /api/subscriptions/webhook`

Security updates:
- Signed webhook verification.
- Abuse protection and per-user per-minute request throttles for AI-heavy endpoints.

---

## 5) Immediate Parity Conclusions (Spec vs Current Workspace)

1. **Core UI surfaces exist**, but currently as multi-page static HTML with local state and direct browser-to-RTDB calls.
2. **AI integration exists**, but through local Python servers and open CORS, not production-grade serverless boundary.
3. **Developer console exists**, but authorization boundaries are not enforced through secure backend claims.
4. **Study plan/progress pages exist**, but analytics and recommendation persistence are not normalized into Firestore schemas.
5. **Critical production skeleton missing**: Firebase rules/config, Cloud Functions codebase, CI workflows, and role-hardened API gateway.

---

## 6) Required Next Action

Start Phase 1 immediately by adding Firebase + Functions + security rule scaffolding, then move existing active endpoints (`data_storage_server.py`, `ai_review_server.py`) behind authenticated serverless routes before further UI expansion.
