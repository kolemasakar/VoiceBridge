# VoiceBridge Cloud Service

Version:

`0.6.0`

Accepted default pipeline after the 2026-08-29 STT transition:

```text
Gemini 3.5 Transcribe Live English STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Ukrainian Speech TTS
```

## Required Configuration

```text
TEST_ACCESS_TOKEN
GEMINI_API_KEY
AZURE_SPEECH_KEY
AZURE_TRANSLATOR_KEY
```

AssemblyAI credentials remain supported for rollback:

```text
ASSEMBLYAI_API_KEY
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

STT provider selection now defaults to Gemini:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
```

The controlled rollback path is explicit:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

`ASSEMBLYAI_SPEECH_MODEL` defaults to the approved value shown above. Empty or
unapproved values fail service startup. Every AssemblyAI streaming request sends
this non-empty `speech_model` parameter explicitly, so provider-side default
model changes cannot silently change VoiceBridge behavior.

AssemblyAI rollback turn detection keeps the conservative free configuration:

```text
end_of_turn_confidence_threshold=0.7
min_turn_silence=800
max_turn_silence=3600
```

## Gemini 3.5 Transcribe Live

Gemini 3.5 Transcribe Live is implemented behind the existing `SttProvider`
contract and was accepted after controlled live A/B validation against the
AssemblyAI rollback baseline on 2026-08-29.

The provider uses the existing cloud-side `GEMINI_API_KEY`. No provider key is
sent to the browser or stored in the repository.

The validated VoiceBridge browser input remains PCM16 mono at 48 kHz. The Gemini
adapter applies a bounded stateful FIR low-pass decimator in the cloud to produce
PCM16 mono at 16 kHz and sends 100 ms provider chunks. The browser transport and
stable VoiceBridge transcript event contract are unchanged.

Operational constraints verified from official Google documentation on
2026-08-29:

- Gemini 3.5 Transcribe Live is a WebSocket real-time transcription model;
- the Live transcription session limit is 10 minutes;
- Free Tier input and output are listed as free for this model;
- Free Tier content may be used to improve Google products;
- exact project rate limits must be checked in Google AI Studio;
- VoiceBridge must not enable paid usage or automatic paid fallback.

Official references:

- https://ai.google.dev/gemini-api/docs/live-api/live-transcribe
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/terms

Provider selection for downstream services remains unchanged:

```text
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
TTS_PROVIDER=azure
```

Azure configuration:

```text
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Gemini translation fallback configuration:

```text
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
```

Provider keys MUST remain in the deployment environment and MUST NOT be stored
in the browser extension or repository.

## Runtime Behavior

- Gemini 3.5 Transcribe Live is the default STT provider;
- AssemblyAI remains available as an explicit rollback provider;
- selected STT provider and model are reported in service metadata;
- final English segments are translated in order;
- Azure Translator is attempted first;
- Gemini is used when Azure translation is unavailable or fails;
- translation fallback results report provider `gemini-fallback`;
- final Ukrainian translations are synthesized by Azure Speech;
- user Stop preserves completed text/translation while bounding queued playback;
- provider failures are sanitized and isolated;
- content and provider responses are not persisted.

## 2026-08-29 Acceptance Evidence

Controlled same-duration A/B evidence used approximately 59 seconds of the same
English source fragment:

- Gemini: 2938 frames, 1 dropped frame, 6 final STT segments, 363 ms reported
  recognition latency;
- AssemblyAI: 2945 frames, 7 dropped frames, 4 final STT segments, 378 ms
  reported recognition latency;
- both providers completed with translation pending 0, TTS pending 0, and queued
  playback 0 ms after Stop;
- transcript review favored Gemini for coherence and several proper-name phrases;
- no human reference transcript was available, so no WER claim is made.

The detailed record is stored in
`docs/history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`.

## Validate

```text
npm ci
npm run check
```
