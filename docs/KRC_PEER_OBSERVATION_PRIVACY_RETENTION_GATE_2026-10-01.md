# Peer observation privacy and retention gate

Date: 2026-10-01. **Design only; no runtime logging, integration, or deployment.**

## Data minimization and boundary

Only the validated TCP peer is eligible for an HMAC-SHA256 96-bit within-process tag. A per-process ephemeral 256-bit random key must be generated at process start, never persisted, exported, or logged. Untrusted forwarded headers are never used for identity or rate limiting; only absent/empty/single/multiple/oversize classes may be counted. Never log raw peer addresses, header values, access tokens or ephemeral keys. Do not expose an HTTP diagnostics endpoint.

## Bounded implementation proposal (not yet coded)

Keep counters by peer tag and header class in process memory for **one 60-second diagnostic window**, then delete; enforce a hard cap of **128 distinct tags per window**, overflow aggregated under an anonymous bucket without tags. Report only counts when the aggregate bucket has **at least 5 observations**; otherwise suppress the output. The threshold limits small-cell disclosure but does not guarantee anonymity. Emit at most one summary per window and retain summaries no longer than **24 hours** if later approved; avoid request-level timestamps or correlation IDs. Restart resets both key and counters. Separate instances cannot compare tags. Log retention must be configured and verified with actual Render behavior before enabling any instrumentation.

## Threat review

1. An exposed HMAC key enables offline guesses of low-entropy IP addresses; keep key process-local and destroy on restart. Even without key, repeated tags link requests inside one period. A 96-bit tag is not encryption or anonymization.
2. Untrusted X-Forwarded-For may be spoofed or oversized. Header classification is diagnostic only, and bounded by input length; do not parse it into identities.
3. A shared reverse proxy TCP peer may merge many clients into one tag. This is the hypothesis under test, **not a proven runtime fact**.
4. Aggregate counts can reveal low-volume traffic patterns; suppress small cells, cap distinct tags, restrict log access, and enforce finite retention.
5. Diagnostics must not modify pre-auth limiter decisions, authentication, health bypass, Retry-After or provider execution. Feature flag default OFF and regression parity required.

## Validation gate

Focused IPv6 normalization and tag tests, complete VoiceBridge regression suite, integration parity (feature OFF/ON), adversarial oversized headers, memory-bound tests, privacy-output inspection, and explicit owner approval before deployment. Current research module remains unconnected to the live server and does not implement these counters or retention rules yet.
