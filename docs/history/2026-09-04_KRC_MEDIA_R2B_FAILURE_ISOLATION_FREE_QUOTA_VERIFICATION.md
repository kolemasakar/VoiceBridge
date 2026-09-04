# KRC MEDIA R2-B - FAILURE ISOLATION AND FREE-QUOTA VERIFICATION

Дата перевірки: 2026-09-04

## Scope

R2-B validates the future public KRC MEDIA path without deployment. The supported public-video boundary remains:

- YouTube
- Telegram
- Instagram
- Facebook

The operating rule is free-only. If a required free provider is unavailable or its free allowance is exhausted, MEDIA must fail closed. No paid retrieval, paid STT fallback, or provider cutover is permitted automatically.

## Current official provider terms verified on 2026-09-04

### Supadata

Official pricing source: https://supadata.ai/pricing

Verified Free plan terms:

- 100 credits per month;
- rate limit 1 request/second;
- native transcript = 1 credit;
- generated transcript = 2 credits per minute;
- Free has no Auto Recharge.

R2-A runtime protection checks the Supadata account before a credit-consuming operation and rejects a non-Free plan or a plan with a credit ceiling above the accepted Free ceiling. Exhausted free credits terminate the MEDIA operation with no paid continuation.

### AssemblyAI

Official free-tier source: https://support.assemblyai.com/articles/5370767329-can-i-sign-up-for-free

Official account/billing documentation: https://www.assemblyai.com/docs/faq/how-to-get-your-api-key

Official current Universal-2 pricing reference: https://www.assemblyai.com/blog/how-to-choose-the-best-speech-to-text-api-for-your-product

Verified terms:

- a Free account receives a finite $50 free-credit pool for supported Speech AI usage;
- the free credits do not represent a daily seconds quota;
- once the free balance is exhausted, continued API usage requires an account upgrade/funding;
- Universal-2 prerecorded STT is currently listed at $0.15/hour, billed per second;
- failed transcripts are not charged according to AssemblyAI billing documentation.

Important correction to interpretation: `MEDIA_DAILY_STT_SECONDS=7200` / the public 7200-second daily ceiling is a KRC project safety cap. It is deliberately conservative but is NOT the AssemblyAI provider free-tier quota.

The application cannot independently prove from the public AssemblyAI API documentation that billing/autopay is disabled or read the account's remaining dollar balance. Therefore public promotion still requires operator evidence that the KRC AssemblyAI account remains on Free/trial-only usage and cannot auto-spend paid funds. `KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY=true` is an operator attestation, not provider-side billing proof.

## Free-only routing policy

- YouTube: Supadata Free native transcript path; if free credits are exhausted -> unavailable.
- Instagram: Supadata Free native transcript; AI generation is allowed only within remaining Free credits and explicit consent; no paid continuation.
- Facebook: Cobalt self-hosted retrieval -> AssemblyAI Universal-2; Cobalt failure -> unavailable; ScrapeCreators is forbidden in public free-only mode.
- Telegram: public Telegram web retrieval -> AssemblyAI Universal-2; retrieval credits = 0; no login/cookies/bot token/paid retrieval fallback.
- Gemini prerecorded activation remains false.

## Failure-isolation matrix

Repository regression coverage now includes:

| Failure | Expected MEDIA result | Core expectation |
| --- | --- | --- |
| invalid Action bearer | 401 / fail closed | Core health unaffected |
| Supadata free credits exhausted | 429 / no provider continuation | Core health unaffected |
| Telegram public retrieval unavailable | MEDIA unavailable | Core health unaffected |
| Facebook Cobalt unavailable | MEDIA unavailable; no paid fallback | Core health unaffected |
| durable MEDIA store / quota ledger unavailable | fail before provider charge where determinable | Core health unaffected |
| unsupported media URL | reject before provider work | Core health unaffected |
| MEDIA rate/concurrency ceiling | 429 / retry later | Core health unaffected |

New acceptance test:

`src/cloud/tests/r2b_failure_isolation_runtime_matrix.test.ts`

Existing durable fail-closed coverage remains authoritative for provider-before-durable-state ordering:

`src/cloud/tests/managed_media_durable_fail_closed.test.ts`

Existing Facebook no-paid-fallback coverage remains authoritative:

- `src/cloud/tests/managed_facebook_fallback.test.ts`
- `src/cloud/tests/a9_facebook_no_automatic_paid_fallback.test.ts`
- `src/cloud/tests/active_facebook_route_policy.test.ts`

## R2-B disposition

Repository/code side may pass after canonical Validate succeeds.

Account-specific external evidence still required before permanent backend promotion:

- current AssemblyAI account is Free/trial-only;
- remaining AssemblyAI free balance is sufficient for the intended canary;
- no card-funded/autopay path can turn public KRC MEDIA usage into paid usage without a fresh owner authorization;
- current Supadata account reports Free and <=100 monthly credits (the runtime wrapper will also enforce this before provider usage).

No Render deployment, Render environment mutation, Neon mutation, VoiceBridge main merge, provider cutover, GPT Builder update, or public rollout is authorized by this checkpoint.
