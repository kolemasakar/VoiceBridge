# ADR-005: Phase 1 Streaming STT Provider

Status: Accepted

Date: 2026-07-19

Decision Owners: VoiceBridge project

## Context

Milestone 4 requires live English speech recognition for the existing browser-to-cloud PCM stream. The solution must preserve the Cloud First boundary, keep provider credentials out of the browser, return partial and final text, expose latency and errors, and avoid coupling the VoiceBridge transport to one vendor API.

The existing transport sends mono signed 16-bit little-endian PCM in nominal 20 millisecond frames at the active browser AudioContext sample rate, observed as 48000 Hz during Milestone 3 validation.

## Decision

Use Deepgram Nova-3 monolingual streaming as the Phase 1 STT provider.

Integrate Deepgram behind the VoiceBridge cloud-side `SttProvider` interface. Browser clients continue to connect only to VoiceBridge Cloud and never connect directly to Deepgram.

The default recognition settings are:

- model: `nova-3`;
- language: `en-US`;
- encoding: `linear16`;
- channels: `1`;
- sample rate: the validated browser stream rate;
- interim results: enabled;
- endpointing: 300 milliseconds;
- utterance end: 1000 milliseconds;
- smart formatting and punctuation: enabled.

## Rationale

Deepgram was selected for the Phase 1 implementation because:

- its streaming API accepts raw `linear16` audio over WebSocket;
- the existing 48000 Hz PCM stream can be forwarded without a new browser codec;
- partial and final results are available in the same streaming connection;
- a standard WebSocket client is already present in the cloud runtime;
- the provider credential can remain in Render secret configuration;
- future STT alternatives can implement the same internal interface.

This is a Phase 1 provider binding, not a permanent production exclusivity decision.

## Cloud Event Mapping

VoiceBridge maps provider activity to stable project events:

- `STT_STATUS`;
- `TRANSCRIPT_PARTIAL`;
- `TRANSCRIPT_FINAL`;
- `STT_ERROR`.

Transcript events contain:

- provider name;
- English text;
- final and speech-final flags;
- confidence when available;
- audio start and duration;
- measured recognition latency.

Provider-specific response objects are not exposed to the browser.

## Credential Binding

Render environment variable:

```text
DEEPGRAM_API_KEY
```

The key:

- MUST remain in Render secret configuration;
- MUST NOT be committed;
- MUST NOT be sent to the browser;
- MUST NOT be written to logs;
- SHOULD be created for the VoiceBridge test environment and revoked after testing if no longer needed.

If the key is missing, the cloud service remains healthy and reports STT as `NOT_CONFIGURED`. Audio transport validation remains available, but no transcript is produced.

## Buffering and Failure Behavior

- audio is forwarded in arrival order;
- provider output buffering is bounded;
- provider backpressure terminates the stream instead of silently creating an incomplete transcript;
- clean Stop sends Deepgram `CloseStream` before completing the VoiceBridge stream;
- provider errors are mapped to sanitized VoiceBridge errors;
- automatic provider reconnect and audio replay are not implemented in Phase 1.

## Data Handling

- VoiceBridge Cloud does not persist audio;
- VoiceBridge Cloud does not persist transcripts;
- the extension keeps only the most recent 20 final segments, bounded to 8000 displayed characters;
- browser transcript state uses session storage and is not synchronized through the browser account.

Deepgram processes streamed audio as the selected external STT provider. Provider-side data controls and production privacy settings require a later production review.

## Cost Baseline

The official Deepgram material reviewed on 2026-07-19 lists Nova-3 monolingual streaming at USD 0.29 per audio hour. The test account includes free credit according to the Deepgram getting-started documentation.

Current pricing MUST be rechecked before production budgeting.

## Alternatives Considered

AssemblyAI:

- lower published streaming price;
- requires larger recommended audio chunks than the current 20 millisecond frames;
- remains a valid future adapter candidate.

Google Cloud Speech-to-Text:

- mature managed service;
- streaming uses a gRPC-oriented integration and additional cloud identity setup;
- adds more Phase 1 integration work than required for the current Node.js WebSocket service.

## Consequences

Positive:

- fastest path from the validated PCM stream to live text;
- provider credentials remain cloud-side;
- browser transport remains provider-neutral;
- partial, final, latency, and error evidence become visible;
- no new audio conversion dependency is required.

Tradeoffs:

- an external paid provider is introduced;
- live validation requires a Deepgram account and API key;
- provider availability affects transcription;
- reconnect and replay remain future work;
- production privacy, residency, quotas, and billing controls remain undecided.

## References

- https://developers.deepgram.com/reference/speech-to-text/listen-streaming
- https://developers.deepgram.com/docs/encoding
- https://developers.deepgram.com/docs/sample-rate
- https://developers.deepgram.com/docs/interim-results
- https://developers.deepgram.com/docs/endpointing
- https://developers.deepgram.com/docs/close-stream
- https://developers.deepgram.com/docs/create-additional-api-keys
- https://developers.deepgram.com/guides/fundamentals/make-your-first-api-request
- https://deepgram.com/enterprise-accelerator-program
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-004_PHASE_1_STREAMING_TRANSPORT](ADR-004_PHASE_1_STREAMING_TRANSPORT.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-19 | Accepted Deepgram Nova-3 behind a provider-neutral cloud STT boundary |
