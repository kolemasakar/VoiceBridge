# KRC MEDIA safe diagnostics — 2026-09-26

## Observed evidence

- Render free-tier service repeatedly starts and stops with SIGTERM after roughly 15 minutes; health returned HTTP 200 after 12.31 seconds during a cold-start observation. This is consistent with free-instance idle suspension, not proof of a crash.
- KRC MCP read-only lookup and preflight intermittently returned HTTP 429. In the deployed code, PublicMediaAdmissionController applies only to `POST /api/v1/media/managed/transcriptions`, not the direct YouTube/Gemini route. Thus its 429 branch does not explain read-only YouTube errors.
- An uncertain `media_youtube_start` response was followed by a successful read-only lookup of completed job `KRCM_10c97258-5c8d-4741-ad52-ff6f1f69adb7` (30 segments). Never blindly retry after an ambiguous execution response.
- Job metadata reported 47,445 transcript characters; concatenated segment texts contain 47,436. Preserve both values and investigate segmentation counting semantics rather than silently treating them as equal.

## Minimal candidate change

The direct YouTube HTTP handler now logs a single structured `krc_youtube_http_error` event in its existing error handler. Allowlisted fields: `request_id`, `correlation_id`, route label, HTTP status, error code, retryable flag. No headers, bearer tokens, URL, request body, transcript, provider payload, or beta access code.

## Validation before deployment

1. Run TypeScript build and existing tests against this exact branch SHA; do not treat an unrun test as PASS.
2. In a nonproduction environment, exercise read-only preflight, lookup-not-found, status-not-found, and malformed request. Check log field allowlist and correlation ID, without revealing secrets.
3. Confirm expected `MEDIA_TRANSCRIPT_NOT_FOUND` is not interpreted as infrastructure failure; optionally reduce its log severity in follow-up.
4. Correlate connector 429 with Render request ID and HTTP logs. If no matching application event exists, inspect upstream gateway/connector response status and Retry-After. If application event exists, compare its error code and provider metadata.
5. Assess direct YouTube/Gemini admission policy separately; the current admission controller only covers the managed route.
6. No production deployment or environment modification without explicit authorization.

## Isolated execution evidence — 2026-09-26

- Exact SHA before test: `d802d15f6763be8ec81d26590f45a5cf970339c2`.
- Isolated host: `krc-cobalt`, directory `~/krc_validation/voicebridge-pr54/src/cloud`; local HTTP server bound to `127.0.0.1` with fixture-only configuration and stub provider.
- `npm ci`: PASS; `npm run build`: PASS; `npm test`: **270 PASS, 0 FAIL, 0 SKIPPED**, duration ~85.5 s.
- Additional isolated HTTP diagnostics: **5/5 PASS**: unauthenticated capabilities 401, absent lookup 404, malformed lookup 400, absent status 404, absent segments 404.
- All five cases asserted the exact seven-field diagnostic allowlist, route/error/status, and matching HTTP/log request and correlation identifiers. Fixture tokens, keys, access code, and media URL absent from captured logs. Stub provider invocation count: **0**.
- Test script is local fixture `src/cloud/isolated_diagnostics.mjs` in validation checkout only, not a tracked production file.
- This validates negative-path logging, not provider-origin 429 or external gateway failures. No production deployment performed.
