# KRC MEDIA State / Job Read / Continuation Negative Matrix

Date: 2026-08-29
Status: ACCEPTED
Release state: RELEASE_HOLD_OWNER_TESTING
Scope: isolated `agent/krc-media-transcript` / private MEDIA BETA only

## Purpose

Validate fail-closed behavior for durable job reads, segment reads, interrupted states, continuation endpoints, and explicit retry semantics without opening a new provider-spend path or changing the accepted MEDIA BETA routing policy.

## Findings and hardening

Two defense-in-depth gaps were identified in durable-record continuation validation.

1. Facebook retrieval continuation validated `provider_mode=facebook_retrieval_stt` and `AWAITING_RETRIEVAL_CONSENT`, but did not independently require the persisted source URL to still classify as Facebook.
2. `retry_failed_job_id` for a fresh native retry required a FAILED record with the same source and language, but did not independently require the retry target provider mode to be `native`.

Implementation commit:

`8da6011cbd8f1134f125266951eebaef894be31c` - `Harden managed media state continuation boundaries`

The implementation now additionally requires:

- `managedMediaPlatform(record.job.source_url) === "facebook"` before Facebook retrieval preflight/continuation can be applicable;
- `retryTarget.job.provider_mode === "native"` before a FAILED record can seed a fresh native retry.

These changes do not activate paid Facebook retrieval, do not change the accepted Cobalt-only active Facebook policy, and do not alter the Builder route contract.

## Static regression matrix

Added:

`src/cloud/tests/managed_media_state_continuation_negative_matrix.test.ts`

Verified:

- unknown job ID -> not found;
- unknown segment page -> not found;
- expired job -> not found;
- orphan persisted `PROCESSING` -> reconciled to terminal `FAILED` without provider replay;
- `COMPLETED` -> persisted segments remain readable;
- non-completed states -> segments are not exposed;
- AI continuation rejects unsupported/foreign platform state before generated provider work;
- AI continuation rejects wrong job state before generated provider work;
- Facebook retrieval continuation rejects a foreign-platform durable record even if provider mode/status are forged to the Facebook continuation shape;
- Facebook retrieval continuation rejects wrong states before paid retrieval;
- replay of an already completed Facebook retrieval job remains reused and does not start paid retrieval;
- fresh native retry rejects a FAILED record from a non-native provider mode before native provider work.

Accepted validation run:

- workflow run: `33261652699`
- job: `99124516494`
- result: SUCCESS
- cloud tests: `146 passed / 0 failed`

Provider counters in the negative cases remained zero.

## Live read-only smoke

A small isolated Render smoke was run only against syntactically valid, randomly generated nonexistent job IDs. No existing durable job was modified and no continuation consent was submitted.

Run:

- workflow run: `33261788902`
- job: `99124868902`
- result: SUCCESS
- exact deployed implementation: `8da6011cbd8f1134f125266951eebaef894be31c`

Observed:

- unknown job read -> `404 / MEDIA_TRANSCRIPT_NOT_FOUND`;
- unknown segment read -> `404 / MEDIA_TRANSCRIPT_NOT_FOUND`;
- unknown AI preflight -> `404 / MEDIA_TRANSCRIPT_NOT_FOUND`;
- unknown Facebook retrieval preflight -> `404 / MEDIA_TRANSCRIPT_NOT_FOUND`;
- unknown Facebook metadata preflight -> `404 / MEDIA_TRANSCRIPT_NOT_FOUND`.

Safety controls:

- isolated Render service identity/feature branch verified;
- active protected `KRC_MEDIA_DATABASE_URL` verified equal to the Neon GitHub secret without printing either value;
- no provider-consuming work requested;
- no database mutation requested;
- no Render environment mutation;
- Action bearer remained masked;
- temporary live-smoke workflow removed after success.

## Harness-only failures during development

Two non-runtime failures occurred while building the matrix and are retained here for reproducibility.

1. Temporary workflow run `33261460835` failed workflow validation before jobs were created. It executed no application/provider/database work. The invalid temporary workflow was removed.
2. First repair run `33261560347` reached the test suite and produced `145 passed / 1 failed`; the only failure was a malformed test fixture job ID (`KRCM_foreign_retry`) that the parser correctly rejected. The fixture was changed to a valid `KRCM_...` ID and the complete rerun then passed `146/146`.

Neither harness failure changed Render environment variables, provider state, or the Neon durable store.

## Accepted gate

```text
STATE_JOB_READ_CONTINUATION_NEGATIVE_MATRIX: ACCEPTED
UNKNOWN_EXPIRED_JOB_FAIL_CLOSED: VERIFIED
ORPHAN_PROCESSING_NO_PROVIDER_REPLAY: VERIFIED
SEGMENTS_COMPLETED_ONLY: VERIFIED
AI_CONTINUATION_STATE_PLATFORM_GUARD: VERIFIED
FACEBOOK_CONTINUATION_PLATFORM_GUARD: ENFORCED
FACEBOOK_CONTINUATION_STATE_GUARD: VERIFIED
FRESH_NATIVE_RETRY_PROVIDER_MODE_GUARD: ENFORCED
LIVE_READ_ONLY_UNKNOWN_JOB_SMOKE: PASS
PROVIDER_CONSUMING_WORK_BY_LIVE_SMOKE: NONE
DATABASE_MUTATION_BY_LIVE_SMOKE: NONE
RENDER_ENV_MUTATION: NONE
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

No merge, production promotion, external tester onboarding, public rollout, original Render PostgreSQL deletion, or paid Facebook activation is authorized by this acceptance.
