# 08_PROJECT_HISTORY - Istoriia proiektu

UA: Istoriia ta perevirenyi potochnyi stan proiektu VoiceBridge.

Purpose:
Record completed VoiceBridge milestones, accepted decisions, current repository state, and the next approved engineering action.

Scope:
Repository foundation, architecture decisions, phase milestones, provider transitions, validated runtime state, and handoff to the next phase.

Status:
Approved

Version:
1.15.0

Last Updated:
2026-08-30

## 1. Project Origin

VoiceBridge was created as an open-source real-time speech translation platform.

Initial product goal:

- English-to-Ukrainian AI voice translation for YouTube videos.

Long-term goal:

- multilingual real-time speech translation for videos, conversations, meetings, calls, and other supported audio sources.

## 2. Repository and Governance Foundation

Completed:

- GitHub repository established as Single Source of Truth;
- repository governance established;
- Cloud First architecture adopted;
- browser selected as primary client for Phases 1 through 4;
- canonical documentation separated into overview, planning, architecture, requirements, design, security, API, governance, ADR, phase, history, and bootstrap records;
- AI-assisted development rules established;
- secrets and provider credentials kept outside source control;
- content persistence rejected by default unless explicitly approved.

Canonical governance:

- `../governance/15_REPOSITORY_RULES.md`;
- `../governance/16_AI_DEVELOPMENT_RULES.md`.

## 3. Cloud First Architecture Decision

On 2026-07-18 VoiceBridge accepted Cloud First as the authoritative runtime model.

Decision:

- browser is the primary client for Phases 1 through 4;
- STT, translation, TTS, session orchestration, provider integration, language capability policy, and authoritative state run in the cloud;
- users do not require a local programming environment;
- a minimal local cross-platform VoiceBridge Agent MAY be introduced only when browser or operating-system restrictions prevent required capture;
- any Agent remains an edge adapter and does not replace cloud AI processing or cloud-owned state.

Record:

`../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md`

## 4. Controlled Test Authentication

The controlled test runtime uses one shared revocable access token.

It excludes production account features such as registration, passwords, account recovery, organizations, and persistent user profiles.

A production authentication/authorization design remains required before public multi-user deployment.

## 5. Phase 1 - Cloud YouTube MVP

Phase 1 completed and validated the initial English-to-Ukrainian YouTube voice translation pipeline.

Final marker:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`

Accepted browser/cloud behavior included:

- current YouTube tab capture;
- secure cloud WebSocket transport;
- streaming STT;
- English-to-Ukrainian translation;
- Ukrainian TTS;
- ordered browser playback;
- independent volume controls;
- automatic ducking/restoration;
- bounded one-press Stop;
- no intentional VoiceBridge content persistence.

The original Phase 1 final run completed 28 English final segments, 28 Ukrainian final segments, 28 voiced segments, and 28 played segments with zero pending translation/TTS work and zero queued audio at terminal state.

Detailed Phase 1 records remain canonical for their specific historical evidence and are not superseded by this consolidated history.

Key records:

- `../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`;
- `../phases/PHASE_1_MVP_VALIDATION.md`;
- `2026-07-22_PHASE_1_MVP_VALIDATED.md`;
- `../bootstrap/PHASE_1_MVP_VALIDATED_BOOTSTRAP.md`.

## 6. Phase 1 Provider Evolution

### 6.1 AssemblyAI STT Baseline

AssemblyAI `universal-streaming-english` established the original validated Phase 1 streaming STT path behind the common `SttProvider` interface.

It remains implemented as the explicit rollback STT provider.

### 6.2 Azure Translation and TTS

Accepted downstream provider policy:

- Azure Translator primary;
- Gemini translation fallback;
- Azure Speech TTS primary;
- accepted Ukrainian voice `uk-UA-OstapNeural`.

### 6.3 Gemini 3.5 Transcribe Live Transition

Date:
2026-08-29.

Gemini 3.5 Transcribe Live was accepted as the default VoiceBridge streaming STT provider.

Exact model:

`gemini-3.5-transcribe-live`

Explicit rollback:

`AssemblyAI universal-streaming-english`

Controlled same-duration comparison used approximately 59 seconds of the same English source fragment.

Gemini evidence:

- 2938 frames;
- 1 dropped frame;
- 6 final STT segments;
- 363 ms reported recognition latency.

AssemblyAI evidence:

- 2945 frames;
- 7 dropped frames;
- 4 final STT segments;
- 378 ms reported recognition latency.

Both paths completed with translation pending `0`, TTS pending `0`, and queued playback `0 ms` after Stop.

No WER claim was made because no human reference transcript was available.

Record:

`2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`

ADR:

`../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md`

## 7. Phase 1 Runtime Alignment

Date:
2026-08-29.

Accepted defaults were synchronized to:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

The stale browser provider preference metadata was also removed so provider selection remained genuinely cloud-owned.

A recovery baseline captured the aligned Phase 1 state before Phase 2 implementation.

## 8. Phase 2 - Universal Cloud Audio

Phase 2 goal:

- generalize the browser input boundary from a YouTube-specific path to supported ordinary current-tab audio while reusing the existing cloud pipeline.

Design record:

`../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md`

Phase 2 final marker:

`VOICEBRIDGE_PHASE_2_UNIVERSAL_CLOUD_AUDIO_VALIDATED`

Accepted browser runtime:

`VoiceBridge Extension 0.8.0`

## 9. Phase 2 Milestones

### P2-M1 - Source Adapter Boundary

Result: PASS.

Implemented `chromium_tab` source adapter and moved current-tab acquisition behind a source-adapter contract without changing provider/cloud pipeline behavior.

### P2-M2 - Universal Browser Session Contract

Result: PASS.

Added `UNIVERSAL_BROWSER_AUDIO` and normalized source metadata while preserving `YOUTUBE_MVP` compatibility.

### P2-M3 - Generic Active-Tab UI Path

Result: PASS.

Validated generic HTTP/HTTPS current-tab media capture.

Live acceptance included:

- non-YouTube media path;
- YouTube regression;
- silent-tab guard;
- restricted `chrome://` page guard;
- actual Ukrainian playback;
- actual ducking;
- bounded Stop.

### P2-M4 - Language Capability Registry

Result: PASS.

Centralized BCP 47 language validation and cloud-owned capability metadata.

Current registry version:

`1.0.0`

Current validated pair:

`en -> uk`

### P2-M5 - Configurable Language UI

Result: PASS.

Extension `0.8.0` added Source/Target selectors populated only from the cloud registry and fail-closed readiness behavior.

Validated selectors intentionally exposed only English source and Ukrainian target because no broader language matrix had been accepted.

### P2-M6 - Controlled End-to-End Acceptance

Result: PASS.

Controlled matrix completed:

- M6-A YouTube steady-state regression: PASS;
- M6-B Vimeo non-YouTube video: PASS;
- M6-C TED speech-heavy non-YouTube source: PASS;
- M6-D Stop during active speech: PASS;
- M6-E Stop with queued translated playback: PASS;
- M6-F source tab ending unexpectedly: PASS.

Canonical record:

`../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

Live tracker:

`GitHub Issue #48 - completed`

## 10. Phase 2 Lifecycle Evidence

Key accepted lifecycle evidence:

- TED Stop-during-speech run returned to `IDLE` in about `2-3 s` with downstream pending/buffered/queued work at zero;
- YouTube backlog run had `45,469 ms` queued translated audio before Stop and drained to `0 ms`, returning to `IDLE` in about `7 s`;
- source-tab-ended run had `55,386 ms` queued translated audio before the source tab was closed, required no manual Stop, automatically reached `CLOSED` / `Playback=COMPLETED`, drained queue to `0 ms`, and returned VoiceBridge to `IDLE` in about `45 s`.

These timings are controlled acceptance observations, not production SLA guarantees.

## 11. Accepted Phase 2 Runtime Boundary

Current validated pipeline:

```text
Supported current browser tab audio
    -> chromium_tab source adapter
    -> browser PCM capture
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech TTS
    -> browser translated PCM playback
    -> automatic ducking/restoration
```

Current validated provider matrix:

- STT default: Gemini `gemini-3.5-transcribe-live`;
- STT rollback: AssemblyAI `universal-streaming-english`;
- Translation primary: Azure Translator;
- Translation fallback: Gemini;
- TTS primary: Azure Speech `uk-UA-OstapNeural`.

Phase 2 did not introduce:

- content persistence;
- automatic paid fallback;
- production identity;
- operating-system-wide audio capture;
- microphone/interpreter mode;
- native Agent;
- KRC Media integration;
- universal language claims.

## 12. Current Repository State

Primary branch:

`main`

Application implementation:

```text
src/
    browser_extension/
    cloud/
```

Canonical documentation:

`docs/`

Phase 1 and Phase 2 are closed validation baselines.

The Phase 2 closure documentation branch synchronizes README, roadmap, architecture, technology stack, design status, history, M6 acceptance, and the Phase 2 recovery bootstrap without changing runtime code.

## 13. Next Engineering Action

Next functional phase:

`Phase 3 - Cloud Service Hardening`

Candidate hardening scope:

- production authentication and authorization design;
- reconnect/recovery behavior;
- multi-session readiness;
- operational observability;
- cost/quota controls;
- provider failover/rollback hardening;
- security/privacy hardening;
- deployment resilience.

Phase 3 MUST begin with a scoped plan and acceptance gate.

Do not reopen completed Phase 1 or Phase 2 scope without a documented defect or explicitly approved change.

## 14. Recovery

Current Phase 2 recovery package:

`../bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md`

This recovery package supersedes earlier Phase 1 bootstrap files as the current continuation point. Earlier bootstraps remain historical recovery anchors.

## 15. References

- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [PHASE_2_DESIGN](../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md)
- [PHASE_2_M6_ACCEPTANCE](../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md)
- [PHASE_2_BOOTSTRAP](../bootstrap/PHASE_2_UNIVERSAL_CLOUD_AUDIO_COMPLETE_BOOTSTRAP.md)
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT](../adr/ADR-009_GEMINI_3_5_TRANSCRIBE_DEFAULT_STT.md)
- [PHASE_1_MVP_VALIDATION](../phases/PHASE_1_MVP_VALIDATION.md)
- [GEMINI_STT_ACCEPTANCE](2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md)

## 16. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.15.0 | 2026-08-30 | Recorded completion of Phase 2 Universal Cloud Audio, Extension 0.8.0, M1-M6 results, controlled lifecycle evidence, and Phase 3 handoff |
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
