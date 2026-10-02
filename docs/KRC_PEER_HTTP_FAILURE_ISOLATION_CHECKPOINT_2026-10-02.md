# KRC isolated HTTP diagnostic parity checkpoint

Date: 2026-10-02. Branch `research/krc-peer-observation-isolated`. No production server import, deployment, provider work, environment or credential changes.

Added `src/cloud/src/peer_http_parity_harness.ts` and `src/cloud/tests/peer_http_parity_harness.test.ts`. This is an **independent research HTTP harness**, not the actual `createVoiceBridgeServer` implementation. It uses the same `FixedWindowRateLimiter` class and calls the diagnostic observer/coordinator after the single limiter decision; diagnostic exceptions are caught without changing the HTTP outcome.

Isolated Node 24 `krc-cobalt`: `npm run build` PASS, focused HTTP parity tests **2/2 PASS**. Tested diagnostics OFF vs ON for HTTP statuses and Retry-After, health and OPTIONS bypass, spoofed forwarded headers not affecting socket-peer limiter key, and synthetic diagnostic exception fail-open behavior (four observed exceptions, identical HTTP outcomes, no exception text in responses).

Important limitations: this proves parity only for the isolated harness, not production server integration; actual proxy peer topology and historical 429 cause remain unknown. The coordinator is externally clock-driven, not autonomously scheduled. Full regression test was started and remains pending until final summary is observed.
