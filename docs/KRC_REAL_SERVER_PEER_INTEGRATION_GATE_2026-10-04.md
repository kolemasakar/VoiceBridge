# KRC / VoiceBridge real-server research integration gate

Date: 2026-10-04
Status: PASS — research source/test evidence only.
Branch: `research/krc-peer-observation-isolated`.
Parent baseline: `b8f032f1150a337074df91fb4dabb87cbaa57374`.
Implementation commit: 9610ddfc5d90399df4a66b6cf86d5a46ddc32201.

## Implementation and acceptance

The real `createVoiceBridgeServer` now accepts an optional sixth, in-process `PeerDiagnosticResearchOptions` argument. `enabled === true` is required; omission/false allocates no key, coordinator, diagnostic timer or diagnostic close listener. Existing callers and `listen(config)` leave diagnostics OFF. No environment variable or `AppConfig` activation was added.

The limiter remains `FixedWindowRateLimiter`, keyed by `request.socket.remoteAddress || "unknown"`. `allow(clientKey(request))` is evaluated exactly once, before authentication; optional observation consumes that already-made decision. OPTIONS and GET health return before both limiter and observation. HTTP 429 and `Retry-After: 60` are unchanged.

An ephemeral random 32-byte HMAC key and the previously validated bounded coordinator are created only on opt-in. Observation/initialization/cleanup exceptions are swallowed without logging exception payloads. Successful initialization adds a close listener that clears coordinator state and zeroes/releases the key. The optional coordinator factory is a trusted in-process test seam, not a remote API.

No raw socket IP, forwarded header, authorization token, key, request ID or individual peer tag is emitted by the diagnostic path. Only the existing thresholded aggregate format is available inside the coordinator; no public diagnostic endpoint, logger, persistence, scheduler or provider call was added.

## Evidence

Host: freshly verified `krc-cobalt`; Node `v24.21.0`.
Workspace: `/tmp/krc_voicebridge_peer_research`.

- Before integration: `npm run check` — 295/295 PASS, 0 failures, exit 0.
- After integration: `npm run build` — PASS.
- Focused `node --test dist/tests/peer*.test.js` — 35/35 PASS, including 10 real-server integration tests.
- Final full `npm test` — 305/305 PASS, 0 failures, exit 0; duration 89.943 seconds.
- `git diff --check` — PASS.
- Source/test content in 9610ddfc5d90399df4a66b6cf86d5a46ddc32201 is exactly the content used by the completed build and regression.

Real-server tests cover omitted/false opt-in, full response parity across OFF/ON/observation failure, missing/invalid authentication, OPTIONS/health bypass before and after saturation, exact 60-request boundary and Retry-After, one limiter call with the actual loopback socket key, absent/empty/spoofed/chained/IPv6/malformed/1025-byte forwarded inputs, and HTTP-parser rejection (431) for a 20,000-byte header before diagnostics or limiter.

Privacy/lifecycle tests cover silence on initialization/record/cleanup errors, fewer-than-five summary suppression through real-server requests, aggregate counts without raw data or tags, close cleanup, no HTTP diagnostic route, and distinct ephemeral tags between server lifetimes. Existing focused suites cover 128-tag overflow, bounded retention and canonical IPv6.

Provider execution uses injected local STT/translation/TTS mocks only: ordinary HTTP requests cause zero provider calls; one explicit local audio stream in each OFF/ON/failure case causes exactly one connect/audio/translation/synthesis call, with the same transcript/translation outcomes. No external provider work occurred.

The first new-test run was 6/8 because its assertions assumed no pre-existing WebSocket close listener and the wrong translation-event field. Assertions were corrected to compare baseline listener count and use the actual `translated_text` contract; the final 10/10 suite and full regression supersede that intermediate result.

## Diff scope

Code/test files:
- `src/cloud/src/server.ts`
- `src/cloud/tests/peer_real_server_integration.test.ts`

`rate_limit.ts`, `auth.ts`, `config.ts`, stream transport and provider implementations are unchanged. Existing diagnostic module comments describing no live import refer to the original isolated stage; the imports in this checkpoint are research-only and have not been deployed.

The older October 1 design proposed observing before the limiter. The October 4 Bootstrap and approved execution plan supersede that ordering: observe after the single decision so allowed/rejected aggregates cannot become a decision input.

## Limits and next boundary

NO PRODUCTION DEPLOYMENT. No production ENV/config/credentials, main merge, Plugin release, E2 mode change, service lifecycle change or real MEDIA job was performed. FREE_ONLY and E2 confirmation-probe-only boundaries remain in force.

This passes the source/test real-server integration gate. It does not establish the cause of historical 429 or the actual Render proxy topology. Idle windows are still externally advanced; expiry is evaluated on advance/read/record, not autonomously while idle. Production retention/log access, multi-instance behavior and any live instrumentation remain separate gates requiring a fresh owner decision. No production readiness or live enablement is claimed.
