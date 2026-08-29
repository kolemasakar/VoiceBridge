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
2.1.0

Last Updated:
2026-08-29

## 1. Project Vision

UA: Bachennia proiektu

VoiceBridge is an open-source AI communication bridge that removes language barriers.

Initial goal:

- allow users to watch English YouTube videos with Ukrainian AI voice translation;
- provide a natural listening experience without manual subtitles;
- validate a real-time speech translation workflow.

Long-term goal:

- enable real-time multilingual communication between people using different languages.

## 2. Development Strategy

UA: Stratehiia rozvytku

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

UA: Ohliad faz

| Phase | Name | Objective | Status |
|------|------|-----------|--------|
| 0 | Repository Foundation | Create project foundation and governance | Completed |
| 1 | Cloud YouTube MVP | Browser client with cloud speech translation pipeline | Completed - MVP Validated |
| 2 | Universal Cloud Audio | Generalize browser audio input and cloud processing | Planned - Next functional phase |
| 3 | Cloud Service Hardening | Improve reliability, security, observability, and provider portability | Planned |
| 4 | Multi Platform Expansion | Support browser-accessible communication services | Planned |
| 5 | Interpreter Mode and Optional Agent | Enable two-way translation and add a minimal local agent only if required | Planned |

## 4. Phase 1 Cloud YouTube MVP

UA: Faza 1 Cloud YouTube MVP

Goal:
Create the first working English-to-Ukrainian YouTube voice translation demonstration.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Current accepted runtime after the 2026-08-29 STT transition:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- Gemini 3.5 Transcribe Live English streaming STT by default;
- AssemblyAI `universal-streaming-english` retained as an explicit rollback provider;
- Azure Translator primary English-to-Ukrainian translation;
- Gemini translation fallback;
- Azure Speech Ukrainian TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- automatic original-audio ducking and restoration;
- bounded user Stop with completed text and translation drain and capped playback cleanup.

Current validated pipeline:

```text
YouTube tab audio
    -> VoiceBridge browser extension
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live English STT
    -> Azure Translator
    -> Azure Speech Ukrainian TTS
    -> browser playback
```

STT rollback path:

```text
YouTube tab audio
    -> VoiceBridge browser extension
    -> VoiceBridge Cloud
    -> AssemblyAI universal-streaming-english
    -> Azure Translator
    -> Azure Speech Ukrainian TTS
```

Translation fallback path:

```text
Selected English STT
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
```

### 4.1 Milestone State

UA: Stan etapiv

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
| 9 | Gemini 3.5 Transcribe Live STT Transition | Passed |
| 10 | Played-segment Instrumentation Repair | Passed |

### 4.2 Final MVP Acceptance Evidence

UA: Dokazy finalnoho pryiniattia MVP

The original controlled Phase 1 acceptance run completed:

- 28 English final segments;
- 28 Ukrainian final segments;
- 28 Ukrainian voiced segments;
- 28 Ukrainian played segments;
- translation pending: 0;
- translation retries: 0;
- TTS pending: 0;
- TTS retries: 0;
- queued audio after completion: 0 ms;
- dropped audio frames: 0;
- Stop completed with one user action.

Observed final-stage latency in that baseline was 712 ms STT, 81 ms translation, and 190 ms TTS.

### 4.3 Gemini STT Transition Evidence

UA: Dokazy perekhodu STT na Gemini

A controlled same-duration comparison on 2026-08-29 used approximately 59 seconds of the same English source fragment.

Gemini run:

- 2938 frames sent;
- 1 dropped frame;
- 6 final STT segments;
- 363 ms reported recognition latency;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

AssemblyAI rollback run:

- 2945 frames sent;
- 7 dropped frames;
- 4 final STT segments;
- 378 ms reported recognition latency;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

The latency result is treated as near parity. Qualitative review favored Gemini for transcript coherence and several proper names. No WER claim is made because no human reference transcript was available.

Canonical record:

`../history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`

## 5. Phase 2 Universal Cloud Audio Translation

UA: Faza 2 Universalnyi khmarnyi audio pereklad

Goal:
Separate browser audio capture from source-specific YouTube behavior and support additional browser-accessible audio sources through the existing cloud pipeline.

Candidate capabilities:

- generic browser audio input;
- configurable source and target languages;
- reusable streaming session contracts;
- provider-independent speech pipeline;
- source adapter boundaries independent from translation and synthesis;
- continued Cloud First execution.

Entry gate:

- Phase 1 canonical documentation and configuration MUST be synchronized;
- the Phase 1 recovery checkpoint MUST be current;
- the Phase 2 design and acceptance criteria MUST be explicitly recorded before functional implementation begins.

## 6. Phase 3 Cloud Service Hardening

UA: Faza 3 Posylennia khmarnoho servisu

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

UA: Faza 4 Rozshyrennia na kilkakh platformakh

Goal:
Support different browser-accessible communication sources.

Possible platforms:

- messengers;
- video conferencing;
- browser communication;
- mobile applications where supported.

## 8. Phase 5 Interpreter Mode and Optional Agent

UA: Faza 5 Rezhym perekladacha ta neoboviazkovyi ahent

Goal:
Enable real-time two-way multilingual communication.

Possible capabilities:

- bidirectional translation sessions;
- multiple AI providers and speech engines;
- a minimal local cross-platform VoiceBridge Agent only when browser or operating-system restrictions prevent required system-audio capture;
- cloud-hosted STT, translation, TTS, orchestration, and authoritative state even when the Agent is used.

## 9. Milestone Criteria

UA: Kryterii etapiv

A milestone is completed only when:

- objectives are achieved;
- automated and live validation criteria pass;
- documentation and project history are updated;
- repository changes are committed;
- next milestone entry conditions are defined.

## 10. References

UA: Posylannia

- `../overview/07_PROJECT_DESCRIPTION.md`
- `02_REPOSITORY_STRUCTURE.md`
- `../architecture/04_ARCHITECTURE.md`
- `../architecture/05_TECHNOLOGY_STACK.md`
- `../governance/15_REPOSITORY_RULES.md`
- `../governance/16_AI_DEVELOPMENT_RULES.md`
- `../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`
- `../phases/PHASE_1_MVP_VALIDATION.md`
- `../history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`
- `../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md`

## 11. Version History

UA: Istoriia versii

| Version | Date | Description |
|---------|------|-------------|
| 2.1.0 | 2026-08-29 | Synchronized Phase 1 with the accepted Gemini STT default and defined the Phase 2 entry gate |
| 2.0.0 | 2026-07-22 | Validated and closed the minimum Phase 1 YouTube MVP |
| 1.6.0 | 2026-07-21 | Passed Milestone 5 and activated Milestone 6 TTS and browser playback validation |
| 1.5.0 | 2026-07-21 | Recorded live Gemini translation and cloud 0.4.2 graceful drain |
| 1.4.0 | 2026-07-21 | Completed Milestone 5 implementation |
| 1.3.0 | 2026-07-21 | Completed Milestone 4 and activated translation integration |
| 1.2.0 | 2026-07-18 | Activated Phase 1 Cloud YouTube MVP execution |
| 1.1.0 | 2026-07-18 | Aligned roadmap with Cloud First architecture and simplified test authentication |
| 1.0.0 | 2026-07-18 | Initial roadmap definition |
