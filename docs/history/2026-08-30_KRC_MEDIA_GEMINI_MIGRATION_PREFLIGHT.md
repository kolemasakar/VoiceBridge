# KRC Media Gemini Migration Preflight

Status: ACTIVE - PREFLIGHT
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Prepare a forward migration of KRC Media from the legacy isolated MEDIA BETA runtime to the current VoiceBridge cloud infrastructure while preserving KRC-specific durability, API, privacy, consent, quota, retrieval, and rollback contracts.

This preflight authorizes no production cutover, public rollout, paid provider use, destructive database change, or deletion of the legacy runtime.

## Current authoritative points

VoiceBridge current main:

`eba77183bee29621aa6c7cb859737a10edb6e4d4`

VoiceBridge main currently includes Phase 2 M5 configurable language UI.

VoiceBridge active cloud endpoint documented by main:

`https://voicebridge-cloud-us.onrender.com`

Legacy KRC Media implementation branch:

`agent/krc-media-transcript`

Legacy KRC Media head at preflight:

`a0d1d5a380d0d90a42510c3b28f6221385578d52`

Legacy KRC Media isolated endpoint:

`https://voicebridge-krc-media-beta-kolemasakar.onrender.com`

New forward-migration branch:

`agent/krc-media-gemini-migration`

The forward-migration branch is based on current VoiceBridge main rather than on the legacy KRC branch. This avoids treating the old integration contour as authority for the evolved VoiceBridge mainline.

## VoiceBridge main runtime baseline

Current main defaults:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
```

AssemblyAI streaming remains an explicit VoiceBridge rollback path.

Current VoiceBridge public language registry is a VoiceBridge translation/playback product constraint and MUST NOT be used as the KRC Media transcription-language limit. KRC prerecorded transcription has its own provider capability boundary.

## KRC Media transcription target

KRC Media prerecorded transcription target:

`gemini-3.5-transcribe`

Do not route prerecorded KRC Media through the VoiceBridge Live STT adapter merely because VoiceBridge uses `gemini-3.5-transcribe-live` for streaming.

Target KRC abstraction:

```text
KRC Media source retrieval
  -> normalized audio/media asset
  -> MediaTranscriptionProvider
       -> GeminiTranscribeProvider        [target]
       -> AssemblyAIAsyncTranscriber      [rollback]
  -> normalized KRC transcript result
  -> durable KRC job / segments / evidence workflow
```

The provider selector must be KRC-specific and independent of VoiceBridge `STT_PROVIDER`.

Suggested configuration boundary:

```text
KRC_MEDIA_STT_PROVIDER=assemblyai|gemini
KRC_MEDIA_TRANSCRIBE_MODEL=gemini-3.5-transcribe
```

The exact environment names may be adapted during implementation, but the separation invariant is mandatory.

## Official Gemini capability snapshot verified at preflight

Gemini 3.5 Transcribe is GA and supports:

- automatic detection across 85+ languages;
- multilingual code-switching;
- word-level timestamps;
- speaker diarization up to 8 speakers, with 3+ speaker attribution documented as experimental;
- custom vocabulary biasing up to 1,000 terms;
- verbatim and smart transcription modes;
- up to 1 hour of audio per unary request;
- up to 30 minutes when word timestamps or diarization are enabled.

KRC canonical evidence must use verbatim/minimally transformed transcription. Smart transcription may only be an explicitly labeled derivative.

## Free-tier and privacy boundary

Current Google Gemini Developer API pricing documents Free Tier input and output for `gemini-3.5-transcribe` as free of charge.

The same pricing documentation states that Free Tier data may be used to improve Google products, while the paid tier states that data is not used for that purpose.

Owner decision recorded on 2026-08-30: this Free Tier data-use condition is ACCEPTABLE for KRC Media owner testing, including local/private attachments intentionally submitted to KRC Media.

Therefore the previous private-attachment privacy HOLD is removed for the private owner-testing contour.

Accepted policy during owner testing:

- public web/social media sources: eligible for Gemini Free Tier evaluation;
- local/private attachments: eligible for Gemini Free Tier evaluation when intentionally submitted by the owner/user to KRC Media;
- AssemblyAI remains available as rollback during migration and observation;
- the acceptance of Free Tier data use does not authorize public rollout or change the release gate.

No automatic paid fallback is authorized.

## Legacy KRC Media contracts that must survive the forward port

The legacy implementation currently includes separate AssemblyAI STT logic in:

- `src/cloud/src/attachment_managed_pipeline.ts`;
- `src/cloud/src/telegram_managed_pipeline.ts`;
- `src/cloud/src/facebook_managed_pipeline.ts`.

The current construction is provider-specific. The next implementation phase must extract provider-neutral prerecorded STT before adding Gemini.

The following accepted KRC boundaries must be preserved:

- managed Action bearer authentication;
- server-side owner admission injection;
- Neon PostgreSQL durable job and segment persistence;
- restart/idempotency behavior;
- shared durable daily STT quota ledger;
- consent and credit gates for Supadata / Instagram paths;
- Facebook Cobalt-only active retrieval with no automatic paid fallback;
- Telegram public-web retrieval with zero retrieval credits;
- trusted OpenAI attachment transport boundary;
- no signed attachment URL persistence;
- provider cleanup state reporting;
- no-store HTTP responses and log-redaction/privacy guards;
- retention and purge behavior;
- KRC Action response and pagination compatibility.

## Migration strategy

Do NOT merge the full legacy `agent/krc-media-transcript` branch into current VoiceBridge main.

Preferred strategy: selective forward port onto `agent/krc-media-gemini-migration` from current main.

Reason:

- VoiceBridge main has evolved independently through Gemini Live migration and Phase 2 work;
- the legacy KRC branch contains a large historical integration contour and release/test harness history;
- KRC managed media should be ported as an additive subsystem onto the current server contract;
- current VoiceBridge runtime remains authoritative for shared server/auth/request infrastructure;
- KRC-specific persistence and media routes remain isolated by path and configuration.

## Phase checkpoints

### M0 - Preflight

Status: ACTIVE

Acceptance:
- current main/head confirmed;
- current KRC legacy head confirmed;
- active and legacy endpoints identified;
- Gemini current official capabilities/pricing/data-use reviewed;
- owner explicitly accepted the Gemini Free Tier data-use boundary for private owner testing, including local/private attachments;
- migration strategy selected;
- no runtime/environment mutation.

### M1 - Provider abstraction, zero behavior change

- forward-port the minimum KRC managed-media runtime and tests onto current main baseline;
- introduce `MediaTranscriptionProvider` for prerecorded media;
- place current AssemblyAI async implementation behind the adapter;
- keep `KRC_MEDIA_STT_PROVIDER=assemblyai` as the only accepted active value during M1;
- preserve API/persistence/quota/cleanup behavior;
- full KRC regression suite must pass.

Checkpoint: `KRC_MEDIA_PROVIDER_ABSTRACTION_PASS`

### M2 - Gemini adapter inactive

- implement `GeminiTranscribeProvider` using `gemini-3.5-transcribe`;
- keep selector default on AssemblyAI;
- use verbatim mode for canonical evidence;
- normalize only provider-returned metadata;
- do not invent confidence values unavailable from Gemini;
- implement provider upload/file cleanup handling;
- add 85+ language capability mapping without coupling to VoiceBridge translation pairs.

Checkpoint: `KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS`

### M3 - A/B and privacy gate

- run the same accepted public-media corpus through AssemblyAI and Gemini;
- compare factual fidelity, names, numbers, omissions, hallucinations, language detection, timestamps, diarization where enabled, latency, failures, and quota use;
- local/private attachments are eligible for controlled Gemini Free Tier A/B because the owner explicitly accepted the documented data-use boundary;
- retain explicit source-class labeling in A/B evidence.

Checkpoint: `KRC_MEDIA_GEMINI_AB_REVIEW`

### M4 - New-infrastructure canary

- deploy KRC managed routes to the current VoiceBridge cloud infrastructure in an isolated/canary configuration;
- keep Neon as the active KRC durable store;
- keep the legacy KRC endpoint available for rollback;
- update the KRC Action schema only after canary validation;
- no public rollout.

Checkpoint: `KRC_MEDIA_NEW_INFRA_CANARY_PASS`

### M5 - Cutover

Requires explicit owner approval.

- switch KRC Action server URL to the new infrastructure;
- select Gemini only for source classes that passed quality/privacy gates;
- preserve AssemblyAI rollback;
- observe real KRC jobs and validate restart/durability/idempotency/privacy;
- legacy endpoint deletion remains a separate later decision.

Checkpoint: `KRC_MEDIA_NEW_INFRA_CUTOVER_APPROVAL_REQUIRED`

## Current gate

```text
FULL_RECOVER: NOT_REQUIRED
CURRENT_STATE_REVALIDATION: COMPLETE
FORWARD_MIGRATION_BRANCH: CREATED
GEMINI_FREE_TIER_DATA_USE: OWNER_ACCEPTED
GEMINI_FREE_TIER_PRIVATE_ATTACHMENTS: ALLOWED_IN_OWNER_TESTING
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```
