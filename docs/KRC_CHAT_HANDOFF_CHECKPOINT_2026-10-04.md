# KRC / VoiceBridge — chat handoff checkpoint

Date: 2026-10-04
Status: research-only diagnostics validated in isolation; **no production integration or deployment authorized**.

## Authoritative baseline

- VoiceBridge production/deployed baseline used for this research: `d3873bf13e60c4932ab08cae449c924051be4a37`.
- Research branch: `research/krc-peer-observation-isolated`.
- Production limiter remains `FixedWindowRateLimiter`, keyed from `request.socket.remoteAddress || "unknown"`; this research branch has not been deployed.
- KRC E2 must remain confirmation-probe-only unless owner explicitly authorizes otherwise. Paid fallback remains prohibited.

## Research implementation completed

1. `peer_observation.ts`
   - validates IPv4/IPv6 socket peer;
   - canonicalizes equivalent IPv6 textual forms;
   - HMAC-SHA256 with purpose/version separator and 96-bit tag;
   - ephemeral random 256-bit key helper;
   - forwarded header is classified only as untrusted shape, never identity.
2. `peer_window_aggregate.ts`
   - 60-second bounded aggregate;
   - max 128 stored tag buckets;
   - overflow counter;
   - summaries suppressed below 5 observations;
   - no raw IP/header/key in output.
3. `peer_window_coordinator.ts`
   - deterministic clock-driven window rotation;
   - 24-hour bounded summary retention design and hard cap;
   - explicit clear;
   - no autonomous scheduler.
4. `peer_http_parity_harness.ts`
   - isolated research HTTP server, **not production createVoiceBridgeServer**;
   - one limiter decision irrespective of diagnostics;
   - diagnostic exceptions fail open with respect to HTTP behavior;
   - health/OPTIONS bypass and Retry-After parity tested.

## Test evidence

On authorized `krc-cobalt`, Node v24:
- peer observation after IPv6 fix: 9/9 PASS;
- observation + aggregate: 16/16 PASS;
- observation + aggregate + coordinator: 23/23 PASS;
- isolated HTTP parity: 2/2 PASS;
- latest full compiled Node regression: **295/295 PASS**, 0 failures, exit 0.
- Earlier full-suite counts (277, 279, 286, 293) were valid intermediate checkpoints; 295/295 is the latest baseline.

## Documents

- `docs/KRC_PEER_OBSERVATION_RESEARCH_CHECKPOINT_2026-10-01.md`
- `docs/KRC_PEER_OBSERVATION_PRIVACY_RETENTION_GATE_2026-10-01.md`
- `docs/KRC_PEER_WINDOW_AGGREGATE_CHECKPOINT_2026-10-02.md`
- `docs/KRC_PEER_COORDINATOR_CHECKPOINT_2026-10-02.md`
- `docs/KRC_PEER_HTTP_FAILURE_ISOLATION_CHECKPOINT_2026-10-02.md`

## What is NOT proven

- Historical VoiceBridge 429 root cause is still unproven.
- Actual Render reverse-proxy/socket-peer topology is unverified.
- Isolated HTTP parity does not prove parity inside real `createVoiceBridgeServer`.
- No autonomous idle-window scheduler is implemented.
- No production logging/retention configuration has been verified.
- Multi-instance aggregation semantics are not implemented.
- No production diagnostics endpoint exists and none should be added by default.

## Next technical gate

Prepare a **research-only integration with the real `createVoiceBridgeServer`**, default OFF, in an isolated branch/checkpoint. Required tests before any deployment decision:
- feature OFF must be byte/behavior compatible where observable;
- feature ON must not change limiter key, limiter decision, authentication, health/OPTIONS bypass, 429 or Retry-After;
- diagnostic exceptions must not affect request processing;
- hostile/oversized forwarded headers must not become identity;
- no raw IP/header/token/key in diagnostic output;
- full VoiceBridge regression must remain green.

Do **not** deploy, change production env/config, rotate credentials, run MEDIA provider work, merge to production/main, or enable live diagnostics without fresh owner authorization.
