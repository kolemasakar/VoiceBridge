# Exact Cobalt 11.7.1 HTTP 400 reason diagnostics

## Verified evidence
- The authorized krc-cobalt local read-only GET / reported version 11.7.1, git commit a636575b09de1fc55d9b8cd98cac88f5f2f16b42, imputnet/cobalt main.
- The schema at that exact upstream SHA accepts VoiceBridge's url, downloadMode=audio, audioFormat=mp3, disableMetadata=true. Accept/Content-Type application/json and Authorization Api-Key syntax also match the exact upstream API code.
- Thus no request contract mismatch has been demonstrated. Do not change request options or credentials speculatively.
- Cobalt's createResponse("error") returns HTTP 400 for authentication, validation, unsupported service and content retrieval failures alike.
- api-keys.js has more rejection codes than missing/invalid (not_found, not_api_key, invalid_ip, ip_not_allowed, ua_not_allowed). The old classifier collapsed these to HTTP_400, hiding relevant diagnostics.
- Render logs query 2026-10-16T09:38:00Z–09:40:00Z returned no logs. This is absence of visible logs, not proof of no upstream work.

## Narrow fix
Use an exact static map of verified upstream error codes to local sanitized categories for HTTP 400. Unknown/malformed codes retain HTTP_400. Existing HTTP 401/403/404/422/429/5xx handling remains bounded. No raw codes, context, URLs, tokens or provider messages are exposed; no credentials, retrieval request or retry rules are changed.

## Validation
TypeScript build and targeted public Cobalt suite 13/13 PASS. New tests exercise all added reason mappings through engine failure persistence, verify no STT invocation, no extra retrieval call, zero STT seconds and no secret/context leakage. Malformed and near-matching codes remain generic; a 503 cannot masquerade as a 400 content failure.

## Limitations
The stored earlier HTTP_400 job has no raw upstream code to recover. This patch repairs observability only, not Instagram retrieval. Exact live failure reason and provider repair remain OPEN until a subsequent authorized diagnostic supplies a specific category. No new provider start, Docker privilege changes or Telegram execution is part of this code change. FREE_ONLY/public HOLD retained.

## Primary references
- https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/src/processing/schema.js
- https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/src/core/api.js
- https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/src/security/api-keys.js
- https://github.com/imputnet/cobalt/blob/a636575b09de1fc55d9b8cd98cac88f5f2f16b42/api/src/processing/request.js

Full regression: 284/284 PASS, zero failures/skips, exit 0 (48.937 seconds). Production baseline befff428d70c9ac65226dc2fb2754bb88b6a1ba4; changes limited to classifier, tests and this evidence document.
