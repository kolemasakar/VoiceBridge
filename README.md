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

Current accepted runtime after the 2026-08-29 STT transition:

- cloud service `0.6.0`;
- browser extension `0.6.2`;
- Gemini 3.5 Transcribe Live English streaming STT by default;
- AssemblyAI `universal-streaming-english` retained as explicit rollback;
- Azure Translator primary English-to-Ukrainian translation;
- Gemini translation fallback;
- Azure Speech Ukrainian TTS with `uk-UA-OstapNeural`;
- ordered browser PCM playback;
- independent original and Ukrainian volume controls;
- automatic original-audio ducking and restoration;
- bounded user Stop: completed text/translation drain, queued playback capped and cancelled;
- bounded queues, retries, drains, and cleanup;
- no intentional VoiceBridge content persistence.

The original Phase 1 controlled acceptance baseline remains documented as
historical evidence. The later Gemini STT transition was validated separately
against that rollback path.

Current STT transition evidence:

- same-duration Gemini run: 2938 frames, 1 dropped, 6 final STT segments,
  363 ms reported recognition latency;
- same-duration AssemblyAI rollback run: 2945 frames, 7 dropped, 4 final STT
  segments, 378 ms reported recognition latency;
- both completed with translation pending 0, TTS pending 0, and queued playback
  0 ms after Stop;
- qualitative transcript review favored Gemini for coherence and several proper
  names;
- no human reference transcript was available, so no WER claim is made.

Active Phase 1 cloud endpoint:

`https://voicebridge-cloud-us.onrender.com`

## Current Pipeline

```text
YouTube tab audio
    -> VoiceBridge browser capture
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live English STT
    -> Azure Translator Ukrainian translation
    -> Azure Speech Ukrainian TTS
    -> browser PCM playback
    -> automatic original-audio ducking and restoration
```

STT rollback path:

```text
YouTube tab audio
    -> VoiceBridge browser capture
    -> VoiceBridge Cloud
    -> AssemblyAI universal-streaming-english
    -> Azure Translator Ukrainian translation
    -> Azure Speech Ukrainian TTS
```

Translation fallback remains:

```text
Selected English STT
    -> Gemini Ukrainian translation fallback
    -> Azure Speech Ukrainian TTS
```

## Test Authentication

The controlled test launch uses one shared revocable access token.

The test model does not include registration, passwords, account recovery, organizations, or persistent user profiles.

A production identity model must replace the shared token before public multi-user deployment.

## Documentation

- [Phase 1 MVP Validation](docs/phases/PHASE_1_MVP_VALIDATION.md)
- [Gemini 3.5 Transcribe STT Acceptance](docs/history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md)
- [Gemini 3.5 Transcribe Default STT ADR](docs/adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md)
- [Phase 1 MVP Recovery Bootstrap](docs/bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md)
- [Phase 1 MVP History Entry](docs/history/2026-07-22_PHASE_1_MVP_VALIDATED.md)
- [Project Overview](docs/overview/01_PROJECT_OVERVIEW.md)
- [Project Description](docs/overview/07_PROJECT_DESCRIPTION.md)
- [Roadmap](docs/planning/03_ROADMAP.md)
- [Architecture](docs/architecture/04_ARCHITECTURE.md)
- [Technology Stack](docs/architecture/05_TECHNOLOGY_STACK.md)
- [Cloud First ADR](docs/adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [Phase 1 Streaming STT Provider ADR](docs/adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md)
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
