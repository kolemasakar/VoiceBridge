# KRC MEDIA Auth / Input / Replay Negative Matrix

Date: 2026-08-29
Scope: isolated owner-only `K-Research & Critic - MEDIA BETA`
Release state: `RELEASE_HOLD_OWNER_TESTING`

## Decision

`AUTH_INPUT_REPLAY_NEGATIVE_MATRIX: ACCEPTED`

The owner-testing audit covered Action authentication, request-body parsing, HTTP method and identifier rejection, pagination validation, server-side owner admission, and duplicate/replay behavior without starting a new billable provider job.

## Defense-in-depth correction

The managed HTTP layer already authenticated the Action bearer before media work and advertised `user_beta_access_code_required = false` plus `owner_access_injected_server_side = true`.

The audit found one server-boundary inconsistency: `withServerOwnerAccessCode(...)` preserved a non-empty caller-supplied `beta_access_code`. A caller could therefore choose the beta code carried into downstream managed service authorization instead of the server always selecting the configured owner admission code.

The active owner-only boundary was hardened so that, after successful Action bearer authentication, the configured server owner code always overwrites any caller-supplied `beta_access_code`.

Accepted implementation commit:

```text
e83a13a09b9bbcf293fb4f2d705f4ea7f15712b7
Harden managed media auth input replay boundaries
```

No public Core or production branch was changed.

## Static regression matrix

Added:

```text
src/cloud/tests/managed_media_auth_input_replay.test.ts
```

Verified:

- missing Action bearer -> `401 AUTHENTICATION_REQUIRED` before managed service work;
- invalid/malformed Action bearer -> `401 AUTHENTICATION_FAILED` before managed service work;
- caller-supplied beta access code is overwritten by the configured server owner code;
- malformed JSON -> `400 INVALID_REQUEST` before managed service work;
- oversized JSON -> `413 REQUEST_BODY_TOO_LARGE` before managed service work;
- wrong method on a managed path fails closed;
- malformed/encoded invalid job IDs fail closed before job reads;
- invalid/out-of-range pagination -> `400 INVALID_PAGINATION` before segment reads;
- duplicate native replay reuses the original job even when the caller varies a supplied beta code;
- duplicate replay starts the fake provider exactly once.

Existing durability/replay regressions also remained green, including concurrent duplicate single-winner behavior and restart blocking of uncertain in-progress provider work.

### Validation history

The first temporary hardening workflow run `33260149379` stopped on a TypeScript test-harness compile error before any implementation commit was pushed. This was a test-code defect, not a runtime/provider/database failure.

The corrected temporary repair workflow run `33260208780` completed successfully:

```text
tests: 142
passed: 142
failed: 0
```

Both temporary hardening workflows were removed by the successful repair commit.

## Isolated live no-spend acceptance

Final successful workflow:

```text
KRC MEDIA Auth Input Replay Live Smoke Final
run: 33260540049
result: SUCCESS
exact tested implementation: e83a13a09b9bbcf293fb4f2d705f4ea7f15712b7
```

The live smoke first verified the isolated Render service and confirmed its protected `KRC_MEDIA_DATABASE_URL` still matched the approved Neon direct-TLS target. It then explicitly deployed the accepted implementation commit.

Live results:

```text
missing bearer              -> 401 AUTHENTICATION_REQUIRED
invalid bearer              -> 401 AUTHENTICATION_FAILED
malformed JSON              -> 400 INVALID_REQUEST
oversized JSON              -> 413 REQUEST_BODY_TOO_LARGE
wrong HTTP method           -> 404 NOT_FOUND
malformed job ID            -> 404 NOT_FOUND
out-of-range pagination     -> 400 INVALID_PAGINATION
injection-shaped pagination -> FAIL-CLOSED at upstream edge (HTTP 403)
```

The SQL-shaped pagination string was rejected by the upstream edge before the application response was reached. Static application-layer coverage separately verifies that the same class of invalid cursor is rejected by `pagination()` with `INVALID_PAGINATION` before `service.page(...)`.

Two earlier live-smoke harness attempts (`33260334846`, `33260439388`) did not change runtime data or provider state. The second attempt identified the upstream HTTP 403 behavior for the injection-shaped query; the final harness treated either application `INVALID_PAGINATION` or upstream edge denial as the intended fail-closed outcome.

## Resource and persistence boundary

During this acceptance block:

```text
new Cobalt retrieval: NONE
new Telegram retrieval: NONE
new Supadata transcript work: NONE
new AssemblyAI STT: NONE
new attachment STT: NONE
provider-consuming media job: NONE
Render environment mutation: NONE
Neon database mutation requested: NONE
```

The live requests terminate at authentication, HTTP parsing/routing, request-size validation, identifier/pagination validation, or upstream edge rejection. The duplicate/replay assertion uses a fake provider in static regression; no new real provider call was required because live idempotency/durability had already been accepted in the post-cutover regression stream.

## Cleanup

All temporary auth/input/replay hardening and live-smoke workflows were removed from the feature branch after validation. Runner-local token/request material was deleted by workflow cleanup steps.

## Gate after acceptance

```text
AUTH_INPUT_REPLAY_NEGATIVE_MATRIX: ACCEPTED
SERVER_OWNER_CODE_OVERRIDE: ENFORCED
ACTION_BEARER_FAIL_CLOSED: VERIFIED
REQUEST_BODY_FAIL_CLOSED: VERIFIED
JOB_ID_PAGINATION_FAIL_CLOSED: VERIFIED
DUPLICATE_REPLAY_SINGLE_START: VERIFIED_STATIC
PROVIDER_SPEND_FOR_LIVE_ACCEPTANCE: 0
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
ORIGINAL_RENDER_POSTGRESQL: RETAINED_FOR_ROLLBACK
RELEASE_HOLD_OWNER_TESTING: PRESERVED
PR_28_MERGE: HOLD
```
