# 05_TECHNOLOGY_STACK

UA: Tekhnolohichnyi stek VoiceBridge ta zatverdzheni tekhnichni vybirky.

Purpose:
Define the approved technology stack for VoiceBridge, including runtime platforms, languages, frameworks, providers, tooling, and stack governance rules.

Scope:
Technology selection, allowed categories, implementation boundaries, development tools, validation tools, and future stack evolution.

Out of Scope:
Detailed implementation tasks, provider credentials, deployment secrets, pricing decisions, and vendor-specific configuration values.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
1.2.0

Last Updated:
2026-07-18

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

VoiceBridge uses a pragmatic, modular technology stack that supports fast MVP validation and long-term evolution into a universal real-time translation platform.

The stack MUST support these architecture goals:

- audio capture from browser or system sources;
- streaming-oriented speech processing;
- replaceable speech recognition providers;
- replaceable translation providers;
- replaceable speech synthesis providers;
- local playback of translated speech;
- clear separation between application logic and vendor integrations.

Technology choices MUST remain compatible with the approved architecture boundaries.

## 2. Stack Principles

The technology stack MUST follow these principles:

- prefer simple, maintainable tools over premature complexity;
- keep provider-specific SDKs behind adapter interfaces;
- avoid hard dependency on a single AI vendor in core business logic;
- choose technologies that can support desktop, browser, and future platform expansion;
- keep secrets outside source code;
- document major stack changes before implementation;
- keep documentation ASCII-only and Markdown-based.

## 3. Application Runtime

The approved runtime direction is Cloud First.

| Category | Approved Direction | Status |
|----------|--------------------|--------|
| Primary client | Browser application | Approved |
| API runtime | Cloud-hosted service | Approved |
| STT runtime | Cloud service behind provider adapter | Approved |
| Translation runtime | Cloud service behind provider adapter | Approved |
| TTS runtime | Cloud service behind provider adapter | Approved |
| Session orchestration | Cloud-hosted service | Approved |
| Authoritative state | Cloud-managed state | Approved |
| Local Agent | Minimal cross-platform edge adapter only if browser capture is insufficient | Future |

The browser is the primary client for Phases 1 through 4.

The MVP MUST NOT require users to install a local programming environment.

A local VoiceBridge Agent MUST NOT be introduced in Phase 1. It MAY be considered later only when browser or operating-system security prevents required system-audio capture.

The test launch MAY use a single shared bearer token supplied through approved secret configuration. This token MUST be replaceable and MUST NOT be used as the final production identity model.

## 4. Programming Languages

Approved language choices:

| Area | Approved Language | Status |
|------|-------------------|--------|
| Browser-facing code | TypeScript | Approved |
| Cloud API and orchestration | TypeScript on Node.js 24+ | Approved for Phase 1 |
| Local service or automation | Python | Approved |
| Build and repository scripts | Bash or Python | Approved |
| Configuration | JSON, YAML, TOML, or environment variables | Approved |

TypeScript SHOULD be used for browser-facing application code because it supports web platform APIs and maintainable UI development.

The Phase 1 cloud API uses TypeScript on Node.js 24 or later.

The Milestone 2 skeleton uses the Node.js built-in HTTP server, zero production npm dependencies, in-memory session state, and Docker packaging.

This runtime decision is recorded in `../adr/ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME.md`.

The Phase 1 test service is deployed as a Render Web Service from the provider-neutral Dockerfile in `src/cloud/`. Render supplies the public HTTPS endpoint and environment-based test secret. This test-hosting choice is recorded in `../adr/ADR-003_PHASE_1_TEST_HOSTING_RENDER.md` and does not define the production hosting contract.

Milestone 3 uses standard WebSocket. The cloud server uses `ws` 8.21.1 in `noServer` mode for authenticated HTTP upgrades. The browser uses its native WebSocket, Web Audio, and AudioWorklet APIs. This decision is recorded in `../adr/ADR-004_PHASE_1_STREAMING_TRANSPORT.md`.

Python MAY be used for local audio processing, provider orchestration, prototypes, and development tooling.

Additional production languages require documented approval before adoption.

## 5. User Interface Layer

The user interface layer is responsible for user controls, session state display, language selection, and user-visible errors.

Approved UI directions:

- browser-native UI for a YouTube MVP;
- lightweight web UI for local control panels;
- future desktop UI only after MVP validation.

UI code MUST NOT contain direct provider secrets.

UI code SHOULD communicate with cloud service layers through documented interfaces.

Provider credentials MUST remain in the cloud and MUST NOT be delivered to the browser.

## 6. Audio Layer

The audio layer handles capture, normalization, buffering, and playback.

Approved audio technology categories:

| Capability | Approved Direction | Status |
|------------|--------------------|--------|
| Browser capture | Web platform audio APIs when available | Planned |
| Local capture | Local operating system audio tools or libraries | Planned |
| Audio conversion | Local library or command-line tool behind an adapter | Planned |
| Playback | Browser or local playback adapter | Planned |

The audio layer MUST expose normalized audio chunks to the processing pipeline.

Audio implementation details MUST remain separate from recognition, translation, and synthesis logic.

## 7. AI Provider Layer

The AI provider layer contains integrations for speech recognition, translation, and text-to-speech.

Approved provider rules:

- providers MUST be wrapped by service adapters;
- provider credentials MUST be loaded from approved configuration mechanisms;
- provider responses SHOULD be normalized before entering core pipeline logic;
- provider-specific errors SHOULD be mapped to common application errors;
- fallback providers MAY be introduced when documented.

Initial provider categories:

| Capability | Provider Category | Status |
|------------|-------------------|--------|
| Speech recognition | Cloud or local speech-to-text provider | Planned |
| Translation | Cloud or local translation provider | Planned |
| Speech synthesis | Cloud or local text-to-speech provider | Planned |

No single provider is permanently approved as mandatory for all runtime modes.

## 8. Configuration and Secrets

Configuration MUST be explicit and environment-aware.

Approved configuration sources:

- environment variables for local secrets;
- local ignored configuration files for developer machines;
- checked-in example configuration without real secrets;
- documented defaults for non-sensitive settings.

Secrets MUST NOT be committed to the repository.

Configuration MUST support at least these settings over time:

- source language;
- target language;
- speech recognition provider;
- translation provider;
- speech synthesis provider;
- voice selection when supported;
- audio input source;
- playback target.

## 9. Testing and Quality Tools

Testing and quality tooling MUST match the implemented stack.

Approved tool categories:

| Area | Approved Direction | Status |
|------|--------------------|--------|
| TypeScript checks | TypeScript compiler and Node.js test runner | In use |
| Python checks | Unit tests and static checks when Python is used | Planned |
| Markdown checks | ASCII validation and reference validation | Approved |
| Integration checks | HTTP lifecycle and WebSocket transport tests | In use |

Tests SHOULD avoid calling paid or external AI providers by default.

Provider integrations SHOULD support mocks or test doubles.

## 10. Documentation Tooling

Documentation MUST use Markdown unless another format is technically required.

Documentation checks SHOULD verify:

- ASCII-only content;
- valid relative references;
- required document metadata;
- consistent version history.

Architecture diagrams SHOULD use text-based diagrams or Mermaid where diagrams are needed.

## 11. Dependency Rules

Dependencies MUST be added intentionally.

Dependency rules:

- add dependencies only when they support an approved capability;
- prefer actively maintained packages;
- avoid dependencies that require secrets at install time;
- avoid committing generated dependency directories;
- document major runtime dependencies when introduced;
- remove unused dependencies promptly.

Provider SDK dependencies MUST remain isolated from core architecture interfaces.

## 12. Evolution Rules

Technology stack changes MUST follow repository governance.

A documented decision is required before introducing:

- a new production language;
- a required cloud runtime;
- a persistent database;
- a new UI framework with long-term maintenance impact;
- a provider-specific dependency in core pipeline logic;
- storage of audio, transcripts, translations, or generated speech.

Stack changes SHOULD be recorded in an ADR when they affect long-term architecture, security, privacy, or deployment assumptions.

## 13. References

- ../../README.md
- 04_ARCHITECTURE.md
- ../planning/02_REPOSITORY_STRUCTURE.md
- ../planning/03_ROADMAP.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md

## 14. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.2.0 | 2026-07-18 | Added the Phase 1 WebSocket server dependency and browser streaming APIs |
| 1.1.0 | 2026-07-18 | Recorded Render as the Phase 1 test deployment platform |
| 1.0.0 | 2026-07-18 | Initial approved technology stack definition |
