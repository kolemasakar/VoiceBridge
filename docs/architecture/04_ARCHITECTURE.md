# 04_ARCHITECTURE

UA: Systemna arkhitektura VoiceBridge ta bazovi tekhnichni mezhi.

Purpose:
Define the approved VoiceBridge system architecture, current validated runtime, data flow, integration boundaries, and evolution rules.

Scope:
System-level architecture, runtime components, provider boundaries, data flow, deployment assumptions, security, reliability, and current validated baseline.

Out of Scope:
Detailed implementation tasks, secret values, provider account configuration, and low-level code structure.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved - Phase 2 Validated

Version:
1.4.0

Last Updated:
2026-08-30

## 1. Architecture Vision

VoiceBridge is an open-source AI communication bridge that converts spoken source-language audio into translated target-language speech.

VoiceBridge uses a Cloud First architecture.

The browser is the primary client for Phases 1 through 4. Speech recognition, translation, speech synthesis, language capability validation, session orchestration, and authoritative session state run in the cloud.

A minimal local cross-platform VoiceBridge Agent MAY be introduced only in a later phase when browser or operating-system security prevents required system-audio capture. The Agent MUST remain an edge adapter and MUST NOT become the primary processing runtime.

Phase 1 and Phase 2 are complete and validated. Completed scope MUST NOT be reopened without a documented defect or explicitly approved change.

## 2. Current Validated System Context

Current accepted browser runtime:

`VoiceBridge Extension 0.8.0`

Current validated user scenario:

- user opens a supported ordinary `http://` or `https://` browser tab with audible media;
- the Chromium source adapter captures current-tab audio after explicit user action;
- the browser converts capture to bounded PCM frames;
- VoiceBridge Cloud receives audio through the existing authenticated WebSocket transport;
- Gemini 3.5 Transcribe Live recognizes English speech by default;
- AssemblyAI `universal-streaming-english` remains an explicit rollback STT path;
- Azure Translator translates final English segments into Ukrainian;
- Gemini remains the translation fallback;
- Azure Speech generates Ukrainian speech using `uk-UA-OstapNeural`;
- the browser plays ordered translated PCM audio;
- automatic ducking lowers and restores original tab audio;
- Stop and source-tab-ended cleanup are bounded and return the client to a terminal state;
- language selectors are populated only from sanitized cloud capability metadata.

Current validated language pair:

`en -> uk`

Current language registry version:

`1.0.0`

## 3. Core Principles

The architecture MUST follow these principles:

- Cloud First execution;
- modular components with clear boundaries;
- replaceable AI providers;
- source adapters separated from cloud AI processing;
- streaming-first processing where possible;
- explicit language configuration and cloud-owned capability validation;
- bounded queues, buffers, retries, and shutdown;
- minimal persistence of sensitive audio or derived content;
- documented architecture decisions before major changes;
- cloud-owned authoritative session state;
- explicit and testable provider selection;
- no silent provider-side default changes;
- no new functional phase without explicit project-owner approval.

## 4. High-Level Architecture

```text
Supported Browser Tab
    |
    v
Chromium Source Adapter
    |
    v
Browser PCM Capture + Audio Graph
    |
    | authenticated HTTPS control
    | one-time-ticket WebSocket audio/events
    v
VoiceBridge Cloud API + Session Orchestrator
    |
    +-- Language Capability Registry
    +-- Audio Ingestion / Backpressure
    +-- STT Provider Boundary
    +-- Translation Provider Boundary
    +-- TTS Provider Boundary
    +-- Session State / Metrics
    |
    v
Browser Translated PCM Playback
    |
    +-- Original volume control
    +-- Translated volume control
    +-- Automatic ducking/restoration
```

Generic source support MUST NOT create a separate STT/translation/TTS pipeline per website.

## 5. Browser Source Adapter Boundary

The browser source adapter owns only source acquisition and capture metadata.

Current adapter:

`chromium_tab`

Logical contract:

```text
can_capture(context)
prepare(context)
start(prepared_source)
stop(capture_handle)
```

The adapter MUST NOT:

- call STT, translation, or TTS providers directly;
- own provider credentials;
- duplicate the cloud pipeline;
- persist audio or transcripts;
- bypass session lifecycle, Stop, or cleanup policy.

Current source metadata is normalized as browser-tab metadata and is not a security authority.

## 6. Session Contract

VoiceBridge preserves the Phase 1 `YOUTUBE_MVP` compatibility path and adds the Phase 2 runtime mode:

`UNIVERSAL_BROWSER_AUDIO`

Phase 2 source metadata identifies a browser tab and the `chromium_tab` adapter.

Provider preferences remain non-authoritative client metadata unless a separately approved provider-selection contract changes that rule.

The browser MUST NOT force provider policy by writing a provider name into session metadata.

## 7. Language Capability Architecture

Language support is cloud-owned.

The cloud capability registry centralizes:

- BCP 47 validation;
- source-language STT capability;
- translation pair capability;
- target-language TTS/voice capability;
- sanitized browser-facing supported options.

The browser consumes sanitized registry metadata and MUST fail closed when capabilities cannot be loaded or a selected pair is not accepted.

Current validated pair is intentionally limited to:

`English (en) -> Ukrainian (uk)`

VoiceBridge MUST NOT advertise universal language support merely because an upstream provider supports additional languages.

## 8. Audio and Streaming Architecture

Browser input path:

- Chrome tab capture;
- Web Audio / AudioWorklet processing;
- PCM16 mono at 48 kHz for cloud transport;
- bounded frame buffering and acknowledgements;
- one active stream per session;
- one-time stream ticket;
- no bearer token in the WebSocket URL.

Gemini STT adapter:

- bounded stateful conversion to PCM16 mono at 16 kHz;
- explicit model guard for `gemini-3.5-transcribe-live`.

Azure Speech playback payload:

- raw 24 kHz 16-bit mono PCM.

Raw audio is transient and MUST NOT be intentionally persisted by the accepted runtime.

## 9. AI Provider Boundaries

### 9.1 Speech Recognition

Default:

`Gemini gemini-3.5-transcribe-live`

Explicit rollback:

`AssemblyAI universal-streaming-english`

Both remain behind the common cloud STT boundary.

### 9.2 Translation

Primary:

`Azure Translator`

Fallback:

`Gemini gemini-3.1-flash-lite`

Translation receives accepted final STT segments and preserves session/segment ordering.

### 9.3 Speech Synthesis

Accepted default:

`Azure Speech uk-UA-OstapNeural`

Gemini TTS remains explicitly selectable by configuration but is not the accepted default.

No automatic paid provider fallback is approved.

## 10. Playback and Ducking

Browser playback responsibilities:

- ordered translated PCM playback;
- bounded playback queue;
- independent original and translated volume controls;
- smooth automatic ducking and restoration;
- accurate played-segment instrumentation;
- bounded cancellation/drain during Stop or source termination.

Played-segment instrumentation counts only playback that actually completes.

Phase 2 live acceptance demonstrated:

- Stop with `45,469 ms` queued playback drained to `0 ms` and returned to `IDLE` in about `7 s`;
- source-tab closure with `55,386 ms` queued playback automatically drained to `0 ms` and returned to `IDLE` without a second Stop in about `45 s`.

These observed times are acceptance evidence, not service-level guarantees.

## 11. Runtime Modes

| Mode | Client | Processing | Status |
|------|--------|------------|--------|
| YouTube MVP | Chromium browser extension | Cloud | Completed - Validated regression baseline |
| Universal Browser Audio | Chromium browser extension | Cloud | Completed - Controlled E2E Validated |
| Multi Platform | Browser-accessible client | Cloud | Planned |
| Interpreter | Browser with optional minimal Agent | Cloud | Planned |

## 12. Security and Privacy

Security and privacy rules:

- capture begins only after explicit user action;
- source adapters request only the approved browser permission boundary;
- do not store raw audio by default;
- do not store transcripts by default;
- do not store translations or generated speech by default;
- provider credentials remain cloud-side;
- secrets are not committed to source control;
- bearer access tokens are not placed in WebSocket URLs;
- source metadata is not authentication;
- transient session content is released during cleanup;
- any future persistence requires an explicit architecture decision;
- KRC Media retrieval/transcription paths remain isolated from VoiceBridge browser capture.

## 13. Reliability and Observability

Required operational signals include:

- session lifecycle state;
- selected provider/model metadata;
- language registry version and selected pair;
- provider availability errors;
- STT/translation/TTS latency;
- frames sent, dropped, and unacknowledged;
- pending, buffered, retry, and playback queue counters;
- played-segment counters;
- clean Stop and source-ended cleanup outcomes.

Small bounded non-zero dropped or unacknowledged counts are observations, not automatically failures. They become blockers when persistent/material, correlated with degraded output, or capable of preventing bounded completion.

## 14. Phase 2 Validation Boundary

The final Phase 2 controlled matrix passed:

- YouTube regression;
- Vimeo non-YouTube video;
- TED speech-heavy source;
- Stop during active speech;
- Stop with a non-zero translated playback backlog;
- source tab ending unexpectedly without manual Stop.

Canonical acceptance record:

`../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

## 15. Evolution Rules

Major changes require documentation before implementation when they affect:

- source/capture boundaries;
- provider abstraction or defaults;
- language capability policy;
- data persistence;
- security or privacy behavior;
- runtime modes;
- external platform integration;
- authentication or authorization;
- authoritative session state.

Completed Phase 1 and Phase 2 scope MUST NOT be reopened without a documented defect or explicitly approved change.

Phase 3 Cloud Service Hardening is the next functional roadmap phase and MUST begin with its own scoped plan and acceptance gate.

## 16. References

- ../overview/01_PROJECT_OVERVIEW.md
- ../overview/07_PROJECT_DESCRIPTION.md
- ../planning/03_ROADMAP.md
- ../architecture/05_TECHNOLOGY_STACK.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md
- ../security/12_SECURITY_MODEL.md
- ../api/13_API_DESIGN.md
- ../phases/PHASE_1_MVP_VALIDATION.md
- ../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md
- ../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md
- ../bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md
- ../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md

## 17. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.4.0 | 2026-08-30 | Synchronized architecture with validated generic active-tab capture, universal session contract, cloud language capability registry, Extension 0.8.0, and M6 lifecycle acceptance |
| 1.3.0 | 2026-08-29 | Synchronized architecture with Gemini default STT, AssemblyAI rollback, Azure translation and TTS, and bounded Stop behavior |
| 1.2.0 | 2026-07-22 | Synchronized architecture with the validated Phase 1 runtime and completion boundary |
| 1.1.0 | 2026-07-18 | Established Cloud First runtime and controlled test authentication boundaries |
| 1.0.0 | 2026-07-18 | Initial approved system architecture definition |
