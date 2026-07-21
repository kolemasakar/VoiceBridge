# VoiceBridge Browser Extension

Purpose:
Validate authenticated VoiceBridge Cloud sessions, bounded YouTube tab-audio streaming, live English STT, ordered Ukrainian translation display, audio controls, and clean shutdown.

Version:
0.5.0

Status:
Implementation complete; live Gemini translation validation pending.

## Requirements

- Chrome or Chromium version 116 or later.
- A supported public YouTube video tab.
- Deployed VoiceBridge Cloud service `0.4.0`.
- Shared test access token configured in Render.
- AssemblyAI API key configured only in Render.
- Gemini API key configured only in Render for live translation validation.

The extension never stores provider API keys.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Select the directory containing `manifest.json`:
   - `src/browser_extension` in the repository;
   - `extension` in the packaged ZIP.
5. Confirm extension version `0.5.0`.
6. Pin the VoiceBridge extension.

## Test Without GEMINI_API_KEY

1. Open a public English YouTube video.
2. Start video playback.
3. Open VoiceBridge.
4. Confirm the API URL is `https://voicebridge-cloud-us.onrender.com`.
5. Paste the shared test access token.
6. Select `Save and test`.
7. Confirm cloud status becomes `READY`.
8. Select `Start capture`.
9. Confirm capture, audio stream, and English transcript become `ACTIVE`.
10. Confirm translation provider displays `gemini` and status displays `NOT CONFIGURED`.
11. Confirm English partial and final transcripts continue normally.
12. Select `Stop`.
13. Confirm capture returns to `IDLE`, cloud and stream become `COMPLETED`, STT becomes `CLOSED`, and translation becomes `CLOSED` or remains safely not configured.

## Live Translation Test

Live translation requires `GEMINI_API_KEY` in Render. The free-tier test is limited to public YouTube or synthetic content approved for provider processing.

1. Confirm Render deploys cloud service `0.4.0`.
2. Confirm extension version `0.5.0`.
3. Start capture on a public English YouTube video.
4. Confirm English transcript status becomes `ACTIVE`.
5. Confirm Ukrainian translation status becomes `ACTIVE`.
6. Confirm provider displays `gemini`.
7. Confirm final Ukrainian segments appear in the same order as final English segments.
8. Confirm final translation count and translation latency update.
9. Confirm translation errors remain empty during normal operation.
10. Confirm `Dropped` remains zero and `Unacknowledged` remains bounded.
11. Select `Stop`.
12. Confirm clean `IDLE`, `COMPLETED`, and `CLOSED` states.

## Expected Result

- Capture starts only after explicit user action.
- The shared token remains outside the WebSocket URL.
- Captured tab audio is sent as bounded mono PCM frames.
- AssemblyAI partial and final English transcripts remain visible.
- Only final English segments are translated.
- Recent Ukrainian translations remain ordered and bounded.
- STT segment identity is preserved through translation events.
- Translation provider, status, final count, latency, and sanitized error are visible.
- Translation failure does not stop audio streaming or STT.
- Recent English and Ukrainian text remains in browser session state only.
- Stop releases the media stream and audio context.

## Current Limitations

- Gemini is the only implemented translation provider.
- Translation is unavailable until `GEMINI_API_KEY` is configured in Render.
- No automatic translation retry or provider fallback.
- No Ukrainian speech synthesis.
- Ukrainian volume control remains a placeholder until TTS integration.
- No automatic ducking based on generated Ukrainian speech.
- The complete original tab audio is controlled as one track.

## Version History

- 0.5.0: Added Gemini translation status, ordered Ukrainian text, count, latency, sanitized errors, and session-only bounded state.
- 0.4.1: Replaced the initial STT provider preference with AssemblyAI Free and completed live STT validation.
- 0.4.0: Added cloud STT status, bounded English transcript display, and recognition latency.
- 0.3.0: Added one-time stream tickets, PCM upload, acknowledgements, flow limits, and visible stream metrics.
- 0.2.0: Added authenticated Cloud API settings, connection test, and session lifecycle.
- 0.1.2: Added effective original-volume and ducking-state indicators.
- 0.1.1: Removed unsupported storage access from the offscreen document.
- 0.1.0: Initial capture feasibility prototype.

## Security

- The shared test token is stored in local extension storage for Phase 1 only.
- The test token is not synchronized through the browser account.
- Stream tickets are one-time and expire after a short interval.
- Provider API keys remain in Render and never enter the extension.
- No remote code.
- No audio recording or cloud content persistence.
- Recent transcript and translation text uses browser session storage only.
- Gemini free-tier translation MUST NOT process private or confidential content.

## References

- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
