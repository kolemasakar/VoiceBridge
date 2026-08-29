# VoiceBridge Phase 2 M3 Generic Active-Tab UI Path

Status: COMPLETE - AUTOMATED VALIDATION PASSED - LIVE ACCEPTANCE PASSED

Date: 2026-08-29

## 1. Objective

Allow VoiceBridge to start the existing cloud speech pipeline from audio actively playing in the current HTTP or HTTPS browser tab, without a YouTube-specific browser gate.

P2-M3 changes browser source eligibility and session selection only. It does not create a second media or AI pipeline.

## 2. Entry Gate

P2-M2 is complete.

Entry baseline:

`cd95680b533e1543494a0b5da167723d3de7d923`

Post-merge P2-M2 Validate run:

`33270768941 - SUCCESS`

## 3. Browser Source Policy

The `chromium_tab` adapter accepts the current tab when:

- an active tab exists;
- the tab URL uses `http:` or `https:`;
- Chromium reports the tab as currently audible.

The adapter rejects unsupported browser pages before cloud streaming with:

`The current tab cannot be captured. Open an HTTP or HTTPS page with audio.`

The adapter rejects a silent or not-yet-playing web tab before cloud streaming with:

`Start audio in the current tab before starting capture.`

This start-time audible check is intentionally conservative. It avoids opening a cloud streaming session for an obviously silent source. It does not claim to detect every later period of silence inside a valid stream.

## 4. Universal Session Selection

Popup source preparation runs through the `chromium_tab` adapter.

For an accepted live source, the popup passes only normalized source metadata to the service worker:

```json
{
  "source_kind": "BROWSER_TAB",
  "source_adapter": "chromium_tab"
}
```

The service worker validates that metadata and creates:

```json
{
  "runtime_mode": "UNIVERSAL_BROWSER_AUDIO",
  "source": {
    "kind": "BROWSER_TAB",
    "adapter": "chromium_tab"
  }
}
```

The `Save and test` connection probe continues to create the backward-compatible `YOUTUBE_MVP` session without source metadata. This keeps the connection test independent of the currently active media tab.

## 5. Permission Boundary

P2-M3 adds no broad website host permission.

The extension continues to use:

- `activeTab`;
- `tabCapture`;
- `offscreen`;
- `storage`.

Host permissions remain limited to:

- VoiceBridge Cloud on Render;
- localhost development endpoints.

`<all_urls>` is not requested.

During live acceptance Chrome displayed a broad site-access description in the extension details UI. The exact packaged artifact was independently inspected and its manifest contained no `<all_urls>`, `http://*/*`, `https://*/*`, or `*://*/*` host pattern. This is retained as a Chrome UI observation, not a manifest permission regression.

## 6. Browser Release Identity

Browser extension version advances from `0.6.2` to:

`0.7.0`

The CI artifact is named:

`VoiceBridge_Extension_0.7.0`

This prevents the universal browser build from being confused with the accepted Phase 1 / P2-M1 `0.6.2` artifact during live regression.

## 7. Automated Coverage

P2-M3 tests cover:

- audible YouTube tab remains accepted;
- audible non-YouTube HTTP/HTTPS tab is accepted;
- restricted browser pages are rejected with an actionable error;
- silent web tabs are rejected with an actionable error;
- stream ID acquisition remains inside the source adapter;
- popup passes normalized source metadata to cloud-session startup;
- service worker selects `UNIVERSAL_BROWSER_AUDIO` for live browser capture;
- service worker rejects unexpected source metadata;
- connection testing remains backward compatible;
- extension permissions do not broaden to `<all_urls>` or wildcard website access.

Existing Stop, provider metadata, playback, cloud, and documentation regression suites remain required.

## 8. Automated Validation Evidence

Pull request:

`#38 - Implement Phase 2 M3 generic active-tab browser path`

Initial validated head:

`32a2b891b8de85bbca16cf63f4836b55ccc550e2`

Initial Validate run:

`33271090615 - SUCCESS`

Final PR head:

`a0c2c24c09034a6cf343d2c8480f74667cc0b140`

Final PR Validate run:

`33271181175 - SUCCESS`

Merged main commit:

`97304ffc5c70530c4b09f9f2729eabb917e9a213`

Post-merge Validate run:

`33271253926 - SUCCESS`

Jobs:

- `browser-extension` - SUCCESS;
- `repository-docs` - SUCCESS;
- `cloud` - SUCCESS.

Post-merge browser artifact:

- name: `VoiceBridge_Extension_0.7.0`;
- artifact ID: `9720163668`;
- artifact digest: `sha256:299f0be2df4868cf7afd5aac049fd17c491dc19d3435125fa1149eebaefb1c3a`.

Browser validation included JavaScript syntax checks, all browser contract tests, manifest validation, and successful packaging/upload of `VoiceBridge_Extension_0.7.0`.

## 9. Explicitly Unchanged

P2-M3 does NOT:

- add website-specific source adapters;
- capture OS-wide audio;
- capture microphone input;
- change `en -> uk`;
- change Gemini STT / AssemblyAI rollback policy;
- change Azure Translator / Gemini fallback policy;
- change Azure Speech TTS;
- change PCM/WebSocket transport;
- change stream ticket semantics;
- change ducking or bounded Stop behavior;
- introduce content persistence;
- add automatic paid fallback;
- modify KRC Media.

## 10. Automated Acceptance Gate

Before merge:

- browser JavaScript syntax passed;
- all browser contract tests passed;
- cloud regression passed;
- repository documentation validation passed;
- extension `0.7.0` packaged successfully;
- final PR head was mergeable with green CI.

After merge:

- `main` Validate run `33271253926` passed before live acceptance began.

## 11. Controlled Live Acceptance Evidence

Tracking issue:

`#39 - P2-M3 live generic active-tab regression gate`

Issue #39 was closed as completed after all required checks passed against the exact post-merge artifact.

### Generic non-YouTube source

PASS:

- extension version `0.7.0` loaded successfully;
- Cloud connection reached READY;
- a non-YouTube HTTP/HTTPS page with actively playing English speech started capture successfully;
- audio stream reached ACTIVE and frames/bytes increased;
- observed generic run included `Dropped = 0`;
- Gemini STT produced final English segments;
- Ukrainian translation produced final segments;
- Azure TTS used `uk-UA-OstapNeural` and produced voiced/played segments;
- audible Ukrainian speech was manually confirmed;
- original-audio ducking was manually confirmed;
- Stop returned the session to `IDLE` with cloud/audio completed, STT/translation/TTS closed, `Pending = 0`, `Buffered = 0`, and `Queued audio = 0 ms`.

### YouTube regression

PASS:

- YouTube remained a valid source under the new generic active-tab path;
- Gemini STT -> Ukrainian translation -> Azure TTS -> playback completed successfully;
- audible Ukrainian speech and ducking were manually confirmed;
- Stop completed in approximately 7 seconds;
- final downstream state drained to zero pending/buffered/queued audio.

Non-blocking observations from the YouTube run:

- final `Dropped = 57 / 8232`, approximately 0.69 percent;
- small bounded unacknowledged-frame counts remained visible after completed Stop;
- neither observation caused a functional failure, downstream queue leak, or shutdown failure.

### Negative source checks

PASS:

- silent `https://example.com` remained `IDLE` and returned exactly `Start audio in the current tab before starting capture.`;
- `chrome://extensions` remained outside streaming state and returned exactly `The current tab cannot be captured. Open an HTTP or HTTPS page with audio.`.

## 12. Acceptance Result

P2-M3 is complete.

The accepted browser baseline is:

- main commit: `97304ffc5c70530c4b09f9f2729eabb917e9a213`;
- browser extension: `0.7.0`;
- generic active HTTP/HTTPS tab audio supported;
- YouTube preserved as a regression source;
- silent/restricted source guards validated;
- existing cloud provider, playback, ducking, privacy, and Stop behavior preserved.

## 13. Next Gate

P2-M4 may begin:

`P2-M4 - Language Capability Registry`

P2-M4 must remain capability-aware and must not imply universal language support merely because a provider supports a broad language set.
