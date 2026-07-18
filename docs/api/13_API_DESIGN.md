# 13_API_DESIGN

UA: Bazovyi dyzain khmarnoho API VoiceBridge.

Purpose:
Define the approved Cloud First API baseline for VoiceBridge, including browser-to-cloud communication, session control, streaming contracts, service boundaries, simplified test authentication, errors, security, privacy, and versioning.

Scope:
Cloud control API, audio and event streaming, session lifecycle, provider-independent service contracts, common data models, test authentication, validation, reliability, and integration rules.

Out of Scope:
Provider-specific endpoints, credentials, final production identity platform, billing, final deployment vendor, persistent user-content storage, and local Agent implementation.

Audience:
Developers, contributors, maintainers, integration developers, and AI development assistants.

Status:
Draft

Version:
1.0.0

Last Updated:
2026-07-18

## Table of Contents

1. API Goals
2. Cloud First API Model
3. Service Boundaries
4. Transport Model
5. Test Authentication
6. Session API
7. Streaming API
8. Provider Service Contracts
9. Common Data Models
10. Error Model
11. Security and Privacy
12. Reliability and Observability
13. Versioning and Compatibility
14. Validation Requirements
15. Future Evolution
16. References
17. Version History

## 1. API Goals

The VoiceBridge API MUST connect the browser client to the cloud speech translation platform.

The API MUST:

- support the Phase 1 YouTube MVP;
- keep STT, translation, TTS, orchestration, and authoritative state in the cloud;
- support low-latency audio and event streaming;
- keep provider credentials outside the browser;
- isolate provider-specific behavior behind adapters;
- expose explicit session state and actionable errors;
- minimize retention of audio and derived user content;
- support replacement of simplified test authentication before public production use.

## 2. Cloud First API Model

The browser is the primary client for Phases 1 through 4.

The cloud platform owns:

- API request validation;
- test-token validation;
- session creation and lifecycle;
- authoritative session state;
- audio ingestion;
- speech recognition;
- translation;
- speech synthesis;
- output streaming;
- provider selection;
- secrets management;
- logging, metrics, and error handling.

```text
Browser Client
    |
    +-- HTTPS control requests
    +-- Secure audio and event stream
    |
    v
Cloud API Gateway
    |
    v
Session Orchestrator
    |
    +-- Audio Processing
    +-- Speech Recognition
    +-- Translation
    +-- Speech Synthesis
    +-- Session State
    |
    v
Browser Playback
```

A local VoiceBridge Agent is not part of Phase 1.

A future Agent MAY connect to the same cloud ingestion contract only when browser or operating-system security prevents required system-audio capture.

## 3. Service Boundaries

| Boundary | Input | Output | Responsibility |
|----------|-------|--------|----------------|
| Browser to Cloud API | Authenticated commands | Session resources and errors | Control translation sessions |
| Browser to Ingestion | Audio chunks | Acknowledgements and flow control | Secure audio transfer |
| Cloud to Browser | Events and synthesized audio | Client acknowledgement | Deliver state and translated speech |
| Orchestrator to Recognition | Normalized audio | Recognition result | Convert speech to source text |
| Orchestrator to Translation | Recognized text | Translation result | Convert source text to target text |
| Orchestrator to Synthesis | Translated text | Synthesized audio | Generate target speech |
| Core to Provider Registry | Capability request | Provider adapter | Resolve replaceable providers |
| Orchestrator to State Store | Session updates | Authoritative state | Preserve active session coordination |

Core components MUST depend on capability contracts, not provider SDK objects, credentials, or endpoint formats.

## 4. Transport Model

### 4.1 Control Transport

HTTPS JSON is the approved logical control transport.

The initial versioned base path is:

```text
/api/v1
```

Control operations include:

- health check;
- session creation;
- session state retrieval;
- start, pause, resume, and stop commands;
- stream authorization or negotiation;
- supported capability discovery when implemented.

### 4.2 Streaming Transport

The implementation MUST use an approved secure bidirectional streaming transport for:

- browser audio upload;
- session events;
- partial and final processing status;
- synthesized audio delivery;
- backpressure and disconnect handling.

WebSocket is the preferred Phase 1 candidate.

The final transport selection MUST be documented before implementation.

Continuous audio MUST use binary frames when supported. Large audio payloads MUST NOT be embedded in JSON by default.

### 4.3 Common Rules

- JSON fields use `snake_case`.
- Timestamps use UTC ISO 8601.
- Identifiers are opaque strings.
- Enum values use uppercase `SNAKE_CASE`.
- Languages use documented BCP 47 tags.
- Every request receives a `request_id`.
- Related events and errors include a `correlation_id`.
- Secrets and raw user content MUST NOT appear in URLs or logs.

## 5. Test Authentication

### 5.1 Approved Test Model

The test launch uses one shared test access token.

HTTPS request example:

```text
Authorization: Bearer TEST_ACCESS_TOKEN
```

The token MUST:

- be stored through approved secret configuration;
- be validated at the cloud API boundary;
- be replaceable without code changes;
- support immediate revocation and rotation;
- be excluded from repository content, URLs, logs, examples, and diagnostics;
- be combined with request limits, provider quotas, cost limits, or equivalent safeguards.

### 5.2 Excluded From Test Scope

The test launch does not require:

- user registration;
- passwords;
- password recovery;
- social login;
- organizations;
- tenant management;
- persistent user profiles;
- role administration.

### 5.3 Limitations

The shared token proves access to the test environment but does not identify an individual user.

It MUST NOT be used for public multi-user production access.

Production authentication and authorization MUST be designed and approved before public or multi-user deployment.

## 6. Session API

### 6.1 Session States

| State | Meaning |
|-------|---------|
| `CREATED` | Session configuration accepted |
| `STARTING` | Cloud resources are being prepared |
| `ACTIVE` | Translation processing is active |
| `PAUSED` | Processing is temporarily suspended |
| `STOPPING` | Stop and cleanup are in progress |
| `COMPLETED` | Session ended successfully |
| `FAILED` | Session ended because of an unrecoverable error |

The Session Orchestrator is the only authority that changes session state.

Canonical transitions:

```text
CREATED -> STARTING -> ACTIVE
ACTIVE -> PAUSED -> ACTIVE
ACTIVE -> STOPPING -> COMPLETED
PAUSED -> STOPPING -> COMPLETED
STARTING -> FAILED
ACTIVE -> FAILED
PAUSED -> FAILED
STOPPING -> FAILED
```

### 6.2 Create Session

```text
POST /api/v1/sessions
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

Response:

```json
{
  "request_id": "req_01",
  "session_id": "session_01",
  "state": "CREATED",
  "source_language": "en",
  "target_language": "uk",
  "runtime_mode": "YOUTUBE_MVP",
  "created_at": "2026-07-18T00:00:00Z"
}
```

The response MUST NOT contain provider credentials or raw user content.

### 6.3 Read Session

```text
GET /api/v1/sessions/{session_id}
```

The response MUST include current state, language configuration, runtime mode, lifecycle timestamps, current pipeline stage, and sanitized error summary when available.

### 6.4 Session Commands

```text
POST /api/v1/sessions/{session_id}/start
POST /api/v1/sessions/{session_id}/pause
POST /api/v1/sessions/{session_id}/resume
POST /api/v1/sessions/{session_id}/stop
```

Commands MUST be idempotent where practical.

An already completed command SHOULD return the current resource state without duplicating cloud resources.

Invalid transitions MUST return `INVALID_SESSION_STATE`.

### 6.5 Health Endpoint

```text
GET /api/v1/health
```

The health response MAY expose service availability and version information.

It MUST NOT expose secrets, provider account information, internal network details, or raw diagnostic data.

## 7. Streaming API

### 7.1 Stream Establishment

The browser MUST authenticate before or during stream establishment.

A stream MUST be bound to exactly one authorized `session_id`.

The server MUST reject:

- missing or invalid test token;
- unknown session;
- terminal session;
- unsupported audio format;
- stream attached to a different session context.

### 7.2 Audio Chunk Metadata

```json
{
  "event_type": "AUDIO_CHUNK",
  "session_id": "session_01",
  "segment_id": "segment_01",
  "sequence": 1,
  "format": "PCM_S16LE",
  "sample_rate_hz": 16000,
  "channels": 1,
  "started_at_ms": 0,
  "duration_ms": 500,
  "is_final": false
}
```

Binary audio SHOULD be transmitted separately from metadata.

### 7.3 Event Envelope

```json
{
  "event_id": "event_01",
  "event_type": "SESSION_STATE_CHANGED",
  "session_id": "session_01",
  "sequence": 1,
  "occurred_at": "2026-07-18T00:00:01Z",
  "correlation_id": "req_01",
  "data": {
    "previous_state": "STARTING",
    "current_state": "ACTIVE"
  }
}
```

Required event types:

- `SESSION_STATE_CHANGED`;
- `PIPELINE_STAGE_CHANGED`;
- `PARTIAL_RESULT_AVAILABLE`;
- `OUTPUT_AVAILABLE`;
- `BACKPRESSURE_REQUIRED`;
- `RECOVERABLE_ERROR`;
- `SESSION_FAILED`;
- `SESSION_COMPLETED`.

### 7.4 Ordering and Backpressure

Events within one session MUST use a monotonically increasing sequence.

The server MUST use bounded buffers.

The server MUST signal backpressure or safely reject excess data instead of allowing unbounded memory growth.

Partial results MUST be marked explicitly and MUST NOT replace final results silently.

Disconnect recovery rules MUST be defined before Phase 1 implementation is considered complete.

## 8. Provider Service Contracts

### 8.1 Recognition

```text
recognize(audio_segment, context) -> recognition_result
```

```json
{
  "segment_id": "segment_01",
  "text": "recognized source text",
  "language": "en",
  "confidence": null,
  "is_final": true,
  "started_at_ms": 0,
  "ended_at_ms": 1200
}
```

### 8.2 Translation

```text
translate(recognition_result, context) -> translation_result
```

```json
{
  "segment_id": "segment_01",
  "source_language": "en",
  "target_language": "uk",
  "translated_text": "translated target text",
  "is_final": true
}
```

### 8.3 Synthesis

```text
synthesize(translation_result, context) -> synthesis_result
```

```json
{
  "segment_id": "segment_01",
  "audio_id": "audio_01",
  "language": "uk",
  "format": "AUDIO_FORMAT_SELECTED_BY_IMPLEMENTATION",
  "duration_ms": null,
  "is_final": true
}
```

Synthesized binary audio SHOULD be delivered separately from metadata.

### 8.4 Adapter Rules

Provider adapters MUST:

- load credentials only in the cloud;
- validate configuration before use;
- normalize provider requests and responses;
- map provider errors to the common error model;
- use bounded timeouts and retries;
- declare supported languages, formats, streaming features, and limits;
- avoid exposing provider SDK objects to core components or browser clients;
- remain replaceable without changing the browser contract.

## 9. Common Data Models

Canonical pipeline stages:

- `CAPTURE`;
- `INGESTION`;
- `AUDIO_PROCESSING`;
- `RECOGNITION`;
- `TRANSLATION`;
- `SYNTHESIS`;
- `OUTPUT_STREAMING`;
- `PLAYBACK`.

Baseline content retention mode:

```text
SESSION_ONLY
```

Raw audio, recognized text, translated text, and synthesized audio MUST be released during session cleanup unless a separate approved requirement and ADR define retention.

Authoritative session state MUST remain in the cloud.

## 10. Error Model

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The request is not valid.",
    "category": "VALIDATION",
    "retryable": false,
    "request_id": "req_01",
    "session_id": "session_01",
    "correlation_id": "req_01",
    "details": []
  }
}
```

Canonical error codes:

| Code | Category | Retryable | Meaning |
|------|----------|-----------|---------|
| `AUTHENTICATION_REQUIRED` | `AUTH` | No | Access token is missing |
| `AUTHENTICATION_FAILED` | `AUTH` | No | Access token is invalid or revoked |
| `RATE_LIMITED` | `AUTH` | Yes | Test or provider limit was reached |
| `INVALID_REQUEST` | `VALIDATION` | No | Request structure or value is invalid |
| `UNSUPPORTED_LANGUAGE` | `VALIDATION` | No | Language is unsupported |
| `UNSUPPORTED_AUDIO_FORMAT` | `VALIDATION` | No | Audio format is unsupported |
| `SESSION_NOT_FOUND` | `SESSION` | No | Session is unknown |
| `INVALID_SESSION_STATE` | `SESSION` | No | Command is invalid for current state |
| `PROVIDER_NOT_CONFIGURED` | `CONFIGURATION` | No | Provider configuration is missing |
| `PROVIDER_UNAVAILABLE` | `PROVIDER` | Yes | Provider is temporarily unavailable |
| `PROVIDER_TIMEOUT` | `PROVIDER` | Yes | Provider operation timed out |
| `AUDIO_INPUT_INTERRUPTED` | `MEDIA` | Yes | Audio input stopped unexpectedly |
| `PROCESSING_FAILED` | `PIPELINE` | Depends | Pipeline stage failed |
| `INTERNAL_ERROR` | `SYSTEM` | No | Unexpected safe failure |

Messages MUST be actionable and MUST NOT expose secrets, raw user content, provider credentials, or sensitive configuration.

## 11. Security and Privacy

The API MUST:

- require the approved test token for protected endpoints and streams;
- use HTTPS and secure streaming transport;
- keep provider credentials in the cloud;
- validate all browser input and provider responses;
- deny cross-session access by default;
- apply request, stream, provider, and cost limits;
- avoid user-content retention by default;
- exclude tokens and raw user content from logs and telemetry;
- support token rotation and revocation;
- fail safely when authentication, validation, or provider trust checks fail.

The shared token MUST NOT be embedded in a publicly distributed browser bundle. Test token delivery MUST use an approved controlled mechanism.

## 12. Reliability and Observability

Implementations MUST:

- use explicit provider and stream timeouts;
- retry only safe retryable operations;
- avoid duplicate non-idempotent work;
- isolate one session failure from unrelated sessions;
- release streams, buffers, temporary content, and provider handles;
- expose session state instead of silent stalls;
- generate correlation identifiers;
- track test-environment request and provider-cost limits.

Recommended measurements:

- authentication failure count;
- active session count;
- capture-to-ingestion latency;
- recognition latency;
- translation latency;
- synthesis latency;
- output queue delay;
- end-to-end segment latency;
- provider error and retry counts;
- session outcome counts.

Metrics and logs MUST NOT include tokens, secrets, or raw user content.

## 13. Versioning and Compatibility

The API begins at `v1`.

- additive optional fields are backward compatible;
- removing or renaming fields is a breaking change;
- changing field meaning, required status, validation, or state transitions is a breaking change;
- new enum values require documented fallback behavior or a version change;
- deprecated behavior MUST be documented before removal;
- transport bindings MUST identify the logical API version;
- breaking architecture changes require documentation updates and an ADR.

## 14. Validation Requirements

Validation MUST cover:

- missing, invalid, rotated, and revoked test tokens;
- request schemas;
- session state transitions;
- command idempotency;
- audio format and language validation;
- stream authorization;
- event ordering;
- bounded buffering and backpressure;
- provider success, timeout, unavailable, limit, and malformed-response cases;
- retry and cleanup behavior;
- error sanitization;
- token and user-content exclusion from logs;
- ASCII documentation validation;
- Markdown reference validation;
- `git diff --check`.

Provider contract tests SHOULD use mocks or fakes.

## 15. Future Evolution

Future work MAY add:

- final WebSocket or alternative streaming binding;
- authenticated user accounts;
- short-lived user tokens;
- organizations and tenant isolation;
- administrative APIs;
- generic audio sources;
- bidirectional interpreter sessions;
- provider capability discovery;
- optional user-controlled history;
- a minimal VoiceBridge Agent using the same cloud ingestion contract.

Production authentication MUST replace the shared test token before public multi-user deployment.

## 16. References

- [ADR-001_CLOUD_FIRST_ARCHITECTURE](../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [02_REPOSITORY_STRUCTURE](../planning/02_REPOSITORY_STRUCTURE.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [06_DEVELOPMENT_STANDARD](../governance/06_DEVELOPMENT_STANDARD.md)
- [09_FUNCTIONAL_REQUIREMENTS](../requirements/09_FUNCTIONAL_REQUIREMENTS.md)
- [10_SYSTEM_DESIGN](../design/10_SYSTEM_DESIGN.md)
- [11_NON_FUNCTIONAL_REQUIREMENTS](../requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md)
- [12_SECURITY_MODEL](../security/12_SECURITY_MODEL.md)
- [15_REPOSITORY_RULES](../governance/15_REPOSITORY_RULES.md)
- [16_AI_DEVELOPMENT_RULES](../governance/16_AI_DEVELOPMENT_RULES.md)

## 17. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Created Cloud First API design baseline |
