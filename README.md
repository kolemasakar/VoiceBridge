# VoiceBridge - Holovna dokumentatsiia

Open-source Cloud First real-time speech translation platform.

Slogan:

`Listen without language barriers.`

## Project Overview

VoiceBridge converts spoken source-language audio into translated target-language speech.

The validated Phase 1 product is real-time English-to-Ukrainian AI voice translation for YouTube videos.

VoiceBridge uses a Cloud First architecture:

- the browser is the primary client for Phases 1 through 4;
- speech recognition, translation, speech synthesis, orchestration, and authoritative state run in the cloud;
- users do not need a local programming environment;
- a minimal local VoiceBridge Agent may be introduced only later if browser or operating-system security prevents required system-audio capture.

## Current Status

Phase 1 minimum YouTube MVP:

`VALIDATED`

Accepted runtime baseline:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- AssemblyAI English streaming STT;
- Azure Translator primary English-to-Ukrainian translation;
- Gemini translation fallback;
- Azure Speech Ukrainian TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- independent original and Ukrainian volume controls;
- automatic original-audio ducking and restoration;
- one-press idempotent Stop with visible `STOPPING` state;
- bounded queues, retries, drains, and cleanup;
- no intentional VoiceBridge content persistence.

Final controlled acceptance evidence:

- English final segments: 28;
- Ukrainian final segments: 28;
- voiced segments: 28;
- played segments: 28;
- translation retries: 0;
- TTS retries: 0;
- pending operations after completion: 0;
- dropped audio frames: 0;
- final playback state: `COMPLETED`;
- final capture state: `IDLE`.

Active Phase 1 cloud endpoint:

`https://voicebridge-cloud-us.onrender.com`

## Validated Phase 1 Pipeline

```text
YouTube tab audio
    -> VoiceBridge browser capture
    -> VoiceBridge Cloud
    -> AssemblyAI English STT
    -> Azure Translator Ukrainian translation
    -> Azure Speech Ukrainian TTS
    -> browser PCM playback
    -> automatic original-audio ducking and restoration
```

Translation fallback path:

```text
AssemblyAI English STT
    -> Gemini Ukrainian translation
    -> Azure Speech Ukrainian TTS
```

## Test Authentication

The controlled test launch uses one shared revocable access token.

The test model does not include registration, passwords, account recovery, organizations, or persistent user profiles.

A production identity model must replace the shared token before public multi-user deployment.

## Documentation

- [Phase 1 MVP Validation](docs/phases/PHASE_1_MVP_VALIDATION.md)
- [Phase 1 MVP Recovery Bootstrap](docs/bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md)
- [Phase 1 MVP History Entry](docs/history/2026-07-22_PHASE_1_MVP_VALIDATED.md)
- [Project Overview](docs/overview/01_PROJECT_OVERVIEW.md)
- [Project Description](docs/overview/07_PROJECT_DESCRIPTION.md)
- [Roadmap](docs/planning/03_ROADMAP.md)
- [Architecture](docs/architecture/04_ARCHITECTURE.md)
- [Technology Stack](docs/architecture/05_TECHNOLOGY_STACK.md)
- [Cloud First ADR](docs/adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [Streaming STT Provider ADR](docs/adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
- [Initial Translation Provider ADR](docs/adr/ADR-006_PHASE_1_TRANSLATION_PROVIDER.md)
- [Initial TTS Provider ADR](docs/adr/ADR-007_PHASE_1_TTS_PROVIDER.md)
- [Azure Speech TTS ADR](docs/adr/ADR-008_AZURE_TTS_PROVIDER.md)
- [Azure Translator Primary ADR](docs/adr/ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER.md)
- [Functional Requirements](docs/requirements/09_FUNCTIONAL_REQUIREMENTS.md)
- [System Design](docs/design/10_SYSTEM_DESIGN.md)
- [Non-Functional Requirements](docs/requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md)
- [Security Model](docs/security/12_SECURITY_MODEL.md)
- [API Design](docs/api/13_API_DESIGN.md)
- [Phase 1 Cloud YouTube MVP Plan](docs/phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)
- [Milestone 4 STT Validation](docs/phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md)
- [Milestone 5 Translation Integration](docs/phases/PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md)
- [Milestone 6 TTS and Playback](docs/phases/PHASE_1_MILESTONE_6_TTS_PLAYBACK.md)
- [Development Standard](docs/governance/06_DEVELOPMENT_STANDARD.md)
- [Repository Rules](docs/governance/15_REPOSITORY_RULES.md)
- [AI Development Rules](docs/governance/16_AI_DEVELOPMENT_RULES.md)
- [Project History](docs/history/08_PROJECT_HISTORY.md)

## Repository Structure

```text
.github/
    workflows/
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

Secrets and provider credentials must never be committed.

## License

Apache-2.0
