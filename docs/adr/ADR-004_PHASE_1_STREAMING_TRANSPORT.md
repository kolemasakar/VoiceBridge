# ADR-004: Phase 1 Streaming Transport

Status: Accepted

Date: 2026-07-18

Decision Owners: VoiceBridge project

## Context

Milestone 3 requires authenticated low-latency browser audio upload, server events, explicit flow control, bounded memory use, and disconnect handling.

The browser WebSocket API does not allow an arbitrary `Authorization` header during the upgrade request. The shared Phase 1 token MUST NOT appear in a URL or log.

Node.js 24 provides a WebSocket client but does not provide the server binding required by the existing built-in HTTP service.

## Decision

Use standard secure WebSocket as the Phase 1 streaming transport.

Use the maintained `ws` package for the Node.js server binding in `noServer` mode so authentication is completed in the HTTP upgrade path.

Stream authorization uses two stages:

1. An `ACTIVE` session requests a one-time stream ticket through authenticated HTTPS.
2. The browser opens the WebSocket with `voicebridge.v1` and a ticket subprotocol.

The shared test token is never placed in the WebSocket URL. A ticket:

- is bound to one `session_id`;
- expires after 60 seconds;
- is consumed by the first valid upgrade attempt;
- cannot be reused.

## Transport Binding

Ticket endpoint:

```text
POST /api/v1/sessions/{session_id}/stream-ticket
```

Stream endpoint:

```text
WS /api/v1/sessions/{session_id}/stream
```

Subprotocols:

```text
voicebridge.v1
voicebridge.ticket.TICKET
```

The server selects only `voicebridge.v1` as the negotiated protocol.

## Audio Format

The browser uploads:

- mono audio;
- signed 16-bit little-endian PCM;
- the active browser AudioContext sample rate;
- nominal 20 millisecond frames;
- binary WebSocket messages.

Audio bytes are counted and discarded in Milestone 3. No audio content is persisted.

## Control Events

JSON control frames use the canonical event envelope.

Milestone 3 event types:

- `STREAM_READY`;
- `STREAM_START`;
- `STREAM_STARTED`;
- `AUDIO_ACK`;
- `BACKPRESSURE_REQUIRED`;
- `STREAM_STOP`;
- `STREAM_COMPLETED`;
- `PING`;
- `PONG`.

## Bounds and Flow Control

- maximum binary frame: 32768 bytes;
- maximum control frame: 8192 bytes;
- acknowledgement interval: 10 audio frames;
- maximum unacknowledged client frames: 50;
- maximum browser WebSocket buffered amount: 262144 bytes;
- server compression: disabled;
- excess client frames: dropped and counted instead of queued without limit;
- one active stream per session.

The server processes each binary frame synchronously, updates counters, and does not retain audio payloads.

## Disconnect Behavior

- a clean Stop sends `STREAM_STOP` and receives `STREAM_COMPLETED`;
- an unexpected WebSocket close stops local capture and exposes an error;
- the HTTP session is stopped through the existing idempotent session command;
- reconnect requires a new one-time ticket;
- automatic transparent replay is not implemented in Milestone 3.

## Consequences

Positive:

- standard browser support;
- low protocol overhead;
- binary audio upload;
- token exclusion from URLs;
- bounded client buffering;
- explicit acknowledgement and backpressure signals;
- provider-neutral WSS endpoint.

Tradeoffs:

- one production dependency is added to the cloud service;
- application-level flow control is required;
- the current implementation drops excess frames rather than replaying them;
- in-memory tickets and stream ownership are single-instance only;
- future horizontal scaling requires shared authorization and session state.

## Security

- stream tickets MUST NOT be logged;
- the shared test token MUST remain in approved secret configuration;
- only `ACTIVE` sessions can obtain a ticket;
- tickets MUST be one-time and short-lived;
- unsupported origins MUST be rejected when CORS is restricted;
- binary and control frame sizes MUST remain bounded;
- production authentication requires a later decision.

## Validation

Automated validation includes:

- ticket request requires an `ACTIVE` session;
- WebSocket upgrade accepts a valid one-time ticket;
- binary PCM frames receive acknowledgements;
- frame and queue limits are advertised;
- reused tickets are rejected;
- existing HTTP tests remain green.

Browser and ten-minute deployment validation remain required before Milestone 3 is complete.

## References

- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME](ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME.md)
- [ADR-003_PHASE_1_TEST_HOSTING_RENDER](ADR-003_PHASE_1_TEST_HOSTING_RENDER.md)
- [13_API_DESIGN](../api/13_API_DESIGN.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Accepted standard WebSocket and one-time stream-ticket binding |
