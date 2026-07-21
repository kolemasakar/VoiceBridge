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
1.6.0

Last Updated:
2026-07-21

## Table of Contents

1. Project Vision
2. Development Strategy
3. Phase Overview
4. Phase 1 Cloud YouTube MVP
5. Phase 2 Universal Cloud Audio Translation
6. Phase 3 Cloud Service Hardening
7. Phase 4 Multi Platform Expansion
8. Phase 5 Interpreter Mode and Optional Agent
9. Milestone Criteria
10. References
11. Version History

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
- the test launch MAY use one shared revocable token;
- production authentication MUST be approved before public multi-user deployment.

Each phase MUST:

- have a documented objective;
- produce a measurable result;
- update project history and status;
- define the next milestone.

## 3. Phase Overview

| Phase | Name | Objective | Status |
|------|------|-----------|--------|
|0|Repository Foundation|Create project foundation and governance|Completed|
|1|Cloud YouTube MVP|Browser client with cloud speech translation pipeline|Active|
|2|Universal Cloud Audio|Generalize browser audio input and cloud processing|Planned|
|3|Cloud Service Hardening|Improve reliability, security, observability, and provider portability|Planned|
|4|Multi Platform Expansion|Support browser-accessible communication services|Planned|
|5|Interpreter Mode and Optional Agent|Enable two-way translation and add a minimal local agent only if required|Planned|

## 4. Phase 1 Cloud YouTube MVP

Goal:
Create the first working demonstration.

Target scenario:
A user opens an English YouTube video and receives Ukrainian AI speech from the cloud pipeline.

Validation criteria:

- successful demo on selected YouTube videos;
- acceptable recognition and translation quality;
- understandable Ukrainian speech;
- acceptable delay;
- stable playback and automatic ducking;
- clean bounded shutdown.

Current milestone state:

| Milestone | Capability | Status |
|-----------|------------|--------|
|1|Browser Capture Feasibility|Passed|
|2|Cloud Skeleton|Passed|
|3|Streaming Transport|Passed|
|4|Streaming STT Integration|Passed|
|5|English-to-Ukrainian Translation Integration|Passed|
|6|Ukrainian TTS and Browser Playback|Implementation complete; live validation pending|
|7|End-to-End Hardening and Demo Validation|Planned|

Milestone 4 validated:

- browser extension `0.4.1`;
- cloud service `0.3.1`;
- AssemblyAI Universal-Streaming English;
- continuous live session longer than ten minutes;
- ordered English partial and final transcripts;
- zero dropped frames;
- clean shutdown states.

Milestone 5 validated:

- cloud service `0.4.2`;
- browser extension `0.5.0`;
- Gemini English-to-Ukrainian translation;
- ordered final-segment translation;
- bounded sequential queue and context;
- visible translation latency and errors;
- ten-second graceful translation drain;
- equal final English and Ukrainian segment counts after Stop;
- readable Ukrainian text;
- zero dropped audio frames;
- no cloud content persistence.

Milestone 6 implemented:

- Gemini TTS selected behind a provider-neutral boundary;
- cloud service `0.5.0`;
- browser extension `0.6.0`;
- configurable model `gemini-2.5-flash-preview-tts`;
- configurable initial voice `Iapetus`;
- ordered TTS queue with a maximum of 20 pending operations;
- normalized mono `pcm_s16le` at 24000 Hz;
- bounded WebSocket PCM chunks;
- TTS latency, audio byte, duration, error, and drain metrics;
- browser Web Audio playback queue;
- real Ukrainian volume control;
- automatic original-audio ducking and restoration;
- bounded cloud and local playback drains;
- provider failure isolation;
- no synthesized-audio persistence.

Milestone 6 remaining validation:

- complete automated validation and merge;
- deploy cloud service `0.5.0`;
- load browser extension `0.6.0`;
- validate Ukrainian voice quality and ordering;
- validate real Ukrainian gain control;
- validate automatic ducking and restoration;
- validate bounded Stop and resource cleanup;
- confirm no secret or persistent content exposure.

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

A milestone is completed only when:

- objectives are achieved;
- automated and live validation criteria pass;
- documentation and project history are updated;
- repository changes are committed;
- next milestone entry conditions are defined.

## 10. References

- ../overview/07_PROJECT_DESCRIPTION.md
- 02_REPOSITORY_STRUCTURE.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md
- ../phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md
- ../phases/PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md
- ../phases/PHASE_1_MILESTONE_6_TTS_PLAYBACK.md

## 11. Version History

| Version | Date | Description |
|---------|------|-------------|
|1.6.0|2026-07-21|Passed Milestone 5 and activated Milestone 6 TTS and browser playback validation|
|1.5.0|2026-07-21|Recorded live Gemini translation and cloud 0.4.2 graceful drain|
|1.4.0|2026-07-21|Completed Milestone 5 implementation|
|1.3.0|2026-07-21|Completed Milestone 4 and activated translation integration|
|1.2.0|2026-07-18|Activated Phase 1 Cloud YouTube MVP execution|
|1.1.0|2026-07-18|Aligned roadmap with Cloud First architecture and simplified test authentication|
|1.0.0|2026-07-18|Initial roadmap definition|
