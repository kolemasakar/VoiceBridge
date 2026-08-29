# KRC MEDIA Retention / Log-Redaction Negative Matrix Acceptance

Date: 2026-08-29
Status: ACCEPTED
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

This owner-testing block verifies retention/deletion behavior and log-redaction/privacy boundaries for the accepted private MEDIA BETA runtime. It is a static/fake-provider regression block and does not require a provider-consuming media operation.

Retained regression:

`src/cloud/tests/managed_media_retention_log_redaction.test.ts`

## Accepted retention and deletion invariants

- zero-credit/certain managed-media work follows the configured normal job TTL;
- charged or charge-uncertain provider outcomes preserve at least a 24-hour recovery window;
- uncertain provider failure is terminal/non-retryable and is not automatically replayed;
- expired durable managed-media jobs are deleted by `purgeExpired()`;
- request-key and job-id reads return only records whose `expires_at` is still in the future;
- the durable STT quota ledger is bounded by deleting entries older than two UTC days.

## Accepted log-redaction / response invariants

- the retained managed-media Facebook diagnostic warning is structured metadata only;
- allowed warning fields are limited to event/job/provider/error/status-class metadata;
- source URL, owner access code, request/access digests, transcript text/segments, media/download URL, and Authorization values are excluded from that warning;
- durable PostgreSQL command stderr is suppressed instead of being copied into application errors;
- durable persistence failures expose generic error text rather than SQL/provider stderr payloads;
- managed-media HTTP responses set `cache-control: no-store`;
- the managed-media HTTP module contains no `console.log/warn/error/info/debug` request-body logging;
- normal `JSON.stringify(body)` response serialization is explicitly distinguished from logging.

## Validation history

Initial regression commit:
`5faa93bfced213c3be82dd71362fc775f3eb0a94`

Initial workflow run:
`33267727322`

Initial result: 167/168 PASS, 1 FAIL.

The single failure was a test-harness false positive. The harness treated normal HTTP response serialization (`response.end(JSON.stringify(body))`) as if it were logging. No product/runtime/provider defect was identified; the other new retention/redaction assertions already passed.

Corrected harness commit:
`43bd757b541f9dcbffa40041228466a6eaa38c7d`

Corrected workflow run:
`33267869660`

Corrected result:

```text
tests: 168
pass: 168
fail: 0
```

All six retained retention/log-redaction tests pass.

## Resource / safety accounting

- AssemblyAI provider-consuming work: NONE;
- Supadata provider-consuming work: NONE;
- Facebook paid retrieval: NONE;
- ScrapeCreators activation: NONE;
- Render environment mutation: NONE;
- Neon data mutation requested: NONE;
- production/main mutation: NONE;
- external/public rollout: NONE.

## Gate state

- active durable store remains Neon PostgreSQL 18;
- original Render PostgreSQL remains retained; deletion NOT AUTHORIZED;
- VoiceBridge PR #28 remains release-gated;
- KRC PR #8 remains release-gated;
- `RELEASE_HOLD_OWNER_TESTING` remains active.

This acceptance does not activate or authorize the separate pending Gemini 3.5 Transcribe transition plan.