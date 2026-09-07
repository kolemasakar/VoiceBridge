# KRC MEDIA R2 Cobalt live retrieval blocker

Date: 2026-09-07
Status: R2 LIVE CANARY BLOCKED / FAIL-CLOSED / ZERO PROVIDER CHARGE

## Context

R2 Cobalt candidate `5003689ad2fe4c850d47dc7777c50470820b0bff` was deployed to `voicebridge-krc-media-beta-kolemasakar`. The first bounded YouTube canary for `https://www.youtube.com/watch?v=5i-4Pk5Idb4` reached the new `cobalt_retrieval_stt` route and failed before AssemblyAI started.

Durable job state recorded:

- `provider_mode=cobalt_retrieval_stt`;
- `retrieval_provider=cobalt`;
- `free_retrieval_error_code=COBALT_PUBLIC_MEDIA_INVALID_RESPONSE`;
- `credits_charged=0`;
- `retrieval_credits_charged=0`;
- `stt_seconds_charged=0`;
- `credit_charge_uncertain=false`.

## Bounded direct Cobalt probe

A one-off GitHub Actions probe was used without STT and without following a returned media/tunnel URL.

Run: `34132438781`
Commit: `96e52a416218df168d6afc0f4e25e11028d5160f`

Result:

```text
GET /:
  HTTP 200
  content-type: application/json
  json_valid: true
  cobalt_version: 11.7.1
  service_count: 21

POST / YouTube audio request WITHOUT API KEY:
  HTTP 400
  content-type: application/json
  json_valid: true
  status: error
  error_code: error.api.auth.key.missing
```

Cobalt startup logs in the same period confirmed `api keys loaded successfully!`.

## Corrected diagnosis

The direct GitHub probe deliberately did not have access to the Render Cobalt secret and therefore proved only that Cobalt authentication is required. It did NOT prove that VoiceBridge lacked `KRC_MEDIA_COBALT_API_KEY`.

The owner later confirmed that `KRC_MEDIA_COBALT_API_KEY` was already present in the VoiceBridge Render environment and contains the UUID key from `cobalt-keys.json`.

The hardened VoiceBridge candidate `cff39a526b83f49e1d39c64fc45090350a1e9e1c` also starts successfully with a runtime guard that requires this key in public mode, confirming that VoiceBridge sees the key at startup.

A fresh canary for `https://www.youtube.com/watch?v=jNQXAC9IVRw` then created a new durable job:

```text
job_id=KRCM_4eeca7c8-4c2b-4262-b0dc-ef0c219a48ee
provider_mode=cobalt_retrieval_stt
retrieval_provider=cobalt
status=FAILED
error_code=COBALT_PUBLIC_MEDIA_FAILED
retrieval_credits_charged=0
stt_seconds_charged=0
```

Therefore the current confirmed blocker is narrower: authenticated VoiceBridge-to-Cobalt retrieval reaches Cobalt, but Cobalt returns a non-2xx response for the YouTube retrieval. The current production code collapses the provider response to a generic `COBALT_PUBLIC_MEDIA_FAILED`, so a bounded sanitized diagnostic is required to distinguish auth rejection from a YouTube extractor/upstream error.

## Safety invariant

Do not weaken Cobalt authentication to bypass the blocker:

```text
API_AUTH_REQUIRED stays enabled
Cobalt retrieval failure -> MEDIA unavailable/fails closed
Core KRC -> remains available
paid retrieval fallback -> none
AssemblyAI must not start before successful Cobalt retrieval
```

## Repository hardening

Public runtime now refuses to start if `mediaPublicMode=true` without `KRC_MEDIA_COBALT_API_KEY`. Regression coverage verifies the `Authorization: Api-Key <configured-key>` header wiring.

A temporary bounded startup diagnostic is implemented behind `KRC_MEDIA_COBALT_DIAGNOSTIC_ONCE=true`. It logs only HTTP status, provider status and provider error code; it does not log the key, source URL, raw response, or returned media/tunnel URL, and it does not call STT.

Diagnostic implementation validated by VoiceBridge `Validate 34142848953` on candidate `52499e4959aa2673f07239c73054cdbeaec0eeac`: SUCCESS.

## Next step

Enable the bounded sanitized startup diagnostic for one deployment, capture the exact Cobalt provider error code, disable the diagnostic flag, then decide whether the fix belongs in auth wiring, Cobalt YouTube retrieval configuration, or upstream service handling. After the fix: bounded YouTube canary, Neon delta verification, then Instagram/Facebook/Telegram canaries.
