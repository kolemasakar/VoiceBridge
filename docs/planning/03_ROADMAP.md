# 03_ROADMAP

UA: Dorozhnia karta rozvytku VoiceBridge vid MVP do universalnoho AI perekladacha.

Purpose:
Define the approved development roadmap, phases, milestones, and project evolution strategy.

Scope:
Project phases, objectives, validation points, and major capabilities.

Out of Scope:
Detailed implementation tasks and low-level technical design.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
2.0.0

Last Updated:
2026-07-22

## 1. Project Vision

VoiceBridge is an open-source AI communication bridge that removes language barriers.

Initial goal:

- allow users to watch English YouTube videos with Ukrainian AI voice translation;
- provide a natural listening experience without manual subtitles;
- validate a real-time speech translation workflow.

Long-term goal:

- enable real-time multilingual communication between people using different languages.

## 2. Development Strategy

The project follows incremental validation and a Cloud First implementation model.

Cloud First rules:

- the browser is the primary client for Phases 1 through 4;
- STT, translation, TTS, orchestration, and authoritative state run in the cloud;
- users do not require a local development environment;
- a minimal cross-platform VoiceBridge Agent MAY be introduced in Phase 5 only when browser or operating-system security prevents required system-audio capture;
- the Agent MUST NOT move AI processing or authoritative state out of the cloud;
- the controlled test launch MAY use one shared revocable token;
- production authentication MUST be approved before public multi-user deployment.

Each phase MUST:

- have a documented objective;
- produce a measurable result;
- update project history and status;
- define the next milestone.

## 3. Phase Overview

| Phase | Name | Objective | Status |
|------|------|-----------|--------|
| 0 | Repository Foundation | Create project foundation and governance | Completed |
| 1 | Cloud YouTube MVP | Browser client with cloud speech translation pipeline | Completed - MVP Validated |
| 2 | Universal Cloud Audio | Generalize browser audio input and cloud processing | Planned |
| 3 | Cloud Service Hardening | Improve reliability, security, observability, and provider portability | Planned |
| 4 | Multi Platform Expansion | Support browser-accessible communication services | Planned |
| 5 | Interpreter Mode and Optional Agent | Enable two-way translation and add a minimal local agent only if required | Planned |

## 4. Phase 1 Cloud YouTube MVP

Goal:
Create the first working English-to-Ukrainian YouTube voice translation demonstration.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted runtime baseline:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- AssemblyAI English streaming STT;
- Azure Translator primary translation;
- Gemini translation fallback;
- Azure Speech Ukrainian TTS;
- browser PCM playback;
- automatic original-audio ducking and restoration;
- one-press idempotent Stop with visible `STOPPING` state.

Validated pipeline:

```text
YouTube tab audio
    -> VoiceBridge browser extension
    -> VoiceBridge Cloud
    -> AssemblyAI English STT
    -> Azure Translator
    -> Azure Speech Ukrainian TTS
    -> browser playback
```

Fallback path:

```text
AssemblyAI English STT
    -> Gemini translation
    -> Azure Speech Ukrainian TTS
```

### 4.1 Milestone State

| Milestone | Capability | Status |
|-----------|------------|--------|
| 1 | Browser Capture Feasibility | Passed |
| 2 | Cloud Skeleton | Passed |
| 3 | Streaming Transport | Passed |
| 4 | Streaming STT Integration | Passed |
| 5 | English-to-Ukrainian Translation Integration | Passed |
| 6 | Ukrainian TTS and Browser Playback | Passed |
| 7 | Minimum End-to-End MVP Acceptance | Passed |
| 8 | Documentation and Recovery Baseline | Passed |

Additional production hardening is not required to classify the controlled minimum MVP as validated. Production authentication, multi-session readiness, advanced observability, recovery, and broader platform support move to later approved work.

### 4.2 Final Acceptance Evidence

Controlled final session:

- English final segments: 28;
- Ukrainian final segments: 28;
- Ukrainian voiced segments: 28;
- Ukrainian played segments: 28;
- translation pending: 0;
- translation retries: 0;
- TTS pending: 0;
- TTS retries: 0;
- queued audio after completion: 0 ms;
- dropped audio frames: 0;
- Stop completed with one user action;
- final states included `IDLE`, `COMPLETED`, and `CLOSED`.

Observed final stage latency:

- STT: 712 ms;
- translation: 81 ms;
- TTS: 190 ms.

A prior Azure Speech endurance session ran for more than 12 minutes and completed 108 English, translated, voiced, and played segments.

Project owner acceptance:

- Ukrainian voice was understandable;
- automatic ducking worked;
- original audio restoration worked;
- the Azure-based pipeline worked normally;
- one-press Stop worked normally.

Canonical record:

`docs/phases/PHASE_1_MVP_VALIDATION.md`

## 5. Phase 2 Universal Cloud Audio Translation

Goal:
Separate browser audio capture from the cloud translation pipeline and support more browser-accessible audio sources.

Candidate capabilities:

- generic browser audio input;
- configurable source and target languages;
- reusable streaming session contracts;
- provider-independent speech pipeline;
- improved source adapters;
- continued Cloud First execution.

Entry requires explicit project-owner approval.

## 6. Phase 3 Cloud Service Hardening

Goal:
Prepare the cloud platform for reliable expansion.

Candidate capabilities:

- production authentication design;
- bounded recovery and reconnect behavior;
- multi-session readiness;
- durable operational metadata without user-content persistence;
- provider failover policy;
- cost and quota observability;
- structured health and alerting;
- security and privacy hardening;
- deployment resilience.

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
- a minimal local cross-platform VoiceBridge Agent only when browser or operating-system restrictions prevent required system-audio capture;
- cloud-hosted STT, translation, TTS, orchestration, and authoritative state even when the Agent is used.

## 9. Milestone Criteria

A milestone is completed only when:

- objectives are achieved;
- automated and live validation criteria pass;
- documentation and project history are updated;
- repository changes are committed;
- next milestone entry conditions are defined.

## 10. References

- `../overview/07_PROJECT_DESCRIPTION.md`
- `02_REPOSITORY_STRUCTURE.md`
- `../governance/15_REPOSITORY_RULES.md`
- `../governance/16_AI_DEVELOPMENT_RULES.md`
- `../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`
- `../phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md`
- `../phases/PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md`
- `../phases/PHASE_1_MILESTONE_6_TTS_PLAYBACK.md`
- `../phases/PHASE_1_MVP_VALIDATION.md`
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`

## 11. Version History

| Version | Date | Description |
|---------|------|-------------|
| 2.0.0 | 2026-07-22 | Validated and closed the minimum Phase 1 YouTube MVP |
| 1.6.0 | 2026-07-21 | Passed Milestone 5 and activated Milestone 6 TTS and browser playback validation |
| 1.5.0 | 2026-07-21 | Recorded live Gemini translation and cloud 0.4.2 graceful drain |
| 1.4.0 | 2026-07-21 | Completed Milestone 5 implementation |
| 1.3.0 | 2026-07-21 | Completed Milestone 4 and activated translation integration |
| 1.2.0 | 2026-07-18 | Activated Phase 1 Cloud YouTube MVP execution |
| 1.1.0 | 2026-07-18 | Aligned roadmap with Cloud First architecture and simplified test authentication |
| 1.0.0 | 2026-07-18 | Initial roadmap definition |
