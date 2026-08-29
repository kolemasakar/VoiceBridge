# VoiceBridge Phase 2 M2 Universal Browser Session Contract

Status: IMPLEMENTED - AUTOMATED VALIDATION PENDING

Date: 2026-08-29

## 1. Objective

Add the cloud-side session contract required for future universal browser-tab audio while preserving the accepted Phase 1 `YOUTUBE_MVP` request and without enabling generic-tab capture in the browser UI.

## 2. Entry Gate

P2-M1 is complete.

Accepted evidence:

- PR #35 merged to `main`;
- PR Validate run `33267280831` passed;
- post-merge Validate run `33267949177` passed;
- controlled Chromium regression in Issue #36 passed;
- audible Ukrainian TTS and original-audio ducking were manually confirmed;
- bounded Stop completed with downstream queues drained to zero.

Entry baseline:

`f5a1800deb87be8dbde4ed31e12d31d33ad20694`

## 3. Contract Evolution

Existing Phase 1 request remains valid:

```json
{
  "source_language": "en",
  "target_language": "uk",
  "runtime_mode": "YOUTUBE_MVP",
  "input_type": "BROWSER_AUDIO",
  "output_type": "BROWSER_PLAYBACK",
  "provider_preferences": {
    "recognition": null,
    "translation": null,
    "synthesis": null
  },
  "voice": {
    "voice_id": "uk-UA-OstapNeural",
    "speaking_rate": null
  }
}
```

For `YOUTUBE_MVP`, `source` remains optional and is normalized to `null` when omitted.

New Phase 2 request:

```json
{
  "source_language": "en",
  "target_language": "uk",
  "runtime_mode": "UNIVERSAL_BROWSER_AUDIO",
  "input_type": "BROWSER_AUDIO",
  "output_type": "BROWSER_PLAYBACK",
  "source": {
    "kind": "BROWSER_TAB",
    "adapter": "chromium_tab"
  },
  "provider_preferences": {
    "recognition": null,
    "translation": null,
    "synthesis": null
  },
  "voice": {
    "voice_id": null,
    "speaking_rate": null
  }
}
```

For `UNIVERSAL_BROWSER_AUDIO`, the normalized source descriptor is required.

## 4. Normalization and Validation

Accepted source descriptor:

```json
{
  "kind": "BROWSER_TAB",
  "adapter": "chromium_tab"
}
```

Client-supplied presentation fields are not persisted as authority. The server stores only the normalized fields above.

The server rejects session creation before streaming when:

- universal runtime mode omits `source`;
- `source.kind` is not `BROWSER_TAB`;
- `source.adapter` is not `chromium_tab`;
- an otherwise unsupported source descriptor is supplied.

The language pair remains intentionally fixed at `en -> uk` in P2-M2. Capability-aware language expansion belongs to P2-M4.

## 5. Provider Ownership

`provider_preferences` remains session metadata.

P2-M2 does not make browser-provided provider names operational.

Cloud provider construction and health capabilities remain controlled by cloud configuration. Automated coverage verifies that creating a session with arbitrary provider-preference strings does not change the cloud health capability/provider state.

## 6. Session State

Session state now exposes:

- `runtime_mode` as either `YOUTUBE_MVP` or `UNIVERSAL_BROWSER_AUDIO`;
- normalized `source` metadata as `null` for the old request or a `BROWSER_TAB/chromium_tab` descriptor for the new request.

No source descriptor is used as authentication or stream authorization.

## 7. Automated Coverage

Added `src/cloud/tests/session_contract.test.ts` covering:

- old `YOUTUBE_MVP` request compatibility;
- normalized `source = null` for the old request;
- valid `UNIVERSAL_BROWSER_AUDIO` creation;
- normalized source metadata in create/read state;
- missing universal source rejection;
- invalid source-kind rejection;
- invalid source-adapter rejection;
- provider preferences remaining metadata rather than changing cloud provider policy.

Existing cloud and browser suites remain required regression gates.

## 8. Explicitly Unchanged

P2-M2 does NOT:

- remove the YouTube compatibility gate from the browser source adapter;
- switch the browser popup to `UNIVERSAL_BROWSER_AUDIO`;
- enable generic current-tab capture;
- change `en -> uk`;
- change Gemini STT / AssemblyAI rollback policy;
- change Azure Translator / Gemini fallback policy;
- change Azure Speech TTS;
- change stream-ticket or WebSocket behavior;
- change Stop, playback, or ducking behavior;
- introduce content persistence;
- modify KRC Media.

Generic active-tab UI behavior remains P2-M3 scope.

## 9. Acceptance

P2-M2 may be marked complete only when CI confirms:

- both runtime modes validate correctly;
- the old Phase 1 request remains accepted;
- invalid universal source descriptors fail during session creation;
- session create/read state exposes normalized source metadata;
- provider preferences do not become operational accidentally;
- existing cloud and browser regression suites stay green.

## 10. Next Gate

After P2-M2 is merged with green post-merge CI, begin:

`P2-M3 - Generic Active-Tab UI Path`

P2-M3 will be the first milestone allowed to remove the YouTube-specific browser gate for the new universal runtime path.
