# 03_ROADMAP

UA: Dorozhnia karta rozvytku VoiceBridge vid MVP do universalnoho AI perekladacha.

Purpose:
Define the approved development roadmap, phases, validation gates, and project evolution strategy.

Scope:
Project phases, objectives, accepted runtime baselines, validation points, and major capabilities.

Out of Scope:
Detailed implementation tasks and low-level technical design.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
2.2.0

Last Updated:
2026-08-30

## 1. Project Vision

VoiceBridge is an open-source AI communication bridge that removes language barriers.

Validated product path:

- Phase 1 validated English-to-Ukrainian YouTube voice translation;
- Phase 2 generalized the same cloud pipeline to supported active browser tabs and introduced cloud-owned language capability selection.

Long-term goal:

- enable real-time multilingual communication between people using different languages.

## 2. Development Strategy

The project follows incremental validation and a Cloud First implementation model.

Cloud First rules:

- the browser is the primary client for Phases 1 through 4;
- STT, translation, TTS, orchestration, language capability validation, and authoritative state run in the cloud;
- users do not require a local development environment;
- a minimal cross-platform VoiceBridge Agent MAY be introduced in Phase 5 only when browser or operating-system security prevents required system-audio capture;
- the Agent MUST NOT move AI processing or authoritative state out of the cloud;
- the controlled test launch MAY use one shared revocable token;
- production authentication MUST be approved before public multi-user deployment.

Each phase MUST:

- have a documented objective;
- produce a measurable result;
- pass automated and live acceptance gates where applicable;
- update project history and recovery documentation;
- define the next milestone.

## 3. Phase Overview

| Phase | Name | Objective | Status |
|------|------|-----------|--------|
| 0 | Repository Foundation | Create project foundation and governance | Completed |
| 1 | Cloud YouTube MVP | Browser client with cloud speech translation pipeline | Completed - MVP Validated |
| 2 | Universal Cloud Audio | Generalize browser audio input and capability-aware languages | Completed - Controlled E2E Validated |
| 3 | Cloud Service Hardening | Improve reliability, security, observability, and provider portability | Planned - Next functional phase |
| 4 | Multi Platform Expansion | Support browser-accessible communication services | Planned |
| 5 | Interpreter Mode and Optional Agent | Enable two-way translation and add a minimal local agent only if required | Planned |

## 4. Phase 1 Cloud YouTube MVP

Goal:
Create the first working English-to-Ukrainian YouTube voice translation demonstration.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted provider baseline after the 2026-08-29 STT transition:

- Gemini `gemini-3.5-transcribe-live` default STT;
- AssemblyAI `universal-streaming-english` explicit rollback;
- Azure Translator primary;
- Gemini translation fallback;
- Azure Speech TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- automatic ducking and restoration;
- bounded one-press Stop;
- no intentional VoiceBridge content persistence.

Phase 1 is closed. Do not reopen it without a documented defect or explicitly approved change.

## 5. Phase 2 Universal Cloud Audio

Goal:
Separate browser audio capture from source-specific YouTube behavior and support additional browser-accessible audio sources through the existing cloud pipeline.

Final result:

`VOICEBRIDGE_PHASE_2_UNIVERSAL_CLOUD_AUDIO_VALIDATED`

Accepted browser runtime:

`VoiceBridge Extension 0.8.0`

### 5.1 Completed Milestones

| Milestone | Capability | Status |
|-----------|------------|--------|
| P2-M1 | Source Adapter Boundary | Passed |
| P2-M2 | Universal Browser Session Contract | Passed |
| P2-M3 | Generic Active-Tab UI Path | Passed |
| P2-M4 | Language Capability Registry | Passed |
| P2-M5 | Configurable Language UI | Passed |
| P2-M6 | Controlled End-to-End Acceptance | Passed |

### 5.2 Accepted Phase 2 Capabilities

- current-tab capture for supported ordinary `http://` / `https://` tabs with active audio;
- source adapter `chromium_tab`;
- `UNIVERSAL_BROWSER_AUDIO` session mode;
- backward compatibility with the Phase 1 `YOUTUBE_MVP` request path;
- source metadata separated from cloud AI provider logic;
- centralized BCP 47 language validation;
- cloud-owned sanitized language capability metadata;
- browser selectors populated only from the cloud registry;
- current validated language pair `en -> uk`;
- generic source support without per-site AI pipelines;
- actionable errors for silent tabs and restricted browser pages;
- source-tab-ended automatic cleanup;
- accepted Phase 1 provider defaults and rollback paths preserved;
- existing permission boundary preserved;
- no unapproved persistence or automatic paid fallback.

### 5.3 Current Pipeline

```text
Supported current browser tab audio
    -> chromium_tab source adapter
    -> browser PCM capture
    -> secure VoiceBridge WebSocket ingestion
    -> Gemini 3.5 Transcribe Live STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech TTS
    -> browser PCM playback
    -> automatic ducking/restoration
```

### 5.4 Controlled Live Acceptance

P2-M6 passed the full controlled matrix:

- M6-A YouTube steady-state regression: PASS;
- M6-B Vimeo non-YouTube video: PASS;
- M6-C separate TED speech-heavy source: PASS;
- M6-D Stop during active speech: PASS;
- M6-E Stop with `45,469 ms` queued translated playback: PASS, final queue `0 ms`;
- M6-F captured source tab closed without Stop: PASS, automatic cleanup returned to `IDLE`, final queue `0 ms`.

Canonical record:

`../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

### 5.5 Phase 2 Boundary

Phase 2 does NOT claim:

- operating-system-wide capture;
- microphone/interpreter mode;
- native desktop Agent;
- public production authentication;
- durable transcript/session history;
- arbitrary remote-media retrieval;
- automatic paid provider fallback;
- universal support for every provider-supported language.

Additional language pairs require explicit registry evidence and validation.

Phase 2 is closed after canonical documentation synchronization and final green `main` CI.

## 6. Phase 3 Cloud Service Hardening

Status:

`PLANNED - NEXT FUNCTIONAL PHASE`

Goal:
Prepare the cloud platform for reliable expansion beyond the validated controlled test runtime.

Candidate capabilities:

- production authentication and authorization design;
- bounded recovery and reconnect behavior;
- multi-session readiness;
- durable operational metadata without user-content persistence;
- provider failover and rollback policy hardening;
- cost and quota observability;
- structured health, metrics, and alerting;
- security and privacy hardening;
- deployment resilience;
- explicit service-level objectives only after evidence supports them.

Phase 3 MUST begin with a scoped hardening plan and acceptance gate. It MUST NOT silently broaden persistence, identity, billing, or provider policy.

## 7. Phase 4 Multi Platform Expansion

Goal:
Support different browser-accessible communication sources.

Possible platforms:

- messengers;
- video conferencing;
- browser communication;
- mobile applications where supported.

## 8. Phase 5 Interpreter Mode and Optional Agent

Goal:
Enable real-time two-way multilingual communication.

Possible capabilities:

- bidirectional translation sessions;
- multiple AI providers and speech engines;
- microphone input;
- a minimal local cross-platform VoiceBridge Agent only when browser or operating-system restrictions prevent required system-audio capture;
- cloud-hosted STT, translation, TTS, orchestration, and authoritative state even when the Agent is used.

## 9. Milestone Criteria

A milestone is completed only when:

- objectives are achieved;
- automated and live validation criteria pass;
- documentation and project history are updated;
- repository changes are committed and validated;
- next milestone entry conditions are defined.

## 10. References

- `../overview/07_PROJECT_DESCRIPTION.md`
- `02_REPOSITORY_STRUCTURE.md`
- `../architecture/04_ARCHITECTURE.md`
- `../architecture/05_TECHNOLOGY_STACK.md`
- `../governance/15_REPOSITORY_RULES.md`
- `../governance/16_AI_DEVELOPMENT_RULES.md`
- `../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`
- `../phases/PHASE_1_MVP_VALIDATION.md`
- `../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md`
- `../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`
- `../bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md`
- `../history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`
- `../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md`

## 11. Version History

| Version | Date | Description |
|---------|------|-------------|
| 2.2.0 | 2026-08-30 | Closed Phase 2 Universal Cloud Audio after M1-M6 and controlled E2E acceptance; activated Phase 3 as next functional phase |
| 2.1.0 | 2026-08-29 | Synchronized Phase 1 with the accepted Gemini STT default and defined the Phase 2 entry gate |
| 2.0.0 | 2026-07-22 | Validated and closed the minimum Phase 1 YouTube MVP |
| 1.6.0 | 2026-07-21 | Passed Milestone 5 and activated Milestone 6 TTS and browser playback validation |
| 1.5.0 | 2026-07-21 | Recorded live Gemini translation and cloud 0.4.2 graceful drain |
| 1.4.0 | 2026-07-21 | Completed Milestone 5 implementation |
| 1.3.0 | 2026-07-21 | Completed Milestone 4 and activated translation integration |
| 1.2.0 | 2026-07-18 | Activated Phase 1 Cloud YouTube MVP execution |
| 1.1.0 | 2026-07-18 | Aligned roadmap with Cloud First architecture and simplified test authentication |
| 1.0.0 | 2026-07-18 | Initial roadmap definition |
