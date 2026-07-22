# VoiceBridge Browser Extension

Version:

`0.6.2`

The extension captures YouTube tab audio, displays English and Ukrainian text,
plays Ukrainian PCM, and automatically ducks the original audio.

## Stop State

One Stop click starts the complete shutdown sequence.

The extension immediately publishes `STOPPING`, disables Start, Stop, and
manual ducking controls, drains the cloud stream and browser playback, and
returns to `IDLE`.

Repeated Stop clicks and duplicate cloud Stop requests are ignored while the
first shutdown operation is active.

## Providers

The browser displays provider names reported by the cloud. Provider secrets
are never stored in or sent to the extension.
