# VoiceBridge Phase 1 MVP Validated Bootstrap

Status: ACTIVE RECOVERY BASELINE

Date: 2026-07-22

## 1. Purpose

Restore the verified VoiceBridge state after a chat, session, or development-environment change without repeating completed Phase 1 work.

This file contains no secret values.

## 2. Repository and Access

Authoritative repository:

`kolemasakar/VoiceBridge`

Default branch:

`main`

GitHub is the Single Source of Truth.

The active AI assistant environment has authorized GitHub connector access to this repository and has already read, created, updated, reviewed, and merged repository content. Repository access is subject to the user authorization and connector availability of the current session. At recovery time, verify access before promising repository operations.

Do not request manual file transfer when working repository access is available. Read the current `main` branch before changing code or documentation.

## 3. Verified Product State

The minimum VoiceBridge Phase 1 YouTube MVP is validated.

Accepted pipeline:

```text
AssemblyAI English STT
    -> Azure Translator
    -> Azure Speech Ukrainian TTS
```

Gemini remains the translation fallback provider.

Accepted versions:

- cloud service: `0.6.0`;
- browser extension: `0.6.2`;
- implementation baseline commit: `1d7e82ecb122ab953190f9b2fdc8e7fbea86840c`.

Deployment:

- Render service: `voicebridge-cloud-us`;
- public endpoint: `https://voicebridge-cloud-us.onrender.com`;
- Render region: Virginia, US East;
- Azure resources: resource group `VoiceBridge`;
- Azure Translator resource: `voicebridge-translator-eastus-01`;
- Azure Speech resource: `voicebridge-speech-eastus-01`;
- Azure region identifier: `eastus`.

## 4. Accepted Functional Behavior

- captures current YouTube tab audio after explicit user action;
- preserves local original-audio playback;
- streams bounded PCM audio to VoiceBridge Cloud;
- produces ordered English transcripts through AssemblyAI;
- produces ordered Ukrainian translations through Azure Translator;
- falls back to Gemini translation when the Azure provider fails and Gemini is available;
- produces Ukrainian speech through Azure Speech voice `uk-UA-OstapNeural`;
- plays ordered PCM audio in the browser;
- automatically lowers original audio during Ukrainian speech;
- restores original audio after Ukrainian speech;
- provides independent original and Ukrainian volume controls;
- completes Stop with one user action;
- exposes `STOPPING` while shutdown is in progress;
- ends in `IDLE`, `COMPLETED`, and `CLOSED` states as applicable.

## 5. Final Acceptance Evidence

Controlled final test:

- English final segments: 28;
- Ukrainian final segments: 28;
- voiced segments: 28;
- played segments: 28;
- translation retries: 0;
- TTS retries: 0;
- pending translation: 0;
- pending TTS: 0;
- queued playback after completion: 0 ms;
- dropped audio frames: 0;
- recognition latency observed: 712 ms;
- translation latency observed: 81 ms;
- TTS latency observed: 190 ms.

Project owner acceptance:

- Ukrainian speech was understandable;
- automatic ducking worked;
- original audio restoration worked;
- Azure translation and Azure TTS operated normally;
- one-press Stop operated normally.

Canonical validation record:

`docs/phases/PHASE_1_MVP_VALIDATION.md`

## 6. Render Environment Configuration

Required names only:

```text
ASSEMBLYAI_API_KEY
TEST_ACCESS_TOKEN
TRANSLATION_PROVIDER
TRANSLATION_FALLBACK_PROVIDER
AZURE_TRANSLATOR_KEY
AZURE_TRANSLATOR_REGION
AZURE_TRANSLATOR_ENDPOINT
GEMINI_API_KEY
GEMINI_TRANSLATION_MODEL
TTS_PROVIDER
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_TTS_VOICE
```

Accepted non-secret values:

```text
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
TTS_PROVIDER=azure
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Never commit or expose key or token values.

## 7. Provider Quota Context

- Gemini free translation reached its daily request quota during development testing;
- Azure Translator F0 was introduced as the primary translation provider;
- Gemini remains fallback only;
- Azure Translator F0 provides a monthly free character allowance controlled by Azure;
- Azure Speech F0 provides a separate speech quota controlled by Azure;
- AssemblyAI usage remains controlled by the provider account and plan;
- provider limits can change and must be verified before relying on them operationally.

## 8. Key Repository Documents

Read these first after recovery:

- `README.md`;
- `docs/phases/PHASE_1_MVP_VALIDATION.md`;
- `docs/planning/03_ROADMAP.md`;
- `docs/history/08_PROJECT_HISTORY.md`;
- `docs/phases/PHASE_1_CLOUD_YOUTUBE_MVP.md`;
- `docs/phases/PHASE_1_MILESTONE_6_TTS_PLAYBACK.md`;
- `docs/adr/ADR-008_AZURE_TTS_PROVIDER.md`;
- `docs/adr/ADR-009_AZURE_TRANSLATOR_PRIMARY.md` if present under the current ADR naming convention;
- `src/cloud/README.md`;
- `src/browser_extension/README.md`.

Confirm actual file names from the current repository before editing.

## 9. Recovery Verification

1. Confirm GitHub access to `kolemasakar/VoiceBridge`.
2. Read current `main` and record its latest commit.
3. Confirm Render shows the latest deployment as live.
4. Confirm the extension version is `0.6.2` or later.
5. Confirm the API connection test succeeds.
6. Start a short controlled YouTube session.
7. Confirm providers display AssemblyAI, `azure+gemini`, and Azure.
8. Confirm segment counts increase without pending backlog.
9. Press Stop once.
10. Confirm `ACTIVE -> STOPPING -> IDLE` and empty final queues.

## 10. Known MVP Constraints

- controlled test deployment, not public production;
- shared test token rather than user accounts;
- browser extension distribution remains controlled;
- Chromium and YouTube tab capture are the validated client path;
- English-to-Ukrainian only;
- cloud state is in memory;
- Render free service may cold-start;
- no persistent user-content history;
- no multi-session production guarantees;
- no Interpreter Mode;
- no local VoiceBridge Agent.

## 11. Next Approved Boundary

Phase 1 MVP work is complete and must not be reopened without a documented defect or approved change.

Do not begin a new functional phase automatically.

The next project scope must be explicitly selected by the project owner. Candidate work belongs to Phase 2 universal cloud audio or Phase 3 hardening, including authentication, observability, multi-session readiness, recovery, and broader input support.

Recovery marker:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED_2026_07_22`
