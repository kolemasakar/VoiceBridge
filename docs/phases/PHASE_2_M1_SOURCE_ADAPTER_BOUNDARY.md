# VoiceBridge Phase 2 M1 Source Adapter Boundary

Status: COMPLETE - AUTOMATED VALIDATION PASSED - LIVE REGRESSION PASSED

Date: 2026-08-29

## 1. Objective

Extract the validated Chromium current-tab capture preparation and stream-id acquisition behind a browser source-adapter boundary without changing Phase 1 user behavior or the cloud speech pipeline.

## 2. Implementation

Added:

`src/browser_extension/source_adapter.js`

Initial adapter:

`chromium_tab`

Logical contract:

```text
canCapture(context) -> capability
prepare(context) -> prepared source
start(prepared source) -> capture handle
stop(capture handle) -> void
```

The adapter owns:

- active current-tab discovery;
- the existing Phase 1 YouTube compatibility gate;
- normalized source metadata;
- `chrome.tabCapture.getMediaStreamId` acquisition.

The popup consumes the adapter instead of directly querying tabs or calling the tab-capture API.

## 3. Behavior Preserved

P2-M1 intentionally does NOT enable generic tabs.

The compatibility rule remains:

- a YouTube tab must be active before capture starts;
- the existing error remains `Open a YouTube tab before starting capture.`

Unchanged:

- cloud session request shape;
- `YOUTUBE_MVP` runtime mode;
- `en -> uk` language pair;
- provider selection;
- WebSocket PCM transport;
- offscreen capture implementation;
- translation and TTS;
- ducking and playback;
- bounded Stop behavior;
- no-content-persistence policy.

## 4. Automated Validation

Source PR:

`#35 - Implement Phase 2 M1 source adapter boundary`

PR Validate run:

`33267280831 - SUCCESS`

Merged main commit:

`f5a1800deb87be8dbde4ed31e12d31d33ad20694`

Post-merge Validate run:

`33267949177 - SUCCESS`

Post-merge jobs all passed:

- browser-extension;
- repository-docs;
- cloud.

Automated coverage includes:

- YouTube compatibility acceptance;
- non-YouTube compatibility rejection;
- normalized prepared-source metadata;
- stream-id acquisition through the source adapter;
- invalid prepared-state rejection before tab-capture work;
- required Chromium API availability;
- popup loading order;
- popup use of `prepare` and `start`;
- absence of direct `chrome.tabs.query` and `chrome.tabCapture.getMediaStreamId` calls from popup orchestration.

The packaged extension includes `source_adapter.js`.

Post-merge extension artifact:

- name: `VoiceBridge_Extension_0.6.2`;
- artifact ID: `9719212999`;
- artifact digest: `sha256:c3c83fe0f27c5e37cfe8b082a495c6c902ae79788bae6f77a5596d1fc11da1e7`.

## 5. Controlled Chromium Live Regression

Tracked gate:

`Issue #36 - P2-M1 live Chromium regression gate`

Result:

`PASS`

Observed accepted path:

```text
YouTube tab
 -> chromium_tab source adapter
 -> offscreen PCM capture
 -> VoiceBridge Cloud
 -> Gemini STT
 -> Ukrainian translation
 -> Azure Speech TTS
 -> browser playback and ducking
 -> bounded Stop
```

Live evidence before Stop included:

- session and cloud connection `ACTIVE`;
- audio frames and bytes increasing;
- `Dropped = 0`;
- Gemini STT final segments produced;
- Ukrainian translation final segments produced;
- Azure TTS voice `uk-UA-OstapNeural` produced voiced segments;
- browser playback reached `PLAYING` and played segments increased;
- Ukrainian speech was audibly confirmed;
- original-audio ducking during Ukrainian speech was audibly confirmed.

Final evidence after Stop included:

- session returned to `IDLE`;
- cloud/audio state completed normally;
- STT, translation, and TTS closed;
- final STT segments: `19`;
- final translation segments: `19`;
- voiced TTS segments: `18`;
- played segments: `15`;
- TTS pending: `0`;
- TTS buffered: `0`;
- TTS retries: `0`;
- queued audio: `0 ms`;
- audio frames sent: `8666`;
- audio bytes sent: `16638720`;
- dropped frames: `0`.

Observation:

- `Unacknowledged = 6` remained after the completed Stop.
- This is recorded as non-blocking for P2-M1 because the session completed normally, no frames were dropped, and downstream queues drained to zero.
- If future evidence shows this residual count represents data loss or a lifecycle leak, it must be promoted to a defect.

## 6. Acceptance Result

P2-M1 acceptance gates are satisfied:

- automated CI passed;
- packaged extension passed controlled YouTube live regression;
- provider/cloud behavior remained compatible;
- audible Ukrainian playback and ducking were confirmed;
- bounded Stop completed with drained downstream queues.

Final milestone state:

`P2-M1 COMPLETE`

## 7. Next Gate

Authorized next milestone:

`P2-M2 - Universal Browser Session Contract`

P2-M2 may add the new cloud session contract and normalized source metadata, but MUST NOT use that contract to enable generic-tab UI behavior. Generic active-tab behavior remains P2-M3 scope.
