# KRC Media M3 Live A/B Credential Preflight Blocked

Status: AB_AUTHORIZED / PROVIDER_EXECUTION_BLOCKED / ZERO_PROVIDER_CALLS
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the first owner-authorized M3 live same-asset provider A/B execution attempt and its fail-closed credential preflight result.

This record does not contain provider credentials or secret values.

## Authorization

The owner explicitly selected APPROVE A/B for the three READY_FOR_AB clean-public cases.

Authorized scope:

```text
ua-clean-public-001
ru-clean-public-001
en-clean-public-001
AssemblyAI model: universal-2
Gemini model: gemini-3.5-transcribe
same exact accepted asset bytes per provider pair
word timestamps: true
diarization: false
```

No normal KRC provider activation, deployment change, database mutation, Builder change, Action URL change, merge, M4/M5 transition, or release gate was authorized.

## Execution preparation

A bounded live execution runner was added at:

`src/cloud/scripts/krc_media_m3_live_ab.mjs`

Runner preparation commit:

`6058eadd87a00d1000afd72c9a82519bd6bbec54`

Exact-head Validate run:

`33529438920`

Result:

`SUCCESS`

The runner is bounded to at most six provider submissions: three cases times two providers. It does not automatically resubmit failed provider requests, verifies accepted asset SHA-256 before provider execution, deletes temporary local media, and does not change the normal KRC provider selector.

## Workflow execution history

Initial workflow creation run:

```text
run: 33529663328
result: FAILURE before job creation
jobs: 0
provider calls: 0
```

The initial workflow condition used a YAML plain scalar containing `M3:` and failed before any job or runner step existed. This was a workflow syntax/preparation defect only.

Corrected authorized run:

```text
run: 33529742510
job: live-ab
credential preflight: FAILED
provider execution step: SKIPPED
result artifact: NOT_CREATED
```

The workflow resolved both configured secret references to empty environment values for this run:

```text
ASSEMBLYAI_API_KEY: EMPTY
GEMINI_API_KEY: EMPTY
```

The preflight stopped on the missing AssemblyAI credential before the provider execution step. No secret value was printed or exposed.

## Provider-consumption result

```text
ASSEMBLYAI_PROVIDER_SUBMISSIONS: 0
GEMINI_PROVIDER_SUBMISSIONS: 0
TOTAL_PROVIDER_SUBMISSIONS: 0
ASSEMBLYAI_M3_CREDITS_CONSUMED_BY_THIS_RUN: 0
GEMINI_M3_PROVIDER_CALLS: 0
M3_LIVE_AB_RESULTS: NOT_CREATED
M3_PROVIDER_AB: NOT_RUN
```

This is a fail-closed infrastructure/configuration blocker, not an A/B quality result.

## Evidence state preserved

The reference/evidence readiness gate remains accepted:

```text
ASSET_SHA256_ACCEPTED: TRUE 3/3
FINAL_REFERENCE_SHA256_ACCEPTED: TRUE 3/3
REFERENCE_REVIEW_STATE: independent_reviewed 3/3
READY_FOR_AB: TRUE 3/3
```

## Required next transition

Configure repository Actions secrets for the VoiceBridge repository using the canonical environment names:

```text
ASSEMBLYAI_API_KEY
GEMINI_API_KEY
```

Then re-run the manual `KRC Media M3 Live A-B` workflow or perform one separately authorized equivalent execution.

The credential values must never be committed to GitHub files, logs, PR text, or documentation.

## Safety boundary

Until credential preflight passes:

```text
M3_PROVIDER_AB: NOT_RUN
GEMINI_PRERECORDED_ACTIVE: FALSE
KRC_MEDIA_STT_PROVIDER: assemblyai
M4: NOT_STARTED
M5: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```
