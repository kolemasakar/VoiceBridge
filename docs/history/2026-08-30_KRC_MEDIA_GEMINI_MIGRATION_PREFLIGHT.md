# KRC Media Gemini Migration Preflight

Status: ACTIVE - M2 COMPLETE; M3 OFFLINE HARNESS ACTIVE
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Prepare a forward migration of KRC Media from the legacy isolated MEDIA BETA runtime to the current VoiceBridge cloud infrastructure while preserving KRC-specific durability, API, privacy, consent, quota, retrieval, and rollback contracts.

This preflight authorizes no production cutover, public rollout, paid provider use, destructive database change, or deletion of the legacy runtime.

## Current authoritative points

VoiceBridge current main baseline used for the forward port:

`eba77183bee29621aa6c7cb859737a10edb6e4d4`

Forward-migration branch:

`agent/krc-media-gemini-migration`

M1 provider-abstraction commit:

`bf0ae1696ced356e2c9e27ef52e86dcc16c52048`

M1 acceptance record:

`docs/history/2026-08-30_KRC_MEDIA_PROVIDER_ABSTRACTION_ACCEPTED.md`

M2 corrected implementation head:

`556a5908cd0644214983b5635da7dbd256835dd1`

M2 acceptance record:

`docs/history/2026-08-30_KRC_MEDIA_GEMINI_ADAPTER_ACCEPTED.md`

M3 offline A/B harness implementation/test head:

`4b0e72fdf884a87e5aab9376a128ea4e093d8e9f`

M3 harness record:

`docs/history/2026-08-30_KRC_MEDIA_M3_AB_HARNESS.md`

Legacy KRC Media isolated endpoint remains available for rollback:

`https://voicebridge-krc-media-beta-kolemasakar.onrender.com`

## Provider separation

VoiceBridge live defaults remain independent from KRC prerecorded transcription:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
```

KRC prerecorded state:

```text
KRC_MEDIA_STT_PROVIDER=assemblyai
KRC_MEDIA_TRANSCRIBE_MODEL=gemini-3.5-transcribe
```

AssemblyAI `universal-2` remains the active KRC prerecorded provider. Gemini `gemini-3.5-transcribe` is implemented as an inactive candidate. No normal KRC managed-media request can activate Gemini at this checkpoint.

## Accepted Gemini capability and privacy boundary

The M2 adapter implements the provider-documented prerecorded contract used for owner testing:

- automatic language detection across 85+ languages;
- general BCP-47 hints independent of VoiceBridge translation pairs;
- multilingual/code-switching-capable transcription;
- word-level timestamps when requested;
- optional diarization request support;
- custom vocabulary validation;
- verbatim mode for canonical KRC evidence;
- up to 60 minutes for plain transcription;
- up to 30 minutes when word timestamps or diarization are requested;
- provider file cleanup with conservative cleanup-state reporting.

Gemini confidence values are not invented when the provider does not return them.

Owner decision recorded on 2026-08-30: Gemini Free Tier data-use conditions are accepted for private owner testing, including intentionally submitted local/private attachments. This does not authorize public rollout or production cutover.

## Preserved KRC contracts

The forward port continues to cover:

- managed Action bearer authentication;
- server-side owner admission injection;
- Neon PostgreSQL durable job and segment persistence contract;
- restart/idempotency behavior;
- shared durable daily STT quota ledger;
- Supadata/Instagram consent and credit gates;
- Facebook Cobalt-only active retrieval with no automatic paid fallback;
- Telegram public-web retrieval with zero retrieval credits;
- trusted OpenAI attachment transport;
- no signed attachment URL persistence;
- provider cleanup state reporting;
- no-store HTTP responses and log-redaction/privacy guards;
- retention and purge behavior;
- KRC Action response and pagination compatibility.

## Validation evidence

M1 provider abstraction:

```text
commit: bf0ae1696ced356e2c9e27ef52e86dcc16c52048
run: 33287504447
cloud: 189/189 PASS
browser-extension: PASS
repository-docs: PASS
```

M2 initial implementation:

```text
commit: 51687600fcb640c302fc087ccdc45dc4835aecea
run: 33287937498
result: TypeScript literal-type compile failure before tests/provider work
```

M2 corrected implementation:

```text
commit: 556a5908cd0644214983b5635da7dbd256835dd1
run: 33287981118
cloud: 198/198 PASS
browser-extension: PASS
repository-docs: PASS
```

M3 offline A/B evaluator and tests:

```text
implementation/test head: 4b0e72fdf884a87e5aab9376a128ea4e093d8e9f
run: 33289377453
cloud: 204/204 PASS
browser-extension: PASS
repository-docs: PASS
```

M3 latest documentation head is validated by the subsequent PR run; no provider-consuming work is introduced by documentation-only changes.

## M3 offline A/B boundary

M3 now has a deterministic offline evaluator for already-produced AssemblyAI/Gemini result records. It scores:

- word error rate against a curated reference;
- substitutions, insertions, and deletions;
- expected term/name recall;
- expected numeric-token recall;
- timestamp coverage;
- provider-reported language metadata;
- cleanup confirmation;
- latency supplied by the execution record;
- reserved quota supplied by the execution record.

The evaluator intentionally cannot start a provider call and does not contain source download, upload, credential, or network-execution logic.

Factual fidelity and hallucination remain manual-review dimensions. The harness therefore never produces an automatic overall provider winner.

## Deployment image note

Before the M4 new-infrastructure canary, the target VoiceBridge deployment image must be audited for KRC runtime dependencies such as media probing/transcoding and PostgreSQL command-line access. M1-M3 unit/regression success does not by itself prove M4 deployment-image parity.

Checkpoint requirement: `M4_DEPLOYMENT_IMAGE_PARITY_REQUIRED`

## Phase checkpoints

### M0 - Preflight

Status: COMPLETE

### M1 - Provider abstraction, zero behavior change

Status: COMPLETE

Checkpoint: `KRC_MEDIA_PROVIDER_ABSTRACTION_PASS`

### M2 - Gemini adapter inactive

Status: COMPLETE

Checkpoint: `KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS`

### M3 - A/B and privacy/quality gate

Status: ACTIVE

Completed so far:

- offline corpus/evaluation contract defined;
- deterministic comparison module implemented;
- tests cover multilingual tokenization, numbers, edit accounting, source-class preservation, timestamp coverage, pair comparison, and mandatory manual review;
- offline harness validation passes without provider calls.

Still required before M3 closure:

- concrete corpus manifest;
- actual same-asset AssemblyAI versus Gemini runs;
- manual factual/hallucination review;
- aggregate quality review and source-class decision.

Actual provider execution is separate because it submits media to external providers and may consume AssemblyAI quota/credits. It is not implied by the offline harness checkpoint.

Checkpoint target: `KRC_MEDIA_GEMINI_AB_REVIEW`

### M4 - New-infrastructure canary

Not started. Requires deployment-image parity audit first.

Checkpoint target: `KRC_MEDIA_NEW_INFRA_CANARY_PASS`

### M5 - Cutover

Requires explicit owner approval.

Checkpoint target: `KRC_MEDIA_NEW_INFRA_CUTOVER_APPROVAL_REQUIRED`

## Current gate

```text
FULL_RECOVER: NOT_REQUIRED
CURRENT_STATE_REVALIDATION: COMPLETE
FORWARD_MIGRATION_BRANCH: ACTIVE
M0_PREFLIGHT: COMPLETE
M1_PROVIDER_ABSTRACTION: PASS
M2_GEMINI_ADAPTER: PASS
M3_OFFLINE_HARNESS: PASS
M3_LIVE_AB: NOT_RUN
KRC_MEDIA_ACTIVE_STT_PROVIDER: assemblyai
GEMINI_PRERECORDED_PROVIDER_IMPLEMENTED: TRUE
GEMINI_PRERECORDED_PROVIDER_ACTIVE: FALSE
GEMINI_FREE_TIER_DATA_USE: OWNER_ACCEPTED
GEMINI_FREE_TIER_PRIVATE_ATTACHMENTS: ALLOWED_IN_OWNER_TESTING
M4_DEPLOYMENT_IMAGE_PARITY_REQUIRED: TRUE
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```
