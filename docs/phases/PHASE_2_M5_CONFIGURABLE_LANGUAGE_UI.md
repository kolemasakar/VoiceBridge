# VoiceBridge Phase 2 M5 Configurable Language UI

Status: IMPLEMENTED - AUTOMATED VALIDATION PASSED - LIVE ACCEPTANCE PENDING

Date: 2026-08-29

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

Therefore extension 0.8.0 displays selectors, but initially each selector has only the currently validated choice.

When additional pairs are added to the cloud registry in a future validated milestone, the browser UI can consume them without inventing provider support locally.

## 4. UI Behavior

A new Languages card contains:

- Source language selector;
- Target language selector;
- cloud-registry status detail.

Both selectors remain disabled until validated capability metadata loads.

Target options are filtered by the selected source using the cloud-provided validated pair list.

The selected pair is saved locally as browser preferences:

- `source_language`;
- `target_language`.

No provider secret or provider language matrix is stored in the browser.

User-facing transcript/speech labels are made language-neutral:

- `Source transcript`;
- `Translation`;
- `Translated speech`;
- `Translated volume`.

## 5. Fail-Closed Behavior

If cloud capability metadata cannot be loaded:

- selectors remain disabled;
- capture is blocked by a capture-phase UI guard;
- no local language fallback list is used;
- a clear capability error is shown.

Language readiness is coordinated with the current capture state so a registry refresh cannot re-enable Start during ACTIVE, PAUSED, STOPPING, or DRAINING states.

Before every cloud session starts, the service worker fetches current language capabilities and revalidates the saved selection.

A stale saved pair cannot silently start a session. It is rejected unless it is still present in the cloud validated pair set.

When no saved pair exists, the cloud-advertised default pair is used.

## 6. Session Contract

Browser session creation no longer hard-codes:

```json
{
  "source_language": "en",
  "target_language": "uk"
}
```

Instead, `sessionRequestBody` receives a validated language selection derived from current cloud capability metadata.

Provider preferences remain null and cloud-owned.

The browser now sends `voice_id: null` as session preference metadata so it does not encode a target-language-specific TTS voice. Runtime TTS voice selection remains cloud-owned and the current accepted Azure voice remains unchanged by this milestone.

## 7. Connection Test

`Save and test` now verifies all three prerequisites:

- Cloud API access;
- test-token validity;
- usable VoiceBridge language registry metadata.

Its temporary test session uses the cloud-advertised default pair rather than a browser hard-coded pair.

## 8. Browser Release Identity

Extension version:

`0.8.0`

CI artifact:

`VoiceBridge_Extension_0.8.0`

The version bump separates the first cloud-driven language UI build from the accepted P2-M3 `0.7.0` artifact.

## 9. Automated Coverage

P2-M5 adds or updates coverage for:

- parsing and fail-closed handling of cloud capability metadata;
- source/target option filtering from validated pairs;
- persisted valid selection handling;
- stale UI selection normalization to the cloud default;
- no local English/Ukrainian language catalog in the language UI module;
- capture blocking until capabilities load;
- coordination of language readiness with active/Stop capture states;
- `GET_LANGUAGE_CAPABILITIES` service-worker contract;
- session language values coming from validated selection rather than hard-coded browser values;
- stale saved service-worker selection rejection;
- cloud connection test using registry defaults;
- extension 0.8.0 manifest and unchanged permission boundary;
- packaging `language_ui.js` in the 0.8.0 artifact.

Existing source adapter, playback, Stop, provider, and cloud regression suites remain required.

## 10. Automated Validation Evidence

Pull request:

`#43 - Implement Phase 2 M5 configurable language UI`

Validated implementation head before this evidence-only documentation commit:

`2d307ff98b3eba79ad2b0071d9b02cb2df0f95bd`

Validate run:

`33273356329 - SUCCESS`

Jobs:

- `browser-extension` - SUCCESS;
- `repository-docs` - SUCCESS;
- `cloud` - SUCCESS.

Browser evidence:

- JavaScript syntax validation passed;
- browser contract suite: `32 passed / 0 failed`;
- manifest validation passed;
- extension `0.8.0` packaged successfully;
- `language_ui.js` is included in the packaged extension;
- PR-run artifact ID: `9720752430`;
- PR-run artifact upload digest: `sha256:4fe4a188e3a1da4a23a7f6b909084bfcba160e53b7e61aa21bbfe879364e1917`.

This evidence commit changes the PR head. The final PR head MUST pass Validate again before merge.

## 11. Explicitly Unchanged

P2-M5 does NOT:

- add any new validated language pair;
- infer provider language support;
- change Gemini STT / AssemblyAI rollback policy;
- change Azure Translator / Gemini fallback policy;
- change Azure Speech TTS runtime selection;
- change source capture, PCM transport, stream tickets, playback, ducking, or bounded Stop;
- add broad website permissions;
- add persistence of content;
- add automatic paid fallback;
- modify KRC Media.

## 12. Automated Acceptance Gate

Before merge:

- browser JavaScript syntax must pass;
- all browser contracts must pass;
- manifest and permission boundary must pass;
- extension 0.8.0 must package successfully with `language_ui.js`;
- cloud regression must remain green;
- repository docs validation must pass;
- final PR head must be green and mergeable.

After merge:

- post-merge `main` Validate must pass.

## 13. Controlled Live Acceptance Gate

P2-M5 MUST NOT be marked complete from automated CI alone because the user-visible popup and live session-start path changed.

Use the exact post-merge `VoiceBridge_Extension_0.8.0` artifact and verify:

1. extension reports version 0.8.0 with no runtime/manifest errors;
2. Cloud `Save and test` reaches READY;
3. Languages card loads options from cloud and reports the registry version;
4. only the currently validated `English -> Ukrainian` pair is offered;
5. a non-YouTube audible HTTP/HTTPS source starts normally;
6. Gemini STT -> translation -> Azure TTS -> playback remains functional;
7. audible translated speech and ducking remain functional;
8. Stop drains queues and returns to IDLE;
9. YouTube remains a regression source;
10. silent and restricted source guards remain intact.

Any functional failure keeps P2-M5 in `LIVE_ACCEPTANCE_PENDING` and blocks P2-M6.

## 14. Next Gate

Only after controlled live acceptance passes may P2-M5 become COMPLETE and P2-M6 begin:

`P2-M6 - Controlled End-to-End Acceptance`
