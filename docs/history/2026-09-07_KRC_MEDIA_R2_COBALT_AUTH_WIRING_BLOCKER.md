# KRC MEDIA R2 Cobalt auth wiring blocker

Date: 2026-09-07
Status: R2 LIVE CANARY BLOCKED / FAIL-CLOSED / ZERO PROVIDER CHARGE

## Context

R2 Cobalt candidate `5003689ad2fe4c850d47dc7777c50470820b0bff` was deployed to `voicebridge-krc-media-beta-kolemasakar`. The first bounded YouTube canary for `https://www.youtube.com/watch?v=5i-4Pk5Idb4` reached the new `cobalt_retrieval_stt` route but ended as `FAILED` before AssemblyAI started.

Durable job state recorded:

- `provider_mode=cobalt_retrieval_stt`;
- `retrieval_provider=cobalt`;
- `free_retrieval_error_code=COBALT_PUBLIC_MEDIA_INVALID_RESPONSE`;
- `credits_charged=0`;
- `retrieval_credits_charged=0`;
- `stt_seconds_charged=0`;
- `credit_charge_uncertain=false`.

## Bounded live probe

A one-off GitHub Actions probe was used for diagnosis without STT and without following any media/tunnel URL.

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

POST / YouTube audio request:
  HTTP 400
  content-type: application/json
  json_valid: true
  status: error
  error_code: error.api.auth.key.missing
```

Cobalt startup logs from the same period confirmed `api keys loaded successfully!`.

## Conclusion

Self-hosted Cobalt is alive, returns valid JSON, and has API-key authentication enabled. The confirmed live blocker is that VoiceBridge does not have working `KRC_MEDIA_COBALT_API_KEY` wiring for this protected Cobalt instance.

The initial `COBALT_PUBLIC_MEDIA_INVALID_RESPONSE` is not used as proof of a specific cold-start or edge response because the raw body from that first failed request was not retained. After warmup, the confirmed blocker is `error.api.auth.key.missing`.

## Safety invariant

Do not weaken Cobalt authentication to bypass this blocker:

```text
API_AUTH_REQUIRED stays enabled
missing/invalid Cobalt key -> MEDIA unavailable/fails closed
Core KRC -> remains available
paid retrieval fallback -> none
AssemblyAI must not start before successful Cobalt retrieval
```

## Repository hardening

The public runtime factory now refuses to start when `mediaPublicMode=true` and `KRC_MEDIA_COBALT_API_KEY` is not wired. A regression test also verifies that the Cobalt retriever sends `Authorization: Api-Key <configured-key>`.

## Next step

Securely wire an existing or newly added Cobalt API key into the VoiceBridge Render environment without exposing the secret in chat and without replacing an unknown existing Cobalt key database. After wiring: exact deployment of the hardened candidate, health check, bounded YouTube canary, Neon delta verification, then Instagram/Facebook/Telegram canaries.
