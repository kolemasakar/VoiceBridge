# VoiceBridge Cloud Service

Version:

`0.6.0`

Validated default pipeline:

```text
AssemblyAI English STT
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Ukrainian Speech TTS
```

## Required Configuration

```text
TEST_ACCESS_TOKEN
ASSEMBLYAI_API_KEY
AZURE_SPEECH_KEY
AZURE_TRANSLATOR_KEY
GEMINI_API_KEY
```

STT provider selection defaults to the validated AssemblyAI rollback baseline:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

`ASSEMBLYAI_SPEECH_MODEL` defaults to the approved value shown above. Empty or
unapproved values fail service startup. Every AssemblyAI streaming request sends
this non-empty `speech_model` parameter explicitly, so provider-side default
model changes cannot silently change VoiceBridge behavior.

AssemblyAI turn detection uses the conservative free configuration:

```text
end_of_turn_confidence_threshold=0.7
min_turn_silence=800
max_turn_silence=3600
```

The conservative preset gives the streaming model more context before it closes
a final English segment. It may increase the delay before some final segments,
but it does not select a paid model or add a paid feature.

## Gemini 3.5 Transcribe Candidate

The migration branch contains an opt-in Gemini Live STT candidate behind the
same `SttProvider` contract. It is not the default provider and must not replace
AssemblyAI until controlled A/B validation and explicit acceptance are complete.

Candidate selection:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
```

The candidate uses the existing cloud-side `GEMINI_API_KEY`. No provider key is
sent to the browser or stored in the repository.

The validated VoiceBridge browser input remains PCM16 mono at 48 kHz. The Gemini
adapter applies a bounded stateful FIR low-pass decimator in the cloud to produce
PCM16 mono at 16 kHz and sends 100 ms provider chunks. The browser transport and
stable VoiceBridge transcript event contract are unchanged.

Candidate operational constraints verified from official Google documentation
on 2026-08-29:

- Gemini 3.5 Transcribe Live is a WebSocket real-time transcription model;
- the Live transcription session limit is 10 minutes;
- Free Tier input and output are listed as free for this model;
- Free Tier content may be used to improve Google products;
- exact project rate limits must be checked in Google AI Studio;
- VoiceBridge must not enable paid usage or automatic paid fallback for this
  candidate.

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

- AssemblyAI remains the default STT provider and rollback baseline;
- Gemini STT is selected only by explicit `STT_PROVIDER=gemini` configuration;
- selected STT provider and model are reported in service metadata;
- final English segments are translated in order;
- Azure Translator is attempted first;
- Gemini is used when Azure translation is unavailable or fails;
- translation fallback results report provider `gemini-fallback`;
- final Ukrainian translations are synthesized by Azure Speech;
- translation and TTS queues drain during Stop;
- provider failures are sanitized and isolated;
- content and provider responses are not persisted.

## Validate

```text
npm ci
npm run check
```
