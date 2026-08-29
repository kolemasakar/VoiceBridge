# VoiceBridge Phase 2 Universal Cloud Audio Design

UA: Dyzain fazy 2 Universal Cloud Audio.

Status: ACTIVE DESIGN GATE

Version: 1.0.0

Date: 2026-08-29

## 1. Purpose

Define the approved design boundary, compatibility rules, milestone sequence, and acceptance criteria for Phase 2 Universal Cloud Audio before functional implementation begins.

Phase 2 generalizes the validated YouTube browser path without replacing the working cloud speech pipeline.

## 2. Entry Baseline

Phase 2 starts from the validated Phase 1 baseline on `main`.

Accepted processing path:

```text
browser PCM audio
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech TTS
    -> browser PCM playback
```

Accepted STT rollback:

`AssemblyAI universal-streaming-english`

The Phase 1 browser capture path, streaming transport, Stop policy, provider adapters, and playback behavior are regression baselines and MUST remain functional during Phase 2.

## 3. Current Boundary Findings

The existing implementation is already partially source-neutral.

Cloud streaming boundary:

- WebSocket transport accepts bounded PCM audio rather than YouTube-specific data;
- STT, translation, and TTS execute behind cloud provider boundaries;
- provider credentials remain cloud-side;
- audio and derived content remain session-only by default.

Browser capture boundary:

- the offscreen capture runtime receives a Chrome tab-capture stream identifier;
- capture is converted to PCM frames before cloud transport;
- playback and ducking operate on the captured tab audio graph;
- the low-level PCM path does not require YouTube-specific media metadata.

Current hard constraints that must be generalized deliberately:

- session creation accepts only `source_language=en`;
- session creation accepts only `target_language=uk`;
- session creation accepts only `runtime_mode=YOUTUBE_MVP`;
- `SessionStore` types encode the same fixed language and runtime-mode values;
- browser session creation currently supplies fixed `en`, `uk`, and `YOUTUBE_MVP` values;
- browser orchestration and user-facing text still describe the validated YouTube scenario.

## 4. Phase 2 Goal

Phase 2 MUST allow VoiceBridge to translate supported browser-tab audio sources through the same cloud pipeline without duplicating provider logic per source.

The first Phase 2 target is generic active-tab audio in Chromium-compatible browsers.

Phase 2 does NOT initially require:

- operating-system-wide audio capture;
- microphone or two-way interpreter mode;
- native desktop Agent;
- mobile applications;
- public multi-user production authentication;
- persistent transcript history;
- automatic provider purchasing or paid fallback;
- KRC Media integration.

These remain separate future scopes.

## 5. Architecture Decision

Source capture MUST be separated from cloud speech processing.

Canonical Phase 2 boundary:

```text
Browser Source Adapter
    -> normalized browser audio stream
    -> PCM Capture Pipeline
    -> existing VoiceBridge WebSocket ingestion
    -> existing cloud STT / Translation / TTS pipeline
    -> existing browser playback adapter
```

A source adapter is responsible only for obtaining an authorized browser audio source and describing that source to the session controller.

A source adapter MUST NOT:

- call STT, translation, or TTS providers directly;
- own provider credentials;
- duplicate the cloud pipeline;
- persist audio or transcript content;
- bypass normal VoiceBridge session lifecycle or Stop behavior.

## 6. Source Adapter Contract

The browser source-adapter interface SHOULD expose the following logical operations:

```text
can_capture(context) -> capability
prepare(context) -> prepared_source
start(prepared_source) -> capture_handle
stop(capture_handle) -> void
```

A prepared source SHOULD provide metadata equivalent to:

```json
{
  "source_kind": "BROWSER_TAB",
  "source_adapter": "chromium_tab",
  "display_label": "Current tab",
  "capture_scope": "CURRENT_TAB",
  "audio_available": true
}
```

The display label is user-interface metadata and MUST NOT become a security authority.

The initial Phase 2 source adapter is:

`chromium_tab`

It generalizes the existing current-tab capture behavior rather than introducing a new capture technology.

## 7. Session Contract Evolution

The existing `/api/v1/sessions` endpoint SHOULD remain backward compatible.

Phase 1 request remains valid:

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

Phase 2 SHOULD introduce a new runtime mode without removing the old one:

`UNIVERSAL_BROWSER_AUDIO`

Proposed compatible Phase 2 request shape:

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

The server MAY initially treat `source` as optional for `YOUTUBE_MVP` and required for `UNIVERSAL_BROWSER_AUDIO`.

Provider preferences remain advisory metadata unless a separately approved provider-selection contract makes them operational. A client MUST NOT silently override cloud provider policy merely by writing provider names into session metadata.

## 8. Language Configuration Model

Phase 2 MUST move from hard-coded language literals to validated language identifiers.

Language configuration MUST follow these rules:

- use documented BCP 47 tags at API boundaries;
- validate the requested source language against the selected STT capability;
- validate the language pair against the translation provider policy;
- validate the target language and selected voice against TTS capability;
- reject unsupported combinations before consuming streaming provider work where practical;
- keep provider capability knowledge in cloud-owned configuration or capability registries, not browser hard-coded lists alone.

Phase 2 implementation MUST NOT imply universal language support merely because one provider supports many languages.

The initial implementation MAY preserve `en -> uk` while source generalization is validated. Configurable language support is a separate milestone inside Phase 2.

## 9. Provider Capability Mapping

A provider capability record SHOULD expose normalized fields equivalent to:

```text
provider
capability
supported_languages
streaming
input_formats
output_formats
model
configured
```

Capability discovery MUST NOT expose:

- API keys;
- account identifiers;
- billing details;
- secret endpoints;
- raw provider error bodies.

The browser SHOULD consume a sanitized cloud capability surface rather than duplicating provider-specific support matrices.

## 10. Streaming Compatibility

Phase 2 MUST reuse the existing secure WebSocket transport unless a measured incompatibility requires a separate ADR.

The following Phase 1 properties remain mandatory:

- one-time stream ticket;
- no bearer token in WebSocket URL;
- bounded binary PCM frames;
- bounded client and server buffers;
- acknowledgements and flow control;
- explicit backpressure behavior;
- one active stream per session;
- ordered cloud events;
- bounded disconnect and Stop cleanup;
- no raw-audio persistence.

Generic browser source support MUST NOT create one WebSocket protocol per website.

## 11. Playback Compatibility

Phase 2 MUST preserve the accepted browser playback behavior for sources where the browser can control the captured tab audio graph.

Required behaviors:

- ordered translated PCM playback;
- independent original and translated volume controls;
- smooth ducking and restoration;
- bounded playback queue;
- accurate played-segment instrumentation;
- bounded Stop behavior.

If a future source cannot support the existing ducking mechanism, that limitation MUST be exposed explicitly rather than simulated silently.

## 12. Privacy and Security

Phase 2 inherits all Phase 1 security and privacy rules.

Additionally:

- capture MUST begin only after explicit user action;
- source adapters MUST request the minimum browser permission required;
- tab or source identifiers MUST be treated as transient client metadata;
- provider credentials remain cloud-side;
- raw audio, transcripts, translations, and synthesized audio remain non-persistent by default;
- source metadata MUST NOT be used as authentication;
- arbitrary remote-media retrieval is outside this Phase 2 browser-capture scope;
- KRC Media retrieval paths MUST remain isolated.

## 13. Failure Model

Phase 2 MUST distinguish source failures from cloud pipeline failures.

Source-side failure examples:

- no capturable audio track;
- user denied or ended capture;
- selected tab closed;
- browser permission unavailable;
- unsupported browser source.

Cloud-side failure examples remain:

- provider not configured;
- provider unavailable;
- provider timeout or quota;
- unsupported language;
- stream disconnect;
- bounded queue overflow.

Source-specific failure text MUST NOT be misreported as an STT or translation provider failure.

## 14. Milestone Plan

### P2-M1 - Source Adapter Boundary

Objective:
Extract the existing Chromium tab-capture behavior behind a small source-adapter contract without changing the validated YouTube user behavior.

Acceptance:

- current YouTube test path still works;
- source-adapter contract has automated tests;
- no provider or cloud pipeline behavior changes;
- Stop and ducking tests remain green.

### P2-M2 - Universal Browser Session Contract

Objective:
Add `UNIVERSAL_BROWSER_AUDIO` and source metadata while preserving `YOUTUBE_MVP` compatibility.

Acceptance:

- both runtime modes validate correctly;
- old Phase 1 request remains accepted;
- invalid source descriptors fail before streaming;
- session state exposes normalized source metadata;
- no provider preference becomes operational accidentally.

### P2-M3 - Generic Active-Tab UI Path

Objective:
Allow the user to start VoiceBridge against a capturable current browser tab without YouTube-specific gating.

Acceptance:

- generic supported tab can start and stop;
- YouTube remains a regression case;
- unsupported or silent tabs return actionable errors;
- no new broad host permission is added unless technically required and documented.

### P2-M4 - Language Capability Registry

Objective:
Replace hard-coded `en -> uk` server types with validated capability-aware language configuration.

Acceptance:

- BCP 47 validation is centralized;
- unsupported combinations fail before provider work;
- browser receives sanitized supported options from cloud capability metadata;
- existing `en -> uk` remains green.

### P2-M5 - Configurable Language UI

Objective:
Expose source and target language selection for combinations accepted by the cloud capability registry.

Acceptance:

- browser does not invent unsupported provider capabilities;
- session request and displayed state use the selected languages;
- target voice selection is compatible with target language;
- defaults preserve the Phase 1 English-to-Ukrainian experience.

### P2-M6 - Controlled End-to-End Acceptance

Objective:
Validate Universal Cloud Audio on multiple browser-accessible sources.

Minimum controlled matrix:

- YouTube regression source;
- one non-YouTube video source with capturable tab audio;
- one speech-heavy non-YouTube source;
- Stop during active speech;
- Stop with queued translated playback;
- source tab ending unexpectedly.

Acceptance evidence MUST record:

- source type;
- duration;
- frames sent and dropped;
- final STT, translation, TTS, and played segment counts;
- pending queues after Stop;
- provider names and models;
- observed errors;
- qualitative translation/playback result;
- known limitations.

## 15. Compatibility Gates

Every Phase 2 implementation PR MUST preserve:

- existing Phase 1 session request compatibility until a separately approved API version change;
- current Gemini STT default and AssemblyAI rollback unless a separate provider decision is approved;
- Azure Translator primary and Gemini fallback policy;
- Azure Speech accepted TTS default;
- current provider credential boundaries;
- no intentional user-content persistence;
- bounded Stop behavior;
- browser extension packaging and current automated validation.

## 16. Deferred Work

The following items are explicitly deferred from Phase 2 unless separately approved:

- production user identity;
- durable session history;
- cross-device accounts;
- operating-system-wide capture;
- microphone interpreter mode;
- bidirectional conversation mode;
- native desktop Agent;
- mobile application capture;
- KRC Media ingestion or transcription;
- automatic paid provider fallback;
- production SLA commitments.

## 17. Implementation Order

Implementation MUST proceed in this order:

```text
P2-M1 source adapter boundary
    -> P2-M2 universal session contract
    -> P2-M3 generic active-tab path
    -> P2-M4 language capability registry
    -> P2-M5 configurable language UI
    -> P2-M6 controlled live acceptance
```

A later milestone MUST NOT be used to hide a failed earlier compatibility gate.

## 18. Phase 2 Completion Criteria

Phase 2 is complete only when:

- generic active-tab browser audio works through the existing cloud pipeline;
- the validated YouTube path remains functional;
- language selection is capability-aware rather than hard-coded;
- source and language errors are explicit;
- automated CI is green;
- controlled live acceptance evidence is recorded;
- architecture, roadmap, history, and recovery documentation are synchronized;
- no unapproved persistence, provider purchase, or authentication expansion is introduced.

## 19. Next Task

After this design gate is validated and merged, begin only:

`P2-M1 - Source Adapter Boundary`

P2-M1 MUST be a behavior-preserving refactor before generic source UI behavior is enabled.
