# VoiceBridge Phase 2 M6 Controlled End-to-End Acceptance

Status: COMPLETE - CONTROLLED LIVE ACCEPTANCE PASSED

Version: 1.1.0

Date: 2026-08-30

## 1. Objective

Close Phase 2 Universal Cloud Audio with a controlled end-to-end browser matrix on the accepted VoiceBridge runtime.

P2-M6 is an acceptance milestone. It did not add a new runtime feature.

## 2. Exact Accepted Baseline

Accepted browser runtime:

`VoiceBridge Extension 0.8.0`

Accepted artifact:

- artifact ID: `9722952002`;
- inner extension ZIP SHA-256: `87888745014ade34137905baf450cd9aaab15e3328bcf5a26cf540e83af844ed`.

Accepted provider policy:

- STT default: Gemini `gemini-3.5-transcribe-live`;
- STT rollback: AssemblyAI `universal-streaming-english`;
- translation primary: Azure Translator;
- translation fallback: Gemini;
- TTS: Azure Speech;
- accepted Ukrainian voice: `uk-UA-OstapNeural`;
- cloud-owned provider and language capability policy;
- browser PCM playback and ducking;
- bounded Stop behavior;
- no intentional user-content persistence;
- no automatic paid fallback.

P2-M6 plan PR:

`#47`

Plan merge baseline:

`4b23d13d35c4544adfa0f166280df7b5bd21348d`

Post-plan merge Validate:

`33287820911 - SUCCESS`

Live acceptance tracker:

`Issue #48 - completed`

## 3. Controlled Matrix Result

### M6-A - YouTube steady-state regression

Result: PASS.

Accepted carry-forward evidence from the same installed 0.8.0 runtime:

- Azure TTS voiced segments: `10`;
- played segments: `4`;
- queued audio after completion: `0 ms`;
- translated Ukrainian speech audibly confirmed;
- actual ducking manually confirmed;
- clean Stop/drain.

### M6-B - Non-YouTube video steady-state

Result: PASS.

Accepted Vimeo evidence:

- Audio: `5016` frames / `9,630,720` bytes;
- dropped: `0`;
- unacknowledged: `6`;
- Gemini STT: `6` final segments, about `835 ms`;
- Translation: `azure+gemini`, `6` final segments, about `286 ms`, pending `0`, retries `0`;
- Azure TTS: `5` voiced / `5` played, about `1037 ms`;
- final queued audio: `0 ms`;
- audible translated speech: PASS;
- ducking: PASS;
- clean Stop to `IDLE`.

### M6-C - Distinct speech-heavy non-YouTube source

Result: PASS.

TED speech-heavy run:

- frames sent: `12,946`;
- bytes sent: `24,856,320`;
- dropped: `70`;
- final unacknowledged: `6`;
- Gemini STT: `7` final segments, `2100 ms` recognition latency;
- Translation: `azure+gemini`, `7` finals, `289 ms`, pending `0`, retries `0`;
- Azure TTS: `6` voiced / `4` played, `815 ms`;
- final TTS pending `0`, buffered `0`, retries `0`;
- final queued audio `0 ms`;
- audible translated speech: PASS;
- ducking: PASS.

A visible `Ukrainian playback queue is full.` observation occurred under load, but bounded cleanup still completed and the terminal playback queue reached zero.

### M6-D - Stop during active speech

Result: PASS.

Combined with the TED run:

- one Stop issued while source speech and pipeline were active;
- no stuck ACTIVE/PAUSED/STOPPING/DRAINING state;
- translation pending `0`;
- TTS pending `0`;
- TTS buffered `0`;
- queued audio `0 ms` at terminal state;
- final session returned to `IDLE` / completed;
- approximate Stop-to-IDLE: `2-3 s`.

### M6-E - Stop with queued translated playback

Result: PASS.

YouTube backlog run before Stop:

- queued audio: `45,469 ms`;
- translated speech state: `READY`;
- Azure TTS voiced segments: `8`;
- played segments: `4`;
- playback: `PLAYING`;
- pending `0`, buffered `0`, retries `0`.

After one Stop:

- Stop-to-IDLE: approximately `7 s`;
- translated speech: `CLOSED`;
- Azure TTS voiced segments: `11`;
- played segments: `6`;
- playback: `COMPLETED`;
- pending `0`;
- buffered `0`;
- retries `0`;
- queued audio: `0 ms`;
- no stuck playback/drain state.

### M6-F - Source tab ends unexpectedly

Result: PASS.

Before source-tab closure:

- translated playback: `PLAYING`;
- queued audio: `55,386 ms`;
- Azure TTS voiced segments: `2`;
- pending `0`;
- buffered `0`.

Procedure and result:

- the captured source tab was closed without pressing Stop;
- runtime used the existing `audioTrack.onended -> stopCapture("TRACK_ENDED")` lifecycle path;
- automatic cleanup completed in approximately `45 s`;
- translated speech reached `CLOSED`;
- playback reached `COMPLETED`;
- pending `0`;
- buffered `0`;
- retries `0`;
- queued audio `0 ms`;
- reopening VoiceBridge on another ordinary tab showed session `IDLE`, Cloud `COMPLETED`, Languages `READY`;
- no second Stop was required.

## 4. Transport Interpretation

Small non-zero `Unacknowledged` or dropped-frame values are recorded as observations and are not silently discarded.

They are not blockers when:

- the session terminates normally;
- downstream queues drain;
- playback queue reaches zero;
- no pipeline state remains stuck;
- output remains usable in the controlled live run.

The M6-C dropped-frame count (`70`) remains an operational observation for future hardening, not a Phase 2 acceptance blocker.

## 5. Exit Gate

- M6-A: PASS
- M6-B: PASS
- M6-C: PASS
- M6-D: PASS
- M6-E: PASS
- M6-F: PASS

Controlled P2-M6 live acceptance is complete on VoiceBridge Extension `0.8.0`.

Phase 2 may be declared complete only after canonical architecture, roadmap, technology stack, project history, design status, and recovery/bootstrap documentation are synchronized and the resulting `main` commit passes final CI.

## 6. References

- `PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md`
- `PHASE_2_M5_CONFIGURABLE_LANGUAGE_UI.md`
- GitHub Issue `#48`
- GitHub PR `#47`
