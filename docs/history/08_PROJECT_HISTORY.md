# 08_PROJECT_HISTORY - Istoriia proiektu

UA: Istoriia ta perevirenyi potochnyi stan proiektu VoiceBridge.

Purpose:
Record completed VoiceBridge milestones, accepted decisions, current repository state, and the next approved engineering action.

Scope:
Repository foundation, documentation milestones, architecture decisions, API baseline, current state, and next phase.

Status:
Approved

Version:
1.13.0

Last Updated:
2026-07-22

## 1. Project Origin

VoiceBridge was created as an open-source real-time speech translation platform.

The initial product goal is English-to-Ukrainian AI voice translation for YouTube videos.

The long-term goal is multilingual speech translation for videos, conversations, meetings, calls, and other supported audio sources.

## 2. Repository Foundation

Completed:

- created the GitHub repository as the Single Source of Truth;
- established repository governance;
- established ASCII-only Markdown documentation;
- separated overview, planning, architecture, requirements, design, security, API, governance, ADR, and history documents;
- established development and AI-assisted development rules.

## 3. Documentation Foundation

Completed baseline documents:

- `docs/overview/01_PROJECT_OVERVIEW.md`;
- `docs/planning/02_REPOSITORY_STRUCTURE.md`;
- `docs/planning/03_ROADMAP.md`;
- `docs/architecture/04_ARCHITECTURE.md`;
- `docs/architecture/05_TECHNOLOGY_STACK.md`;
- `docs/governance/06_DEVELOPMENT_STANDARD.md`;
- `docs/overview/07_PROJECT_DESCRIPTION.md`;
- `docs/requirements/09_FUNCTIONAL_REQUIREMENTS.md`;
- `docs/design/10_SYSTEM_DESIGN.md`;
- `docs/requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md`;
- `docs/security/12_SECURITY_MODEL.md`;
- `docs/api/13_API_DESIGN.md`;
- `docs/governance/15_REPOSITORY_RULES.md`;
- `docs/governance/16_AI_DEVELOPMENT_RULES.md`.

## 4. Cloud First Architecture Decision

On 2026-07-18, VoiceBridge accepted Cloud First as the authoritative runtime model.

Decision:

- the browser is the primary client for Phases 1 through 4;
- STT, translation, TTS, session orchestration, provider integration, and authoritative state run in the cloud;
- users do not require a local programming environment;
- a minimal local cross-platform VoiceBridge Agent MAY be introduced in Phase 5 only when browser or operating-system security prevents required system-audio capture;
- the Agent MUST remain an edge adapter while core processing and state remain in the cloud.

The decision is recorded in `docs/adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md`.

## 5. Test Authentication Decision

The test launch uses one shared revocable access token.

The test model excludes:

- user registration;
- passwords;
- account recovery;
- social login;
- organizations;
- tenant administration;
- persistent user profiles.

The token MUST be protected as a secret and supported by rotation, revocation, request limits, provider quotas, and cost controls.

A production authentication design MUST replace the shared token before public multi-user deployment.

## 6. Phase 1 Audio Mixing Decision

Phase 1 uses browser-side automatic audio ducking.

Decision:

- Ukrainian synthesized speech uses the primary playback level;
- the complete original YouTube audio is reduced while Ukrainian speech is active;
- original audio rises to a configurable background level during Ukrainian pauses;
- original and Ukrainian volume controls are independent;
- the user can mute original audio;
- gain transitions are smooth;
- speech, music, and sound-effect separation is deferred beyond Phase 1.

Recommended initial levels are 15 percent original audio during Ukrainian speech, 50 percent during Ukrainian pauses, and 100 percent Ukrainian speech.

## 7. API Design Baseline

The Cloud First API baseline defines:

- HTTPS control operations under `/api/v1`;
- secure bidirectional streaming for browser audio, events, and translated output;
- cloud-owned session lifecycle and state;
- provider-independent recognition, translation, and synthesis contracts;
- common errors, versioning, backpressure, security, privacy, and validation requirements.

The baseline is recorded in `docs/api/13_API_DESIGN.md`.

## 8. Current Repository State

```text
docs/
    adr/
        ADR-001_CLOUD_FIRST_ARCHITECTURE.md
    api/
        13_API_DESIGN.md
    architecture/
        04_ARCHITECTURE.md
        05_TECHNOLOGY_STACK.md
    design/
        10_SYSTEM_DESIGN.md
    governance/
        06_DEVELOPMENT_STANDARD.md
        15_REPOSITORY_RULES.md
        16_AI_DEVELOPMENT_RULES.md
    history/
        08_PROJECT_HISTORY.md
        VOICEBRIDGE_DOCUMENTATION_AUTHOR_NOTES_UA.txt
    overview/
        01_PROJECT_OVERVIEW.md
        07_PROJECT_DESCRIPTION.md
    planning/
        02_REPOSITORY_STRUCTURE.md
        03_ROADMAP.md
    requirements/
        09_FUNCTIONAL_REQUIREMENTS.md
        11_NON_FUNCTIONAL_REQUIREMENTS.md
    security/
        12_SECURITY_MODEL.md
```

Documentation foundation status:
Completed and synchronized with Cloud First.

## 9. Phase 1 Implementation Plan

The detailed plan is recorded in `docs/phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`.

The plan defines:

- Phase 1 scope and exclusions;
- browser capture feasibility gate;
- cloud service boundaries;
- provider and streaming decision gates;
- simplified test authentication;
- milestones, testing, validation, cost controls, and recovery.

Phase 1 status:
Active.

## 10. Milestone 1 Browser Capture Validation

Milestone status:
COMPLETED.

Result:
PASSED.

Validated extension:

`src/browser_extension/`

Validated version:

`0.1.2`

Test scenarios:

- mixed film audio;
- audiobook;
- music track.

Validation results:

- capture started normally;
- original audio remained audible;
- original-volume control worked;
- ducking worked;
- visible `DUCKING` indication worked;
- audio metadata worked;
- continuous capture remained stable for 12 minutes;
- stop and cleanup completed normally;
- status returned to `IDLE`.

Resolved defects:

- unsupported `chrome.storage.local` access in the offscreen document;
- missing visual ducking indication.

Validation report:

`docs/phases/PHASE_1_MILESTONE_1_BROWSER_CAPTURE_VALIDATION.md`

## 11. Bootstrap and Author Notes

The repository now stores cross-chat recovery packages under:

`docs/bootstrap/`

The Documentation Foundation recovery package is archived because later Cloud First and Phase 1 work supersede its recorded Next Task.

The user-provided Ukrainian documentation explanation is stored unchanged in meaning as:

`docs/history/VOICEBRIDGE_DOCUMENTATION_AUTHOR_NOTES_UA.txt`

This file is an approved UTF-8 personal exception and is non-authoritative.

## 12. Milestone 2 Cloud Skeleton

Implementation path:

`src/cloud/`

Runtime decision:

`docs/adr/ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME.md`

Implemented:

- TypeScript and Node.js 24+ service;
- public health endpoint;
- shared Bearer-token validation;
- in-memory authoritative sessions;
- session lifecycle endpoints;
- canonical errors;
- request and correlation identifiers;
- bounded request bodies;
- request limiting;
- environment configuration;
- Docker packaging;
- automated tests.

Validation:

- TypeScript compilation passed;
- 8 automated tests passed;
- HTTP smoke test passed: health, create, start, and stop;
- ASCII validation passed;
- secret-pattern check passed.

Deployment and integration validation:

- Render built the Docker image successfully;
- the service reached `Live` state;
- the public HTTPS health endpoint returned `status: ok`;
- the shared test token remained in Render environment configuration;
- browser extension 0.2.0 returned `READY` after an authenticated connection test;
- capture and the cloud session reached `ACTIVE`;
- browser-side ducking displayed and applied `DUCKING 15%`;
- Stop returned capture to `IDLE` and the cloud session to `COMPLETED`.

Test deployment:

`https://voicebridge-cloud.onrender.com`

Validation record:

`docs/phases/PHASE_1_MILESTONE_2_CLOUD_SKELETON_VALIDATION.md`

Milestone 2 status:
PASSED.

## 13. Next Engineering Action

Phase 1 MVP work is complete.

Do not reopen completed Phase 1 scope without a documented defect or approved change.

The next project scope must be explicitly approved by the project owner. Candidate work belongs to Phase 2 Universal Cloud Audio or Phase 3 Cloud Service Hardening.
## 14. Milestone 3 Streaming Transport

Implemented:

- standard WebSocket server through `ws`;
- HTTP-authenticated one-time stream tickets;
- ticket binding to one active session;
- ticket expiration and one-use enforcement;
- binary mono `pcm_s16le` audio upload;
- canonical transport event envelopes;
- audio acknowledgements;
- client and server frame limits;
- client output-buffer limit;
- excess-frame drop counters;
- unexpected disconnect cleanup;
- browser stream metrics;
- 10 automated cloud tests.

Implementation paths:

- `src/cloud/src/stream_ticket_store.ts`;
- `src/cloud/src/stream_transport.ts`;
- `src/browser_extension/audio_processor.js`.

Decision:

`docs/adr/ADR-004_PHASE_1_STREAMING_TRANSPORT.md`

Validation:

- cloud service 0.2.0 reached `Live` on Render;
- browser extension 0.3.0 was confirmed;
- real YouTube audio streamed for 10 minutes and 3 seconds;
- 30902 frames and 59331840 bytes were sent;
- zero frames were dropped;
- unacknowledged frames remained below the maximum of 50;
- Stop returned capture to `IDLE` and both stream and session to `COMPLETED`.

Validation record:

`docs/phases/PHASE_1_MILESTONE_3_STREAMING_TRANSPORT_VALIDATION.md`

Status:
PASSED.

## 15. Milestone 4 Streaming STT

Decision:

- AssemblyAI Universal-Streaming English on the free tier for Phase 1 STT;
- provider binding remains behind the cloud-side `SttProvider` interface;
- provider credentials remain in Render environment configuration;
- browser clients continue to connect only to VoiceBridge Cloud.

Implemented:

- cloud service 0.3.1;
- AssemblyAI streaming adapter for raw PCM S16LE;
- aggregation of five nominal 20 millisecond frames into 100 millisecond provider packets;
- ordered partial and final transcript events;
- recognition-latency and error measurements;
- bounded provider output buffering;
- clean provider stream completion;
- extension 0.4.1 English transcript display;
- bounded browser session transcript state;
- 12 automated tests.

Decision record:

`docs/adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md`

Validation record:

`docs/phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md`

Status:
Implementation complete; Render configuration and live browser validation pending.

## 15A. Phase 1 MVP Final Validation

Date:

2026-07-22.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted versions:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- implementation baseline commit `1d7e82ecb122ab953190f9b2fdc8e7fbea86840c`.

Accepted pipeline:

```text
AssemblyAI English STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
```

Final controlled test completed 28 English, Ukrainian, voiced, and played segments with zero translation retries, zero TTS retries, zero pending operations after completion, zero dropped audio frames, and one-press Stop returning the extension to `IDLE`.

Observed final stage latency was 712 ms for STT, 81 ms for translation, and 190 ms for TTS.

A prior Azure Speech endurance session exceeded 12 minutes and completed 108 English, translated, voiced, and played segments with zero TTS retries.

The project owner confirmed understandable Ukrainian speech, automatic ducking, original-audio restoration, normal Azure pipeline operation, and correct one-press Stop behavior.

Records:

- `../phases/PHASE_1_MVP_VALIDATION.md`;
- `2026-07-22_PHASE_1_MVP_VALIDATED.md`;
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`.

## 16. References

- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [09_FUNCTIONAL_REQUIREMENTS](../requirements/09_FUNCTIONAL_REQUIREMENTS.md)
- [10_SYSTEM_DESIGN](../design/10_SYSTEM_DESIGN.md)
- [11_NON_FUNCTIONAL_REQUIREMENTS](../requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md)
- [12_SECURITY_MODEL](../security/12_SECURITY_MODEL.md)
- [13_API_DESIGN](../api/13_API_DESIGN.md)
- [ADR-005_PHASE_1_STREAMING_STT_PROVIDER](../adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION](../phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md)

## 17. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.13.0 | 2026-07-22 | Validated the minimum Phase 1 MVP and recorded the Azure pipeline and one-press Stop acceptance |
| 1.12.0 | 2026-07-19 | Replaced the initial Milestone 4 STT adapter with AssemblyAI Free |
| 1.11.0 | 2026-07-19 | Added Milestone 4 provider-neutral STT implementation and pending live validation |
| 1.10.0 | 2026-07-19 | Completed ten-minute Milestone 3 streaming validation and activated STT integration |
| 1.9.0 | 2026-07-18 | Added Milestone 3 bounded WebSocket and browser PCM streaming implementation |
| 1.8.0 | 2026-07-18 | Completed Render deployment and authenticated extension lifecycle validation |
| 1.7.0 | 2026-07-18 | Added Milestone 2 Cloud Skeleton implementation and validation |
| 1.6.0 | 2026-07-18 | Completed Milestone 1 validation and activated Milestone 2 Cloud Skeleton |
| 1.5.0 | 2026-07-18 | Added Bootstrap storage and UTF-8 personal author notes |
| 1.4.0 | 2026-07-18 | Added Milestone 1 browser extension prototype and pending validation status |
| 1.3.0 | 2026-07-18 | Added Phase 1 browser audio ducking and volume-control decision |
| 1.2.0 | 2026-07-18 | Added Phase 1 implementation plan and activated browser capture feasibility milestone |
| 1.1.0 | 2026-07-18 | Consolidated history and synchronized Cloud First architecture and API baseline |
| 1.0.0 | 2026-07-18 | Created project history baseline |
