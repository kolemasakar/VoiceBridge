# VoiceBridge Phase 2 M6 Controlled End-to-End Acceptance

Status: ACTIVE - CONTROLLED LIVE ACCEPTANCE

Date: 2026-08-30

## 1. Objective

Close Phase 2 Universal Cloud Audio with a controlled end-to-end browser matrix that exercises multiple source classes and lifecycle boundaries on the accepted VoiceBridge runtime.

P2-M6 is an acceptance milestone. It does not add a new runtime feature unless a test exposes a concrete defect that must be repaired before Phase 2 can close.

## 2. Entry Gate

P2-M5 is COMPLETE.

Current main baseline:

`5e7cc79bbd10a96e43e07107037310af4f454c8c`

Post-P2-M5 closure Validate:

`33287638998 - SUCCESS`

Accepted browser runtime:

`VoiceBridge Extension 0.8.0`

Exact accepted artifact from P2-M5:

- artifact ID: `9722952002`;
- GitHub artifact archive digest: `sha256:049bf582f427b44a987c99cb3bfa60bbd67b1254ee208eb54a1db3ecf8e7da9f`;
- inner extension ZIP SHA-256: `87888745014ade34137905baf450cd9aaab15e3328bcf5a26cf540e83af844ed`.

The installed 0.8.0 artifact may be reused for P2-M6. Comparing accepted runtime commit `eba77183bee29621aa6c7cb859737a10edb6e4d4` to current main `5e7cc79bbd10a96e43e07107037310af4f454c8c` shows only P2-M5 documentation changed; browser and cloud runtime files did not change.

## 3. Accepted Provider Baseline

P2-M6 MUST preserve:

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
- no automatic paid fallback;
- existing permission boundary.

## 4. Controlled Matrix

### M6-A - YouTube steady-state regression

Purpose:
Confirm the accepted Phase 1 source remains functional through the final Phase 2 runtime.

Recent P2-M5 evidence MAY be carried forward because the exact same 0.8.0 artifact remains installed and no runtime code changed after that acceptance.

Required evidence:

- audio frames and drops;
- Gemini STT finals;
- translation finals;
- Azure TTS voiced segments;
- played segments greater than zero;
- audible translated speech;
- actual ducking;
- clean Stop/drain.

### M6-B - Non-YouTube video steady-state

Purpose:
Confirm generic active-tab media remains functional on a non-YouTube video source.

Recent P2-M5 Vimeo evidence MAY be carried forward under the same exact-artifact rule.

Required evidence is the same as M6-A.

### M6-C - Distinct speech-heavy non-YouTube source

Purpose:
Exercise a separate browser-accessible speech-heavy source, preferably on a different site/domain from the Vimeo baseline.

This MUST be a new P2-M6 live run.

Required:

- sustained English speech;
- source tab is ordinary HTTP/HTTPS;
- Gemini STT produces finals;
- translation produces finals;
- Azure TTS produces and plays translated speech;
- translated speech is audibly confirmed;
- ducking is manually confirmed.

### M6-D - Stop during active speech

Purpose:
Verify one Stop issued while source speech and cloud processing are active performs bounded cleanup.

This MAY be combined with M6-C if Stop is deliberately pressed while speech is actively flowing and before the source naturally pauses.

Acceptance:

- one Stop only;
- no stuck ACTIVE/PAUSED/STOPPING/DRAINING state;
- translation pending reaches `0`;
- TTS pending reaches `0`;
- TTS buffered reaches `0`;
- playback queue reaches `0 ms` or a bounded explicit error is surfaced;
- final browser session state returns to `IDLE` / completed.

### M6-E - Stop with queued translated playback

Purpose:
Exercise Stop while translated playback has a real backlog.

This MUST be a separate controlled condition unless M6-D visibly has a non-zero playback queue before Stop.

Before Stop, record a screenshot with:

- `Queued audio > 0 ms`;
- preferably at least `5000 ms` queued to make the condition unambiguous;
- active TTS/playback state.

Then press Stop once and record:

- approximate time to final IDLE;
- final queued audio `0 ms`;
- translation pending `0`;
- TTS pending `0`;
- TTS buffered `0`;
- final playback state;
- any timeout or visible error.

### M6-F - Source tab ends unexpectedly

Purpose:
Verify capture lifecycle cleanup when the source disappears without the user pressing Stop.

Current browser runtime explicitly binds the captured audio track ending to:

`stopCapture("TRACK_ENDED")`

Procedure:

1. start a normal audible source and wait until capture is ACTIVE with pipeline output;
2. do NOT press Stop;
3. close the captured source tab entirely;
4. open another ordinary browser tab and reopen VoiceBridge popup;
5. record resulting session state and any visible error or status.

Acceptance:

- capture must not remain ACTIVE indefinitely;
- cleanup must be bounded;
- browser returns to `IDLE` or an explicit terminal error state rather than hanging;
- cloud/playback queues do not remain stuck;
- no second manual Stop is required to terminate the ended source.

## 5. Evidence Record Per Live Run

For every newly executed P2-M6 run, record as applicable:

- scenario ID;
- source URL/domain and source type;
- approximate duration;
- frames sent;
- frames dropped;
- unacknowledged frames at final state;
- STT provider/model;
- final STT segment count;
- recognition latency;
- translation provider;
- final translation segment count;
- translation latency;
- translation pending/retries;
- TTS provider and voice;
- voiced segment count;
- TTS latency;
- TTS pending/buffered/retries;
- played segment count;
- queued audio before Stop where relevant;
- queued audio after completion;
- audible translated speech result;
- ducking result;
- Stop or TRACK_ENDED cleanup duration where observable;
- visible errors;
- final session state;
- qualitative translation/playback result;
- known limitation or anomaly.

## 6. Carry-Forward Evidence From P2-M5

Because runtime did not change after exact 0.8.0 acceptance, the following steady-state evidence is admissible for M6-A and M6-B.

### YouTube

Accepted repeated run:

- Azure TTS voiced segments: `10`;
- TTS latency about `597 ms`;
- playback: `COMPLETED`;
- played segments: `4`;
- queued audio after completion: `0 ms`;
- TTS pending `0`, buffered `0`, retries `0`;
- translated Ukrainian speech audibly confirmed;
- actual ducking manually confirmed;
- Stop/drain completed normally.

The earlier short YouTube run with `Played segments = 0` remains recorded as insufficient playback evidence and is not used as the acceptance run.

### Vimeo non-YouTube video

Accepted run:

- Audio: `5016` frames / `9,630,720` bytes;
- dropped: `0`;
- unacknowledged: `6`;
- STT: Gemini, `6` final segments, about `835 ms`;
- Translation: `azure+gemini`, `6` final segments, about `286 ms`, pending `0`, retries `0`;
- TTS: Azure `uk-UA-OstapNeural`, `5` voiced segments, about `1037 ms`;
- TTS pending `0`, buffered `0`, retries `0`;
- playback: `COMPLETED`, played segments `5`, queued audio `0 ms`;
- translated Ukrainian speech audibly confirmed;
- actual ducking manually confirmed;
- Stop returned the browser to `IDLE` / completed.

## 7. Interpretation of Transport Counters

Small non-zero `Unacknowledged` values at a clean terminal state are recorded exactly but are not automatically a failure if:

- the session terminates normally;
- dropped frames remain bounded;
- downstream translation/TTS queues drain;
- playback queue reaches zero;
- no content pipeline remains stuck.

Likewise, a small bounded dropped-frame count is recorded as an observation. It becomes a blocker if it is persistent/material, correlates with degraded output, or prevents clean completion.

No metric is silently discarded.

## 8. Failure Rules

P2-M6 is blocked if any scenario shows:

- indefinite ACTIVE/STOPPING/DRAINING state;
- unbounded playback queue growth;
- Stop that cannot complete within the accepted bounded cleanup path;
- source-tab termination that leaves capture running;
- provider selection different from accepted policy without an approved change;
- translation/TTS queues that remain stuck;
- permission expansion, persistence, or automatic paid fallback not previously approved;
- functional regression of the accepted YouTube or generic-tab paths.

If a failure is found, create a scoped defect branch/PR, validate it, repeat the affected scenario, and keep P2-M6 open until the evidence passes.

## 9. Exit Gate

P2-M6 becomes COMPLETE only after M6-A through M6-F are supported by acceptable evidence.

After P2-M6 passes, Phase 2 closure MUST synchronize:

- architecture;
- roadmap;
- project history;
- recovery/bootstrap documentation;
- Phase 2 design status.

Phase 2 MUST NOT be declared complete before that documentation synchronization and a final green main CI.
