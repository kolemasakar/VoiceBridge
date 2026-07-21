# Phase 1 Milestone 6 Ukrainian TTS and Browser Playback

Status: IMPLEMENTATION COMPLETE; CONTROLLED LIVE VALIDATION PENDING

Date: 2026-07-21

## Objective

Convert ordered final Ukrainian translations into understandable Ukrainian speech and play the speech in the browser while automatically lowering the original YouTube audio.

## Approved Provider

- provider: Gemini Developer API;
- model: `gemini-2.5-flash-preview-tts`;
- default voice: `Iapetus`;
- credential: existing cloud-only `GEMINI_API_KEY`;
- optional configuration: `GEMINI_TTS_MODEL` and `GEMINI_TTS_VOICE`.

Decision record:

`docs/adr/ADR-007_PHASE_1_TTS_PROVIDER.md`

## Implemented Runtime Flow

```text
Final Ukrainian translation
    |
    v
Bounded sequential TTS queue
    |
    v
Provider-neutral TtsProvider
    |
    v
Gemini Ukrainian PCM synthesis
    |
    v
Bounded ordered WebSocket audio events
    |
    v
Offscreen AudioContext playback queue
    |
    v
Automatic original-audio ducking
```

## Cloud Service 0.5.0

Implemented:

- provider-neutral TTS interface;
- disabled provider for safe not-configured operation;
- Gemini TTS REST adapter;
- configurable model and voice;
- Ukrainian prompt discipline;
- raw mono 16-bit PCM validation;
- fixed output metadata: 24000 Hz, one channel;
- 20-second provider timeout;
- maximum 4000 source characters;
- maximum 2 MiB provider audio response;
- ordered per-stream TTS queue;
- maximum 20 pending TTS operations;
- bounded 12288-byte PCM output chunks encoded in WebSocket JSON events;
- server WebSocket output-buffer control;
- TTS counts, bytes, audio duration, latency, errors, pending count, and drain state;
- 30-second graceful TTS drain on Stop;
- immediate cancellation after unexpected disconnect;
- no audio persistence.

Implemented events:

- `TTS_STATUS`;
- `TTS_ERROR`;
- `TTS_AUDIO_START`;
- `TTS_AUDIO_CHUNK`;
- `TTS_AUDIO_END`.

The original translation `segment_id` is preserved through every TTS event.

## Browser Extension 0.6.0

Implemented:

- Ukrainian PCM decoding into Web Audio buffers;
- ordered buffer scheduling;
- independent Ukrainian gain node;
- real Ukrainian volume control;
- automatic original-audio ducking during queued or active Ukrainian playback;
- smooth original-audio gain transitions;
- restoration of the configured background level after playback drains;
- maximum 45 seconds of queued playback;
- visible TTS provider, voice, status, segment count, latency, audio bytes, playback status, and queued duration;
- 35-second local playback drain during Stop;
- cleanup of source nodes, buffers, gain nodes, timers, streams, and AudioContext;
- manual ducking test retained for diagnostics.

## Shutdown Policy

On explicit Stop:

1. browser stops sending captured PCM;
2. cloud closes STT;
3. cloud drains accepted translations;
4. cloud drains accepted TTS operations;
5. browser receives the final bounded PCM chunks;
6. cloud stream closes cleanly;
7. browser finishes scheduled Ukrainian playback within its bound;
8. browser restores original gain and releases audio resources;
9. Cloud API session moves to `COMPLETED`.

Unexpected disconnect cancels provider work and browser playback immediately.

## Error Isolation

TTS errors do not terminate:

- tab capture;
- audio transport;
- AssemblyAI STT;
- Gemini translation.

Sanitized TTS categories include:

- `TTS_NOT_CONFIGURED`;
- `TTS_TIMEOUT`;
- `TTS_RATE_LIMITED`;
- `TTS_INVALID_RESPONSE`;
- `TTS_PROVIDER_REJECTED`;
- `TTS_PROVIDER_FAILED`;
- `TTS_QUEUE_FULL`;
- `TTS_DRAIN_TIMEOUT`.

No key, prompt, raw provider response, transcript, translation, or PCM content is logged or persisted.

## Automated Validation

Automated tests cover:

- TTS configuration defaults and validation;
- Gemini request construction;
- voice selection;
- base64 PCM response normalization;
- audio format, sample rate, channel count, byte length, and duration;
- translation-to-TTS segment identity preservation;
- bounded ordered audio chunk events;
- completion summary metrics;
- TTS failure isolation from STT and translation;
- browser JavaScript syntax;
- extension manifest validation;
- extension packaging;
- ASCII documentation validation.

Live provider requests are not made during automated tests.

## Privacy Boundary

The Gemini free tier is restricted to controlled public YouTube or synthetic test content approved for provider processing.

Private, confidential, regulated, or production content is prohibited.

## Controlled Live Validation

The live test must confirm:

- cloud service `0.5.0` deploys successfully;
- browser extension `0.6.0` loads successfully;
- TTS provider is `gemini`;
- voice is `Iapetus` unless an approved override is used;
- final Ukrainian translations generate ordered audio segments;
- Ukrainian speech is understandable;
- TTS latency is visible;
- Ukrainian volume changes playback level;
- original YouTube audio ducks during Ukrainian speech;
- original audio restores after speech;
- dropped capture frames remain zero or within the approved limit;
- Stop drains queues and ends in `IDLE`, `COMPLETED`, and `CLOSED` states;
- no provider secret or persisted content is exposed.

## Exit Criterion

Milestone 6 passes when a controlled public English YouTube video produces ordered understandable Ukrainian speech in the browser with functional volume control, automatic ducking, bounded queues, visible latency, clean shutdown, and no secret or content persistence.

Current result:

IMPLEMENTATION COMPLETE. CONTROLLED LIVE VALIDATION PENDING.

## References

- [ADR-007_PHASE_1_TTS_PROVIDER](../adr/ADR-007_PHASE_1_TTS_PROVIDER.md)
- [ADR-006_PHASE_1_TRANSLATION_PROVIDER](../adr/ADR-006_PHASE_1_TRANSLATION_PROVIDER.md)
- [PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION](PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md)
- [Cloud Service README](../../src/cloud/README.md)
- [Browser Extension README](../../src/browser_extension/README.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.1.0 | 2026-07-21 | Implemented cloud TTS, browser PCM playback, automatic ducking, metrics, tests, and validation plan |
