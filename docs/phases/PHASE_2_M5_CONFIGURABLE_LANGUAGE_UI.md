# VoiceBridge Phase 2 M5 Configurable Language UI

Status: COMPLETE

Date: 2026-08-29
Live acceptance completed: 2026-08-30

## 1. Objective

Make browser language selection capability-driven while preserving the cloud as the authority for which language pairs VoiceBridge has actually validated.

P2-M5 does not enable new languages. It exposes the P2-M4 registry through a future-ready browser UI and removes browser-side hard-coding of the session language pair.

## 2. Entry Gate

P2-M4 is complete.

Entry baseline:

`15a498c6aaed0f09e3351ec3b385aec87200c2aa`

Entry Validate run:

`33272989740 - SUCCESS`

## 3. Cloud-Owned Language Choices

The browser asks the service worker for:

`GET_LANGUAGE_CAPABILITIES`

The service worker reads the existing cloud health capability surface and returns only normalized language capability metadata.

The extension does not contain a local catalog of supported languages.

The current cloud registry exposes only:

`English (en) -> Ukrainian (uk)`

Extension 0.8.0 displays selectors, but each selector initially contains only the currently validated choice. Additional pairs must first be validated and added to the cloud registry.

## 4. UI Behavior

A Languages card contains:

- Source language selector;
- Target language selector;
- cloud-registry status detail.

Both selectors remain disabled until validated capability metadata loads. Target options are filtered by the selected source using the cloud-provided validated pair list.

The selected pair is stored locally as browser preferences:

- `source_language`;
- `target_language`.

No provider secret or provider language matrix is stored in the browser.

User-facing labels are language-neutral:

- `Source transcript`;
- `Translation`;
- `Translated speech`;
- `Translated volume`.

## 5. Fail-Closed Behavior

If cloud capability metadata cannot be loaded:

- selectors remain disabled;
- capture is blocked;
- no local language fallback list is used;
- a clear capability error is shown.

Language readiness is coordinated with capture state so a registry refresh cannot re-enable Start during ACTIVE, PAUSED, STOPPING, or DRAINING states.

Before every cloud session starts, the service worker fetches current language capabilities and revalidates the saved selection. A stale pair cannot silently start a session.

## 6. Session Contract

Browser session creation no longer hard-codes:

```json
{
  "source_language": "en",
  "target_language": "uk"
}
```

Instead, the request receives a validated language selection derived from current cloud capability metadata.

Provider preferences remain null and cloud-owned. The browser sends `voice_id: null`; runtime TTS voice selection remains cloud-owned.

## 7. Connection Test

`Save and test` verifies:

- Cloud API access;
- test-token validity;
- usable VoiceBridge language registry metadata.

The temporary test session uses the cloud-advertised default pair rather than a browser hard-coded pair.

## 8. Browser Release Identity

Extension version:

`0.8.0`

CI artifact:

`VoiceBridge_Extension_0.8.0`

## 9. Automated Coverage

P2-M5 coverage includes:

- parsing and fail-closed handling of cloud capability metadata;
- source/target filtering from validated pairs;
- persisted valid selection handling;
- stale selection normalization/rejection;
- no local language catalog in the UI module;
- capture blocking until capabilities load;
- coordination of language readiness with active/Stop states;
- `GET_LANGUAGE_CAPABILITIES` service-worker contract;
- session languages sourced from validated selection;
- cloud connection test using registry defaults;
- extension 0.8.0 manifest and unchanged permission boundary;
- packaging `language_ui.js` in the artifact.

Existing source adapter, playback, Stop, provider, and cloud regression suites remain required.

## 10. Automated Validation Evidence

Pull request:

`#43 - Implement Phase 2 M5 configurable language UI`

Final PR head:

`81447671d89cde80d2c4ec8d6a5a5f01a0a5ccfa`

Final PR Validate:

`33273436922 - SUCCESS`

Merged main commit:

`eba77183bee29621aa6c7cb859737a10edb6e4d4`

Post-merge Validate:

`33280914334 - SUCCESS`

Jobs:

- `browser-extension` - SUCCESS;
- `repository-docs` - SUCCESS;
- `cloud` - SUCCESS.

Post-merge artifact:

- name: `VoiceBridge_Extension_0.8.0`;
- artifact ID: `9722952002`;
- GitHub archive digest: `sha256:049bf582f427b44a987c99cb3bfa60bbd67b1254ee208eb54a1db3ecf8e7da9f`;
- inner extension ZIP SHA-256: `87888745014ade34137905baf450cd9aaab15e3328bcf5a26cf540e83af844ed`.

## 11. Explicitly Unchanged

P2-M5 does NOT:

- add any new validated language pair;
- infer provider language support;
- change Gemini STT / AssemblyAI rollback policy;
- change Azure Translator / Gemini fallback policy;
- change Azure Speech TTS runtime selection;
- change source capture, PCM transport, stream tickets, playback, ducking, or bounded Stop;
- add broad website permissions;
- add content persistence;
- add automatic paid fallback;
- modify KRC Media.

## 12. Controlled Live Acceptance Evidence

Live tracker:

`#44 - P2-M5 live acceptance - VoiceBridge Extension 0.8.0`

Issue #44 is closed as `completed` after all checks passed on the exact post-merge artifact.

### Language UI and registry

PASS:

- extension details show version `0.8.0` with no visible runtime/manifest error;
- Cloud `Save and test` reaches `READY`;
- Languages card reaches `READY`;
- registry version is `1.0.0`;
- Source selector offers only `English`;
- Target selector offers only `Ukrainian`;
- Start becomes enabled after language capability readiness.

### Primary non-YouTube run

Source: Vimeo HTTPS media path.

PASS evidence:

- Audio: `5016` frames / `9,630,720` bytes;
- Dropped: `0`;
- Unacknowledged: `6`;
- STT: Gemini, `6` final segments, about `835 ms`;
- Translation: `azure+gemini`, `6` final segments, about `286 ms`, pending `0`, retries `0`;
- TTS: Azure, `uk-UA-OstapNeural`, `5` voiced segments, about `1037 ms`;
- TTS pending `0`, buffered `0`, retries `0`;
- Playback: `COMPLETED`, played segments `5`, queued audio `0 ms`;
- translated Ukrainian speech was audibly confirmed;
- actual original-audio ducking was manually confirmed;
- Stop returned the session to `IDLE` / completed state.

### YouTube regression

A first short run proved capture/STT/translation/TTS/Stop but ended before playback evidence was sufficient (`Played segments = 0`), so it was not counted as full playback acceptance.

A repeated longer YouTube run supplied the missing evidence and passed:

- Azure TTS: `10` voiced segments;
- TTS latency about `597 ms`;
- Playback: `COMPLETED`;
- Played segments: `4`;
- Queued audio: `0 ms`;
- pending `0`, buffered `0`, retries `0`;
- UI reached `DUCKING 15%` during translated playback;
- audible Ukrainian playback manually confirmed;
- actual ducking manually confirmed;
- Stop/drain completed normally.

### Negative source guards

Silent HTTP/HTTPS page (`https://example.com`) remained `IDLE` and was rejected before streaming with:

`Start audio in the current tab before starting capture.`

Restricted browser page (`chrome://extensions`) remained outside streaming and was rejected with:

`The current tab cannot be captured. Open an HTTP or HTTPS page with audio.`

Both guards PASS.

## 13. Exit Gate

P2-M5 is COMPLETE.

The exact merged artifact passed automated validation and controlled Chromium live acceptance without reopening the provider, privacy, permission, source-adapter, playback, ducking, or bounded-Stop boundaries.

## 14. Next Gate

P2-M6 may begin:

`P2-M6 - Controlled End-to-End Acceptance`
