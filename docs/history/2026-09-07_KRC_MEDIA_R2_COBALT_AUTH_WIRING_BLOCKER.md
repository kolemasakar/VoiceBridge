# KRC MEDIA R2 Cobalt auth wiring blocker

Дата: 2026-09-07
Статус: R2 LIVE CANARY BLOCKED / FAIL-CLOSED / ZERO PROVIDER CHARGE

## Контекст

R2 Cobalt candidate `5003689ad2fe4c850d47dc7777c50470820b0bff` був розгорнутий на `voicebridge-krc-media-beta-kolemasakar`. Перший bounded YouTube canary для `https://www.youtube.com/watch?v=5i-4Pk5Idb4` дійшов до нового `cobalt_retrieval_stt` маршруту, але завершився `FAILED` до запуску AssemblyAI.

Durable job state зафіксував:

- `provider_mode=cobalt_retrieval_stt`;
- `retrieval_provider=cobalt`;
- `free_retrieval_error_code=COBALT_PUBLIC_MEDIA_INVALID_RESPONSE`;
- `credits_charged=0`;
- `retrieval_credits_charged=0`;
- `stt_seconds_charged=0`;
- `credit_charge_uncertain=false`.

## Bounded live probe

Для діагностики був одноразово доданий GitHub Actions probe без STT і без переходу за media/tunnel URL.

Run: `34132438781`
Commit: `96e52a416218df168d6afc0f4e25e11028d5160f`

Результат:

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

Cobalt startup logs у цей самий період підтвердили `api keys loaded successfully!`.

## Висновок

Self-hosted Cobalt живий, повертає валідний JSON і має увімкнену API-key authentication. Підтверджений live blocker: VoiceBridge не має робочого `KRC_MEDIA_COBALT_API_KEY` для цього захищеного Cobalt instance.

Початковий `COBALT_PUBLIC_MEDIA_INVALID_RESPONSE` не використовується як доказ конкретної причини cold-start/edge відповіді, оскільки raw body першої невдалої відповіді не був збережений. Після прогріву підтверджений блокер є `error.api.auth.key.missing`.

## Safety invariant

Не послаблювати Cobalt authentication для обходу blocker:

```text
API_AUTH_REQUIRED stays enabled
missing/invalid Cobalt key -> MEDIA unavailable/fails closed
Core KRC -> remains available
paid retrieval fallback -> none
AssemblyAI must not start before successful Cobalt retrieval
```

## Repository hardening

Public runtime factory тепер повинен відмовлятися стартувати, якщо `mediaPublicMode=true` і `KRC_MEDIA_COBALT_API_KEY` не підключений. Regression test також перевіряє, що Cobalt retriever надсилає `Authorization: Api-Key <configured-key>`.

## Наступний крок

Securely wire an existing or newly added Cobalt API key into VoiceBridge Render environment without exposing the secret in chat and without replacing an unknown existing Cobalt key database. Після wiring: exact deployment of the hardened candidate, health check, bounded YouTube canary, Neon delta verification, then Instagram/Facebook/Telegram canaries.
