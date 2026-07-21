# VoiceBridge Cloud Service

Purpose:
Provide the Phase 1 cloud API, bounded browser audio streaming, AssemblyAI English STT, Gemini English-to-Ukrainian translation, and Gemini Ukrainian TTS.

Version:
0.5.0

Status:
Implementation complete; controlled live TTS and browser playback validation pending.

## Capabilities

- authenticated session lifecycle;
- one-time WebSocket stream tickets;
- bounded mono PCM input with acknowledgements and flow control;
- AssemblyAI partial and final English transcripts;
- ordered Gemini Ukrainian translations;
- ordered Gemini Ukrainian speech synthesis;
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

Required for live Gemini translation and TTS:

```text
GEMINI_API_KEY
```

Optional model and voice overrides:

```text
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Iapetus
```

Other optional variables:

```text
HOST
PORT
CORS_ALLOWED_ORIGIN
MAX_REQUEST_BODY_BYTES
RATE_LIMIT_REQUESTS_PER_MINUTE
```

Without a provider key, the service remains healthy and reports the corresponding capability as `NOT_CONFIGURED`.

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
    "synthesis": "gemini"
  },
  "voice": {
    "voice_id": "Iapetus",
    "speaking_rate": null
  }
}
```

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

The TTS adapter normalizes provider output to:

- `pcm_s16le`;
- `24000` Hz;
- one channel.

PCM is divided into bounded chunks before WebSocket delivery. Audio is not persisted.

## Queue and Shutdown Policy

- final STT segments only are translated;
- final Ukrainian translations only are synthesized;
- translation and TTS use separate sequential queues;
- each queue accepts at most 20 pending operations;
- translation drains for up to 10 seconds during Stop;
- TTS drains for up to 30 seconds during Stop;
- unexpected disconnect cancels pending provider work immediately;
- provider failures do not terminate earlier pipeline stages.

## Privacy

The controlled Gemini free-tier test is limited to public YouTube or synthetic content approved for provider processing.

It MUST NOT process private, confidential, regulated, or production content.

VoiceBridge does not persist audio, transcripts, translations, prompts, provider responses, or synthesized speech.

## Current Limitations

- single process and in-memory sessions;
- one implemented provider per pipeline stage;
- Gemini TTS is a preview model;
- the initial TTS adapter receives the complete provider audio response before sending bounded chunks;
- no automatic provider retry or fallback;
- no production identity model.

## Security

- keep all secrets only in the deployment environment;
- use HTTPS at the deployment boundary;
- restrict CORS outside controlled testing;
- do not log keys, tokens, prompts, responses, transcripts, translations, or PCM;
- treat stream tickets as short-lived bearer secrets.
