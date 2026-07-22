# Phase 1 Milestone 6 Ukrainian TTS and Browser Playback

Status: PASSED

Date: 2026-07-22

## Objective

Convert ordered final Ukrainian translations into understandable Ukrainian speech and play the speech in the browser while automatically lowering and restoring the original YouTube audio.

## Final Provider Decision

Primary TTS provider:

- provider: Azure Speech;
- region: `eastus`;
- voice: `uk-UA-OstapNeural`;
- output: raw mono 16-bit PCM at 24000 Hz;
- credential: cloud-only `AZURE_SPEECH_KEY`.

Gemini TTS remains implemented behind the provider-neutral boundary but is not selected for the validated runtime.

Decision records:

- `docs/adr/ADR-007_PHASE_1_TTS_PROVIDER.md`;
- `docs/adr/ADR-008_AZURE_TTS_PROVIDER.md`.

## Validated Runtime Flow

```text
Final Ukrainian translation
    -> bounded sequential TTS queue
    -> provider-neutral TtsProvider
    -> Azure Speech Ukrainian PCM synthesis
    -> bounded ordered WebSocket audio events
    -> offscreen AudioContext playback queue
    -> automatic original-audio ducking
    -> original-audio restoration
```

## Accepted Runtime Baseline

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- Azure Speech voice `uk-UA-OstapNeural`;
- implementation baseline commit `1d7e82ecb122ab953190f9b2fdc8e7fbea86840c`.

## Cloud TTS Capabilities

- provider-neutral TTS interface;
- Azure Speech REST adapter;
- cloud-only subscription-key authentication;
- regional endpoint selection;
- SSML language `uk-UA`;
- XML escaping;
- output normalization to mono `pcm_s16le` at 24000 Hz;
- provider timeout and response-size bounds;
- ordered per-stream TTS queue;
- bounded pending work and retries;
- bounded PCM WebSocket chunks;
- TTS counts, bytes, latency, errors, pending count, and drain state;
- graceful TTS drain during explicit Stop;
- immediate cancellation after unexpected disconnect;
- no synthesized-audio persistence.

## Browser Playback Capabilities

- Ukrainian PCM decoding into Web Audio buffers;
- ordered buffer scheduling;
- independent Ukrainian gain node;
- real Ukrainian volume control;
- automatic original-audio ducking during queued or active Ukrainian playback;
- smooth original-audio gain transitions;
- restoration of the configured original level after playback drains;
- bounded playback queue;
- visible provider, voice, status, segment count, latency, bytes, playback state, and queued duration;
- bounded local playback drain during Stop;
- cleanup of source nodes, buffers, gain nodes, timers, streams, and AudioContext;
- manual ducking test retained for diagnostics.

## Stop State Correction

Browser extension `0.6.2` corrected the prior multi-click Stop behavior.

Accepted transition:

```text
ACTIVE -> STOPPING -> IDLE
```

Validated behavior:

- one Stop click starts the complete shutdown sequence;
- Start, Stop, and manual ducking controls remain disabled while stopping;
- repeated Stop commands are ignored;
- capture stops before cloud draining;
- accepted STT, translation, TTS, and playback work drains within bounds;
- original gain is restored;
- browser resources are released;
- final cloud and provider states close cleanly.

## Automated Validation

Automated checks cover:

- TTS configuration defaults and validation;
- Azure request construction and regional authentication;
- SSML and XML escaping;
- PCM format, sample rate, channel count, byte length, and duration;
- HTTP 429 and temporary provider failure mapping;
- segment identity preservation;
- bounded ordered audio chunk events;
- completion summary metrics;
- TTS failure isolation;
- browser JavaScript syntax;
- extension manifest version `0.6.2`;
- extension packaging;
- ASCII Markdown validation.

## Live Acceptance Evidence

Final controlled acceptance session:

- English final segments: 28;
- Ukrainian final segments: 28;
- voiced segments: 28;
- played segments: 28;
- TTS retries: 0;
- TTS pending: 0;
- TTS buffered: 0;
- queued audio after completion: 0 ms;
- playback final state: `COMPLETED`;
- final observed TTS latency: 190 ms;
- one Stop click returned capture to `IDLE`.

Extended Azure Speech session:

- duration greater than 12 minutes;
- English final segments: 108;
- Ukrainian final segments: 108;
- voiced segments: 108;
- played segments: 108;
- TTS retries: 0;
- pending and buffered operations after Stop: 0;
- playback final state: `COMPLETED`.

Observed values are controlled-test evidence and are not production service-level guarantees.

## User Acceptance

The project owner confirmed:

- Ukrainian speech remained understandable throughout the test;
- original audio was automatically reduced during Ukrainian speech;
- original audio returned after Ukrainian speech;
- Ukrainian volume control affected playback;
- one Stop click completed shutdown normally.

## Privacy Boundary

- Azure Speech key remains only in cloud environment configuration;
- browser clients do not receive provider keys;
- private, confidential, regulated, or production content is prohibited during the controlled MVP test stage;
- VoiceBridge does not intentionally persist raw audio, transcript text, translation text, provider responses, SSML, or synthesized PCM.

## Exit Result

Milestone 6 exit criterion is satisfied.

The user hears ordered understandable Ukrainian translated speech during YouTube playback with functional Ukrainian volume control, automatic original-audio ducking and restoration, bounded queues, visible latency, one-press Stop, clean cleanup, and no secret exposure.

Final result:

`PHASE_1_MILESTONE_6_PASSED`

## References

- [Phase 1 MVP Validation](PHASE_1_MVP_VALIDATION.md)
- [Initial TTS Provider ADR](../adr/ADR-007_PHASE_1_TTS_PROVIDER.md)
- [Azure Speech TTS ADR](../adr/ADR-008_AZURE_TTS_PROVIDER.md)
- [Azure Translator ADR](../adr/ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER.md)
- [Milestone 5 Translation Integration](PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md)
- [Cloud Service README](../../src/cloud/README.md)
- [Browser Extension README](../../src/browser_extension/README.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-22 | Passed Azure Speech TTS, browser playback, ducking, restoration, endurance, and one-press Stop validation |
| 0.1.0 | 2026-07-21 | Implemented initial Gemini TTS, browser PCM playback, automatic ducking, metrics, tests, and validation plan |
