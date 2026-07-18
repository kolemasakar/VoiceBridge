# VoiceBridge Cloud Skeleton

Purpose:
Provide the Phase 1 Milestone 2 cloud API baseline.

Version:
0.1.0

Status:
Implementation

## Capabilities

- public `GET /api/v1/health`;
- shared Bearer-token validation;
- in-memory authoritative session state;
- create and read session endpoints;
- start, pause, resume, and stop commands;
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

## Docker

```text
docker build -t voicebridge-cloud .
docker run --rm -p 8080:8080 \
  -e TEST_ACCESS_TOKEN=replace-with-a-long-random-token \
  voicebridge-cloud
```

## Current Limitations

- single process;
- in-memory sessions;
- no persistence;
- no WebSocket;
- no audio ingestion;
- no STT;
- no translation;
- no TTS;
- shared token is not a production identity model.

## Security

- keep all real secrets outside the repository;
- rotate and revoke the test token when exposure is suspected;
- restrict `CORS_ALLOWED_ORIGIN` outside controlled testing;
- use HTTPS at the deployment boundary;
- do not use this skeleton for public multi-user production access.
