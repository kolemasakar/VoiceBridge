# KRC MEDIA BETA Browser Helper
Closed-beta Chrome/Edge helper for captions-first YouTube ingestion with audio fallback.

Version: 0.2.2
Status: A4.2 PREVIEW

## Purpose

This helper is an isolated beta component. It does not replace or modify the validated VoiceBridge translation extension.

It uses the tester browser/network path because direct YouTube acquisition from the current Render/datacenter path is blocked. Version 0.2.2 uses a layered captions-first strategy: first try the current YouTube caption track, then fall back to YouTube's own transcript panel if direct timed-text fetch is empty/blocked. Audio capture and AssemblyAI remain a fallback only when both caption paths are unavailable.

Version 0.2.2 also fixes switching from a completed job to a newly created KRCC job. Editing the Job ID now persists immediately and stale terminal UI state no longer disables the captions/audio buttons for the new job.

## Beta flow

```text
K-Research & Critic MEDIA BETA
 -> create KRCC_... job
 -> status AWAITING_CLIENT
 -> open the same YouTube video in Chrome/Edge
 -> enter KRCC job ID + tester beta code
 -> Use subtitles
    -> direct caption-track attempt
    -> if timedtext is empty/blocked: YouTube transcript-panel fallback
    -> timestamped browser captions sent to backend
    -> COMPLETED with stt_seconds_charged=0
 -> only if both caption paths fail: Audio fallback
    -> tab audio capture -> backend -> AssemblyAI STT
```

## Installation for closed beta

1. Download or clone the VoiceBridge feature branch `agent/krc-media-transcript`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer mode.
4. Choose `Load unpacked`.
5. Select `src/media_beta_helper`.

Do not publish this helper to an extension store during A4 beta validation.

## Usage

- The active tab must be the same YouTube video used to create the `KRCC_...` job.
- Use `Use subtitles` first.
- Manual captions are preferred over automatic captions when no active track determines the choice.
- Direct signed `timedtext` may return HTTP 200 with an empty body under current YouTube behavior; Helper 0.2.2 treats that as a fallback condition rather than a terminal error.
- If direct caption fetch is unavailable, the helper opens/reads YouTube's own transcript panel in the active tab and derives timestamped segments from the rendered transcript.
- Caption ingestion does not consume AssemblyAI STT seconds.
- A newly entered Job ID immediately replaces the stored Job ID and is not blocked by a previous job's COMPLETED state.
- Use `Audio fallback` only when the helper reports both caption paths unavailable, except during an explicit controlled fallback acceptance test.
- For audio fallback, play the video at normal speed so timestamps remain aligned.
- Maximum beta duration is 60 minutes.
- The browser helper never receives or stores the server-side `KRC_MEDIA_ACTION_TOKEN`.
- The tester beta access code is stored only in extension local storage for the beta workflow and is sent only to the dedicated beta backend.

## Current boundary

Implemented:
- browser-side YouTube caption extraction with timestamps;
- direct caption-track path plus transcript-panel fallback;
- manual vs auto-generated caption metadata;
- zero-STT caption completion path;
- same-video matching and per-tester ownership;
- completed-job to fresh-job UI switching;
- browser/residential audio fallback;
- 32 MB audio upload guard and 60-minute duration guard;
- async UK/RU/EN/auto AssemblyAI fallback;
- provider transcript delete request for AssemblyAI fallback;
- client-side status polling.

Known limitation:
- YouTube player internals and transcript-panel DOM are undocumented and can change; live acceptance remains mandatory.

Not implemented:
- extension-store distribution;
- automatic seeking or accelerated audio playback.
