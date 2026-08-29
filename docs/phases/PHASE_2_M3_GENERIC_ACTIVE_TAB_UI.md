# VoiceBridge Phase 2 M3 Generic Active-Tab UI Path

Status: IMPLEMENTED - AUTOMATED VALIDATION PASSED - LIVE REGRESSION PENDING

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

The `chromium_tab` adapter now accepts the current tab when:

- an active tab exists;
- the tab URL uses `http:` or `https:`;
- Chromium reports the tab as currently audible.

The adapter rejects unsupported browser pages before cloud streaming with:

`The current tab cannot be captured. Open an HTTP or HTTPS page with audio.`

The adapter rejects a silent or not-yet-playing web tab before cloud streaming with:

`Start audio in the current tab before starting capture.`

This start-time audible check is intentionally conservative. It avoids opening a cloud streaming session for an obviously silent source. It does not claim to detect every later period of silence inside a valid stream.

## 4. Universal Session Selection

Popup source preparation still runs through the `chromium_tab` adapter.

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

## 6. Browser Release Identity

Browser extension version advances from `0.6.2` to:

`0.7.0`

The CI artifact is renamed to:

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

Validated head before this evidence-only documentation commit:

`32a2b891b8de85bbca16cf63f4836b55ccc550e2`

Validate run:

`33271090615 - SUCCESS`

Jobs:

- `browser-extension` - SUCCESS;
- `repository-docs` - SUCCESS;
- `cloud` - SUCCESS.

Browser validation included JavaScript syntax checks, all browser contract tests, manifest validation, and successful packaging/upload of `VoiceBridge_Extension_0.7.0`.

Because this evidence update changes the PR head, the final PR head MUST also pass Validate before merge.

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

- browser JavaScript syntax must pass;
- all browser contract tests must pass;
- cloud regression must pass;
- repository documentation validation must pass;
- extension `0.7.0` must package successfully;
- PR must be mergeable with a green final head.

After merge:

- `main` Validate must pass before live acceptance begins.

## 11. Controlled Live Acceptance Gate

P2-M3 MUST NOT be marked complete from CI alone.

Use the exact post-merge `VoiceBridge_Extension_0.7.0` artifact and verify at minimum:

1. A non-YouTube HTTP/HTTPS tab with actively playing English speech starts successfully.
2. Audio frames and bytes increase with no material loss.
3. Gemini STT produces final English segments.
4. Ukrainian translation produces final segments.
5. Azure TTS produces audible Ukrainian speech.
6. Original audio ducking works during Ukrainian playback.
7. Stop drains downstream queues and returns to `IDLE`.
8. YouTube remains a successful regression source.
9. A silent HTTP/HTTPS tab is rejected with the expected actionable error before streaming.
10. A restricted browser page is rejected with the expected actionable error.

Any functional failure keeps P2-M3 in `LIVE_REGRESSION_PENDING` and blocks P2-M4.

## 12. Next Gate

Only after controlled live acceptance passes may P2-M3 become `COMPLETE` and P2-M4 begin:

`P2-M4 - Language Capability Registry`
