# VoiceBridge Phase 1 MVP Validation

Status: PASSED

Date: 2026-07-22

## 1. Decision

The minimum working VoiceBridge Phase 1 YouTube MVP is validated.

The accepted end-to-end pipeline is:

```text
YouTube tab audio
    -> VoiceBridge browser extension
    -> VoiceBridge Cloud on Render
    -> AssemblyAI English streaming STT
    -> Azure Translator English-to-Ukrainian translation
    -> Azure Speech Ukrainian TTS
    -> browser PCM playback
    -> automatic original-audio ducking and restoration
```

Gemini remains configured as the translation fallback provider. It is not the primary translation path.

## 2. Accepted Runtime Baseline

- cloud service version: `0.6.0`;
- browser extension version: `0.6.2`;
- implementation baseline commit: `1d7e82ecb122ab953190f9b2fdc8e7fbea86840c`;
- public test cloud endpoint: `https://voicebridge-cloud-us.onrender.com`;
- cloud region: Render Virginia, US East;
- Azure Translator region: `eastus`;
- Azure Speech region: `eastus`;
- Azure Speech voice: `uk-UA-OstapNeural`.

## 3. Provider Baseline

| Capability | Primary Provider | Fallback | Result |
|------------|------------------|----------|--------|
| English STT | AssemblyAI | None | Passed |
| English-to-Ukrainian translation | Azure Translator | Gemini | Passed |
| Ukrainian TTS | Azure Speech | Gemini adapter retained but not selected | Passed |

The extension displays the configured translation chain as `azure+gemini`. During the final acceptance test, Azure completed all translations and no fallback retry was required.

## 4. Final Controlled Acceptance Test

Test session evidence:

- active session duration observed: at least 2 minutes and 7 seconds;
- English final segments: 28;
- Ukrainian final segments: 28;
- Ukrainian voiced segments: 28;
- Ukrainian played segments: 28;
- translation pending count: 0;
- translation retries: 0;
- TTS pending count: 0;
- TTS buffered count: 0;
- TTS retries: 0;
- queued audio after completion: 0 ms;
- playback final state: `COMPLETED`;
- audio stream dropped frames: 0.

Observed final stage latency values:

- AssemblyAI recognition latency: 712 ms;
- Azure translation latency: 81 ms;
- Azure Speech TTS latency: 190 ms.

These values are observations from the controlled session, not production service-level guarantees.

## 5. Endurance Evidence

A prior continuous Azure Speech session ran for more than 12 minutes and completed:

- 108 English final segments;
- 108 Ukrainian translations;
- 108 voiced segments;
- 108 played segments;
- zero TTS retries;
- zero pending or buffered TTS operations after Stop;
- final playback state `COMPLETED`.

This evidence confirmed stable Azure Speech generation and ordered browser playback over an extended test.

## 6. Stop and Cleanup Acceptance

Browser extension `0.6.2` implements an idempotent Stop workflow.

Accepted transition:

```text
ACTIVE -> STOPPING -> IDLE
```

Validated behavior:

- one Stop press is sufficient;
- the Stop button becomes disabled while shutdown is active;
- repeated Stop commands are ignored;
- browser capture stops;
- cloud STT, translation, and TTS queues drain within their bounds;
- browser playback finishes within its bound;
- original audio gain is restored;
- local audio resources are released;
- cloud and provider states close cleanly.

## 7. User Acceptance

The project owner confirmed:

- Ukrainian speech remained understandable throughout the test;
- original YouTube audio was automatically reduced during Ukrainian speech;
- original YouTube audio returned to the configured level after Ukrainian speech;
- the final Azure-based pipeline worked normally;
- the one-press Stop correction worked normally.

## 8. Security and Privacy Boundary

- provider keys are stored only in Render environment configuration;
- Azure and Gemini key values are not committed;
- the shared test access token remains a temporary controlled test mechanism;
- browser clients communicate with VoiceBridge Cloud rather than directly with providers;
- raw audio, transcripts, translations, and synthesized audio are not intentionally persisted by the VoiceBridge service;
- public or controlled test content is required for the current provider setup.

## 9. Required Cloud Configuration Names

No secret values are recorded here.

```text
ASSEMBLYAI_API_KEY
TEST_ACCESS_TOKEN
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
AZURE_TRANSLATOR_KEY
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
GEMINI_API_KEY
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
TTS_PROVIDER=azure
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

## 10. Known MVP Limitations

- Chromium-based browser extension only;
- one controlled shared test token;
- in-memory cloud session state;
- Render free instance may cold-start after inactivity;
- no public multi-user production authentication;
- no persistent transcript or audio history;
- English-to-Ukrainian direction only;
- YouTube tab capture is the validated input mode;
- provider quotas remain external operational constraints;
- end-to-end hardening, multi-session readiness, and broader platform support remain future work.

## 11. Exit Result

The minimum Phase 1 product objective is achieved:

- browser tab audio capture works;
- secure bounded cloud streaming works;
- English STT works;
- Ukrainian translation works;
- Ukrainian speech generation works;
- browser playback and volume controls work;
- automatic ducking and restoration work;
- queues and retries remain bounded;
- Stop and cleanup complete correctly;
- credentials remain outside the repository.

Final result:

`VOICEBRIDGE_PHASE_1_MVP_VALIDATED`
