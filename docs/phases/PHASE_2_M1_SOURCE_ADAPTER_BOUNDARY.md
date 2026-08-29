# VoiceBridge Phase 2 M1 Source Adapter Boundary

Status: IMPLEMENTED - AUTOMATED VALIDATION PENDING - LIVE REGRESSION PENDING

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

The popup now consumes the adapter instead of directly querying tabs or calling the tab-capture API.

## 3. Behavior Preserved

This milestone intentionally does NOT enable generic tabs yet.

The existing compatibility rule remains:

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

## 4. Automated Contracts

Added automated coverage for:

- YouTube compatibility acceptance;
- non-YouTube compatibility rejection;
- normalized prepared-source metadata;
- stream-id acquisition through the source adapter;
- invalid prepared-state rejection before tab-capture work;
- required Chromium API availability;
- popup loading order;
- popup use of `prepare` and `start`;
- absence of direct `chrome.tabs.query` and `chrome.tabCapture.getMediaStreamId` calls from popup orchestration.

The CI packaging step includes `source_adapter.js` in the extension artifact.

## 5. Acceptance Boundary

P2-M1 MUST NOT be marked `PASSED` solely from code review or automated CI.

A controlled browser regression is still required to confirm that the packaged extension preserves the accepted YouTube path end to end:

```text
YouTube tab
 -> chromium_tab source adapter
 -> offscreen PCM capture
 -> VoiceBridge Cloud
 -> accepted STT / translation / TTS pipeline
 -> browser playback
```

The live regression should confirm at minimum:

- Start succeeds on an active YouTube tab;
- non-YouTube compatibility behavior remains blocked at this milestone;
- audio frames reach cloud transport;
- STT, translation, TTS, and playback operate normally;
- one-press Stop completes with bounded queues;
- no new source or provider regression is observed.

## 6. Next Gate

Do not start `P2-M2 - Universal Browser Session Contract` until:

- P2-M1 automated CI passes; and
- the controlled P2-M1 YouTube regression is accepted.
