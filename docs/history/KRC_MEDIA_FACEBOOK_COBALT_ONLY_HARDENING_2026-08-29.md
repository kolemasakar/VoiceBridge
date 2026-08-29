# KRC MEDIA Facebook Cobalt-Only Server Hardening

Status: PASS
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

## Validation

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

## Resource and release boundary

This code/test hardening did not:
- start a live media/transcription job;
- spend Supadata or AssemblyAI resources;
- call Facebook retrieval providers;
- change Render environment variables;
- mutate Neon data;
- delete the original Render PostgreSQL rollback database;
- merge PR #28;
- touch VoiceBridge main;
- authorize production/public rollout.

Next runtime step: deploy only the isolated MEDIA BETA service at an exact hardened feature-branch head and perform a no-provider-spend policy smoke before accepting the hardening as live runtime state.
