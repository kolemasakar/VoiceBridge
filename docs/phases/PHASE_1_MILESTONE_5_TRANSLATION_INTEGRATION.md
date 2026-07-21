# Phase 1 Milestone 5 Translation Integration

Status: PROVIDER APPROVED; IMPLEMENTATION PENDING

Date: 2026-07-21

## Objective

Convert ordered final English transcript segments into understandable ordered Ukrainian text through a cloud-side provider-neutral translation boundary before Ukrainian speech synthesis is introduced.

## Approved Provider

Phase 1 provider:

- provider: Gemini Developer API;
- model: `gemini-3.1-flash-lite`;
- credential: `GEMINI_API_KEY`;
- optional model override: `GEMINI_TRANSLATION_MODEL`;
- billing mode: free tier without a linked billing account;
- deployment boundary: VoiceBridge Cloud only.

Decision record:

`docs/adr/ADR-006_PHASE_1_TRANSLATION_PROVIDER.md`

## Privacy Boundary

The Gemini free tier may use prompts and responses to improve provider products.

Allowed Phase 1 input:

- controlled public YouTube test content;
- synthetic text;
- content explicitly approved for provider processing.

Prohibited input:

- private conversations;
- confidential meetings;
- personal communications;
- regulated or production user content.

VoiceBridge MUST NOT persist transcripts, provider prompts, provider responses, or translations.

## Target Runtime Flow

```text
AssemblyAI final English segment
    |
    v
VoiceBridge Translation Queue
    |
    v
TranslationProvider interface
    |
    v
Gemini adapter
    |
    v
Validated Ukrainian translation
    |
    v
Ordered TRANSLATION_FINAL event
    |
    v
Browser session-only display
```

## Provider-Neutral Contract

Translation request:

- `segment_id`;
- `source_language`;
- `target_language`;
- `source_text`;
- bounded prior English context;
- `requested_at`.

Translation result:

- `segment_id`;
- `provider`;
- `translated_text`;
- `translation_latency_ms`;
- `completed_at`.

Common provider states:

- `NOT_CONFIGURED`;
- `READY`;
- `ACTIVE`;
- `ERROR`;
- `CLOSED`.

## Event Contract

Required cloud-to-browser events:

- `TRANSLATION_STATUS`;
- `TRANSLATION_FINAL`;
- `TRANSLATION_ERROR`.

`TRANSLATION_FINAL` MUST preserve the original final STT segment identifier and ordering.

Provider-specific raw payloads MUST NOT cross the VoiceBridge cloud boundary.

## Ordering and Buffering Policy

- translate final STT segments only;
- use one bounded sequential translation queue per active session;
- keep at most 20 pending translation operations;
- reject additional work safely when the queue is full;
- preserve source segment order even if provider response times vary;
- keep at most four prior final English segments for context;
- limit context to 3000 characters;
- limit one segment to 2000 characters;
- do not retry automatically during Phase 1;
- translation failure MUST NOT stop audio streaming or STT.

## Timeout and Error Policy

Provider timeout:

`15000` milliseconds.

Sanitized errors MUST distinguish:

- missing provider configuration;
- provider timeout;
- provider quota or rate limit;
- malformed provider response;
- provider rejection;
- internal queue overflow;
- unexpected provider failure.

Errors MUST NOT contain API keys, provider request bodies, raw provider responses, or private text.

## Browser Requirements

The next browser extension version MUST display:

- translation provider;
- translation status;
- recent ordered Ukrainian text;
- final translation count;
- latest translation latency;
- sanitized translation error.

Recent Ukrainian text MUST remain bounded and session-only.

## Cloud Requirements

The next cloud service version MUST include:

- provider-neutral `TranslationProvider` interface;
- Gemini translation adapter;
- environment configuration validation;
- structured-output validation;
- bounded sequential queue;
- translation metrics;
- graceful close behavior;
- fake-provider automated tests;
- no content persistence.

## Implementation Versions

Planned versions:

- cloud service: `0.4.0`;
- browser extension: `0.5.0`.

## Automated Validation Plan

Required tests:

- provider configuration absent;
- successful English-to-Ukrainian translation;
- structured output parsing;
- malformed output rejection;
- timeout handling;
- rate-limit mapping;
- segment identity preservation;
- ordered multi-segment output;
- bounded queue overflow behavior;
- context length limit;
- translation failure without STT termination;
- clean session close;
- secret-pattern and ASCII documentation checks.

Default automated tests MUST NOT call the live Gemini API.

## Live Validation Plan

Live validation requires:

- `GEMINI_API_KEY` configured only in Render;
- no billing account linked to the Phase 1 test project;
- cloud health or session startup reports translation as configured;
- extension `0.5.0` is confirmed;
- final English segments produce readable Ukrainian text;
- segment order is preserved;
- translation latency remains visible;
- provider errors remain empty during a normal test;
- Stop closes translation, STT, stream, and session cleanly;
- no secret or persistent translation content is exposed.

## Exit Criterion

Milestone 5 passes when controlled English YouTube speech produces understandable ordered Ukrainian text through the complete browser-to-cloud pipeline with bounded buffering, visible latency, clean shutdown, no payment configuration, and no secret or content persistence.

Current result:

PROVIDER APPROVED. IMPLEMENTATION PENDING.

## References

- [ADR-006_PHASE_1_TRANSLATION_PROVIDER](../adr/ADR-006_PHASE_1_TRANSLATION_PROVIDER.md)
- [ADR-005_PHASE_1_STREAMING_STT_PROVIDER](../adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION](PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2026-07-21 | Approved the Phase 1 translation provider and defined Milestone 5 implementation and validation contracts |
