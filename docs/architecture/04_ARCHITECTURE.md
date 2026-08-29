# 04_ARCHITECTURE

UA: Systemna arkhitektura VoiceBridge ta bazovi tekhnichni mezhi.

Purpose:
Define the approved VoiceBridge system architecture, current validated runtime, data flow, integration boundaries, and evolution rules.

Scope:
System-level architecture, runtime components, provider boundaries, data flow, deployment assumptions, security, reliability, and current validated baseline.

Out of Scope:
Detailed implementation tasks, secret values, provider account configuration, user interface design, and low-level code structure.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
1.3.0

Last Updated:
2026-08-29

## Table of Contents

1. Architecture Vision
   UA: Bachennia arkhitektury

2. System Context
   UA: Systemnyi kontekst

3. Core Principles
   UA: Osnovni pryntsypy

4. High Level Architecture
   UA: Arkhitektura vysokoho rivnia

5. Component Responsibilities
   UA: Vidpovidalnist komponentiv

6. Data Flow
   UA: Potik danykh

7. External Integrations
   UA: Zovnishni intehratsii

8. Runtime Modes
   UA: Rezhymy vykonannia

9. Security and Privacy
   UA: Bezpeka ta pryvatnist

10. Reliability and Observability
    UA: Nadiinist ta sposterezhuvanist

11. Evolution Rules
    UA: Pravyla rozvytku

12. References
    UA: Posylannia

13. Version History
    UA: Istoriia versii

## 1. Architecture Vision

VoiceBridge is an open-source AI communication bridge that converts spoken source-language audio into translated target-language speech.

The architecture MUST support incremental growth from the validated YouTube MVP to a universal real-time translation platform.

The system MUST keep capture, recognition, translation, synthesis, playback, and provider integration as separate concerns.

VoiceBridge MUST use a Cloud First architecture.

The browser MUST be the primary client for Phases 1 through 4.

Speech recognition, translation, speech synthesis, session orchestration, and authoritative session state MUST run in the cloud.

A minimal local cross-platform VoiceBridge Agent MAY be introduced only in a later phase when browser or operating-system security prevents required system-audio capture. The Agent MUST remain an edge adapter and MUST NOT become the primary processing runtime.

Phase 1 is complete and validated. Completed Phase 1 scope MUST NOT be reopened without a documented defect or an explicitly approved change.

## 2. System Context

VoiceBridge receives audio from a supported source, processes speech through cloud AI services, and returns translated speech to the user.

Primary actors:

- local user;
- audio source;
- browser client;
- VoiceBridge Cloud;
- speech recognition provider;
- translation provider;
- text-to-speech provider;
- playback target;
- developer or maintainer.

Current validated Phase 1 scenario:

- user watches an English YouTube video;
- the browser extension captures current-tab audio after explicit user action;
- VoiceBridge Cloud receives bounded PCM audio;
- Gemini 3.5 Transcribe Live recognizes English speech by default;
- AssemblyAI `universal-streaming-english` remains an explicit rollback STT path;
- Azure Translator translates final English segments into Ukrainian;
- Gemini remains available as the translation fallback;
- Azure Speech generates Ukrainian speech using `uk-UA-OstapNeural`;
- the browser plays ordered Ukrainian PCM audio;
- automatic ducking lowers and restores original YouTube audio;
- one Stop action drains completed text and translation while bounding queued playback and returns the client to `IDLE`.

## 3. Core Principles

The architecture MUST follow these principles:

- modular components with clear boundaries;
- replaceable AI providers;
- streaming-first processing where possible;
- graceful degradation when an approved provider is unavailable;
- explicit language configuration;
- bounded queues, buffers, retries, and shutdown;
- minimal persistence of sensitive audio or transcript data;
- documented architecture decisions before major changes;
- cloud-owned authoritative session state;
- no new functional phase without explicit project-owner approval.

Provider selection MUST remain explicit and testable. A provider-side default MUST NOT silently change VoiceBridge behavior.

## 4. High Level Architecture

```text
Browser Client
    |
    | HTTPS control and authenticated session requests
    | Secure WebSocket audio and event transport
    v
Cloud API Gateway
    |
    v
Cloud Session Orchestrator
    |
    +-- Audio Ingestion and Processing
    +-- Speech Recognition Service
    +-- Translation Service
    +-- Speech Synthesis Service
    +-- Output Streaming
    |
    v
Browser Playback and Audio Mixing
```

Supporting cloud services:

```text
Configuration
Provider Registry
Session State
Secrets Management
Logging Metrics and Tracing
Error Handling
Quota and Cost Controls
```

Optional later edge component:

```text
System Audio -> VoiceBridge Agent -> Secure Cloud Ingestion
```

The VoiceBridge Agent MUST be introduced only when browser or operating-system restrictions make required capture impossible. It MUST NOT host the authoritative session state or replace cloud AI services.

## 5. Component Responsibilities

### 5.1 Audio Capture Adapter

The audio capture adapter receives audio from a supported source.

Responsibilities:

- connect to source-specific audio input;
- require explicit user authorization where applicable;
- normalize audio format for the processing pipeline;
- expose streaming audio chunks;
- preserve or intentionally control local source playback;
- avoid provider-specific translation logic.

### 5.2 Audio Processing Pipeline

The audio processing pipeline prepares captured audio for recognition.

Responsibilities:

- buffer audio chunks within approved bounds;
- apply required audio format conversion;
- manage timing metadata;
- enforce frame and output-buffer limits;
- pass ordered audio to speech recognition;
- release buffers during shutdown.

The validated browser input is PCM16 mono at 48 kHz. The Gemini STT adapter applies bounded stateful FIR decimation to PCM16 mono at 16 kHz and sends bounded provider chunks.

### 5.3 Speech Recognition Service

The speech recognition service converts speech audio to source-language text.

Responsibilities:

- accept streaming or segmented audio input;
- return partial and final text with timing metadata when available;
- surface confidence or quality metadata when available;
- preserve segment order;
- hide provider-specific APIs behind a common `SttProvider` interface;
- support bounded completion and cleanup.

Accepted Phase 1 provider policy:

- default: Gemini 3.5 Transcribe Live, model `gemini-3.5-transcribe-live`;
- explicit rollback: AssemblyAI `universal-streaming-english`.

The provider factory MUST preserve the common `SttProvider` boundary and MUST reject unapproved model configuration.

### 5.4 Translation Service

The translation service converts source-language text into target-language text.

Responsibilities:

- receive accepted final recognition segments;
- translate according to configured source and target languages;
- preserve segment identity and ordering;
- preserve meaning and conversational tone;
- return text suitable for speech synthesis;
- apply the approved primary and fallback policy;
- avoid persistence of translation text.

Accepted Phase 1 provider policy:

- primary: Azure Translator;
- fallback: Gemini `gemini-3.1-flash-lite`.

### 5.5 Speech Synthesis Service

The speech synthesis service converts translated text into target-language audio.

Responsibilities:

- generate speech in the configured target language;
- support voice configuration where available;
- return playable normalized audio;
- preserve ordered segment delivery;
- hide provider-specific APIs behind a common interface;
- keep generated audio transient.

Accepted Phase 1 provider:
Azure Speech with `uk-UA-OstapNeural`, raw 24 kHz 16-bit mono PCM.

Gemini TTS remains an explicitly selectable supported provider but is not the accepted Phase 1 default.

### 5.6 Playback Adapter

The playback adapter delivers translated audio to the user.

Responsibilities:

- play synthesized audio in order;
- coordinate playback timing;
- maintain bounded playback queues;
- expose playback state;
- support independent original and translated volume controls;
- apply automatic original-audio ducking and restoration;
- release audio resources during Stop or failure;
- avoid speech recognition and translation logic.

Played-segment instrumentation MUST count only playback that actually completes. Audio discarded by the bounded Stop policy MUST NOT be counted as played.

### 5.7 Session Controller

The cloud session controller coordinates a translation session.

Responsibilities:

- load configuration;
- create component instances;
- own authoritative session state;
- start, pause, resume, and stop processing where supported;
- validate state transitions;
- coordinate bounded drain and cleanup;
- route errors to recovery handling;
- expose sanitized session state and metrics.

### 5.8 Provider Registry

The provider registry and provider factories manage available AI providers.

Responsibilities:

- register speech recognition providers;
- register translation providers;
- register speech synthesis providers;
- select providers based on explicit configuration and capability;
- apply approved fallback policies;
- keep provider-specific code isolated;
- preserve explicit rollback paths.

## 6. Data Flow

The canonical data flow is:

```text
source audio
 -> normalized bounded audio chunks
 -> recognized source-language text
 -> translated target-language text
 -> synthesized target-language audio
 -> ordered playback output
```

The current validated Phase 1 path is:

```text
YouTube tab audio
 -> VoiceBridge browser extension
 -> VoiceBridge Cloud
 -> Gemini 3.5 Transcribe Live English STT
 -> Azure Translator
 -> Azure Speech Ukrainian TTS
 -> browser PCM playback
 -> automatic original-audio ducking and restoration
```

The validated STT rollback path is:

```text
YouTube tab audio
 -> VoiceBridge browser extension
 -> VoiceBridge Cloud
 -> AssemblyAI universal-streaming-english
 -> Azure Translator
 -> Azure Speech Ukrainian TTS
```

The validated translation fallback path is:

```text
Selected English STT
 -> Gemini translation fallback
 -> Azure Speech Ukrainian TTS
```

Intermediate data SHOULD be treated as transient session data.

Persistent storage MUST NOT be introduced for VoiceBridge audio, transcripts, translations, or generated speech unless a documented requirement and architecture decision approve it.

## 7. External Integrations

The validated Phase 1 integrations are:

- Chromium browser and YouTube tab audio capture;
- Render-hosted VoiceBridge Cloud;
- Google Gemini 3.5 Transcribe Live as default streaming STT;
- AssemblyAI streaming STT as explicit rollback;
- Azure Translator as primary translation;
- Gemini translation fallback;
- Azure Speech TTS;
- browser PCM playback.

Each external integration MUST be wrapped by an adapter or provider interface.

The core pipeline MUST NOT depend directly on a single vendor API.

Provider credentials MUST remain in approved cloud secret configuration and MUST NOT be sent to the browser or committed to the repository.

## 8. Runtime Modes

| Mode | Client | Processing | Status |
|------|--------|------------|--------|
| YouTube MVP | Chromium browser extension | Cloud | Completed - MVP Validated |
| Generic Audio | Browser | Cloud | Planned - Phase 2 |
| Multi Platform | Browser-accessible client | Cloud | Planned |
| Interpreter | Browser with optional minimal Agent | Cloud | Planned |

Accepted current Phase 1 runtime baseline:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- Gemini 3.5 Transcribe Live as default STT;
- AssemblyAI `universal-streaming-english` as explicit rollback STT;
- Azure Translator primary translation;
- Gemini translation fallback;
- Azure Speech TTS voice `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- automatic ducking and restoration;
- bounded one-press Stop behavior;
- no intentional VoiceBridge content persistence.

The controlled test launch MAY use a single shared revocable test access token. User registration, password recovery, social login, organizations, and role administration remain outside the controlled test scope.

Public or multi-user production access MUST NOT use the shared test token and MUST require an approved authentication and authorization design.

## 9. Security and Privacy

VoiceBridge MUST minimize sensitive data exposure.

Security and privacy rules:

- do not store raw audio by default;
- do not store transcripts by default;
- do not store translations or generated speech by default;
- do not store provider credentials in source code;
- load secrets from approved cloud configuration mechanisms;
- redact secrets and user content from logs;
- authenticate control and streaming boundaries;
- prevent cross-session delivery;
- release transient session content during cleanup;
- document any future persistence before implementation.

Provider privacy and data-use terms MUST be reviewed when provider selection changes.

## 10. Reliability and Observability

The system SHOULD expose enough observability to debug translation sessions without leaking sensitive content.

Required operational signals:

- session lifecycle events;
- selected provider and model metadata;
- provider availability errors;
- pipeline timing metrics;
- queue, retry, drop, and playback counters;
- recoverable processing failures;
- user-visible failure state;
- clean drain and shutdown outcomes.

The system SHOULD support graceful recovery from:

- temporary provider failure;
- provider rate limits;
- network interruption;
- unsupported audio format;
- empty or low-quality audio input;
- browser or stream disconnect;
- bounded shutdown timeout.

Observed validation latency values are evidence, not production service-level guarantees.

## 11. Evolution Rules

Architecture changes MUST follow repository governance.

Major changes require documentation before implementation when they affect:

- component boundaries;
- provider abstraction;
- data persistence;
- security or privacy behavior;
- runtime modes;
- external platform integration;
- authentication or authorization;
- authoritative session state.

Accepted architecture changes SHOULD be recorded in an ADR when they introduce a long-term decision.

Completed Phase 1 work MUST NOT be reopened without a documented defect or explicitly approved change.

Phase 2 MUST begin with a source-adapter and session-contract design gate. It MUST reuse the existing cloud processing boundaries rather than duplicate the translation pipeline for each source.

## 12. References

- ../overview/01_PROJECT_OVERVIEW.md
- ../overview/07_PROJECT_DESCRIPTION.md
- ../planning/02_REPOSITORY_STRUCTURE.md
- ../planning/03_ROADMAP.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md
- ../requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md
- ../security/12_SECURITY_MODEL.md
- ../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md
- ../phases/PHASE_1_MVP_VALIDATION.md
- ../history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md
- ../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md
- ../adr/ADR-008_AZURE_TTS_PROVIDER.md
- ../adr/ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER.md

## 13. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.3.0 | 2026-08-29 | Synchronized architecture with Gemini default STT, AssemblyAI rollback, Azure translation and TTS, and bounded Stop behavior |
| 1.2.0 | 2026-07-22 | Synchronized architecture with the validated Phase 1 runtime and completion boundary |
| 1.1.0 | 2026-07-18 | Established Cloud First runtime and controlled test authentication boundaries |
| 1.0.0 | 2026-07-18 | Initial approved system architecture definition |
