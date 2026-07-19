# VoiceBridge Cloud Skeleton

Purpose:
Provide the Phase 1 cloud API, bounded streaming transport, and streaming STT integration.

Version:
0.3.1

Status:
Implementation

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
- recognition-latency measurements;
- canonical error envelopes;
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

Copy `.env.example` to an ignored environment file or provide environment variables through the deployment platform.

Required:

```text
TEST_ACCESS_TOKEN
```

Required for live STT:

```text
ASSEMBLYAI_API_KEY
```

Without `ASSEMBLYAI_API_KEY`, the service remains healthy and reports STT as `NOT_CONFIGURED`.

The Phase 1 account uses the AssemblyAI free tier without a payment method. If free credit is exhausted, STT stops instead of switching to paid usage.

Optional:

```text
HOST
PORT
CORS_ALLOWED_ORIGIN
MAX_REQUEST_BODY_BYTES
RATE_LIMIT_REQUESTS_PER_MINUTE
```

Real tokens MUST NOT be committed.

## Install and Validate

```text
npm ci
npm run check
```

## Run

```text
TEST_ACCESS_TOKEN=replace-with-a-long-random-token npm run dev
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
    "recognition": null,
    "translation": null,
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

## Audio Stream

An `ACTIVE` session can request a one-time stream ticket:

```text
POST /api/v1/sessions/{session_id}/stream-ticket
Authorization: Bearer TEST_ACCESS_TOKEN
```

The response provides a stream path and two WebSocket subprotocol values. The second value contains a one-time ticket that expires after 60 seconds. The shared test token is not placed in the WebSocket URL.

Connect to:

```text
WS /api/v1/sessions/{session_id}/stream
Sec-WebSocket-Protocol: voicebridge.v1, voicebridge.ticket.TICKET
```

After `STREAM_READY`, send a JSON `STREAM_START` event describing mono `pcm_s16le` audio. Binary frames are limited to 32768 bytes. The server sends `AUDIO_ACK` every 10 frames. The client MUST keep no more than 50 frames unacknowledged and MUST bound its WebSocket output buffer.

When AssemblyAI is configured, the stream also emits:

```text
STT_STATUS
TRANSCRIPT_PARTIAL
TRANSCRIPT_FINAL
STT_ERROR
```

Transcript events include provider name, English text, final-state flags, confidence, audio timing, and measured recognition latency. Transcript text and audio are not persisted by the cloud service.

## Docker

```text
docker build -t voicebridge-cloud .
docker run --rm -p 8080:8080 \
  -e TEST_ACCESS_TOKEN=replace-with-a-long-random-token \
  -e ASSEMBLYAI_API_KEY=replace-with-an-assemblyai-api-key \
  voicebridge-cloud
```

## Current Limitations

- single process;
- in-memory sessions;
- no persistence;
- AssemblyAI is the only implemented STT provider;
- no STT reconnect or audio replay;
- transcript display is bounded to recent text in browser session storage;
- no translation;
- no TTS;
- shared token is not a production identity model.

## Security

- keep all real secrets outside the repository;
- rotate and revoke the test token when exposure is suspected;
- restrict `CORS_ALLOWED_ORIGIN` outside controlled testing;
- use HTTPS at the deployment boundary;
- do not use this skeleton for public multi-user production access.
- do not log stream tickets or the shared token;
- treat stream tickets as short-lived bearer secrets.
