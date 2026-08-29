# VoiceBridge Browser Extension

Version:

`0.7.0`

The extension captures audio that is actively playing in the current HTTP or
HTTPS browser tab, displays English and Ukrainian text, plays Ukrainian PCM,
and automatically ducks the original audio.

Before pressing Start, begin audio playback in the source tab. Restricted
browser pages and tabs that are not currently audible are rejected with an
actionable error before a cloud streaming session is started.

YouTube remains a supported regression case, but is no longer the only browser
source accepted by the extension.

## Permission Boundary

The universal active-tab path continues to use `activeTab` and `tabCapture`.
It does not require `<all_urls>` or a broad website host permission. Existing
host permissions remain limited to the VoiceBridge Cloud endpoint and local
development endpoints.

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
