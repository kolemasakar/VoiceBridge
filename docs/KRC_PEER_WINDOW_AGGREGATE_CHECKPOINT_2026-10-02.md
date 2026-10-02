# KRC peer-window aggregate prototype checkpoint

Date: 2026-10-02. Research branch `research/krc-peer-observation-isolated`; **no production server import, runtime logging, or deployment**.

Added `src/cloud/src/peer_window_aggregate.ts` and `src/cloud/tests/peer_window_aggregate.test.ts`. The pure in-memory `BoundedPeerWindow` consumes precomputed `PeerObservation` values; does not receive raw IPs, header values or HMAC keys. It bounds distinct tag storage to 128 per window, tracks additional observations in an overflow counter, rejects out-of-window events, suppresses summaries with fewer than five observations, and supports explicit window clearing. It does not autonomously schedule rotation, enforce a logging-retention policy, or connect to the live rate limiter; these require separate design and tests before any deployment.

Isolated `krc-cobalt` Node 24 test: `npm run build` PASS; focused compiled peer observation + aggregation suites **16/16 PASS**, 0 failures, exit 0. Full regression run initiated; its result must be separately recorded when completed.

Privacy caveats: within-window HMAC tags are pseudonymous, not anonymous. Even aggregate summaries can reveal small populations. Threshold five is a mitigation, not an anonymity guarantee. The class is designed to be used only with process-local ephemeral keys and strict access controls; actual production log retention remains unverified. Existing limiter, authentication and E2 probe-only settings remain unchanged.

## Final full regression result

The same isolated checkout's full compiled Node suite completed **286/286 PASS**, zero failures, exit code 0, test runtime 86.68 seconds. Together with prior successful TypeScript build and focused 16/16 PASS, the research-only prototype passes its current isolated gates. This does **not** establish integration parity or authorize production instrumentation. No full log-retention mechanism exists yet.
