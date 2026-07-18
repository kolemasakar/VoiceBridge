# 08_PROJECT_HISTORY - Istoriia proiektu

UA: Istoriia ta perevirenyi potochnyi stan proiektu VoiceBridge.

Purpose:
Record completed VoiceBridge milestones, accepted decisions, current repository state, and the next approved engineering action.

Scope:
Repository foundation, documentation milestones, architecture decisions, API baseline, current state, and next phase.

Status:
Approved

Version:
1.4.0

Last Updated:
2026-07-18

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

## 10. Milestone 1 Prototype

The initial Chromium Manifest V3 prototype was created in:

`src/browser_extension/`

Implemented:

- explicit user-initiated YouTube tab capture;
- offscreen media runtime;
- original tab-audio playback;
- original volume control;
- Ukrainian volume control placeholder;
- three-second ducking simulation;
- audio metadata and elapsed-time display;
- clean stop and track-ended handling;
- no cloud connection, credentials, recording, or persistence.

Static validation passed.

Browser runtime validation is pending.

## 11. Next Engineering Action

Install the unpacked extension in Chrome 116 or later and execute the Milestone 1 browser validation checklist.

Milestone 1 MUST remain incomplete until the ten-minute stability test and clean shutdown checks pass.

## 12. References

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

## 13. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.4.0 | 2026-07-18 | Added Milestone 1 browser extension prototype and pending validation status |
| 1.3.0 | 2026-07-18 | Added Phase 1 browser audio ducking and volume-control decision |
| 1.2.0 | 2026-07-18 | Added Phase 1 implementation plan and activated browser capture feasibility milestone |
| 1.1.0 | 2026-07-18 | Consolidated history and synchronized Cloud First architecture and API baseline |
| 1.0.0 | 2026-07-18 | Created project history baseline |
