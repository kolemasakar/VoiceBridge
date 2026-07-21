# VoiceBridge Browser Extension

Purpose:
Validate authenticated VoiceBridge Cloud sessions, bounded YouTube capture, live English STT, ordered Ukrainian translation, Ukrainian speech playback, automatic ducking, and clean shutdown.

Version:
0.6.0

Status:
Implementation complete; controlled live Ukrainian TTS validation pending.

## Requirements

- Chrome or Chromium version 116 or later.
- A public English YouTube video.
- VoiceBridge Cloud service `0.5.0`.
- Shared test access token configured in Render.
- AssemblyAI API key configured only in Render.
- Gemini API key configured only in Render.

The extension never stores provider API keys.

## Install

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Select `Load unpacked`.
4. Select the directory containing `manifest.json`:
   - `src/browser_extension` in the repository;
   - `extension` in the packaged ZIP.
5. Confirm extension version `0.6.0`.
6. Pin VoiceBridge.

## Controlled Live Test

1. Open and start a public English YouTube video.
2. Open VoiceBridge.
3. Confirm the cloud endpoint and test token.
4. Select `Save and test` and confirm `READY`.
5. Select `Start capture`.
6. Confirm:
   - Audio stream `ACTIVE`;
   - English transcript `ACTIVE` with provider `assemblyai`;
   - Ukrainian translation `ACTIVE` or `READY` with provider `gemini`;
   - Ukrainian speech `ACTIVE` or `READY` with provider `gemini`;
   - voice `Iapetus`;
   - audio segment count and TTS latency update;
   - playback alternates between `BUFFERING`, `PLAYING`, and `IDLE`;
   - the original audio automatically drops to the ducking level during Ukrainian speech;
   - Ukrainian volume changes real playback gain;
   - `Dropped` remains zero and acknowledgement state remains bounded.
7. Select `Stop`.
8. Wait for translation, TTS, and playback draining to complete.
9. Confirm capture `IDLE`, cloud and stream `COMPLETED`, and STT, translation, and TTS `CLOSED`.

## Runtime Behavior

- Captured tab audio is sent as bounded mono PCM frames.
- AssemblyAI provides partial and final English transcript segments.
- Gemini translates final English segments only.
- Gemini synthesizes final Ukrainian translations only.
- VoiceBridge Cloud emits bounded ordered PCM audio chunks.
- The offscreen document converts 16-bit PCM to Web Audio buffers.
- Ukrainian buffers are scheduled in segment order.
- Ukrainian gain follows the Ukrainian volume control.
- The complete original tab track is smoothly ducked while Ukrainian speech is queued or playing.
- The configured original background level is restored after playback drains.
- TTS failure does not stop capture, STT, or translation.
- Stop allows bounded cloud and browser playback drains before releasing resources.

## Current Limitations

- AssemblyAI is the only implemented STT provider.
- Gemini is the only implemented translation and TTS provider.
- Gemini TTS is a preview model.
- The initial cloud adapter receives a complete provider audio response before sending bounded chunks to the browser.
- There is no automatic TTS retry or provider fallback.
- The complete original tab audio is controlled as one track.
- Long sustained speech may create a playback backlog; the browser queue is bounded.

## Version History

- 0.6.0: Added Gemini Ukrainian TTS, ordered PCM playback, real Ukrainian gain, automatic ducking, playback metrics, bounded drain, and cleanup.
- 0.5.0: Added Gemini translation status, ordered Ukrainian text, count, latency, sanitized errors, and bounded session state.
- 0.4.1: Completed AssemblyAI live STT validation.
- 0.4.0: Added cloud STT status, English transcript display, and latency.
- 0.3.0: Added authenticated PCM streaming, acknowledgements, and flow limits.
- 0.2.0: Added Cloud API settings and session lifecycle.
- 0.1.0: Initial capture feasibility prototype.

## Security

- The shared test token is local to the browser profile.
- Stream tickets are one-time and short-lived.
- Provider API keys remain only in Render.
- No remote code is loaded.
- VoiceBridge does not persist audio, transcripts, translations, or synthesized speech.
- Gemini free-tier processing MUST NOT be used for private or confidential content.

## References

- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/reference/api/offscreen
- https://developer.mozilla.org/docs/Web/API/Web_Audio_API
