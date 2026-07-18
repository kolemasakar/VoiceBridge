# VoiceBridge - Holovna dokumentatsiia

Open-source Cloud First real-time speech translation platform.

Slogan:

`Listen without language barriers.`

## Project Overview

VoiceBridge converts spoken source-language audio into translated target-language speech.

The initial product target is real-time English-to-Ukrainian AI voice translation for YouTube videos.

VoiceBridge uses a Cloud First architecture:

- the browser is the primary client for Phases 1 through 4;
- speech recognition, translation, speech synthesis, session orchestration, and authoritative state run in the cloud;
- the user does not need a local programming environment;
- a minimal local VoiceBridge Agent may be introduced only later if browser or operating-system security prevents required system-audio capture.

## Current Status

Completed:

- repository and documentation foundation;
- governance, requirements, system design, and security baselines;
- Cloud First architecture decision;
- Cloud First API design baseline;
- simplified test authentication model.

Next:

- prepare the detailed Phase 1 Cloud YouTube MVP implementation plan.

## Test Authentication

The test launch uses one shared revocable access token.

The test model does not include user registration, passwords, account recovery, organizations, or persistent user profiles.

A production identity model must replace the shared test token before public multi-user deployment.

## Documentation

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

Secrets and provider credentials must never be committed to the repository.

## License

Apache-2.0
