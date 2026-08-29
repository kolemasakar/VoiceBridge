# KRC MEDIA Facebook Cobalt-Only Server Hardening

Status: LIVE_ACCEPTED
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Harden the isolated MEDIA BETA server boundary so a new Facebook request cannot enter the generic Supadata native/AI path. The accepted active Facebook route remains free Cobalt only:

Cobalt success -> AssemblyAI -> durable KRCM
Cobalt failure -> unavailable -> STOP

ScrapeCreators remains inactive/reserve-only and is not an active fallback.

## Finding

The Builder policy already routed Facebook through the dedicated managed Facebook endpoint and forbade paid/Supadata generation fallback. The backend still exposed generic Supadata native endpoints that could technically accept a Facebook URL if called directly, and the managed capability object still advertised Facebook AI fallback as active.

This was a defense-in-depth gap between the accepted product policy and the HTTP boundary, not evidence that the accepted Builder runtime had automatically used the forbidden route.

## Hardening

Active HTTP behavior now rejects Facebook on:
- generic managed native preflight;
- generic managed native transcription start.

Both stops occur before the generic Supadata service is called.

Capability advertisement now reports:
- facebook_ai_fallback = false;
- facebook_ai_requires_duration_metadata = false;
- facebook_ai_metadata_credits = 0;
- facebook_retrieval_stt_fallback remains true;
- facebook_automatic_paid_retrieval remains false.

The dedicated Facebook Cobalt -> AssemblyAI endpoint remains unchanged.

Historical job-specific compatibility surfaces were not removed in this change. They remain outside the active Builder route and cannot be opened by a new Facebook request through the hardened generic HTTP intake.

## Regression coverage

Added `src/cloud/tests/active_facebook_route_policy.test.ts` to assert:
- generic Facebook preflight is rejected at the HTTP boundary;
- generic Facebook native start is rejected at the HTTP boundary;
- the generic service methods are not reached;
- capability does not advertise Facebook AI generation as active;
- the active Facebook retrieval/STT capability remains present;
- automatic paid Facebook retrieval remains disabled.

Existing Facebook Cobalt terminal-unavailable and no-automatic-paid-fallback tests remain in place.

## Source validation

Temporary hardening workflow:
- final successful run: 33257066138
- result: SUCCESS
- full `src/cloud` build and test suite: PASS
- tests: 134 total, 134 passed after current-policy expectations were synchronized

One preceding validation attempt correctly exposed a stale test expectation that still expected `facebook_ai_fallback = true`; it did not commit implementation changes. The expectation was updated to the accepted Cobalt-only policy and the complete suite then passed.

Net implementation diff from the pre-hardening closure head contains only:
- `src/cloud/src/managed_media_http.ts`;
- `src/cloud/tests/active_facebook_route_policy.test.ts`;
- `src/cloud/tests/managed_media_http.test.ts`;
- `src/cloud/tests/managed_media_instagram.test.ts`.

The temporary hardening workflow is absent from the final tree.

## Live isolated-runtime acceptance

No-provider-spend smoke:
- workflow: `KRC MEDIA Facebook Hardening Live Smoke`
- run ID: 33257262574
- result: SUCCESS
- exact hardened runtime deployed to isolated service: PASS
- active durable store remained protected Neon PostgreSQL: PASS
- managed capability remained configured/restart-resilient: PASS
- facebook_free_retrieval_provider = cobalt: PASS
- facebook_ai_fallback = false: PASS
- facebook_ai_requires_duration_metadata = false: PASS
- facebook_ai_metadata_credits = 0: PASS
- facebook_automatic_paid_retrieval = false: PASS
- generic Facebook Supadata preflight rejected with `FACEBOOK_FREE_RETRIEVAL_REQUIRED`: PASS
- generic Facebook Supadata transcription start rejected with `FACEBOOK_FREE_RETRIEVAL_REQUIRED`: PASS

The smoke deliberately did not invoke the dedicated Facebook retrieval endpoint. Therefore it did not start Cobalt, Supadata transcript generation, or AssemblyAI STT work and did not consume provider credits.

The temporary live-smoke workflow was removed immediately after the successful run.

## Resource and release boundary

This hardening and acceptance did not:
- start a live media/transcription job;
- spend Supadata or AssemblyAI resources;
- call Facebook retrieval providers during the acceptance smoke;
- change Render environment variables;
- mutate Neon data;
- delete the original Render PostgreSQL rollback database;
- merge PR #28;
- touch VoiceBridge main;
- authorize production/public rollout.

## Accepted state

FACEBOOK_COBALT_ONLY_SERVER_HARDENING: LIVE_ACCEPTED
ACTIVE_FACEBOOK_GENERIC_SUPADATA_INGRESS: BLOCKED
FACEBOOK_AI_FALLBACK_ADVERTISED: FALSE
FACEBOOK_AUTOMATIC_PAID_RETRIEVAL: FALSE
FACEBOOK_ACTIVE_ROUTE: COBALT_FREE_ONLY
RELEASE_HOLD_OWNER_TESTING: PRESERVED

No additional Builder update is required because the accepted Builder instructions already used only the dedicated Cobalt-first Facebook route and already forbade the blocked paths.
