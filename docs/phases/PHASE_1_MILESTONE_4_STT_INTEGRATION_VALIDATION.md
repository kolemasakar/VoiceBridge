# Phase 1 Milestone 4 STT Integration Validation

Status: LIVE SMOKE VALIDATION PASSED; TEN-MINUTE ENDURANCE VALIDATION PENDING

Date: 2026-07-19

## Objective

Convert the validated browser audio stream into ordered partial and final English transcripts through a cloud-side STT provider while preserving bounded memory use, provider-secret isolation, and a no-payment Phase 1 test environment.

## Implemented Components

Cloud service 0.3.1:

- provider-neutral `SttProvider` boundary;
- AssemblyAI Universal-Streaming English adapter;
- cloud-only `ASSEMBLYAI_API_KEY` configuration;
- aggregation of five nominal 20 millisecond frames into 100 millisecond provider packets;
- ordered `TRANSCRIPT_PARTIAL` and `TRANSCRIPT_FINAL` events;
- confidence and audio-timing fields;
- recognition-latency measurement;
- sanitized status and error events;
- bounded provider output buffer;
- graceful AssemblyAI `Terminate` and `Termination` handling;
- no cloud audio or transcript persistence.

Browser extension 0.4.1:

- STT provider and status display;
- partial English transcript display;
- bounded recent final transcript display;
- final-segment counter;
- recognition-latency display;
- visible STT errors;
- browser session-only transcript state.

## Automated Validation

- TypeScript compilation: PASSED;
- Node.js automated tests: 12 of 12 PASSED;
- fake-provider audio forwarding: PASSED;
- ordered partial transcript event: PASSED;
- ordered final transcript event: PASSED;
- recognition-latency propagation: PASSED;
- transcript summary metrics: PASSED;
- clean provider close: PASSED.

## Deployment Configuration

Active Render service:

`voicebridge-cloud-us`

Active endpoint:

`https://voicebridge-cloud-us.onrender.com`

Configured secrets:

- `TEST_ACCESS_TOKEN`;
- `ASSEMBLYAI_API_KEY`.

Secret values MUST NOT be added to GitHub, the extension, screenshots, documentation, or chat.

No payment method is required for the Phase 1 AssemblyAI test environment. If free credit is exhausted, STT is expected to stop with a provider error. Phase 1 MUST NOT enable paid usage or automatic top-up.

## Live Browser Smoke Validation

Validated on 2026-07-19 against the Virginia deployment.

Observed evidence:

- Chrome extension version `0.4.1` confirmed by the user;
- `Save and test` returned cloud state `READY`;
- capture, audio stream, and STT reached `ACTIVE`;
- STT provider displayed `assemblyai`;
- partial English text appeared during speech;
- final English text remained ordered and readable;
- at least two final segments were recorded;
- observed recognition latency was 618 milliseconds;
- sample rate was 48000 Hz;
- channel metadata reported two source channels before mono STT processing;
- final observed stream counters were 3661 frames and 7029120 bytes;
- dropped frames remained zero;
- final unacknowledged count was one;
- no STT error was visible during the normal test;
- Stop returned capture to `IDLE`;
- cloud session and audio stream returned to `COMPLETED`;
- STT returned to `CLOSED`;
- no secret value was exposed in the recorded evidence.

Result:

LIVE SMOKE VALIDATION PASSED.

## Remaining Exit Validation

The recorded 3661 nominal 20 millisecond frames represent approximately 73 seconds of audio. The existing Milestone 4 exit criterion requires at least ten minutes.

Remaining checks:

- run one continuous AssemblyAI transcription session for at least ten minutes;
- confirm dropped frames remain zero or document any controlled loss;
- confirm buffering remains bounded;
- record transcript quality across the approved test set;
- record AssemblyAI free-credit usage;
- confirm clean Stop and zero secret exposure after the endurance run;
- rotate the shared test token after the active test period.

## Exit Criterion

Live English speech from a YouTube tab produces readable partial and final transcripts for at least ten minutes without unbounded buffering, payment configuration, or secret exposure.

Current result:

SMOKE TEST PASSED. FULL MILESTONE EXIT PENDING TEN-MINUTE ENDURANCE VALIDATION.

## References

- [ADR-005_PHASE_1_STREAMING_STT_PROVIDER](../adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [ADR-004_PHASE_1_STREAMING_TRANSPORT](../adr/ADR-004_PHASE_1_STREAMING_TRANSPORT.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](PHASE_1_CLOUD_YOUTUBE_MVP.md)
- [Browser Extension README](../../src/browser_extension/README.md)
- [Cloud README](../../src/cloud/README.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.3.0 | 2026-07-19 | Recorded the first live AssemblyAI browser smoke validation and retained the ten-minute endurance requirement |
| 0.2.0 | 2026-07-19 | Replaced the initial STT adapter with AssemblyAI Free and preserved pending live validation |
| 0.1.0 | 2026-07-19 | Recorded the provider-neutral STT implementation and pending live validation |
