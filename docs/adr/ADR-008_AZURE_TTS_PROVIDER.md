# ADR-008 Azure Speech TTS Provider

Status: ACCEPTED

Date: 2026-07-21

Decision Owners: VoiceBridge project

## Context

Milestone 6 live testing validated browser PCM playback and automatic ducking, but Gemini preview TTS exhausted provider quota during continuous sessions. Translation continued while Ukrainian speech stopped after a small number of segments, even after bounded batching, retry, and backoff were added.

VoiceBridge requires a stable Ukrainian neural TTS service with predictable request behavior and a controlled free test allowance.

This decision supersedes ADR-007 as the active Phase 1 TTS provider binding. The provider-neutral interface introduced by ADR-007 remains valid.

## Decision

Use Azure Speech as the primary Phase 1 TTS provider.

Initial configuration:

- provider selector: `TTS_PROVIDER=azure`;
- region: `AZURE_SPEECH_REGION=eastus`;
- voice: `AZURE_TTS_VOICE=uk-UA-OstapNeural`;
- credential: `AZURE_SPEECH_KEY`;
- output format: `raw-24khz-16bit-mono-pcm`;
- endpoint: the regional Azure Speech REST text-to-speech endpoint.

Gemini TTS remains implemented as a selectable fallback adapter, but automatic cross-provider fallback is disabled.

## Rationale

- Azure Speech provides native Ukrainian neural voices;
- raw mono 24000 Hz 16-bit PCM matches the existing browser playback pipeline;
- the Azure resource is deployed in East US near the Render Virginia service;
- the provider uses a separate revocable cloud-only credential;
- the existing provider-neutral TTS contract and browser extension require no protocol change;
- the Free F0 resource is suitable for controlled validation.

## Security

- `AZURE_SPEECH_KEY` MUST remain only in Render environment variables;
- the key MUST NOT be committed, logged, sent to the browser, or shown in screenshots;
- provider errors MUST remain sanitized;
- synthesized PCM MUST remain transient and MUST NOT be persisted.

## Runtime Contract

Azure output is normalized to:

- provider: `azure`;
- audio format: `pcm_s16le`;
- sample rate: `24000` Hz;
- channels: `1`;
- bounded PCM bytes and duration metadata;
- existing ordered `TTS_AUDIO_START`, `TTS_AUDIO_CHUNK`, and `TTS_AUDIO_END` events.

## Failure Policy

- HTTP 429 maps to `TTS_RATE_LIMITED` and honors `Retry-After`;
- temporary HTTP 5xx responses are retryable;
- authorization and validation failures are sanitized as provider rejection;
- TTS failure does not terminate audio capture, STT, or translation;
- automatic cross-provider fallback is disabled to keep behavior deterministic.

## Validation Requirements

The Azure integration must pass:

- configuration validation;
- SSML construction and XML escaping;
- subscription-key header validation;
- raw PCM normalization;
- Retry-After mapping;
- existing ordered browser audio events;
- a continuous live public YouTube test with sustained Ukrainian speech;
- clean bounded shutdown and zero secret exposure.

## References

- https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
- https://learn.microsoft.com/azure/ai-services/speech-service/language-support
- [ADR-007_PHASE_1_TTS_PROVIDER](ADR-007_PHASE_1_TTS_PROVIDER.md)
- [PHASE_1_MILESTONE_6_TTS_PLAYBACK](../phases/PHASE_1_MILESTONE_6_TTS_PLAYBACK.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-21 | Selected Azure Speech as primary Phase 1 Ukrainian TTS provider |
