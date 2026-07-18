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
1.1.0

Last Updated:
2026-07-18

## Table of Contents

1. Project Vision
   UA: Bachennia proiektu

2. Development Strategy
   UA: Stratehiia rozvytku

3. Phase Overview
   UA: Ohliad faz

4. Phase 1 YouTube MVP
   UA: Persha faza YouTube MVP

5. Phase 2 Universal Audio Translation
   UA: Universalnyi audio pereklad

6. Phase 3 Interpreter Mode
   UA: Rezhym synkhronnoho perekladacha

7. Phase 4 Multi Platform Expansion
   UA: Rozshyrennia platform

8. Phase 5 Open Translation Platform
   UA: Vidkryta platforma perekladu

9. Milestone Criteria
   UA: Kryterii kontrolnykh tochek

10. References
    UA: Posylannia

11. Version History
    UA: Istoriia versii

## 1. Project Vision

VoiceBridge is an open-source AI communication bridge that removes language barriers.

The initial goal:

- allow users to watch English YouTube videos with Ukrainian AI voice translation;
- provide natural listening experience without manual subtitles;
- validate real-time speech translation workflow.

The long-term goal:

- enable real-time multilingual communication between people using different languages.

## 2. Development Strategy

The project follows incremental validation and a Cloud First implementation model.

Cloud First rules:

- the browser is the primary client for Phases 1 through 4;
- speech recognition, translation, speech synthesis, session orchestration, and state management run in the cloud;
- users do not require a local development environment;
- a minimal local cross-platform VoiceBridge Agent MAY be introduced in Phase 5 only when browser or operating-system security prevents required system-audio capture;
- the Agent MUST NOT move AI processing, orchestration, or authoritative session state out of the cloud;
- the test launch MAY use a single shared test access token without registration or account management;
- production authentication MUST be designed and approved before public or multi-user deployment.

Each phase MUST:

- have a documented objective;
- produce a measurable result;
- update project history;
- update project status;
- define the next milestone.

## 3. Phase Overview

| Phase | Name | Objective | Status |
|------|------|-----------|--------|
|0|Repository Foundation|Create project foundation and governance|Completed|
|1|Cloud YouTube MVP|Browser client with cloud speech translation pipeline|Planned|
|2|Universal Cloud Audio|Generalize browser audio input and cloud processing|Planned|
|3|Cloud Service Hardening|Improve reliability, security, observability, and provider portability|Planned|
|4|Multi Platform Expansion|Support browser-accessible communication services|Planned|
|5|Interpreter Mode and Optional Agent|Enable two-way translation and add a minimal local agent only if required|Planned|

## 4. Phase 1 Cloud YouTube MVP

Goal:
Create the first working demonstration.

Target scenario:
User opens an English YouTube video in a browser and receives Ukrainian AI voice translation from the cloud pipeline.

Validation criteria:

- successful demo on selected YouTube videos;
- acceptable translation quality;
- acceptable delay;
- stable playback experience.

## 5. Phase 2 Universal Cloud Audio Translation

Goal:
Separate browser audio capture from the cloud translation pipeline.

Capabilities:

- generic audio input;
- streaming speech recognition;
- translation service layer;
- text-to-speech output;
- configurable languages.

## 6. Phase 3 Cloud Service Hardening

Goal:
Prepare the cloud platform for reliable expansion.

Capabilities:

- bounded streaming and recovery;
- provider portability;
- security and observability controls;
- production authentication design;
- multi-session readiness.

## 7. Phase 4 Multi Platform Expansion

Goal:
Support different communication sources.

Possible platforms:

- messengers;
- video conferencing;
- browser communication;
- mobile applications.

## 8. Phase 5 Interpreter Mode and Optional Agent

Goal:
Enable real-time two-way multilingual communication.

Possible capabilities:

- bidirectional translation sessions;
- multiple AI providers and speech engines;
- a minimal local cross-platform VoiceBridge Agent only when browser or operating-system restrictions prevent required system-audio capture;
- cloud-hosted STT, translation, TTS, orchestration, and authoritative state even when the Agent is used.

## 9. Milestone Criteria

A phase is completed only when:

- objectives are achieved;
- documentation is updated;
- project history is updated;
- repository changes are committed;
- next phase entry conditions are defined.

## 10. References

- ../overview/07_PROJECT_DESCRIPTION.md
- 02_REPOSITORY_STRUCTURE.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md

## 11. Version History

| Version | Date | Description |
|---------|------|-------------|
|1.1.0|2026-07-18|Aligned roadmap with Cloud First architecture and simplified test authentication|
|1.0.0|2026-07-18|Initial roadmap definition|
