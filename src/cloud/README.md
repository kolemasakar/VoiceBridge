# VoiceBridge Cloud Service

Version:

`0.6.0`

Pipeline:

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

AssemblyAI model configuration:

```text
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

Provider selection:

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

Gemini fallback configuration:

```text
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
```

Provider keys MUST remain in the deployment environment and MUST NOT be stored
in the browser extension or repository.

## Runtime Behavior

- AssemblyAI receives an explicit approved STT model on every connection;
- AssemblyAI receives explicit conservative turn-detection parameters;
- the selected STT provider and model are recorded in the structured
  `service_started` log event;
- final English segments are translated in order;
- Azure Translator is attempted first;
- Gemini is used when Azure is unavailable or fails;
- fallback results report provider `gemini-fallback`;
- final Ukrainian translations are synthesized by Azure Speech;
- translation and TTS queues drain during Stop;
- provider failures are sanitized and isolated;
- content and provider responses are not persisted.

## Validate

```text
npm ci
npm run check
```
