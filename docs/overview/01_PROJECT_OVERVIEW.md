# 01_PROJECT_OVERVIEW

UA: Ohliad proiektu VoiceBridge, yoho pryznachennia, dokumentatsiia ta bazovi mezhi.

Purpose:
Provide the approved high-level project overview for VoiceBridge and direct contributors to the canonical documentation set.

Scope:
Project identity, repository purpose, documentation map, operating principles, current product direction, and source-of-truth references.

Out of Scope:
Detailed architecture, implementation tasks, provider configuration, deployment instructions, pricing decisions, and release planning.

Audience:
Developers, contributors, maintainers, users, and AI development assistants.

Status:
Approved

Version:
1.1.0

Last Updated:
2026-07-18

## Table of Contents

1. Project Identity
   UA: Identychnist proiektu

2. Repository Purpose
   UA: Pryznachennia repozitoriia

3. Product Direction
   UA: Napriam produktu

4. Documentation Map
   UA: Mapa dokumentatsii

5. Operating Principles
   UA: Robochi pryntsypy

6. Contribution Context
   UA: Kontekst vneskiv

7. Source of Truth
   UA: Dzherelo pravdy

8. References
   UA: Posylannia

9. Version History
   UA: Istoriia versii

## 1. Project Identity

VoiceBridge is an open-source real-time speech translation platform.

The project converts spoken source-language audio into translated target-language speech so users can understand audio content and conversations across language barriers.

The initial product direction is English-to-Ukrainian AI voice translation for YouTube videos.

The long-term direction is a universal multilingual communication bridge for videos, live conversations, meetings, calls, and other audio sources.

## 2. Repository Purpose

This repository contains the canonical documentation, governance, planning, architecture, source code, tests, tools, examples, and supporting assets for VoiceBridge.

Repository content MUST remain organized according to the approved repository structure.

Project work MUST be documented clearly so humans and AI development assistants can continue development consistently.

## 3. Product Direction

VoiceBridge starts with a focused MVP that proves the end-to-end translation workflow:

- capture or receive supported audio;
- recognize spoken source-language content;
- translate recognized text into the target language;
- synthesize target-language speech;
- play translated speech for the user.

The MVP MUST prioritize a working, understandable demo before broad platform support.

VoiceBridge follows a Cloud First model.

The browser is the primary client for Phases 1 through 4.

Speech recognition, translation, speech synthesis, session orchestration, and session state management MUST run in the cloud.

A minimal local cross-platform VoiceBridge Agent MAY be introduced only in a later phase when browser or operating-system security prevents required system-audio capture. The Agent MUST remain limited to local capture and delivery functions while AI processing, orchestration, and state remain in the cloud.

The test launch MAY use a single shared test access token without user registration or account management. This temporary mechanism MUST NOT be treated as the final production authentication model.

Future development MAY expand to additional languages, audio sources, runtime modes, provider integrations, and privacy-preserving engines.

## 4. Documentation Map

Core documentation is organized by topic:

- `docs/overview/` contains project-level overview and description documents;
- `docs/planning/` contains repository structure and roadmap documents;
- `docs/architecture/` contains architecture and technology stack documents;
- `docs/governance/` contains development, repository, and AI development rules;
- `docs/adr/` contains architecture decision records when decisions are introduced;
- `docs/design/` contains product and interface design documents when design work is introduced;
- `docs/phases/` contains phase-specific execution documents when phase plans are introduced;
- `docs/bootstrap/` contains bootstrap and recovery documents when needed.

## 5. Operating Principles

VoiceBridge development MUST follow these principles:

- keep documentation Markdown-based and ASCII-only;
- avoid committing secrets, credentials, or sensitive runtime data;
- keep major technical decisions documented before implementation;
- preserve modular boundaries between audio capture, speech recognition, translation, speech synthesis, and playback;
- keep provider integrations replaceable;
- prioritize privacy-aware operation by default;
- keep project history clear through focused commits.

## 6. Contribution Context

Contributors SHOULD read the overview, repository structure, roadmap, architecture, technology stack, development standard, repository rules, and AI development rules before making changes.

Changes MUST respect the approved scope and governance documents.

Implementation work SHOULD reference the relevant planning or architecture document when introducing significant behavior.

## 7. Source of Truth

GitHub is the single source of truth for the VoiceBridge project.

Approved documentation in this repository defines the baseline for project structure, development practices, architecture direction, and repository governance.

When documents conflict, the more specific approved governance or architecture document SHOULD guide the change unless maintainers explicitly approve an update.

## 8. References

- 07_PROJECT_DESCRIPTION.md
- ../planning/02_REPOSITORY_STRUCTURE.md
- ../planning/03_ROADMAP.md
- ../architecture/04_ARCHITECTURE.md
- ../architecture/05_TECHNOLOGY_STACK.md
- ../governance/06_DEVELOPMENT_STANDARD.md
- ../governance/15_REPOSITORY_RULES.md
- ../governance/16_AI_DEVELOPMENT_RULES.md

## 9. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-07-18 | Added Cloud First runtime direction and test authentication baseline |
| 1.0.0 | 2026-07-18 | Initial approved project overview |
