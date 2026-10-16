# YouTube admission and provider billing visibility

Owner-authorized test-only implementation, 2026-10-16.

The Gemini YouTube start route previously bypassed public admission because only the managed route prefix was recognized. Both start routes now share the existing process-local rate, spacing and concurrency controller. Dedicated E1–E4 tokens are included in admission authentication; existing handler platform authorization remains responsible for rejecting tokens on unsupported routes. Read-only calls still do not consume provider admission budget.

Public job responses from Gemini, Cobalt and the managed service now expose:
- provider_billing_verified=false
- provider_cost_usd=null
- provider_free_balance_usd=null

Legacy credits_charged, credits_remaining_estimate and credit_charge_uncertain remain unchanged for compatibility. They describe internal retrieval-credit accounting, not provider dollars, an invoice, free-grant balance or verified Free Tier entitlement. These new fields are normalized at response time, including old stored jobs.

Tests cover E1 sharing concurrency with managed starts, E1 burst throttling, read-only availability during a held start, idempotent lease release, and Gemini completed-result unknown billing fields. All provider work in tests uses fixtures.

Account verification: available tool discovery and plugin search found no sufficient Google Billing or AssemblyAI account-billing reader. No account tariff, key-project linkage, remaining grant, payment method or auto-pay state was verified. No secrets or financial settings were read or changed. Required owner evidence can contain only: Google project Free status for the deployed key; AssemblyAI Free status, remaining free credits and auto-pay off. Never transmit key or card values.

Limits: this patch does not add daily YouTube-hour/token accounting, distributed admission, a billing-entitlement service or model tariff allowlist. It does not resolve Gemini provider503. These remain separate audit items. No production deploy authorized by this implementation. Instagram PAUSED; Telegram LIVE BLOCKED; PUBLIC HOLD; no live provider starts in this change.

Validation: TypeScript build PASS; targeted tests30/30 PASS; full regression285/285 PASS,no failures/skips (49.11s); git diff --check PASS.
