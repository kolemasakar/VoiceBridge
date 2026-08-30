# 05_TECHNOLOGY_STACK

UA: Tekhnolohichnyi stek VoiceBridge ta zatverdzheni tekhnichni vybirky.

Purpose:
Define the approved technology stack for VoiceBridge, including runtime platforms, languages, providers, tooling, and stack governance rules.

Scope:
Technology selection, implementation boundaries, development tools, validation tools, provider choices, and future stack evolution.

Status:
Approved - Phase 2 Validated

Version:
1.4.0

Last Updated:
2026-08-30

## 1. Stack Vision

VoiceBridge uses a pragmatic, modular Cloud First stack that supports browser audio capture, cloud AI processing, capability-aware language selection, and local translated speech playback.

The stack MUST keep source capture, recognition, translation, synthesis, playback, language capability policy, and provider integrations as separate concerns.

## 2. Stack Principles

The technology stack MUST:

- prefer simple, maintainable tools over premature complexity;
- keep provider-specific code behind adapter interfaces;
- keep source-specific capture behind source adapters;
- avoid hard dependency on one AI vendor in core pipeline logic;
- keep secrets outside source code;
- make accepted provider defaults explicit and testable;
- keep language capability knowledge authoritative in the cloud;
- retain documented rollback paths where approved;
- keep content non-persistent by default;
- document major stack changes before implementation;
- keep repository documentation ASCII-only and Markdown-based except approved exceptions.

## 3. Application Runtime

| Category | Approved Direction | Status |
|----------|--------------------|--------|
| Primary client | Chromium browser extension | In use - validated |
| Browser runtime | Extension `0.8.0` | Accepted Phase 2 runtime |
| Source adapter | `chromium_tab` | In use - validated |
| API runtime | Cloud-hosted TypeScript service | In use |
| STT runtime | Cloud service behind `SttProvider` | In use |
| Translation runtime | Cloud provider adapter | In use |
| TTS runtime | Cloud provider adapter | In use |
| Language registry | Cloud-owned capability registry | In use - validated |
| Session orchestration | Cloud-hosted service | In use |
| Authoritative state | Cloud-managed transient session state | In use |
| Local Agent | Minimal cross-platform edge adapter only if browser capture is insufficient | Future |

The browser remains the primary client for Phases 1 through 4.

The current cloud service is deployed as a Render Web Service using the provider-neutral Dockerfile in `src/cloud/`. Render is the accepted controlled-test hosting platform and does not define the final production hosting contract.

## 4. Programming Languages and Core Dependencies

Approved language choices:

| Area | Approved Language | Status |
|------|-------------------|--------|
| Browser-facing code | JavaScript / TypeScript-compatible browser code | In use |
| Cloud API and orchestration | TypeScript on Node.js 24+ | In use |
| Local service or automation | Python | Approved when needed |
| Build and repository scripts | Bash, JavaScript, or Python | Approved |
| Configuration | JSON, YAML, TOML, environment variables | Approved |

Current cloud package baseline includes:

- Node.js 24+;
- TypeScript 7.0.2;
- `ws` 8.21.1 for WebSocket transport;
- Node.js built-in test runner;
- direct HTTP/WebSocket provider adapters rather than mandatory provider SDKs in the core package.

## 5. Browser and UI Layer

Current accepted browser client:

`VoiceBridge Extension 0.8.0`

Responsibilities include:

- explicit user-controlled current-tab capture;
- source-adapter orchestration;
- cloud connection/token validation;
- cloud language-registry loading;
- source and target language selectors populated only from accepted registry capabilities;
- session state and transport metrics;
- source transcript and translated text display;
- original and translated volume controls;
- automatic ducking/restoration;
- ordered translated PCM playback;
- bounded Stop behavior;
- source-tab-ended cleanup;
- transcript-copy support.

Current validated language UI exposes only:

- Source: English (`en`);
- Target: Ukrainian (`uk`).

The browser MUST NOT maintain an independent broader provider/language support matrix.

## 6. Audio Layer

Current audio path:

- Chromium current-tab capture;
- Web Audio and AudioWorklet APIs;
- browser input PCM16 mono at 48 kHz;
- secure WebSocket transport of bounded PCM frames to VoiceBridge Cloud;
- Gemini STT adapter conversion to PCM16 mono at 16 kHz;
- Azure Speech raw 24 kHz 16-bit mono PCM output;
- ordered browser playback with bounded queueing;
- automatic original-audio ducking and restoration.

Audio implementation remains separate from recognition, translation, and synthesis logic.

Phase 2 lifecycle acceptance validated both user Stop and unexpected source-tab termination with non-zero playback backlog.

## 7. AI Provider Layer

Current accepted provider matrix:

| Capability | Default | Fallback / Rollback | Status |
|------------|---------|---------------------|--------|
| Streaming STT | Gemini `gemini-3.5-transcribe-live` | AssemblyAI `universal-streaming-english` explicit rollback | Validated |
| Translation | Azure Translator | Gemini `gemini-3.1-flash-lite` | Validated |
| Ukrainian TTS | Azure Speech `uk-UA-OstapNeural` | Gemini TTS selectable by explicit configuration | Validated primary |

Provider rules:

- providers MUST remain behind adapters;
- provider credentials remain cloud-side;
- provider responses are normalized before core orchestration consumes them;
- fallback and rollback behavior is explicit;
- model identifiers are guarded when silent upstream changes could alter behavior;
- no automatic paid provider fallback is approved.

## 8. Language Capability Registry

Phase 2 introduced a cloud-owned language capability registry.

Current validated registry version:

`1.0.0`

Responsibilities:

- centralized BCP 47 validation;
- source-language STT capability validation;
- translation pair validation;
- target-language TTS/voice validation;
- sanitized browser-facing capability metadata;
- fail-closed browser behavior when capabilities cannot be loaded.

Current validated pair:

`en -> uk`

Additional languages MUST NOT be advertised until their end-to-end combination is accepted by the registry and supported by evidence.

## 9. Configuration and Secrets

Accepted provider defaults:

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

The browser uses only the controlled VoiceBridge access token and MUST NOT receive upstream provider credentials.

## 10. Testing and Quality Tools

Current checks include:

- TypeScript compilation;
- Node.js cloud tests;
- Gemini and AssemblyAI STT regression tests;
- provider factory and provider-default tests;
- Azure translation tests;
- Azure TTS tests;
- language capability registry tests;
- universal session contract tests;
- browser source-adapter tests;
- browser session-request contract tests;
- browser language UI/readiness tests;
- browser Stop/playback tests;
- browser JavaScript syntax validation;
- browser manifest validation;
- Extension `0.8.0` packaging;
- Markdown ASCII validation.

Automated tests SHOULD avoid calling paid or external AI providers by default.

Provider integrations SHOULD support mocks or test doubles.

## 11. Phase 2 Live Acceptance Evidence

Controlled live validation passed:

- YouTube regression;
- Vimeo non-YouTube video;
- TED speech-heavy source;
- Stop during active speech;
- Stop with `45,469 ms` queued playback, drained to `0 ms`;
- unexpected source-tab closure with `55,386 ms` queued playback, automatically drained to `0 ms` and returned to `IDLE`.

Canonical record:

`../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

## 12. Dependency and Evolution Rules

Dependencies MUST be added intentionally.

A documented decision is required before introducing:

- a new production language/runtime;
- a persistent VoiceBridge content database;
- a new UI framework with long-term maintenance impact;
- a provider-specific dependency in core pipeline logic;
- storage of audio, transcripts, translations, or generated speech;
- a new default provider;
- a broader language capability claim;
- a new authentication model;
- an automatic paid fallback path.

Phase 1 and Phase 2 accepted runtime boundaries MUST remain regression baselines during Phase 3 hardening.

## 13. Next Stack Scope

Phase 3 Cloud Service Hardening is next.

Likely stack work includes:

- production authentication/authorization design;
- reconnect/recovery hardening;
- multi-session readiness;
- metrics and alerting;
- provider/quota/cost observability;
- deployment resilience;
- operational metadata that does not introduce user-content persistence.

## 14. References

- ../../README.md
- 04_ARCHITECTURE.md
- ../planning/03_ROADMAP.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md
- ../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md
- ../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md
- ../bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md
- ../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md

## 15. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.4.0 | 2026-08-30 | Added validated Extension 0.8.0, chromium_tab source adapter, universal session mode, cloud language registry, configurable language UI, and Phase 2 E2E acceptance |
| 1.3.0 | 2026-08-29 | Synchronized the technology stack with accepted Gemini STT, Azure translation, Azure TTS runtime and rollback paths |
| 1.2.0 | 2026-07-18 | Added Phase 1 WebSocket server dependency and browser streaming APIs |
| 1.1.0 | 2026-07-18 | Recorded Render as the Phase 1 test deployment platform |
| 1.0.0 | 2026-07-18 | Initial approved technology stack definition |
