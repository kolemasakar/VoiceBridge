# VoiceBridge Phase 2 Universal Cloud Audio Design

UA: Dyzain fazy 2 Universal Cloud Audio.

Status: COMPLETE - IMPLEMENTED AND VALIDATED

Version: 1.1.0

Date: 2026-08-30

## 1. Purpose

Define the approved design boundary, compatibility rules, milestone sequence, and acceptance criteria for Phase 2 Universal Cloud Audio.

This design was implemented and validated. Phase 2 generalized the validated YouTube browser path without replacing the working cloud speech pipeline.

## 2. Accepted Entry Baseline

Phase 2 started from the validated Phase 1 cloud pipeline:

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

Phase 1 browser capture, secure streaming transport, Stop policy, provider adapters, playback, privacy, and no-persistence rules remained regression baselines throughout Phase 2.

## 3. Final Phase 2 Architecture Decision

Source capture is separated from cloud speech processing.

Canonical boundary:

```text
Browser Source Adapter
    -> normalized browser audio stream
    -> PCM Capture Pipeline
    -> existing VoiceBridge WebSocket ingestion
    -> existing cloud STT / Translation / TTS pipeline
    -> existing browser playback adapter
```

The initial source adapter is:

`chromium_tab`

The source adapter owns source acquisition and capture metadata only. It does not own AI provider credentials, cloud provider selection, content persistence, or a separate website-specific speech pipeline.

## 4. Final Session Contract

Phase 2 introduced:

`UNIVERSAL_BROWSER_AUDIO`

while preserving backward compatibility with:

`YOUTUBE_MVP`

Universal browser sessions use normalized browser-tab source metadata and the `chromium_tab` adapter.

Provider preferences remain non-authoritative browser metadata. Cloud provider policy remains authoritative.

## 5. Language Configuration Model

Phase 2 moved language validation from hard-coded browser/server assumptions to a cloud-owned capability registry.

Rules:

- API language identifiers use BCP 47-compatible normalized values;
- source language is validated against STT capability;
- language pair is validated against translation policy;
- target language/voice is validated against TTS capability;
- unsupported combinations fail before provider work where practical;
- the browser consumes sanitized cloud capability metadata;
- the browser fails closed if the registry cannot validate its selected pair.

Current validated registry version:

`1.0.0`

Current validated pair:

`English (en) -> Ukrainian (uk)`

Phase 2 does not claim support for every language available from upstream providers.

## 6. Streaming Compatibility

Phase 2 reused the existing secure WebSocket transport.

Preserved properties:

- one-time stream ticket;
- no bearer token in the WebSocket URL;
- bounded binary PCM frames;
- bounded client/server buffers;
- acknowledgements and backpressure;
- one active stream per session;
- ordered cloud events;
- bounded disconnect/Stop cleanup;
- no raw-audio persistence.

Generic browser-source support did not introduce per-site WebSocket protocols.

## 7. Playback Compatibility

Phase 2 preserved:

- ordered translated PCM playback;
- independent original and translated volume controls;
- smooth ducking/restoration;
- bounded playback queue;
- accurate played-segment instrumentation;
- bounded Stop behavior.

The accepted runtime also performs bounded cleanup when the captured tab audio track ends unexpectedly.

## 8. Security and Privacy

Phase 2 preserved Phase 1 security/privacy rules and added source-boundary rules:

- capture starts only after explicit user action;
- only the approved browser permission boundary is used;
- provider credentials remain cloud-side;
- raw audio, transcripts, translations, and synthesized audio remain non-persistent by default;
- source metadata is not authentication;
- arbitrary remote-media retrieval is outside Phase 2 browser capture;
- KRC Media retrieval/transcription remains isolated.

## 9. Implemented Milestones

### P2-M1 - Source Adapter Boundary

Status: PASS.

Implemented `chromium_tab` adapter and moved current-tab capture orchestration behind the adapter boundary while preserving YouTube behavior.

### P2-M2 - Universal Browser Session Contract

Status: PASS.

Implemented `UNIVERSAL_BROWSER_AUDIO`, normalized source metadata, and compatibility with `YOUTUBE_MVP`.

### P2-M3 - Generic Active-Tab UI Path

Status: PASS.

Validated ordinary HTTP/HTTPS current-tab media capture, YouTube regression, silent-tab guard, and restricted-page guard.

### P2-M4 - Language Capability Registry

Status: PASS.

Centralized language validation and exposed sanitized browser-facing capability metadata. Initial advertised pair intentionally remained `en -> uk`.

### P2-M5 - Configurable Language UI

Status: PASS.

Extension `0.8.0` consumes cloud capabilities for Source/Target selectors, preserves cloud authority, and fails closed when capability readiness is absent.

### P2-M6 - Controlled End-to-End Acceptance

Status: PASS.

Controlled matrix:

- YouTube steady-state regression;
- Vimeo non-YouTube video;
- TED speech-heavy source;
- Stop during active speech;
- Stop with non-zero translated playback backlog;
- source tab ending unexpectedly.

Canonical acceptance record:

`PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

## 10. Accepted Runtime

Browser:

`VoiceBridge Extension 0.8.0`

Provider matrix:

- Gemini `gemini-3.5-transcribe-live` default STT;
- AssemblyAI `universal-streaming-english` explicit STT rollback;
- Azure Translator primary;
- Gemini translation fallback;
- Azure Speech `uk-UA-OstapNeural` default TTS.

Current validated source class:

- supported ordinary Chromium current tab with active audio.

Current validated language pair:

`en -> uk`

## 11. Controlled E2E Evidence Summary

Key accepted evidence includes:

- YouTube and non-YouTube playback with audible Ukrainian speech and actual ducking;
- TED speech-heavy run with Gemini finals, Azure translation, Azure TTS, played segments, and clean Stop;
- Stop during active speech returned to `IDLE` in about `2-3 s` in the accepted run;
- Stop with `45,469 ms` queued translated playback drained to `0 ms` and returned to `IDLE` in about `7 s`;
- closing the captured source tab with `55,386 ms` queued translated playback required no second Stop, drained downstream work to `0 ms`, and returned VoiceBridge to `IDLE` in about `45 s`.

Observed timings are acceptance evidence, not production SLA guarantees.

## 12. Deferred Work

Still outside Phase 2 unless separately approved:

- production user identity;
- durable session/content history;
- operating-system-wide capture;
- microphone interpreter mode;
- bidirectional conversation mode;
- native desktop Agent;
- mobile application capture;
- KRC Media ingestion/transcription;
- automatic paid provider fallback;
- universal language claims;
- production SLA commitments.

## 13. Completion Criteria

All Phase 2 completion criteria are satisfied:

- generic active-tab browser audio works through the existing cloud pipeline;
- YouTube remains functional;
- language selection is capability-aware rather than browser hard-coded;
- source/language errors are explicit;
- automated CI gates passed throughout implementation;
- controlled live acceptance evidence is recorded;
- architecture, roadmap, technology stack, history, and recovery documentation are synchronized by the Phase 2 closure change;
- no unapproved persistence, provider purchase, or authentication expansion was introduced.

## 14. Next Task

Phase 2 is closed.

Next functional roadmap scope:

`Phase 3 - Cloud Service Hardening`

Phase 3 MUST begin with its own scoped design/acceptance plan and MUST preserve the accepted Phase 1/Phase 2 runtime as regression baseline.

## 15. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-08-30 | Marked Phase 2 implemented and validated; recorded final M1-M6 state, accepted Extension 0.8.0 runtime, and Phase 3 handoff |
| 1.0.0 | 2026-08-29 | Approved Phase 2 design gate and implementation order |
