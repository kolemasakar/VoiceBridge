# KRC MEDIA Neon Post-Cutover Live Regression

Status: PASS
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Purpose

Verify the isolated KRC MEDIA BETA service after the completed Render PostgreSQL to Neon PostgreSQL cutover with one controlled owner-approved live native media job.

Required assertions:
- active durable store remains Neon PostgreSQL 18
- a real managed media job can complete after cutover
- the completed job is persisted in Neon
- job and segments can be read through the managed API
- state survives an exact-head Render restart/redeploy
- replay of the same request is idempotent and does not start provider work again
- accepted MEDIA BETA provider policy remains unchanged

No PR merge, main change, public promotion, external tester onboarding, source database deletion, or paid Facebook fallback was authorized.

## 2. Initial guarded live attempt

Workflow:
- KRC MEDIA Neon Post-Cutover Live Regression
- run ID: 33248257261
- workflow commit: af967e1a17c72c0f911e9c5a73afcf369c1a3032

Preconditions passed:
- isolated Render service identity: PASS
- required feature branch: PASS
- Render KRC_MEDIA_DATABASE_URL exactly matched the protected Neon direct TLS secret: PASS
- managed capability: PASS
- durable_store = postgres
- restart_resilient_jobs = true
- facebook_automatic_paid_retrieval = false
- telegram_retrieval_credits = 0
- local_attachment_retrieval_provider = openai_attachment
- non-terminal managed jobs before the test: 0

A known public YouTube source was selected without publishing transcript content. The source identifier is recorded only as a SHA256 fingerprint:
- source SHA256: 26de4009168f2aa5f02418c9df7ffab2543d388a9f828cd7280d678edc06245c

Native preflight:
- provider: supadata
- mode: native
- estimated credit ceiling: 1
- can_continue: true
- provider credits available before the live start: 78

Exactly one provider start was authorized and executed.

Created job evidence:
- status: COMPLETED
- provider: supadata
- provider mode: native
- reused: false
- provider credits charged: 1
- credit charge uncertain: false
- segment count: 321
- transcript characters: 9081

The transcript text itself was not intentionally printed into the workflow summary or migration documentation.

## 3. Harness defect after successful provider work

The first workflow attempt stopped during the direct Neon row verification because the diagnostic SQL used a psql variable form that was not expanded in that execution mode.

Observed harness error:
- SQL syntax error at the diagnostic job-id placeholder

Classification:
- application/runtime defect: NO
- Neon persistence defect: NO evidence
- provider failure: NO
- migration rollback trigger: NO
- test harness defect: YES

The failure occurred only after the live provider job had already completed successfully and charged one provider credit.

To prevent accidental duplicate provider work, the harness was changed to resume and verify the already-created deterministic regression job instead of creating a second live job.

## 4. Regression continuation and durability verification

Workflow continuation:
- run ID: 33248337547
- workflow commit: 04e1f37360ffe853fbc8cadf362e75cd120259d2
- result: SUCCESS

The continuation first located the completed regression row already present in Neon and explicitly refused to issue a fresh provider start if that row was missing.

Verified before restart:
- active Render database target still exactly matched protected Neon: PASS
- managed capability: PASS
- regression job exists exactly once in Neon: PASS
- persisted status = COMPLETED: PASS
- persisted provider_mode = native: PASS
- persisted segment_count > 0: PASS
- API job read: PASS
- API segments read: PASS

## 5. Restart resilience

The isolated MEDIA BETA Render service was redeployed at the exact continuation workflow commit.

Result:
- exact-head deploy reached live: PASS
- job API read after restart: PASS
- segments API read after restart: PASS
- completed Neon row remained readable: PASS

No database target rollback occurred.

## 6. Idempotency verification

After restart, the exact same managed native transcription request was submitted again with the same one-credit consent ceiling.

Expected behavior:
- return the existing durable job
- reused = true
- keep the same credits_charged value
- do not update the persisted row timestamp
- do not start provider work again

Observed:
- same job returned: PASS
- status remained COMPLETED: PASS
- reused = true: PASS
- credits_charged remained 1: PASS
- exactly one persisted row for the job: PASS
- persisted updated_at unchanged: PASS
- second provider start: NOT REQUESTED / NOT OBSERVED

## 7. Resource use

Intentional provider use for this post-cutover regression:
- Supadata native provider starts: 1
- Supadata native credits charged: 1
- AssemblyAI STT: not used
- Telegram retrieval: not used
- Facebook Cobalt retrieval: not used
- ScrapeCreators paid retrieval: not used
- AI generated transcript fallback: not used

The continuation run performed only durable/API/restart/idempotency verification against the already-created job.

## 8. Security and release boundaries

Confirmed:
- secrets committed: NONE
- database URL printed intentionally: NO
- bearer token printed intentionally: NO
- transcript text committed: NO
- PR #28 merge: NOT AUTHORIZED
- main modification: NONE
- external testers: NOT AUTHORIZED
- public rollout: NOT AUTHORIZED
- paid Facebook fallback: NOT ACTIVATED
- ScrapeCreators: NOT ACTIVATED
- original Render PostgreSQL deletion: NOT AUTHORIZED

The original Render PostgreSQL database remains retained for rollback during the observation window.

## 9. Current gate

DATABASE_CUTOVER: PASS
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
POST_CUTOVER_LIVE_MEDIA_JOB: PASS
LIVE_JOB_PROVIDER_MODE: SUPADATA_NATIVE
LIVE_JOB_PROVIDER_STARTS: 1
LIVE_JOB_PROVIDER_CREDITS_CHARGED: 1
NEON_DURABLE_WRITE: PASS
API_READ_BEFORE_RESTART: PASS
EXACT_HEAD_RESTART: PASS
API_READ_AFTER_RESTART: PASS
IDEMPOTENT_REPLAY: PASS
DUPLICATE_PROVIDER_START: NOT_OBSERVED
ORIGINAL_RENDER_POSTGRESQL: RETAINED_FOR_ROLLBACK
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Post-cutover durability regression is accepted as PASS. Continue the observation window; any release-state transition remains a separate owner decision.
