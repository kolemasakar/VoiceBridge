# 05_TECHNOLOGY_STACK

UA: Tekhnolohichnyi stek VoiceBridge ta zatverdzheni tekhnichni vybirky.

Purpose:
Define the approved technology stack for VoiceBridge, including runtime platforms, languages, providers, tooling, and stack governance rules.

Scope:
Technology selection, implementation boundaries, development tools, validation tools, provider choices, and future stack evolution.

Out of Scope:
Detailed implementation tasks, provider credentials, deployment secrets, pricing decisions, and private environment values.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
1.3.0

Last Updated:
2026-08-29

## Table of Contents

1. Stack Vision
   UA: Bachennia steku

2. Stack Principles
   UA: Pryntsypy steku

3. Application Runtime
   UA: Seredovyshche vykonannia dodatku

4. Programming Languages
   UA: Movy prohramuvannia

5. User Interface Layer
   UA: Shar interfeisu korystuvacha

6. Audio Layer
   UA: Audio shar

7. AI Provider Layer
   UA: Shar AI provideriv

8. Configuration and Secrets
   UA: Konfiguratsiia ta sekrety

9. Testing and Quality Tools
   UA: Instrumenty testuvannia ta yakosti

10. Documentation Tooling
    UA: Instrumenty dokumentatsii

11. Dependency Rules
    UA: Pravyla zalezhnostei

12. Evolution Rules
    UA: Pravyla rozvytku

13. References
    UA: Posylannia

14. Version History
    UA: Istoriia versii

## 1. Stack Vision

VoiceBridge uses a pragmatic, modular technology stack that supports fast validation and long-term evolution into a universal real-time translation platform.

The stack MUST support:

- browser audio capture;
- streaming-oriented speech processing;
- replaceable speech recognition providers;
- replaceable translation providers;
- replaceable speech synthesis providers;
- local browser playback of translated speech;
- clear separation between application logic and vendor integrations.

## 2. Stack Principles

The technology stack MUST:

- prefer simple, maintainable tools over premature complexity;
- keep provider-specific code behind adapter interfaces;
- avoid hard dependency on one AI vendor in core pipeline logic;
- keep secrets outside source code;
- make accepted provider defaults explicit and testable;
- retain documented rollback paths where approved;
- document major stack changes before implementation;
- keep repository documentation ASCII-only and Markdown-based.

## 3. Application Runtime

The approved runtime direction is Cloud First.

| Category | Approved Direction | Status |
|----------|--------------------|--------|
| Primary client | Chromium browser extension / browser application | In use |
| API runtime | Cloud-hosted TypeScript service | In use |
| STT runtime | Cloud service behind `SttProvider` | In use |
| Translation runtime | Cloud service behind provider adapter | In use |
| TTS runtime | Cloud service behind provider adapter | In use |
| Session orchestration | Cloud-hosted service | In use |
| Authoritative state | Cloud-managed transient session state | In use |
| Local Agent | Minimal cross-platform edge adapter only if browser capture is insufficient | Future |

The browser is the primary client for Phases 1 through 4.

The Phase 1 cloud service is deployed as a Render Web Service using the provider-neutral Dockerfile in `src/cloud/`. Render is the accepted test-hosting platform and does not define the final production hosting contract.

## 4. Programming Languages

Approved language choices:

| Area | Approved Language | Status |
|------|-------------------|--------|
| Browser-facing code | JavaScript / TypeScript-compatible browser code | In use |
| Cloud API and orchestration | TypeScript on Node.js 24+ | In use |
| Local service or automation | Python | Approved when needed |
| Build and repository scripts | Bash, JavaScript, or Python | Approved |
| Configuration | JSON, YAML, TOML, or environment variables | Approved |

The cloud package currently uses:

- Node.js 24+;
- TypeScript 7.0.2;
- `ws` 8.21.1 for WebSocket transport;
- Node.js built-in test runner;
- no provider SDK dependency in the core cloud package.

Provider integrations use explicit HTTP or WebSocket adapters so provider-specific SDKs do not become mandatory core dependencies.

## 5. User Interface Layer

The Phase 1 user interface is the Chromium browser extension under `src/browser_extension/`.

Responsibilities include:

- explicit user-controlled capture;
- session state display;
- English and Ukrainian transcript presentation;
- original and Ukrainian volume controls;
- automatic original-audio ducking;
- ordered Ukrainian PCM playback;
- bounded Stop behavior;
- transcript-copy support.

UI code MUST NOT contain direct provider secrets.

## 6. Audio Layer

The audio layer handles capture, normalization, buffering, transport, and playback.

Current Phase 1 audio path:

- browser capture uses Web Audio and AudioWorklet APIs;
- browser input is PCM16 mono at 48 kHz;
- secure WebSocket transports bounded PCM frames to VoiceBridge Cloud;
- the Gemini STT adapter performs bounded stateful FIR conversion to PCM16 mono at 16 kHz;
- Azure Speech returns raw 24 kHz 16-bit mono PCM for browser playback.

Audio implementation MUST remain separate from recognition, translation, and synthesis logic.

## 7. AI Provider Layer

The AI provider layer contains integrations for speech recognition, translation, and text-to-speech.

Approved provider rules:

- providers MUST be wrapped by service adapters;
- provider credentials MUST be loaded from approved environment configuration;
- provider responses SHOULD be normalized before entering core pipeline logic;
- provider-specific errors SHOULD be mapped to common application errors;
- fallback and rollback behavior MUST be explicit;
- provider model identifiers MUST be guarded when silent upstream model changes could alter behavior.

Current accepted Phase 1 provider matrix:

| Capability | Default | Fallback / Rollback | Status |
|------------|---------|---------------------|--------|
| Streaming STT | Gemini `gemini-3.5-transcribe-live` | AssemblyAI `universal-streaming-english` explicit rollback | Validated |
| Translation | Azure Translator | Gemini `gemini-3.1-flash-lite` | Validated |
| Ukrainian TTS | Azure Speech `uk-UA-OstapNeural` | Gemini TTS selectable by explicit configuration | Validated primary |

Gemini STT was accepted after controlled same-duration A/B validation on 2026-08-29. AssemblyAI remains implemented and testable as the rollback provider.

No automatic paid provider fallback is approved for the accepted Phase 1 runtime.

## 8. Configuration and Secrets

Configuration MUST be explicit and environment-aware.

Approved configuration sources:

- deployment environment variables for secrets and runtime selection;
- local ignored configuration files for developer machines;
- checked-in example configuration without real secrets;
- documented defaults for non-sensitive settings.

Accepted provider-selection defaults:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Explicit STT rollback:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

Secrets MUST NOT be committed to the repository.

## 9. Testing and Quality Tools

Testing and quality tooling MUST match the implemented stack.

Current checks include:

- TypeScript compilation;
- Node.js automated cloud tests;
- Gemini STT adapter tests;
- AssemblyAI model guard and adapter regression tests;
- provider factory tests;
- Azure translation tests;
- Azure TTS tests;
- browser JavaScript validation;
- browser Stop-policy tests;
- browser manifest validation;
- extension packaging;
- Markdown ASCII validation.

Tests SHOULD avoid calling paid or external AI providers by default.

Provider integrations SHOULD support mocks or test doubles.

## 10. Documentation Tooling

Documentation MUST use Markdown unless another format is technically required.

Documentation checks SHOULD verify:

- ASCII-only content;
- valid relative references;
- required document metadata;
- consistent version history.

## 11. Dependency Rules

Dependencies MUST be added intentionally.

Dependency rules:

- add dependencies only when they support an approved capability;
- prefer actively maintained packages;
- avoid dependencies that require secrets at install time;
- avoid committing generated dependency directories;
- document major runtime dependencies when introduced;
- remove unused dependencies promptly;
- keep provider-specific dependencies out of core architecture when direct protocol integration is sufficient.

## 12. Evolution Rules

Technology stack changes MUST follow repository governance.

A documented decision is required before introducing:

- a new production language;
- a required cloud runtime;
- a persistent VoiceBridge content database;
- a new UI framework with long-term maintenance impact;
- a provider-specific dependency in core pipeline logic;
- storage of audio, transcripts, translations, or generated speech;
- a new default provider that changes accepted runtime behavior.

Phase 2 SHOULD reuse the current provider-neutral cloud pipeline and add source adapters rather than create source-specific AI stacks.

## 13. References

- ../../README.md
- 04_ARCHITECTURE.md
- ../planning/02_REPOSITORY_STRUCTURE.md
- ../planning/03_ROADMAP.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md
- ../history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md
- ../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md

## 14. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.3.0 | 2026-08-29 | Synchronized the technology stack with the accepted Gemini STT, Azure translation, Azure TTS runtime and explicit rollback paths |
| 1.2.0 | 2026-07-18 | Added the Phase 1 WebSocket server dependency and browser streaming APIs |
| 1.1.0 | 2026-07-18 | Recorded Render as the Phase 1 test deployment platform |
| 1.0.0 | 2026-07-18 | Initial approved technology stack definition |
