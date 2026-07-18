# VoiceBridge Browser Capture Feasibility

Purpose:
Validate the authenticated VoiceBridge Cloud session lifecycle together with YouTube tab-audio capture, browser playback control, audio metadata, and clean shutdown.

Version:
0.2.0

## Requirements

- Chrome or Chromium version 116 or later.
- A supported YouTube video tab.
- A deployed VoiceBridge Cloud API.
- The shared test access token configured in the cloud environment.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Select the directory that contains `manifest.json`:
   - `src/browser_extension` in the repository;
   - `extension` in the downloadable ZIP.
5. Pin the VoiceBridge extension.

## Test

1. Open a YouTube video.
2. Start video playback.
3. Open the VoiceBridge extension.
4. Confirm the API URL is `https://voicebridge-cloud.onrender.com`.
5. Paste the shared test access token from Render.
6. Select `Save and test`.
7. Confirm cloud status changes to `READY`.
8. Select `Start capture`.
9. Confirm cloud status and capture status change to `ACTIVE`.
10. Confirm audio remains audible.
11. Change `Original volume`.
12. Select `Test ducking for 3 seconds`.
13. Confirm the effective-level indicator changes to `DUCKING 15%`.
14. Confirm the original audio lowers smoothly and returns.
15. Confirm sample rate, channel count, RMS, peak, and elapsed time update.
16. Select `Stop`.
17. Confirm capture returns to `IDLE` and cloud state becomes `COMPLETED`.

## Expected Result

- Capture starts only after explicit user action.
- The authenticated create, start, and stop session commands succeed.
- A capture startup failure closes the cloud session automatically.
- Original tab audio is routed through the extension.
- Volume control and ducking test work.
- Audio metadata updates once per second.
- Capture runs for at least ten minutes without interruption.
- Stop releases the media stream and audio context.

## Limitations

- No STT.
- No translation.
- No Ukrainian speech synthesis.
- The Ukrainian volume control is a placeholder until TTS integration.
- No automatic ducking based on real Ukrainian speech.
- The complete original tab audio is controlled as one track.

## Version History

- 0.2.0: Added authenticated Cloud API settings, connection test, and session lifecycle.
- 0.1.2: Added effective original-volume and ducking-state indicators.
- 0.1.1: Removed unsupported storage access from the offscreen document.
- 0.1.0: Initial capture feasibility prototype.

## Security

- The shared test token is stored in local extension storage for Phase 1 only.
- The test token is not synchronized through the browser account.
- No remote code.
- No user-content persistence.
- No audio recording.

## References

- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
