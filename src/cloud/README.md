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
