# KRC Media Gemini Prerecorded Adapter Acceptance

Status: ACCEPTED
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING
Checkpoint: KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS

## Scope

This checkpoint closes M2 of the KRC Media forward migration. M2 adds an inactive Gemini prerecorded transcription adapter for KRC Media while preserving AssemblyAI as the only active KRC prerecorded provider.

No production cutover, Action URL change, Render environment change, Neon mutation, public rollout, paid provider activation, or provider-consuming transcription call was authorized or performed by this checkpoint.

## Implementation

Initial M2 implementation commit:

`51687600fcb640c302fc087ccdc45dc4835aecea`

Type-only correction commit:

`556a5908cd0644214983b5635da7dbd256835dd1`

Added runtime module:

`src/cloud/src/gemini_transcribe_provider.ts`

Updated KRC provider boundary and configuration:

- `src/cloud/src/media_transcription_provider.ts`
- `src/cloud/src/config.ts`
- `src/cloud/.env.example`

Added unit/contract coverage:

`src/cloud/tests/gemini_transcribe_provider.test.ts`

## Accepted provider contract

The inactive Gemini candidate is fixed to:

`gemini-3.5-transcribe`

M2 implements and tests:

- Gemini Files API resumable upload;
- Gemini Interactions API prerecorded transcription request;
- canonical `verbatim` mode;
- automatic language detection;
- KRC-specific BCP-47 language hints independent of the VoiceBridge translation registry;
- current short-hint compatibility for `uk`, `ru`, and `en`;
- word timestamp parsing when requested;
- optional diarization request support;
- custom vocabulary validation up to the provider-documented limit;
- KRC segment normalization without inventing confidence values;
- explicit Gemini file deletion after transcription;
- conservative `provider_data_deleted=false` when provider cleanup cannot be confirmed;
- cleanup attempt after transcription failure;
- rejection of empty successful provider output;
- 60-minute plain transcription limit;
- 30-minute limit when word timestamps or diarization are requested.

The capability descriptor records provider-documented automatic detection across 85+ languages. It is intentionally independent of VoiceBridge translation/playback language pairs.

## Activation boundary

M2 does NOT activate Gemini for KRC Media.

The active KRC selector remains:

```text
KRC_MEDIA_STT_PROVIDER=assemblyai
```

The candidate model is exposed separately:

```text
KRC_MEDIA_TRANSCRIBE_MODEL=gemini-3.5-transcribe
```

The runtime selector still rejects `gemini`; therefore no normal KRC managed-media request can reach the Gemini prerecorded adapter at the M2 checkpoint.

AssemblyAI `universal-2` remains the active KRC prerecorded provider and the intended rollback provider after any later Gemini activation.

## Validation evidence

The first M2 validation run was:

`33287937498`

It failed during TypeScript compilation before tests or provider work because `config.krcMediaTranscribeModel` was typed as a general string while the candidate constructor required the literal model type.

The type-only correction was committed as:

`556a5908cd0644214983b5635da7dbd256835dd1`

Final validation run:

`33287981118`

Result:

```text
cloud tests: 198
pass: 198
fail: 0
browser-extension: PASS
repository-docs: PASS
```

The M2-specific tests confirm:

- general BCP-47 mapping and KRC language independence;
- fail-closed behavior before network access when no Gemini API key is configured;
- Files plus Interactions request shape;
- verbatim mode;
- word timestamp normalization;
- provider file cleanup after success;
- automatic detection path without invented annotations;
- conservative cleanup failure reporting;
- cleanup on provider failure;
- empty-result rejection;
- plain versus annotated duration limits;
- Gemini candidate configuration remains inactive while the KRC active selector stays on AssemblyAI.

## Safety and privacy state

Gemini Free Tier data-use acceptance for private owner testing remains the owner-approved policy recorded during preflight. That decision allows later controlled M3 evaluation but does not activate Gemini or authorize public rollout.

Current gates:

```text
M0_PREFLIGHT: COMPLETE
M1_PROVIDER_ABSTRACTION: PASS
M2_GEMINI_ADAPTER: PASS
KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS: TRUE
KRC_MEDIA_ACTIVE_STT_PROVIDER: assemblyai
GEMINI_PRERECORDED_PROVIDER_IMPLEMENTED: TRUE
GEMINI_PRERECORDED_PROVIDER_ACTIVE: FALSE
PROVIDER_CONSUMING_M2_WORK: NONE
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next phase

M3 is the controlled A/B and privacy/quality review. The next implementation work is to create an offline comparison harness and corpus manifest first. Real AssemblyAI/Gemini A/B provider execution remains a separate provider-consuming operation and must not be inferred from this acceptance checkpoint.
