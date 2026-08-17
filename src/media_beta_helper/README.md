# KRC MEDIA BETA Browser Helper
Closed-beta Chrome/Edge helper for captions-first YouTube ingestion with audio fallback.

Version: 0.2.0
Status: A4.2 PREVIEW

## Purpose

This helper is an isolated beta component. It does not replace or modify the validated VoiceBridge translation extension.

It uses the tester browser/network path because direct YouTube acquisition from the current Render/datacenter path is blocked. Version 0.2.0 prefers the caption track already available to the open YouTube player. Audio capture and AssemblyAI remain a fallback only when usable captions are unavailable.

## Beta flow

```text
K-Research & Critic MEDIA BETA
 -> create KRCC_... job
 -> status AWAITING_CLIENT
 -> open the same YouTube video in Chrome/Edge
 -> enter KRCC job ID + tester beta code
 -> Use subtitles
    -> browser reads YouTube caption track + timestamps
    -> backend validates source/timestamps
    -> COMPLETED with stt_seconds_charged=0
 -> if captions unavailable: Audio fallback
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
- Use `Use subtitles` first. The helper prefers the currently active caption language; otherwise it uses the job language hint and then a source caption track.
- Manual captions are preferred over automatic captions when no active track determines the choice.
- Caption ingestion does not consume AssemblyAI STT seconds.
- Use `Audio fallback` only when the helper reports captions unavailable.
- For audio fallback, play the video at normal speed so timestamps remain aligned.
- Maximum beta duration is 60 minutes.
- The browser helper never receives or stores the server-side `KRC_MEDIA_ACTION_TOKEN`.
- The tester beta access code is stored only in extension local storage for the beta workflow and is sent only to the dedicated beta backend.

## Current boundary

Implemented:
- browser-side YouTube caption extraction with timestamps;
- manual vs auto-generated caption metadata;
- zero-STT caption completion path;
- same-video matching and per-tester ownership;
- browser/residential audio fallback;
- 32 MB audio upload guard and 60-minute duration guard;
- async UK/RU/EN/auto AssemblyAI fallback;
- provider transcript delete request for AssemblyAI fallback;
- client-side status polling.

Not implemented:
- extension-store distribution;
- automatic seeking or accelerated audio playback.
