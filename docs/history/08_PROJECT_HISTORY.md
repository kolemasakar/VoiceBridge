# 08_PROJECT_HISTORY - Istoriia proiektu

UA: Istoriia ta perevirenyi potochnyi stan proiektu VoiceBridge.

Purpose:
Record completed VoiceBridge milestones, accepted decisions, current repository state, and the next approved engineering action.

Scope:
Repository foundation, documentation milestones, architecture decisions, API baseline, current state, and next phase.

Status:
Approved

Version:
1.14.0

Last Updated:
2026-08-29

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

The authoritative application implementation is stored under:

```text
src/
    browser_extension/
    cloud/
```

Canonical project documentation is stored under `docs/`, including architecture, planning, ADR, phase validation, history, governance, and bootstrap records.

Current primary branch:

`main`

Current accepted Phase 1 runtime is documented in `README.md`, `docs/planning/03_ROADMAP.md`, `docs/architecture/04_ARCHITECTURE.md`, and `docs/architecture/05_TECHNOLOGY_STACK.md`.

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
Completed and validated.

## 10. Milestone 1 Browser Capture Validation

Milestone status:
COMPLETED.

Result:
PASSED.

Validated extension:

`src/browser_extension/`

Validated scenarios included mixed film audio, audiobook, and music. Capture, original-volume control, ducking, metadata, endurance, Stop, and cleanup passed the Phase 1 acceptance gate.

Validation report:

`docs/phases/PHASE_1_MILESTONE_1_BROWSER_CAPTURE_VALIDATION.md`

## 11. Bootstrap and Author Notes

The repository stores cross-chat recovery packages under:

`docs/bootstrap/`

The Documentation Foundation recovery package is archived because later Cloud First and Phase 1 work supersede its recorded Next Task.

The user-provided Ukrainian documentation explanation is stored as:

`docs/history/VOICEBRIDGE_DOCUMENTATION_AUTHOR_NOTES_UA.txt`

This file is an approved UTF-8 personal exception and is non-authoritative.

## 12. Milestone 2 Cloud Skeleton

Implementation path:

`src/cloud/`

Implemented and validated:

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
- automated tests;
- Render deployment and authenticated browser lifecycle.

Milestone 2 status:
PASSED.

## 13. Next Engineering Action

Phase 1 MVP work and the Gemini STT transition are complete.

Do not reopen completed Phase 1 scope without a documented defect or approved change.

The next functional project scope is Phase 2 Universal Cloud Audio. Phase 2 MUST begin with a documented source-adapter and session-contract design gate before implementation.

Phase 3 Cloud Service Hardening remains a separate later scope.

## 14. Milestone 3 Streaming Transport

Implemented and validated:

- standard WebSocket server through `ws`;
- HTTP-authenticated one-time stream tickets;
- ticket binding, expiration, and one-use enforcement;
- binary mono PCM audio upload;
- canonical transport event envelopes;
- acknowledgements and bounded frame handling;
- disconnect cleanup;
- browser stream metrics;
- ten-minute live validation with zero dropped frames in the accepted run.

Decision:

`docs/adr/ADR-004_PHASE_1_STREAMING_TRANSPORT.md`

Status:
PASSED.

## 15. Milestone 4 Streaming STT

Original Phase 1 decision:

- AssemblyAI Universal-Streaming English on the free tier;
- provider binding behind the cloud-side `SttProvider` interface;
- provider credentials in cloud environment configuration;
- browser clients connect only to VoiceBridge Cloud.

This provider choice established the validated rollback baseline and was later superseded as the default by the accepted Gemini 3.5 Transcribe Live transition. The AssemblyAI path remains implemented.

Decision record:

`docs/adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md`

Validation record:

`docs/phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md`

## 15A. Phase 1 MVP Final Validation

Date:
2026-07-22.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted versions:

- cloud service `0.6.0`;
- browser extension `0.6.2`.

Original accepted pipeline:

```text
AssemblyAI English STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
```

The controlled final run completed 28 English, Ukrainian, voiced, and played segments with zero translation retries, zero TTS retries, zero pending operations after completion, zero dropped audio frames, and one-press Stop returning the extension to `IDLE`.

Observed final stage latency was 712 ms for STT, 81 ms for translation, and 190 ms for TTS.

Records:

- `../phases/PHASE_1_MVP_VALIDATION.md`;
- `2026-07-22_PHASE_1_MVP_VALIDATED.md`;
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`.

## 15B. Gemini 3.5 Transcribe Live Transition

Date:
2026-08-29.

Decision:
Gemini 3.5 Transcribe Live is accepted as the default VoiceBridge streaming STT provider behind the existing `SttProvider` boundary.

Exact model:

`gemini-3.5-transcribe-live`

Rollback:

`AssemblyAI universal-streaming-english`

The controlled same-duration A/B used approximately 59 seconds of the same English source fragment.

Gemini evidence:

- 2938 frames sent;
- 1 dropped frame;
- 6 final STT segments;
- 363 ms reported recognition latency;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

AssemblyAI rollback evidence:

- 2945 frames sent;
- 7 dropped frames;
- 4 final STT segments;
- 378 ms reported recognition latency;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

The latency difference is treated as near parity. Qualitative transcript review favored Gemini, but no WER claim is made because no human reference transcript was available.

The accepted downstream pipeline remains:

```text
Gemini 3.5 Transcribe Live
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
```

Record:

`2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`

ADR:

`../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md`

## 15C. Played-Segment Instrumentation Repair

Date:
2026-08-29.

The non-blocking instrumentation defect found during Gemini STT acceptance was repaired on `main`.

Current implementation tracks completed TTS playback by scheduled playback boundaries. Audio discarded by the bounded user Stop policy is excluded from the played-segment count.

Accepted commit before the alignment work:

`9a42c8ea3779ae603f8721cace3e74db07ced6d6`

## 15D. Phase 1 Runtime Alignment

Date:
2026-08-29.

The accepted provider defaults are synchronized so a missing provider-selection environment variable resolves to the validated Phase 1 provider matrix:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Gemini TTS remains explicitly selectable, and AssemblyAI remains the explicit STT rollback path.

A regression test protects these accepted defaults.

Alignment implementation commit:

`2a755d7e3e902542a5589ebca2700df0fa51f6b1`

## 16. References

- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT](../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md)
- [PHASE_1_MVP_VALIDATION](../phases/PHASE_1_MVP_VALIDATION.md)
- [GEMINI_STT_ACCEPTANCE](2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md)

## 17. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.14.0 | 2026-08-29 | Recorded Gemini default STT acceptance, played-segment repair, aligned provider defaults, and Phase 2 as the next functional scope |
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
