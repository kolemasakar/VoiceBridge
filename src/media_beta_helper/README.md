# KRC MEDIA BETA Browser Helper
Closed-beta Chrome/Edge helper for client-assisted YouTube ingestion.

Version: 0.1.0
Status: A4.2 PREVIEW

## Purpose

This helper is an isolated beta component. It does not replace or modify the validated VoiceBridge translation extension.

It exists because YouTube blocks direct media acquisition from the current Render/datacenter IP path even when the current yt-dlp PO-token provider is wired correctly.

The helper captures audio from the active YouTube tab through the tester's normal browser/network path and uploads that audio to the isolated MEDIA BETA backend.

## Beta flow

```text
K-Research & Critic MEDIA BETA
 -> create KRCC_... job
 -> status AWAITING_CLIENT
 -> open the same YouTube video in Chrome/Edge
 -> enter KRCC job ID + tester beta code in this helper
 -> Start capture
 -> play video at normal speed
 -> Stop capture
 -> helper uploads compressed tab audio
 -> backend validates duration/quota
 -> AssemblyAI async multilingual STT
 -> provider delete request
 -> helper reports COMPLETED
 -> return to K-Research & Critic
 -> GPT fetches timestamped segments
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
- Play the video at normal speed while recording so STT timestamps remain aligned with source playback time.
- Maximum beta duration is 60 minutes.
- Audio is recorded as Opus at approximately 32 kbps and uploaded only after Stop.
- The browser helper never receives or stores the server-side `KRC_MEDIA_ACTION_TOKEN`.
- The tester beta access code is stored only in extension local storage for the beta workflow and is sent only to the dedicated beta backend.

## Current A4.2 boundary

Implemented now:
- browser/residential audio acquisition;
- job/source matching;
- per-tester access-code ownership;
- 32 MB upload guard;
- 60-minute duration guard enforced by the backend;
- client-ingest beta STT budget;
- async UK/RU/EN/auto AssemblyAI path;
- timestamped transcript segments;
- provider transcript delete request;
- client-side status polling.

Not yet implemented in this helper:
- client-side YouTube caption extraction;
- automatic seeking or accelerated playback;
- extension-store distribution.

Caption-first client acquisition remains a later optimization. A4.2 first validates the residential/browser audio path that removes the confirmed cloud-IP ingress blocker.
