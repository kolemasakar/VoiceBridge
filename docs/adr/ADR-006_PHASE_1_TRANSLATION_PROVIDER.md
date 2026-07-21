# ADR-006 Phase 1 Translation Provider

Status: ACCEPTED

Date: 2026-07-21

Decision Owners: VoiceBridge project

## Context

Phase 1 Milestone 5 requires ordered English-to-Ukrainian text translation after final AssemblyAI transcript segments and before Ukrainian speech synthesis.

The selected solution must:

- preserve the Cloud First boundary;
- keep provider credentials out of the browser;
- support English-to-Ukrainian translation;
- preserve segment identity and ordering;
- expose translation latency and sanitized errors;
- require no payment method for the controlled Phase 1 test;
- remain replaceable behind a provider-neutral interface;
- avoid persistent storage of transcripts or translations.

## Decision

Use the Gemini Developer API free tier as the Phase 1 translation provider.

Use model:

`gemini-3.1-flash-lite`

The model identifier MUST remain configurable through:

`GEMINI_TRANSLATION_MODEL`

The provider credential MUST be configured only in the cloud runtime through:

`GEMINI_API_KEY`

Browser clients continue to connect only to VoiceBridge Cloud and MUST NOT receive or store the Gemini key.

## Rationale

Gemini 3.1 Flash-Lite is selected for the controlled Phase 1 test because:

- the official model description identifies translation as an optimized workload;
- the model is available on the Gemini API free tier;
- new Gemini API accounts begin on the free tier without enabling paid billing;
- the REST API supports API-key authentication through the `x-goog-api-key` header;
- structured JSON output is supported;
- the existing Node.js cloud runtime can use native HTTPS requests without a provider SDK;
- provider selection remains isolated behind the VoiceBridge translation interface.

This is a Phase 1 test binding, not a permanent production provider decision.

## Privacy Restriction

Gemini free-tier prompts and responses may be used to improve Google products.

Therefore Phase 1 free-tier translation is restricted to:

- controlled public YouTube test content;
- synthetic test segments;
- content approved for external provider processing.

The free tier MUST NOT be used for private conversations, confidential meetings, personal communications, regulated content, or production user traffic.

Before production or private-content use, VoiceBridge MUST approve one of these paths:

- Gemini paid tier with reviewed data terms;
- another provider with acceptable privacy terms;
- an approved local translation engine.

## Translation Contract

The provider-neutral request contains:

- segment identifier;
- source language;
- target language;
- final English text;
- bounded previous final-segment context;
- request timestamp.

The normalized result contains:

- original segment identifier;
- provider identifier;
- translated Ukrainian text;
- translation latency;
- completion timestamp.

Provider-specific response objects MUST NOT be exposed to the browser.

## Processing Policy

- translate final STT segments only;
- never translate partial STT text;
- preserve final-segment order through a bounded sequential queue;
- keep at most four previous final English segments as disambiguation context;
- limit context to 3000 characters;
- limit one source segment to 2000 characters;
- use a 15-second provider timeout;
- do not retry automatically during Phase 1;
- emit a sanitized translation error without terminating audio capture or STT;
- retain recent translation text only in browser session state;
- do not persist provider prompts, responses, transcripts, or translations in VoiceBridge Cloud.

## Output Policy

The provider prompt MUST require:

- natural Ukrainian suitable for later speech synthesis;
- preservation of meaning, names, numbers, tone, and conversational intent;
- no explanation, commentary, Markdown, or source-text repetition;
- context used only for disambiguation;
- one structured result containing only the translation field.

The cloud adapter MUST validate structured output before publishing a translation event.

## Cost and Quota Policy

- Phase 1 uses a free-tier project without a linked billing account;
- automatic paid upgrade is prohibited;
- rate-limit or quota exhaustion produces a sanitized provider error;
- no automatic provider fallback is enabled;
- usage MUST be monitored during live tests;
- current pricing and model availability MUST be rechecked before production planning.

## Alternatives Considered

DeepL API Free:

- dedicated translation API;
- supports Ukrainian;
- includes a 500000-character monthly free limit;
- remains a future adapter candidate.

Microsoft Translator:

- supports English-to-Ukrainian translation;
- requires additional Azure account and resource configuration;
- remains a future adapter candidate.

Local translation model:

- strongest control over data handling;
- adds deployment size, compute, model-management, and latency work beyond the current Cloud First MVP;
- remains a future privacy-focused option.

## Consequences

Positive:

- no payment method is required for the Phase 1 translation test;
- implementation can use the existing cloud runtime and native HTTP support;
- structured output reduces parsing ambiguity;
- provider credentials remain cloud-side;
- browser and transport contracts remain provider-neutral.

Tradeoffs:

- the selected model is a preview model and may change;
- free-tier quotas are limited;
- free-tier content may be used to improve provider products;
- translation quality and latency require live validation;
- production privacy and billing decisions remain open.

## Validation Requirements

Milestone 5 does not pass until:

- `GEMINI_API_KEY` is configured only in Render;
- cloud startup reports translation configuration safely;
- final English segments produce ordered Ukrainian translations;
- translation latency is visible;
- provider failures are sanitized and do not terminate STT;
- a controlled live test produces understandable Ukrainian text;
- no key, raw provider response, or persisted translation is exposed.

## References

- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing
- https://ai.google.dev/gemini-api/docs/get-started
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/api
- https://developers.deepl.com/docs/resources/usage-limits
- https://developers.deepl.com/docs/getting-started/supported-languages
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-005_PHASE_1_STREAMING_STT_PROVIDER](ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-21 | Accepted Gemini 3.1 Flash-Lite for controlled Phase 1 English-to-Ukrainian translation |
