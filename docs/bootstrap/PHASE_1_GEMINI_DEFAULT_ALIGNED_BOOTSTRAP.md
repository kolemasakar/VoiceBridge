# VoiceBridge Phase 1 Gemini Default Aligned Bootstrap

Status: ACTIVE RECOVERY BASELINE

Date: 2026-08-29

## 1. Purpose

Restore the verified VoiceBridge project state after the accepted Gemini 3.5 Transcribe Live migration and the Phase 1 runtime-alignment closure without reopening completed work.

This file contains no secret values.

## 2. Authoritative Repository State

Repository:

`kolemasakar/VoiceBridge`

Default branch:

`main`

GitHub is the Single Source of Truth.

Phase 1 runtime-alignment merge commit:

`fd952d7f70dc0edf012d94f133d5b12666638071`

Alignment PR:

`#31 - Align Phase 1 runtime defaults and canonical documentation`

PR #31 was merged only after a successful pull-request validation run.

## 3. Accepted Product State

VoiceBridge Phase 1 YouTube MVP is complete and validated.

Current accepted pipeline:

```text
YouTube tab audio
    -> VoiceBridge browser extension
    -> VoiceBridge Cloud
    -> Gemini 3.5 Transcribe Live English STT
    -> Azure Translator primary
    -> Azure Speech Ukrainian TTS
    -> ordered browser PCM playback
```

Accepted fallback and rollback paths:

```text
STT rollback:
AssemblyAI universal-streaming-english

Translation fallback:
Gemini gemini-3.1-flash-lite

TTS alternate provider:
Gemini TTS by explicit configuration only
```

Accepted versions:

- cloud service: `0.6.0`;
- browser extension: `0.6.2`.

VoiceBridge does not intentionally persist audio, transcripts, translations, or generated speech in the accepted Phase 1 runtime.

## 4. Accepted Provider Defaults

Canonical non-secret defaults:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
TTS_PROVIDER=azure
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Explicit STT rollback:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

Provider credentials remain server-side and MUST NOT be committed or exposed to browser clients.

No automatic paid provider fallback is authorized by this baseline.

## 5. Gemini STT Acceptance Evidence

The accepted model is:

`gemini-3.5-transcribe-live`

Controlled same-duration A/B on 2026-08-29 used approximately 59 seconds of the same English source fragment.

Gemini run:

- frames sent: 2938;
- dropped frames: 1;
- final STT segments: 6;
- reported recognition latency: 363 ms;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

AssemblyAI rollback run:

- frames sent: 2945;
- dropped frames: 7;
- final STT segments: 4;
- reported recognition latency: 378 ms;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms.

The latency difference is treated as near parity. Qualitative transcript review favored Gemini for coherence and several proper names. No WER claim was made because no human reference transcript was available.

Canonical evidence:

`docs/history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`

## 6. Stop and Playback State

Accepted Stop behavior:

- stop new browser capture and STT input;
- preserve completed source text and translation drain;
- prevent new TTS work from extending the playback backlog after Stop;
- allow only a bounded playback grace period;
- cancel remaining queued playback;
- return to an idle or completed state with bounded queues empty.

The played-segment instrumentation defect found during the Gemini transition was repaired before this baseline.

Repair baseline before runtime alignment:

`9a42c8ea3779ae603f8721cace3e74db07ced6d6`

Played-segment counters now represent audio that actually completed playback and exclude queued audio discarded by the bounded Stop policy.

## 7. Runtime Alignment Closure

The 2026-08-29 alignment corrected configuration and documentation drift after the Gemini migration.

Implementation commit:

`2a755d7e3e902542a5589ebca2700df0fa51f6b1`

Documentation alignment commit:

`9b130bf16ef12fcf39a41b3a3ccc95acab013fc5`

Regression-test alignment commit:

`9a6589c0f9e87dbf9bc4159c55595f5006ec33f5`

Merge commit:

`fd952d7f70dc0edf012d94f133d5b12666638071`

Changes included:

- Azure Speech became the code default for `TTS_PROVIDER`, matching the accepted runtime;
- `.env.example` was synchronized with STT, translation, and TTS provider selection;
- accepted provider defaults received regression coverage;
- Roadmap, Architecture, Technology Stack, and Project History were synchronized.

## 8. Validation Evidence

PR #31 validation:

- workflow: `Validate`;
- successful run ID: `33266546841`;
- result: `SUCCESS`;
- validated head: `9a6589c0f9e87dbf9bc4159c55595f5006ec33f5`.

Post-merge `main` validation:

- workflow: `Validate`;
- run ID: `33266623252`;
- result: `SUCCESS`;
- validated `main`: `fd952d7f70dc0edf012d94f133d5b12666638071`.

Validation covers:

- TypeScript cloud build and automated tests;
- Gemini STT adapter and provider factory;
- AssemblyAI rollback path;
- Azure translation and Gemini translation fallback contracts;
- Azure and Gemini TTS contracts;
- accepted configuration defaults;
- browser JavaScript and Stop policy;
- extension manifest and packaging;
- Markdown ASCII compliance.

## 9. Deployment Boundary

Repository and CI state are verified by this baseline.

The live Render runtime was not independently revalidated as part of the repository alignment closure. Do not claim current deployment equivalence solely from this bootstrap. Revalidate the live endpoint and deployment environment before any production-sensitive change or live-runtime assertion.

No deployment environment, provider secret, or paid-provider setting was changed during the alignment closure.

## 10. Repository Governance Gap

At the alignment checkpoint, `main` is not protected and the repository has no active repository ruleset.

Desired governance improvement:

- protect `main`;
- require the `Validate` workflow or equivalent required checks before merge;
- prevent accidental direct unvalidated changes to the canonical branch.

The connected GitHub tooling used for this closure can read current protection and rulesets but does not expose a supported write operation for branch protection or repository rulesets. Therefore this item remains OPEN and MUST NOT be reported as completed.

Historical feature branches also require a separate safe branch-hygiene review. Do not delete branches merely because they are old; first confirm they are merged, obsolete, and not recovery anchors.

## 11. KRC Media Isolation

K-Research & Critic MEDIA BETA work in VoiceBridge is a separate integration contour.

VoiceBridge PR #28 remains separate from the Phase 1 VoiceBridge product baseline and MUST NOT be treated as the authority for VoiceBridge `main` runtime evolution.

Do not merge, deploy, or repurpose KRC Media work as part of VoiceBridge Phase 2 unless explicitly approved as a separate scope.

## 12. Recovery Procedure

1. Confirm GitHub access to `kolemasakar/VoiceBridge`.
2. Read current `main` and record its actual HEAD.
3. Compare current HEAD with this baseline instead of assuming the repository has not advanced.
4. Read `README.md`, Roadmap, Architecture, Technology Stack, Project History, Gemini STT acceptance record, and ADR-009.
5. Confirm accepted provider defaults from `src/cloud/src/config.ts` and `src/cloud/.env.example`.
6. Confirm current CI status for the actual HEAD.
7. Revalidate live Render runtime only when the task depends on current deployment state.
8. Keep KRC Media changes isolated from VoiceBridge mainline work.
9. Do not expose secrets or initiate paid provider use during recovery.

## 13. Next Approved Engineering Boundary

Phase 1 is complete and aligned.

The next functional scope is:

`PHASE 2 - UNIVERSAL CLOUD AUDIO`

Phase 2 MUST begin with a design and acceptance gate, not immediate source-specific implementation.

The design gate MUST define at minimum:

- a generic browser audio source-adapter boundary;
- reusable streaming session contracts independent of YouTube;
- configurable source and target languages;
- provider capability mapping for supported languages;
- unchanged cloud ownership of STT, translation, TTS, and authoritative session state;
- backward compatibility with the validated YouTube path;
- automated and controlled live acceptance criteria;
- privacy, quota, and failure behavior for new sources.

Phase 3 production hardening remains a separate later scope and includes production authentication, multi-session readiness, observability, recovery, quota/cost controls, and deployment resilience.

Recovery marker:

`VOICEBRIDGE_PHASE_1_GEMINI_DEFAULT_ALIGNED_2026_08_29`
