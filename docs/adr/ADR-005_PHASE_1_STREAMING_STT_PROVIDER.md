# ADR-005: Phase 1 Streaming STT Provider

Status: Accepted

Date: 2026-07-19

Decision Owners: VoiceBridge project

## Context

Milestone 4 requires live English speech recognition for the existing browser-to-cloud PCM stream. The solution must preserve the Cloud First boundary, keep provider credentials out of the browser, return partial and final text, expose latency and errors, avoid coupling the VoiceBridge transport to one vendor API, and require no payment method during Phase 1 testing.

The existing transport sends mono signed 16-bit little-endian PCM in nominal 20 millisecond frames at the active browser AudioContext sample rate, observed as 48000 Hz during Milestone 3 validation.

## Decision

Use AssemblyAI Universal-Streaming English on the AssemblyAI free tier as the Phase 1 STT provider.

Integrate AssemblyAI behind the VoiceBridge cloud-side `SttProvider` interface. Browser clients continue to connect only to VoiceBridge Cloud and never connect directly to AssemblyAI.

The default recognition settings are:

- endpoint: `wss://streaming.assemblyai.com/v3/ws`;
- model: `universal-streaming-english`;
- language: English;
- encoding: signed PCM16 little-endian;
- channels: `1`;
- sample rate: the validated browser stream rate;
- formatted turns: enabled;
- partial transcript: `Turn` with `end_of_turn: false`;
- final transcript: `Turn` with both `end_of_turn: true` and `turn_is_formatted: true`.

VoiceBridge combines five nominal 20 millisecond browser frames into one 100 millisecond provider packet. This stays within the provider's documented 50 to 1000 millisecond packet range without changing the browser transport protocol.

## Rationale

AssemblyAI was selected because:

- an account can start without a credit card;
- the published free tier includes streaming transcription;
- exhausted free credit stops API access instead of creating automatic paid usage when no payment method is added;
- its v3 streaming API accepts raw PCM16 audio over WebSocket;
- partial and final turns are available in the same connection;
- the existing 48000 Hz PCM stream requires no new browser codec;
- the provider credential remains in Render secret configuration;
- future STT alternatives can implement the same internal interface.

This is a Phase 1 free-test binding, not a permanent production provider or pricing decision.

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
- average word confidence when available;
- audio start and duration;
- measured recognition latency.

Provider-specific response objects are not exposed to the browser.

## Credential Binding

Render environment variable:

```text
ASSEMBLYAI_API_KEY
```

The key:

- MUST remain in Render secret configuration;
- MUST NOT be committed;
- MUST NOT be sent to the browser;
- MUST NOT be written to logs;
- SHOULD be created for the VoiceBridge test environment and revoked after testing if no longer needed.

No payment method is added during Phase 1 testing. If free credit is exhausted, STT stops and VoiceBridge reports a sanitized provider error. It MUST NOT switch to paid usage automatically.

If the key is missing, the cloud service remains healthy and reports STT as `NOT_CONFIGURED`. Audio transport validation remains available, but no transcript is produced.

## Buffering and Failure Behavior

- audio is forwarded in arrival order;
- five nominal 20 millisecond frames are aggregated into one 100 millisecond provider packet;
- provider output buffering is bounded;
- provider backpressure terminates the stream instead of silently creating an incomplete transcript;
- clean Stop sends AssemblyAI `Terminate`, waits for `Termination`, and then completes the VoiceBridge stream;
- provider errors are mapped to sanitized VoiceBridge errors;
- automatic provider reconnect and audio replay are not implemented in Phase 1.

## Data Handling

- VoiceBridge Cloud does not persist audio;
- VoiceBridge Cloud does not persist transcripts;
- the extension keeps only the most recent 20 final segments, bounded to 8000 displayed characters;
- browser transcript state uses session storage and is not synchronized through the browser account.

AssemblyAI processes streamed audio as the selected external STT provider. Provider-side data controls and production privacy settings require a later production review.

## Free-Tier Baseline

The official AssemblyAI pricing material reviewed on 2026-07-19 states that no credit card is required and the free tier includes up to 333 hours of streaming transcription. The support material describes the trial as up to USD 50 in audio credit and states that API access requires an upgrade after the credit is exhausted.

The account remains without a payment method during Phase 1. Pricing and free-tier conditions MUST be rechecked before production budgeting.

## Alternatives Considered

Google Cloud Speech-to-Text:

- recurring limited free usage is available;
- streaming uses a gRPC-oriented integration and additional cloud identity setup;
- adds more Phase 1 integration work than the current Node.js WebSocket adapter.

Cloudflare Workers AI:

- has a daily free allocation;
- introduces another hosting account and a different inference boundary;
- live streaming behavior is less direct for the current WebSocket design.

## Consequences

Positive:

- Phase 1 live STT testing requires no payment method;
- provider credentials remain cloud-side;
- browser transport remains provider-neutral;
- partial, final, latency, and error evidence become visible;
- no new audio conversion dependency is required.

Tradeoffs:

- free credit is finite and is not a permanent production contract;
- provider availability affects transcription;
- reconnect and replay remain future work;
- production privacy, residency, quotas, and billing controls remain undecided.

## References

- https://www.assemblyai.com/pricing/
- https://support.assemblyai.com/articles/5370767329-can-i-sign-up-for-free
- https://www.assemblyai.com/docs/streaming/guides/v2_to_v3_migration_js
- https://www.assemblyai.com/docs/streaming/message-sequence
- https://www.assemblyai.com/docs/universal-streaming/turn-detection
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-004_PHASE_1_STREAMING_TRANSPORT](ADR-004_PHASE_1_STREAMING_TRANSPORT.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-07-19 | Replaced the initial provider choice with AssemblyAI Free and prohibited automatic paid usage |
| 1.0.0 | 2026-07-19 | Established the provider-neutral cloud STT boundary |
