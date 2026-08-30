# VoiceBridge - Holovna dokumentatsiia

Open-source Cloud First real-time speech translation platform.

Slogan:

`Listen without language barriers.`

## Project Overview

VoiceBridge converts spoken source-language audio into translated target-language speech.

The validated product now supports current-tab browser audio capture for ordinary HTTP/HTTPS media sources, not only YouTube, while keeping the speech pipeline in VoiceBridge Cloud.

VoiceBridge uses a Cloud First architecture:

- the browser is the primary client for Phases 1 through 4;
- speech recognition, translation, speech synthesis, orchestration, language capability validation, and authoritative session state run in the cloud;
- users do not need a local programming environment;
- a minimal local VoiceBridge Agent may be introduced only later if browser or operating-system security prevents required system-audio capture.

## Current Status

Phase 1 Cloud YouTube MVP:

`COMPLETE - VALIDATED`

Phase 2 Universal Cloud Audio:

`COMPLETE - CONTROLLED E2E VALIDATED`

Current accepted browser runtime:

`VoiceBridge Extension 0.8.0`

Current accepted runtime capabilities:

- generic current-tab capture for supported ordinary `http://` / `https://` browser tabs with active audio;
- YouTube remains a validated regression source;
- Chromium source-adapter boundary (`chromium_tab`);
- `UNIVERSAL_BROWSER_AUDIO` session contract while preserving `YOUTUBE_MVP` compatibility;
- cloud-owned language capability registry;
- browser language selectors populated only from sanitized cloud capabilities;
- current validated language pair: English -> Ukrainian (`en -> uk`);
- Gemini 3.5 Transcribe Live streaming STT by default;
- AssemblyAI `universal-streaming-english` retained as explicit rollback;
- Azure Translator primary translation;
- Gemini translation fallback;
- Azure Speech TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- independent original and translated volume controls;
- automatic original-audio ducking and restoration;
- bounded one-press Stop and bounded source-tab-ended cleanup;
- bounded queues, retries, drains, and cleanup;
- no intentional VoiceBridge content persistence;
- no automatic paid provider fallback.

Active test cloud endpoint:

`https://voicebridge-cloud-us.onrender.com`

## Current Pipeline

```text
Current browser tab audio
    -> Chromium source adapter
    -> browser PCM capture
    -> VoiceBridge secure WebSocket ingestion
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live STT
    -> Azure Translator primary
    -> Gemini translation fallback when approved/required
    -> Azure Speech TTS
    -> browser PCM playback
    -> automatic original-audio ducking and restoration
```

STT rollback path:

```text
Current browser tab audio
    -> VoiceBridge Cloud
    -> AssemblyAI universal-streaming-english
    -> Azure Translator
    -> Azure Speech TTS
```

## Phase 2 Acceptance

Controlled Phase 2 acceptance completed on Extension `0.8.0`.

Validated matrix:

- YouTube steady-state regression: PASS;
- Vimeo non-YouTube video: PASS;
- separate TED speech-heavy source: PASS;
- Stop during active speech: PASS;
- Stop with `45,469 ms` translated playback backlog: PASS, queue drained to `0 ms`;
- source tab closed without manual Stop: PASS, automatic cleanup returned VoiceBridge to `IDLE` and drained a `55,386 ms` playback backlog to `0 ms`.

Canonical acceptance record:

`docs/phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

## Language Capability Boundary

Language options are cloud-owned and capability-aware.

The browser MUST NOT invent or hard-code a broader support matrix than the cloud registry exposes.

Current validated registry version:

`1.0.0`

Current validated selectable pair:

- Source: English (`en`);
- Target: Ukrainian (`uk`).

Additional language pairs require explicit capability evidence and validation before being advertised as supported.

## Test Authentication

The controlled test launch uses one shared revocable access token.

The test model does not include registration, passwords, account recovery, organizations, or persistent user profiles.

A production identity model must replace the shared token before public multi-user deployment.

## Next Functional Phase

Phase 3 Cloud Service Hardening is the next roadmap phase.

Candidate Phase 3 work includes production authentication design, reconnect/recovery hardening, multi-session readiness, operational observability, cost/quota controls, provider failover policy, and deployment resilience.

Phase 2 MUST NOT be reopened without a documented defect or explicitly approved change.

## Documentation

- [Phase 2 Universal Cloud Audio Design](docs/phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md)
- [Phase 2 M6 Controlled E2E Acceptance](docs/phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md)
- [Phase 2 Complete Recovery Bootstrap](docs/bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md)
- [Phase 1 MVP Validation](docs/phases/PHASE_1_MVP_VALIDATION.md)
- [Gemini 3.5 Transcribe STT Acceptance](docs/history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md)
- [Gemini 3.5 Transcribe Default STT ADR](docs/adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md)
- [Project Overview](docs/overview/01_PROJECT_OVERVIEW.md)
- [Project Description](docs/overview/07_PROJECT_DESCRIPTION.md)
- [Roadmap](docs/planning/03_ROADMAP.md)
- [Architecture](docs/architecture/04_ARCHITECTURE.md)
- [Technology Stack](docs/architecture/05_TECHNOLOGY_STACK.md)
- [Cloud First ADR](docs/adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [Functional Requirements](docs/requirements/09_FUNCTIONAL_REQUIREMENTS.md)
- [System Design](docs/design/10_SYSTEM_DESIGN.md)
- [Non-Functional Requirements](docs/requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md)
- [Security Model](docs/security/12_SECURITY_MODEL.md)
- [API Design](docs/api/13_API_DESIGN.md)
- [Development Standard](docs/governance/06_DEVELOPMENT_STANDARD.md)
- [Repository Rules](docs/governance/15_REPOSITORY_RULES.md)
- [AI Development Rules](docs/governance/16_AI_DEVELOPMENT_RULES.md)
- [Project History](docs/history/08_PROJECT_HISTORY.md)

## Repository Structure

```text
.github/
    workflows/
docs/
    adr/
    api/
    architecture/
    bootstrap/
    design/
    governance/
    history/
    overview/
    phases/
    planning/
    requirements/
    security/
src/
tests/
tools/
patches/
examples/
assets/
```

## Contributing

Contributors must follow the approved architecture, repository rules, development standard, and AI development rules.

Significant architecture changes require an ADR.

Secrets and provider credentials must never be committed.

## License

Apache-2.0
