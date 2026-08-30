# VoiceBridge Phase 2 Universal Cloud Audio Complete Bootstrap

Status: CURRENT RECOVERY BASELINE - PHASE 2 COMPLETE

Date: 2026-08-30

Recovery marker:

`VOICEBRIDGE_PHASE_2_UNIVERSAL_CLOUD_AUDIO_VALIDATED_2026_08_30`

## 1. Purpose

Restore VoiceBridge after completion of Phase 2 Universal Cloud Audio without reopening validated Phase 1 or Phase 2 work.

GitHub `main` is the Single Source of Truth.

## 2. Project State

Completed:

- Phase 0 Repository Foundation;
- Phase 1 Cloud YouTube MVP;
- Phase 1 Gemini 3.5 Transcribe Live default-STT transition;
- Phase 1 provider/default alignment;
- Phase 2 Universal Cloud Audio P2-M1 through P2-M6;
- Phase 2 controlled end-to-end live acceptance.

Next functional roadmap phase:

`Phase 3 - Cloud Service Hardening`

Do not reopen Phase 1 or Phase 2 without a documented defect or explicitly approved change.

## 3. Accepted Browser Runtime

Version:

`VoiceBridge Extension 0.8.0`

Accepted artifact ID:

`9722952002`

Inner extension ZIP SHA-256:

`87888745014ade34137905baf450cd9aaab15e3328bcf5a26cf540e83af844ed`

Accepted runtime implementation commit before later docs-only closure work:

`eba77183bee29621aa6c7cb859737a10edb6e4d4`

Subsequent Phase 2 acceptance-plan and closure changes are documentation-only unless Git history shows an explicitly approved later runtime change.

## 4. Accepted Cloud/Provider Policy

Default STT:

- provider: Gemini;
- model: `gemini-3.5-transcribe-live`.

Explicit STT rollback:

- provider: AssemblyAI;
- model: `universal-streaming-english`.

Translation:

- primary: Azure Translator;
- fallback: Gemini `gemini-3.1-flash-lite`.

TTS:

- primary: Azure Speech;
- accepted voice: `uk-UA-OstapNeural`.

Rules:

- provider selection remains cloud-owned;
- no automatic paid fallback;
- provider secrets remain cloud-side;
- no intentional VoiceBridge audio/transcript/translation/TTS persistence.

## 5. Accepted Phase 2 Architecture

Canonical flow:

```text
Supported current browser tab audio
    -> chromium_tab source adapter
    -> browser PCM capture
    -> authenticated VoiceBridge session + one-time stream ticket
    -> secure WebSocket ingestion
    -> cloud STT
    -> cloud translation
    -> cloud TTS
    -> browser PCM playback
    -> automatic original-audio ducking/restoration
```

Session modes:

- `YOUTUBE_MVP` remains backward compatible;
- `UNIVERSAL_BROWSER_AUDIO` is the accepted Phase 2 generic-browser mode.

Source metadata:

- kind: browser tab;
- adapter: `chromium_tab`.

## 6. Language Capability State

Language capability policy is cloud-owned.

Registry version:

`1.0.0`

Current validated selectable pair:

- Source: English (`en`);
- Target: Ukrainian (`uk`).

The browser UI receives sanitized capability metadata from the cloud and fails closed if capabilities are unavailable or the pair is invalid.

Do not infer support for additional language pairs from upstream provider marketing or provider documentation alone. Expand the registry only with approved end-to-end evidence.

## 7. Phase 2 Milestone State

- P2-M1 Source Adapter Boundary: COMPLETE / PASS;
- P2-M2 Universal Browser Session Contract: COMPLETE / PASS;
- P2-M3 Generic Active-Tab UI Path: COMPLETE / PASS;
- P2-M4 Language Capability Registry: COMPLETE / PASS;
- P2-M5 Configurable Language UI: COMPLETE / PASS;
- P2-M6 Controlled End-to-End Acceptance: COMPLETE / PASS.

## 8. Final Controlled Live Matrix

M6-A YouTube steady-state regression:

`PASS`

M6-B Vimeo non-YouTube video:

`PASS`

M6-C TED speech-heavy source:

`PASS`

M6-D Stop during active speech:

`PASS`

Accepted run returned to `IDLE` in approximately `2-3 s` with downstream pending/buffered/queued work at zero.

M6-E Stop with queued translated playback:

`PASS`

Before Stop:

`Queued audio = 45,469 ms`

After Stop:

- `Playback = COMPLETED`;
- pending `0`;
- buffered `0`;
- queued audio `0 ms`;
- Stop-to-IDLE approximately `7 s`.

M6-F source tab ends unexpectedly:

`PASS`

Before source-tab closure:

`Queued audio = 55,386 ms`

Without manual Stop:

- translated speech reached `CLOSED`;
- playback reached `COMPLETED`;
- pending `0`;
- buffered `0`;
- queued audio `0 ms`;
- VoiceBridge returned to `IDLE` on another ordinary tab;
- cleanup observed at approximately `45 s`.

Canonical record:

`../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`

Live tracker:

`GitHub Issue #48 - completed`

## 9. Known Non-Blocking Observations

Recorded observations include:

- small non-zero final unacknowledged-frame values in some otherwise clean sessions;
- bounded dropped-frame counts in some live runs;
- one TED load run displayed `Ukrainian playback queue is full.` but still reached bounded terminal cleanup with queue `0 ms`;
- source-tab-ended cleanup can take materially longer than direct user Stop when translated playback backlog exists.

These are Phase 3 hardening/observability inputs unless they reproduce as a functional defect.

Do not convert these observations into hidden success metrics or silently discard them.

## 10. Security and Scope Boundaries

Still not part of the accepted Phase 2 runtime:

- public production identity;
- persistent user/session content history;
- operating-system-wide capture;
- microphone/interpreter mode;
- native desktop Agent;
- mobile capture;
- KRC Media retrieval/transcription integration;
- automatic paid provider fallback;
- universal language claims;
- production SLA commitments.

KRC Media remains a separate integration contour and MUST NOT be treated as VoiceBridge mainline baseline without explicit approval.

## 11. Canonical Documents

Read first when restoring:

1. `../../README.md`
2. `../planning/03_ROADMAP.md`
3. `../architecture/04_ARCHITECTURE.md`
4. `../architecture/05_TECHNOLOGY_STACK.md`
5. `../phases/PHASE_2_UNIVERSAL_CLOUD_AUDIO_DESIGN.md`
6. `../phases/PHASE_2_M6_CONTROLLED_E2E_ACCEPTANCE.md`
7. `../history/08_PROJECT_HISTORY.md`
8. `../governance/15_REPOSITORY_RULES.md`
9. `../governance/16_AI_DEVELOPMENT_RULES.md`

Earlier Phase 1 bootstrap files remain historical anchors but are superseded as the current continuation point by this file.

## 12. Recovery Procedure

1. Check out current `main` from GitHub.
2. Confirm repository working tree/branch state before writes.
3. Confirm the current `main` Validate workflow is green.
4. Read the canonical documents listed above.
5. Confirm Extension `0.8.0` and provider/language defaults have not been superseded by a later approved runtime change.
6. Preserve KRC Media isolation.
7. Start only the approved next phase or a scoped defect repair.

If the current repository state conflicts with this bootstrap, prefer newer accepted GitHub commits/PRs that explicitly supersede this marker and have green validation evidence.

## 13. Next Engineering Action

Prepare the Phase 3 Cloud Service Hardening design/acceptance gate.

Initial candidate topics:

- production authentication and authorization;
- reconnect/recovery behavior;
- multi-session readiness;
- observability and alerting;
- cost/quota controls;
- provider failover/rollback hardening;
- deployment resilience;
- security/privacy hardening.

Do not implement these as one undifferentiated change. Define scoped milestones and validation gates first.

## 14. Recovery Summary

Recovery marker:

`VOICEBRIDGE_PHASE_2_UNIVERSAL_CLOUD_AUDIO_VALIDATED_2026_08_30`

Functional runtime baseline:

`VoiceBridge Extension 0.8.0`

Phase state:

`PHASE 2 COMPLETE - PHASE 3 NEXT`
