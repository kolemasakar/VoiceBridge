# KRC Media Gemini Migration Preflight

Status: ACTIVE - M1 COMPLETE
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Prepare a forward migration of KRC Media from the legacy isolated MEDIA BETA runtime to the current VoiceBridge cloud infrastructure while preserving KRC-specific durability, API, privacy, consent, quota, retrieval, and rollback contracts.

This preflight authorizes no production cutover, public rollout, paid provider use, destructive database change, or deletion of the legacy runtime.

## Current authoritative points

VoiceBridge current main baseline used for the forward port:

`eba77183bee29621aa6c7cb859737a10edb6e4d4`

VoiceBridge main at that baseline includes Phase 2 M5 configurable language UI.

VoiceBridge active cloud endpoint documented by main:

`https://voicebridge-cloud-us.onrender.com`

Legacy KRC Media implementation branch:

`agent/krc-media-transcript`

Legacy KRC Media head used as the selective source baseline:

`a0d1d5a380d0d90a42510c3b28f6221385578d52`

Legacy KRC Media isolated endpoint:

`https://voicebridge-krc-media-beta-kolemasakar.onrender.com`

Forward-migration branch:

`agent/krc-media-gemini-migration`

M1 runtime forward-port commit:

`a60a4dd441e8dc9a66bc30db6d49e2c281332a49`

M1 provider-abstraction commit:

`bf0ae1696ced356e2c9e27ef52e86dcc16c52048`

The forward-migration branch is based on current VoiceBridge main rather than on the legacy KRC branch. This avoids treating the old integration contour as authority for the evolved VoiceBridge mainline.

## VoiceBridge main runtime baseline

Current main defaults preserved by the forward port:

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
       -> GeminiTranscribeProvider        [target M2+]
       -> AssemblyAI async                [M1 active / rollback]
  -> normalized KRC transcript result
  -> durable KRC job / segments / evidence workflow
```

The provider selector is KRC-specific and independent of VoiceBridge `STT_PROVIDER`.

M1 configuration boundary:

```text
KRC_MEDIA_STT_PROVIDER=assemblyai
```

M1 intentionally rejects `gemini` as a KRC prerecorded provider. Gemini becomes selectable only after the M2 adapter passes its unit/contract gate.

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
- acceptance of Free Tier data use does not authorize public rollout or change the release gate.

No automatic paid fallback is authorized.

## Legacy KRC Media contracts preserved in M1

The selective forward port retained the accepted KRC Media implementation and regression coverage for:

- managed Action bearer authentication;
- server-side owner admission injection;
- Neon PostgreSQL durable job and segment persistence contract;
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

The current AssemblyAI async implementations remain inside the attachment, Facebook, and Telegram media pipeline modules during M1. M1 centralizes KRC provider selection and construction without moving the provider cleanup logic, which keeps the accepted cleanup/privacy contracts unchanged.

## M1 provider abstraction

M1 introduced:

- `src/cloud/src/media_transcription_provider.ts` - KRC prerecorded provider boundary;
- `src/cloud/src/krc_managed_media_factory.ts` - KRC service construction through that boundary;
- `KRC_MEDIA_STT_PROVIDER=assemblyai` - KRC-specific selector, independent of live VoiceBridge `STT_PROVIDER`;
- `src/cloud/src/managed_server.ts` injection of the KRC managed service factory;
- `src/cloud/tests/krc_media_transcription_provider.test.ts` - provider-separation and fail-closed M1 contract tests.

M1 does not implement or call Gemini prerecorded transcription.

## M1 validation evidence

Forward-port baseline commit:

`a60a4dd441e8dc9a66bc30db6d49e2c281332a49`

Validation run:

`33287326362`

Result:

```text
cloud tests: 184
pass: 184
fail: 0
browser-extension: PASS
repository-docs: PASS
```

Provider-abstraction commit:

`bf0ae1696ced356e2c9e27ef52e86dcc16c52048`

Validation run:

`33287504447`

Result:

```text
cloud tests: 189
pass: 189
fail: 0
browser-extension: PASS
repository-docs: PASS
```

The five new M1 tests confirm:

- live VoiceBridge remains on Gemini while KRC prerecorded remains on AssemblyAI;
- KRC AssemblyAI provider/model identity is explicit;
- KRC provider reports unconfigured without an AssemblyAI key;
- `KRC_MEDIA_STT_PROVIDER=gemini` is rejected during M1;
- managed KRC runtime construction flows through the new provider boundary and does not use live `config.sttProvider` or `config.geminiSttModel`.

No provider-consuming call, Render environment mutation, Action URL change, Neon data mutation, production deployment, or paid provider activation was performed in M1.

Checkpoint: `KRC_MEDIA_PROVIDER_ABSTRACTION_PASS`

## Deployment image note

The current main VoiceBridge cloud image is optimized for the current live service, while some KRC Media paths require runtime dependencies such as media probing/transcoding and PostgreSQL command-line access.

This is not an M1 compile/test blocker. Before the M4 new-infrastructure canary, the target deployment image MUST be audited and made KRC-runtime compatible without regressing the live VoiceBridge service.

Checkpoint requirement: `M4_DEPLOYMENT_IMAGE_PARITY_REQUIRED`

## Migration strategy

Do NOT merge the full legacy `agent/krc-media-transcript` branch into current VoiceBridge main.

Preferred strategy remains selective forward port onto `agent/krc-media-gemini-migration` from current main.

Reason:

- VoiceBridge main has evolved independently through Gemini Live migration and Phase 2 work;
- the legacy KRC branch contains a large historical integration contour and release/test harness history;
- KRC managed media is being ported as an additive subsystem onto the current server contract;
- current VoiceBridge runtime remains authoritative for shared server/auth/request infrastructure;
- KRC-specific persistence and media routes remain isolated by path and configuration.

## Phase checkpoints

### M0 - Preflight

Status: COMPLETE

Acceptance:
- current main/head confirmed;
- current KRC legacy head confirmed;
- active and legacy endpoints identified;
- Gemini current official capabilities/pricing/data-use reviewed;
- owner explicitly accepted the Gemini Free Tier data-use boundary for private owner testing, including local/private attachments;
- migration strategy selected;
- no runtime/environment mutation.

### M1 - Provider abstraction, zero behavior change

Status: COMPLETE

Acceptance:
- minimum KRC managed-media runtime and accepted tests forward-ported onto current main baseline;
- `MediaTranscriptionProvider` boundary introduced;
- current AssemblyAI async provider construction routed through the KRC-specific adapter/factory;
- `KRC_MEDIA_STT_PROVIDER=assemblyai` remains the only accepted active value during M1;
- live VoiceBridge Gemini selection remains independent;
- API/persistence/quota/cleanup behavior remains covered by the combined regression suite;
- 189/189 cloud tests pass on the provider-abstraction commit.

Checkpoint: `KRC_MEDIA_PROVIDER_ABSTRACTION_PASS`

### M2 - Gemini adapter inactive

Status: NEXT

- implement `GeminiTranscribeProvider` using `gemini-3.5-transcribe`;
- keep selector default on AssemblyAI;
- use verbatim mode for canonical evidence;
- normalize only provider-returned metadata;
- do not invent confidence values unavailable from Gemini;
- implement provider upload/file cleanup handling;
- add 85+ language capability mapping without coupling to VoiceBridge translation pairs.

Checkpoint: `KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS`

### M3 - A/B and privacy gate

- run the same accepted media corpus through AssemblyAI and Gemini;
- compare factual fidelity, names, numbers, omissions, hallucinations, language detection, timestamps, diarization where enabled, latency, failures, and quota use;
- local/private attachments are eligible for controlled Gemini Free Tier A/B because the owner explicitly accepted the documented data-use boundary;
- retain explicit source-class labeling in A/B evidence.

Checkpoint: `KRC_MEDIA_GEMINI_AB_REVIEW`

### M4 - New-infrastructure canary

- audit and provide KRC-required deployment image dependencies;
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
FORWARD_MIGRATION_BRANCH: ACTIVE
M0_PREFLIGHT: COMPLETE
M1_PROVIDER_ABSTRACTION: PASS
KRC_MEDIA_PROVIDER_ABSTRACTION_PASS: TRUE
KRC_MEDIA_ACTIVE_STT_PROVIDER: assemblyai
GEMINI_PRERECORDED_PROVIDER: NOT_IMPLEMENTED
GEMINI_FREE_TIER_DATA_USE: OWNER_ACCEPTED
GEMINI_FREE_TIER_PRIVATE_ATTACHMENTS: ALLOWED_IN_OWNER_TESTING
M4_DEPLOYMENT_IMAGE_PARITY_REQUIRED: TRUE
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```
