# VoiceBridge Cloud Service

Purpose:
Provide the Phase 1 cloud API, bounded audio streaming, AssemblyAI STT, and ordered English-to-Ukrainian translation.

Version:
0.4.1

Status:
Implementation complete; live Gemini validation pending.

## Capabilities

- public `GET /api/v1/health`;
- shared Bearer-token validation;
- in-memory authoritative session state;
- create and read session endpoints;
- start, pause, resume, and stop commands;
- one-time WebSocket stream tickets;
- authenticated WebSocket upgrade without the shared token in the URL;
- bounded binary PCM audio frames;
- acknowledgement and flow-control events;
- per-stream counters without audio persistence;
- provider-neutral cloud-side STT boundary;
- AssemblyAI Universal-Streaming English STT;
- ordered partial and final English transcript events;
- provider-neutral cloud-side translation boundary;
- Gemini English-to-Ukrainian translation adapter;
- ordered bounded per-session translation queue;
- graceful drain of already accepted translations for up to 3000 milliseconds on Stop;
- cancellation after drain timeout or unexpected disconnect;
- STT segment identity preserved in translation events;
- bounded prior English context;
- recognition and translation latency measurements;
- sanitized provider errors;
- canonical API error envelopes;
- request and correlation identifiers;
- bounded JSON request bodies;
- test-environment CORS;
- fixed-window request limiting;
- environment-based configuration;
- deterministic automated tests;
- Docker deployment.

## Requirements

- Node.js 24 or later;
- npm;
- one test access token with at least 16 characters.

## Configuration

Copy `.env.example` to an ignored environment file or provide variables through the deployment platform.

Required:

```text
TEST_ACCESS_TOKEN
```

Required for live STT:

```text
ASSEMBLYAI_API_KEY
```

Without `ASSEMBLYAI_API_KEY`, the service remains healthy and reports STT as `NOT_CONFIGURED`.

Required for live translation:

```text
GEMINI_API_KEY
```

Optional translation model override:

```text
GEMINI_TRANSLATION_MODEL=gemini-3.1-flash-lite
```

Without `GEMINI_API_KEY`, the service remains healthy, AssemblyAI STT continues to work, and translation reports `NOT_CONFIGURED`.

The controlled Gemini free-tier test is limited to public YouTube or synthetic content approved for external provider processing. It MUST NOT be used for private, confidential, regulated, or production traffic.

Other optional settings:

```text
HOST
PORT
CORS_ALLOWED_ORIGIN
MAX_REQUEST_BODY_BYTES
RATE_LIMIT_REQUESTS_PER_MINUTE
```

Real tokens and API keys MUST NOT be committed.

## Install and Validate

```text
npm ci
npm run check
```

Default endpoint:

```text
http://127.0.0.1:8080/api/v1/health
```

## Create a Session

```text
POST /api/v1/sessions
Authorization: Bearer TEST_ACCESS_TOKEN
Content-Type: application/json
```

Request:

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
    "synthesis": null
  },
  "voice": {
    "voice_id": null,
    "speaking_rate": null
  }
}
```

## Session Commands

```text
GET  /api/v1/sessions/{session_id}
POST /api/v1/sessions/{session_id}/start
POST /api/v1/sessions/{session_id}/pause
POST /api/v1/sessions/{session_id}/resume
POST /api/v1/sessions/{session_id}/stop
```

## Audio and Text Stream

An `ACTIVE` session can request a one-time stream ticket:

```text
POST /api/v1/sessions/{session_id}/stream-ticket
Authorization: Bearer TEST_ACCESS_TOKEN
```

Connect to:

```text
WS /api/v1/sessions/{session_id}/stream
Sec-WebSocket-Protocol: voicebridge.v1, voicebridge.ticket.TICKET
```

After `STREAM_READY`, send `STREAM_START` describing mono `pcm_s16le` audio. Binary frames are limited to 32768 bytes. The server sends `AUDIO_ACK` every 10 frames. The client MUST keep no more than 50 frames unacknowledged and MUST bound its WebSocket output buffer.

STT events:

```text
STT_STATUS
TRANSCRIPT_PARTIAL
TRANSCRIPT_FINAL
STT_ERROR
```

Translation events:

```text
TRANSLATION_STATUS
TRANSLATION_FINAL
TRANSLATION_ERROR
```

Only final English transcript segments are translated. `TRANSLATION_FINAL` preserves the original final STT `segment_id`. The queue accepts at most 20 pending operations and uses at most four previous final English segments, bounded to 3000 context characters.

Translation errors do not terminate audio streaming or STT. Audio, transcripts, provider prompts, provider responses, and translations are not persisted by VoiceBridge Cloud.

## Docker

```text
docker build -t voicebridge-cloud .
docker run --rm -p 8080:8080 \
  -e TEST_ACCESS_TOKEN=replace-with-a-long-random-token \
  -e ASSEMBLYAI_API_KEY=replace-with-an-assemblyai-api-key \
  -e GEMINI_API_KEY=replace-with-a-gemini-api-key \
  voicebridge-cloud
```

## Current Limitations

- single process;
- in-memory sessions;
- no content persistence;
- AssemblyAI is the only implemented STT provider;
- Gemini is the only implemented translation provider;
- no automatic STT reconnect or audio replay;
- no automatic translation retry or fallback;
- recent transcript and translation display is bounded to browser session state;
- no TTS;
- shared token is not a production identity model.

## Security

- keep all real secrets outside the repository;
- rotate and revoke secrets when exposure is suspected;
- restrict `CORS_ALLOWED_ORIGIN` outside controlled testing;
- use HTTPS at the deployment boundary;
- do not log stream tickets, shared tokens, provider keys, prompts, or responses;
- treat stream tickets as short-lived bearer secrets;
- do not use the Gemini free tier for private or production content.
