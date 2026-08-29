# KRC MEDIA Route-Boundary Audit — Telegram / Local Attachment / Instagram

Status: STATIC_PASS_TELEGRAM_HARDENED
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

Owner-testing defense-in-depth audit of the remaining active MEDIA BETA input routes after the accepted Facebook Cobalt-only server hardening.

Audited routes:
- Telegram public post URL;
- one local current-conversation audio/video attachment;
- Instagram Reel/video post.

The audit began with source inspection and no-provider-spend regression checks. No live media retrieval or transcription job was started by this static phase.

## Telegram finding

The accepted Builder/runtime policy already used the dedicated Telegram public route:

`public Telegram post -> telegram_public_web -> trusted Telegram media -> AssemblyAI -> durable KRCM`

with zero retrieval credits and no login/cookies/session/bot token/paid fallback.

A defense-in-depth gap remained at the HTTP boundary: the generic Supadata native preflight and transcription endpoints could still accept a normalized Telegram URL if called directly. This was analogous to the previously closed Facebook generic-ingress gap.

The gap did not demonstrate that the accepted Builder route had used Supadata for Telegram. It meant the backend boundary was broader than the accepted active policy.

## Telegram hardening

Implementation commit:

`3d8691b77f061b2f9b9fc8d5b9a2fd04d65faf68`

New active behavior:
- generic managed Supadata preflight rejects Telegram with `TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED`;
- generic managed Supadata transcription start rejects Telegram with the same policy code;
- both rejections occur before the generic Supadata service methods are reached;
- dedicated `/api/v1/media/managed/telegram` behavior remains unchanged;
- capability remains `telegram_public_retrieval = true`;
- capability remains `telegram_retrieval_provider = telegram_public_web`;
- capability remains `telegram_retrieval_credits = 0`.

Regression file added:

`src/cloud/tests/active_telegram_route_policy.test.ts`

Temporary hardening workflow:
- successful run: `33257805945`;
- result: SUCCESS;
- full `src/cloud` build/test suite: PASS;
- temporary hardening workflows removed from the resulting implementation tree.

Net implementation diff from the accepted Facebook-hardening baseline contains only:
- `src/cloud/src/managed_media_http.ts`;
- `src/cloud/tests/active_telegram_route_policy.test.ts`.

## Local attachment audit

Result: PASS — no additional server hardening required in this audit.

Verified boundary:
- active HTTP intake is the attachment-specific endpoint;
- parser requires the runtime `openaiFileIdRefs` object form and exactly one file reference;
- stored request identity uses the attachment file identity and owner-access digest;
- retrieval provider is fixed to `openai_attachment`;
- retrieval credits are fixed to 0;
- downloader accepts HTTPS only;
- download host must be a real subdomain ending in `.oaiusercontent.com`;
- URL userinfo, explicit port, and fragment are rejected;
- redirects are blocked;
- declared/downloaded media class must match;
- download body is bounded to 32 MiB;
- AssemblyAI STT is the only active attachment transcription provider.

Existing regression coverage includes rejection of lookalike hosts, redirects, MIME mismatch, oversize content, malformed attachment placeholders, duplicate job replay, and zero retrieval credits.

No arbitrary external attachment URL route was identified.

## Instagram audit

Result: PASS — current generic managed Supadata route is intentional for Instagram and no additional boundary hardening is required.

Verified behavior:
- public Reel/video-post URL normalization remains restricted to supported Instagram forms;
- native Supadata work requires one-credit explicit consent;
- `automatic_ai_fallback = false` remains global;
- Instagram Reel AI generation is available only after native-unavailable state;
- AI work requires a separate preflight and separate explicit consent matching the current maximum credit ceiling;
- AI fallback is not enabled for arbitrary non-Reel media sources;
- duplicate/idempotency protections remain active.

This differs intentionally from Facebook and Telegram, whose accepted active routes are dedicated retrieval/STT pipelines and therefore must not enter the generic native Supadata path.

## Resource boundary

This static audit and Telegram hardening did not:
- start Cobalt retrieval;
- start Telegram public retrieval;
- start Supadata transcript work;
- start AssemblyAI STT;
- spend provider credits;
- modify Render environment variables;
- mutate Neon data;
- delete the retained Render PostgreSQL rollback database;
- merge PR #28;
- touch VoiceBridge main;
- authorize production/public rollout.

## Current gate

```text
TELEGRAM_GENERIC_SUPADATA_INGRESS: BLOCKED_IN_SOURCE
TELEGRAM_PUBLIC_ROUTE: PRESERVED
TELEGRAM_RETRIEVAL_CREDITS: 0
LOCAL_ATTACHMENT_BOUNDARY_AUDIT: PASS
INSTAGRAM_BOUNDARY_AUDIT: PASS
PROVIDER_CONSUMING_WORK_IN_STATIC_AUDIT: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

Next acceptance step: exact-head CI followed by an isolated Render no-provider-spend smoke that verifies the hardened Telegram generic-ingress rejection and unchanged capability/durable-store state before marking the Telegram hardening live-accepted.
