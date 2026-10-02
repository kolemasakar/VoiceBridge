# KRC isolated peer-window coordinator checkpoint

Date: 2026-10-02. Research branch `research/krc-peer-observation-isolated`; no live server import, deploy, env change, provider work or logs.

Added `src/cloud/src/peer_window_coordinator.ts` and seven focused tests. The deterministic coordinator advances 60-second windows on `record`, `readSummaries`, or explicit `advance(nowMs)` calls; skips empty periods, retains only aggregate summaries under 24-hour expiry and a hard cap of 1440 summaries, and permits explicit clearing. The previous aggregate class bounds distinct in-window HMAC tags to 128 and suppresses summaries with fewer than five observations.

On isolated `krc-cobalt`, Node 24: initial TypeScript strict-index errors were fixed, subsequent `npm run build` PASS and combined peer-observation, aggregation and coordinator suites **23/23 PASS**, 0 failures, exit 0. Includes a limited limiter-decision parity test against a separate identical `FixedWindowRateLimiter` instance. This is not live-server integration parity.

**Remaining gates:** No timer or external scheduler is wired, so idle windows are closed only when `advance` is called; there is no persisted logging and no verified Render retention. Multi-instance behavior, malformed-input and exception isolation, real server integration parity, and owner approval for any live instrumentation remain outstanding. Full regression test run initiated; record final result separately when complete.

## Final full regression result

On the same isolated checkout after successful TypeScript build, the full Node suite finished **293/293 PASS**, 0 failures, exit code 0, test runtime 87.56 seconds. The earlier full-regression pending note is superseded. Research-only limiter parity is not a substitute for server integration tests. No production changes.
