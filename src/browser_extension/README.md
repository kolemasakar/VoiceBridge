# VoiceBridge Browser Capture Feasibility

Purpose:
Validate YouTube tab-audio capture, browser playback control, audio metadata, and clean session shutdown for VoiceBridge Phase 1.

Version:
0.1.2

## Requirements

- Chrome or Chromium version 116 or later.
- A supported YouTube video tab.

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
4. Select `Start capture`.
5. Confirm the status changes to `ACTIVE`.
6. Confirm audio remains audible.
7. Change `Original volume`.
8. Select `Test ducking for 3 seconds`.
9. Confirm the effective-level indicator changes to `DUCKING 15%`.
10. Confirm the original audio lowers smoothly and returns.
11. Confirm sample rate, channel count, RMS, peak, and elapsed time update.
12. Keep capture active for at least ten minutes.
13. Select `Stop`.
14. Confirm audio capture stops and status returns to `IDLE`.

## Expected Result

- Capture starts only after explicit user action.
- Original tab audio is routed through the extension.
- Volume control and ducking test work.
- Audio metadata updates once per second.
- Capture runs for at least ten minutes without interruption.
- Stop releases the media stream and audio context.

## Limitations

- No cloud connection.
- No STT.
- No translation.
- No Ukrainian speech synthesis.
- The Ukrainian volume control is a placeholder until TTS integration.
- No automatic ducking based on real Ukrainian speech.
- The complete original tab audio is controlled as one track.

## Version History

- 0.1.2: Added effective original-volume and ducking-state indicators.
- 0.1.1: Removed unsupported storage access from the offscreen document.
- 0.1.0: Initial capture feasibility prototype.

## Security

- No credentials.
- No remote code.
- No user-content persistence.
- No audio recording.

## References

- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
