# Phase 1 Milestone 4 STT Integration Validation

Status: PASSED

Date: 2026-07-21

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

## Initial Live Browser Smoke Validation

The first live AssemblyAI browser test validated the complete streaming path before the endurance run.

Observed evidence:

- Chrome extension version `0.4.1` confirmed by the user;
- `Save and test` returned cloud state `READY`;
- capture, audio stream, and STT reached `ACTIVE`;
- STT provider displayed `assemblyai`;
- partial and final English text appeared;
- observed recognition latency was 618 milliseconds;
- sample rate was 48000 Hz;
- dropped frames remained zero;
- Stop returned capture to `IDLE`, the cloud session and audio stream to `COMPLETED`, and STT to `CLOSED`.

Result:

LIVE SMOKE VALIDATION PASSED.

## Ten-Minute Live Endurance Validation

A second continuous AssemblyAI transcription session was executed for more than ten minutes.

Active-state evidence recorded at 10 minutes 23 seconds:

- capture state: `ACTIVE`;
- cloud connection: `ACTIVE`;
- audio stream: `ACTIVE`;
- English transcript: `ACTIVE`;
- STT provider: `assemblyai`;
- frames sent: `31150`;
- bytes sent: `59808000`;
- dropped frames: `0`;
- unacknowledged frames: `10`;
- final transcript segments: `93`;
- recognition latency: `857` milliseconds;
- final English text remained ordered and readable;
- no visible STT error occurred.

Final evidence after Stop:

- capture state: `IDLE`;
- cloud connection: `COMPLETED`;
- audio stream: `COMPLETED`;
- English transcript: `CLOSED`;
- provider remained `assemblyai`;
- final frames sent: `32857`;
- final bytes sent: `63085440`;
- dropped frames: `0`;
- final unacknowledged frames: `7`;
- audio metadata was released;
- Stop control became disabled;
- no secret value was exposed in the recorded evidence.

Result:

TEN-MINUTE LIVE ENDURANCE VALIDATION PASSED.

## Exit Criterion Assessment

Exit criterion:

Live English speech from a YouTube tab produces readable partial and final transcripts for at least ten minutes without unbounded buffering, payment configuration, or secret exposure.

Assessment:

- continuous runtime exceeded ten minutes;
- English partial and final transcription remained active;
- final text remained ordered and readable;
- client acknowledgement count remained bounded;
- dropped frames remained zero;
- cloud, stream, STT, and browser resources closed cleanly;
- provider secrets remained cloud-side;
- no payment configuration or automatic top-up was enabled.

Current result:

MILESTONE 4 PASSED.

## Follow-Up Actions

- activate Milestone 5 - English-to-Ukrainian Translation Integration;
- evaluate and approve a translation provider;
- preserve the provider-neutral cloud adapter boundary;
- define segment ordering and translation-context policy;
- rotate the shared test token before the next shared test period;
- continue monitoring AssemblyAI free-credit usage.

## References

- [ADR-005_PHASE_1_STREAMING_STT_PROVIDER](../adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [ADR-004_PHASE_1_STREAMING_TRANSPORT](../adr/ADR-004_PHASE_1_STREAMING_TRANSPORT.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](PHASE_1_CLOUD_YOUTUBE_MVP.md)
- [Browser Extension README](../../src/browser_extension/README.md)
- [Cloud README](../../src/cloud/README.md)
- [Live Endurance History Record](../history/PHASE_1_MILESTONE_4_ENDURANCE_VALIDATION_2026-07-21.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 0.4.0 | 2026-07-21 | Completed the ten-minute AssemblyAI endurance validation and passed Milestone 4 |
| 0.3.0 | 2026-07-19 | Recorded the first live AssemblyAI browser smoke validation and retained the ten-minute endurance requirement |
| 0.2.0 | 2026-07-19 | Replaced the initial STT adapter with AssemblyAI Free and preserved pending live validation |
| 0.1.0 | 2026-07-19 | Recorded the provider-neutral STT implementation and pending live validation |
