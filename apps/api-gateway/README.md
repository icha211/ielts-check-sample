# API Gateway

This is the public backend entrypoint for bounded AI chat, evaluation and explanations.

Keep the current root Python servers in place until frontend migration is ready.

## Entry Point

- `main.py`: FastAPI application bootstrap.
- Health is available at `/health` directly and `/api/health` through the Hosting
  `/api/**` rewrite. The default CORS list includes both Firebase Hosting domains.
  An explicit `IELTS_API_CORS_ORIGINS` replaces that list; include the deployed
  website origins when overriding it.

## Responsibilities

- Health and readiness endpoints.
- Unified evaluation routes for reading, listening, writing, and speaking.
- Chat routes for explanation pages.
- Firebase ID-token authentication for developer audio mutations and alignment.

## Run

When FastAPI dependencies are installed, the intended local command is:

`uvicorn main:app --reload --host 127.0.0.1 --port 8000`

## Developer authentication

Copy `.env.example` to the ignored `.env` for local configuration. Set
`FIREBASE_PROJECT_ID` to the same project used by the frontend. Use Application
Default Credentials (`gcloud auth application-default login` locally, a Cloud Run
service account in production). The service identity needs Firebase Authentication
read access to check revoked tokens and disabled accounts.

The four POST endpoints `upload-url`, `upload-proxy`, `ensure-audio-folder`, and
`align-transcript` under `/api/developer` require `Authorization: Bearer <Firebase ID token>`.
The verified token must contain `role: "developer"`, the existing developer email
`quickcheck.edu@gmail.com`, and `email_verified: true`, matching Firebase rules.
Teacher profiles and frontend developer mode do not grant this access. Public audio
playback GET routes remain accessible. Missing/invalid tokens return 401,
insufficient claims return 403, and authentication infrastructure failures return 503.
Grant developer custom claims only through a trusted Firebase Admin environment.

R2 credentials must be rotated if exposed. Inject rotated credentials through
Secret Manager in Cloud Run; do not use tracked environment YAML files or embed
keys in deploy commands. Local `.env` and `env.yaml` are excluded from both
container and source uploads. Removing tracked copies does not revoke credentials
or remove previous Git history.

## Validation

From this directory:

```text
python -m unittest discover -s tests
```

## Private-beta AI controls

AI requires a registered Firebase account (anonymous Firebase sessions are rejected).
The gateway and root legacy AI/transcription servers share `ai_runtime.py` and the
same Firebase project. Install root `requirements.txt` for the legacy servers;
it includes gateway dependencies. Configure `FIREBASE_PROJECT_ID` for every server.
The Gemini SDK minimum is the verified 2.10.0 release, which supports explicit
single-attempt retry and timeout options. Reinstall requirements when upgrading
older environments. Gateway debug tracebacks are disabled by default.

Default limits:

| Control | Default |
| --- | --- |
| Provider attempts per user per UTC day | 10 |
| Provider attempts platform-wide per UTC day | 100 |
| Provider attempts per user per minute | 2 |
| JSON AI request body | 32 KB |
| Constructed text prompt | 16,000 characters |
| Output, including transcription | 2,048 tokens |
| Provider timeout | 60 seconds |
| Automatic provider/network retries | None |
| Legacy transcription audio size | 2 MB |

Each provider call reserves a slot **before** calling the provider. Failed calls and
legacy format-repair calls count too; no refunds or alternate-provider fallback can
amplify the allowance. Developer alignment also reserves from the same limits.
Slots cap attempts, not dollar spend. Audio, input tokenization and provider prices
differ; configure provider billing limits and Cloud Run instance limits separately.
Limits do not protect against fake-account signups within the global allowance.

AI is disabled by default. To enable after a controlled deployment:

1. Grant the service identity Firestore read/write access for Admin SDK transactions
   (plus the Firebase Authentication read access documented above).
2. Create Firestore document `aiUsageControl/current` with Boolean `enabled: true`
   using a trusted admin environment, not browser client code.
3. Set `IELTS_API_AI_ENABLED=true` on all AI services. Optional overrides are
   `IELTS_API_AI_DAILY_USER_LIMIT`, `IELTS_API_AI_DAILY_GLOBAL_LIMIT`,
   `IELTS_API_AI_MINUTE_USER_LIMIT`, `IELTS_API_AI_MAX_PROMPT_CHARS`,
   `IELTS_API_AI_MAX_OUTPUT_TOKENS`, and `IELTS_API_AI_TIMEOUT_SECONDS`.

Daily `aiUsageDays/{UTC-date}` counters use Firestore transactions across instances.
The checked-in rules do not allow browser clients to read or modify these documents.
Delete/expire old daily counters only after their UTC day has ended; deleting the
current day's counters resets the cap. Choose a retention policy before production.
Setting `aiUsageControl/current.enabled` to false stops new reservations immediately,
without a redeploy; already-reserved calls may finish. Missing controls, quota-store
outages and invalid credentials fail closed. 429 means quota reached; 503 means AI
or its controls are unavailable.

The browser uses Firebase ID tokens, never a Gemini/DeepSeek provider key. The
shared client sends tokens only to its explicit trusted origins and does not retry
paid requests against alternate servers. Add a new legitimate gateway origin to
`toefl-sample/ai-client.js` when changing deployment domains. Clear old browser
`toefl_gemini_api_key` entries if you previously used direct Gemini chat.

## DeepSeek benchmark and migration gate

The default text provider remains Gemini. DeepSeek support uses the documented
`deepseek-flash` model, bounded `max_tokens` and explicitly disabled thinking.
Audio transcription remains Gemini: this is not a DeepSeek audio migration.

No paid benchmark is run automatically. `benchmark_ai.py` supplies five original
listening pilot cases and validates **recorded** results without making API calls:

```text
python benchmark_ai.py --fixtures
python benchmark_ai.py --results recorded-results.json
```

The result file is a JSON array with one entry per case per provider. Each entry
contains `id`, `provider` (`gemini` or `deepseek`), raw JSON `text`, `latency_ms`,
`input_tokens`, `output_tokens`, `reviewer_correct` and `reviewer_grounded`.
Record actual provider outputs and usage; a reviewer must verify answer correctness
and transcript grounding. All cases must pass, output must match the explanation
shape/answer mapping, latency must be at most 30 seconds and output at most 2,048 tokens.
Do not use user submissions, repository code or confidential material in benchmarks.

These five cases are only a pilot gate. Also review representative IELTS writing,
grammar chat, translation and longer listening tasks before a platform-wide switch.
Only after acceptable benchmark results and owner approval: inject `DEEPSEEK_API_KEY`
from Secret Manager, set `IELTS_API_AI_PROVIDER=deepseek` and
`IELTS_API_DEEPSEEK_BENCHMARK_APPROVED=true` on all text AI services. No automatic
switch occurs. Setting provider back to `gemini` rolls back without client changes.