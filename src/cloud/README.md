# VoiceBridge Cloud Service

Purpose:
Provide the Phase 1 cloud API, bounded browser audio streaming, AssemblyAI English STT, Gemini English-to-Ukrainian translation, and selectable Azure or Gemini Ukrainian TTS.

Version:
0.5.1

Status:
Azure Speech TTS integration complete; controlled live validation pending.

## Capabilities

- authenticated session lifecycle;
- one-time WebSocket stream tickets;
- bounded mono PCM input with acknowledgements and flow control;
- AssemblyAI partial and final English transcripts;
- ordered Gemini Ukrainian translations;
- ordered Azure Speech or Gemini Ukrainian speech synthesis;
- provider-neutral STT, translation, and TTS interfaces;
- final-segment identity preserved through translation and TTS;
- bounded translation and TTS queues;
- bounded PCM audio output chunks;
- recognition, translation, and TTS latency metrics;
- translation and TTS graceful drains during Stop;
- sanitized provider errors;
- no content persistence;
- deterministic automated tests;
- Docker deployment.

## Requirements

- Node.js 24 or later;
- npm;
- `TEST_ACCESS_TOKEN` with at least 16 characters.

## Configuration

Required for live STT:

```text
ASSEMBLYAI_API_KEY
```

Required for live Gemini translation:

```text
GEMINI_API_KEY
```

Select Azure Speech TTS:

```text
TTS_PROVIDER=azure
AZURE_SPEECH_KEY=replace-with-azure-speech-key
AZURE_SPEECH_REGION=eastus
AZURE_TTS_VOICE=uk-UA-OstapNeural
```

Gemini TTS remains available as a selectable fallback:

```text
TTS_PROVIDER=gemini
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Iapetus
```

Translation model override:

```text
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
```

Other optional variables:

```text
HOST
PORT
CORS_ALLOWED_ORIGIN
MAX_REQUEST_BODY_BYTES
RATE_LIMIT_REQUESTS_PER_MINUTE
```

Without the selected TTS provider key, the service remains healthy and reports TTS as `NOT_CONFIGURED`.

Provider keys MUST remain outside the repository and browser extension.

## Validate

```text
npm ci
npm run check
```

Health endpoint:

```text
GET /api/v1/health
```

The health response reports service version and STT, translation, and TTS configuration without exposing secrets.

## Session Request

```json
{
  "source_language": "en",
  "target_language": "uk",
  "runtime_mode": "YOUTUBE_MVP",
  "input_type": "BROWSER_AUDIO",
  "output_type": "BROWSER_PLAYBACK",
  "provider_preferences": {
    "recognition": "assemblyai",
    "translation": "gemini",
    "synthesis": "azure"
  },
  "voice": {
    "voice_id": "uk-UA-OstapNeural",
    "speaking_rate": null
  }
}
```

The deployed TTS provider is authoritative during Phase 1. Browser provider preferences do not expose provider credentials.

## Streaming Events

STT:

```text
STT_STATUS
TRANSCRIPT_PARTIAL
TRANSCRIPT_FINAL
STT_ERROR
```

Translation:

```text
TRANSLATION_STATUS
TRANSLATION_FINAL
TRANSLATION_ERROR
```

TTS:

```text
TTS_STATUS
TTS_AUDIO_START
TTS_AUDIO_CHUNK
TTS_AUDIO_END
TTS_ERROR
```

Both TTS adapters normalize output to:

- `pcm_s16le`;
- `24000` Hz;
- one channel.

PCM is divided into bounded chunks before WebSocket delivery. Audio is not persisted.

## Azure Speech Adapter

- regional REST endpoint derived from `AZURE_SPEECH_REGION`;
- subscription key sent only in the cloud request header;
- SSML language `uk-UA`;
- default voice `uk-UA-OstapNeural`;
- output format `raw-24khz-16bit-mono-pcm`;
- XML escaping for synthesized text;
- HTTP 429 and `Retry-After` mapping;
- temporary HTTP 5xx mapping to bounded retry;
- no automatic cross-provider fallback.

## Queue and Shutdown Policy

- final STT segments only are translated;
- final Ukrainian translations only are synthesized;
- translation and TTS use separate sequential queues;
- each queue accepts at most 60 pending operations;
- translated segments are batched before TTS synthesis;
- retry and backoff are bounded;
- translation drains for up to 45 seconds during Stop;
- TTS drains for up to 60 seconds during Stop;
- unexpected disconnect cancels pending provider work immediately;
- provider failures do not terminate earlier pipeline stages.

## Privacy

Azure Speech and Gemini translation are used only for controlled public YouTube or synthetic content approved for provider processing.

Private, confidential, regulated, or production content remains prohibited during Phase 1 testing.

VoiceBridge does not persist audio, transcripts, translations, prompts, provider responses, or synthesized speech.

## Current Limitations

- single process and in-memory sessions;
- Azure Speech and Gemini TTS adapters are selectable, but automatic fallback is disabled;
- provider audio is received before VoiceBridge sends bounded chunks to the browser;
- no production identity model.

## Security

- keep all secrets only in the deployment environment;
- use HTTPS at the deployment boundary;
- restrict CORS outside controlled testing;
- do not log keys, tokens, SSML, responses, transcripts, translations, or PCM;
- treat stream tickets as short-lived bearer secrets.
