# Phase 1 Milestone 4 Live STT Smoke Validation

Date: 2026-07-19

Status: PASSED

## Scope

Record the first live browser validation of VoiceBridge extension 0.4.1 with AssemblyAI streaming STT through the Virginia Render deployment.

## Validated Configuration

- repository baseline commit: `8c92d9194e2262f598286d0c505e6c80382fc4df`;
- cloud service version: `0.3.1`;
- browser extension version: `0.4.1`;
- active endpoint: `https://voicebridge-cloud-us.onrender.com`;
- STT provider: `assemblyai`;
- source: English YouTube tab audio.

## Evidence

- authenticated connection returned `READY`;
- audio stream and STT reached `ACTIVE`;
- partial and final English transcript text appeared;
- at least two final segments were recorded;
- observed recognition latency was 618 milliseconds;
- sample rate was 48000 Hz;
- final counters showed 3661 frames and 7029120 bytes;
- dropped frames remained zero;
- Stop returned capture to `IDLE`;
- cloud and stream returned to `COMPLETED`;
- STT returned to `CLOSED`;
- no secret value was recorded.

## Result

The first live AssemblyAI browser smoke validation passed.

The observed frame count corresponds to approximately 73 seconds at the nominal 20 millisecond frame duration. The separate ten-minute Milestone 4 endurance exit validation remains pending.

## Security

- `TEST_ACCESS_TOKEN` remained masked in the browser UI;
- `ASSEMBLYAI_API_KEY` remained cloud-side;
- neither secret is included in this record;
- the shared test token must be rotated after the active validation period.
