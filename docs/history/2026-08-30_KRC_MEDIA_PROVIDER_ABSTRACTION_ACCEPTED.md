# KRC Media Provider Abstraction Acceptance

Date: 2026-08-30
Status: ACCEPTED
Checkpoint: KRC_MEDIA_PROVIDER_ABSTRACTION_PASS
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

M1 forward-ports the accepted KRC Media managed runtime onto the current VoiceBridge main baseline and introduces a KRC-specific prerecorded transcription provider boundary without changing the active KRC STT provider.

## Commits

Runtime forward port:

`a60a4dd441e8dc9a66bc30db6d49e2c281332a49`

Provider abstraction:

`bf0ae1696ced356e2c9e27ef52e86dcc16c52048`

Preflight/checkpoint update:

`3a9bde51e057d1a2224e65ba8c9a3e39c9e7ea98`

## Accepted architecture

```text
VoiceBridge live STT
  -> STT_PROVIDER=gemini
  -> gemini-3.5-transcribe-live

KRC Media prerecorded STT
  -> KRC_MEDIA_STT_PROVIDER=assemblyai
  -> MediaTranscriptionProvider
  -> AssemblyAI async universal-2
```

The two provider selectors are independent. M1 rejects `KRC_MEDIA_STT_PROVIDER=gemini`; Gemini prerecorded selection is deferred to M2 after the adapter passes its unit/contract gate.

KRC service construction now flows through:

- `src/cloud/src/media_transcription_provider.ts`;
- `src/cloud/src/krc_managed_media_factory.ts`;
- `src/cloud/src/managed_server.ts`.

The existing route-local AssemblyAI cleanup behavior remains in the attachment, Facebook, Telegram, and legacy client modules, preserving the previously accepted cleanup/privacy contract while provider selection and construction are centralized.

## Validation

Forward-port run:

`33287326362`

```text
cloud tests: 184
pass: 184
fail: 0
browser-extension: PASS
repository-docs: PASS
```

Provider-abstraction run:

`33287504447`

```text
cloud tests: 189
pass: 189
fail: 0
browser-extension: PASS
repository-docs: PASS
```

New M1 contract tests prove:

- live VoiceBridge Gemini selection remains independent from KRC prerecorded STT;
- KRC prerecorded provider is AssemblyAI universal-2 during M1;
- missing AssemblyAI configuration fails the KRC provider to unconfigured state;
- Gemini cannot be selected through the M1 KRC provider selector;
- the managed server injects a KRC service built through the new provider boundary;
- the KRC factory does not use live `config.sttProvider` or `config.geminiSttModel`.

## Preserved KRC contracts

The combined regression suite continues to cover:

- Action bearer authentication and server-side owner admission;
- durable job/segment persistence and restart/idempotency;
- durable STT quota fail-closed behavior;
- Supadata consent/credit accounting;
- Facebook Cobalt-only active retrieval with no automatic paid fallback;
- Telegram public retrieval with zero retrieval credits;
- OpenAI attachment transport restrictions;
- cleanup-state reporting;
- privacy/log-redaction/no-store behavior;
- retention/purge behavior;
- cross-route isolation and state-continuation guards.

## Deployment note

Current production infrastructure was not changed in M1. Before M4 canary, the target VoiceBridge deployment image must be audited for KRC runtime dependencies such as media processing/probing and PostgreSQL command-line access.

Marker:

`M4_DEPLOYMENT_IMAGE_PARITY_REQUIRED`

## Resource and release accounting

- Gemini prerecorded provider calls: NONE;
- AssemblyAI provider-consuming calls: NONE;
- Supadata provider-consuming calls: NONE;
- paid Facebook/ScrapeCreators activation: NONE;
- Neon data mutation requested: NONE;
- Render environment mutation: NONE;
- KRC Action URL change: NONE;
- production cutover: NONE;
- public/external rollout: NONE;
- legacy endpoint deletion: NONE.

M2 is the next phase. It may implement the inactive `GeminiTranscribeProvider`, but it does not authorize production cutover or public rollout.
