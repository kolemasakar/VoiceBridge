# KRC MEDIA Cross-Route Isolation Hardening

Status: LIVE_ACCEPTED
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

Defense-in-depth negative routing matrix for the accepted MEDIA BETA inputs:
- YouTube;
- Instagram;
- Facebook;
- Telegram;
- local current-conversation attachment.

The purpose was to ensure that a foreign platform cannot enter another platform's active endpoint or bypass the accepted provider and consent policy.

## Implementation

Implementation commit:

`cd8336c568df510beb8a3a8b4488b7e8ac8cd024`

Changed implementation surface:
- `src/cloud/src/managed_media_http.ts`;
- `src/cloud/tests/managed_media_cross_route_isolation.test.ts`.

The generic Supadata lookup path now rejects Facebook and Telegram before `service.lookup` is reached:
- Facebook -> `FACEBOOK_FREE_RETRIEVAL_REQUIRED`;
- Telegram -> `TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED`.

The dedicated Telegram endpoint now rejects Facebook, Instagram, and YouTube before `service.startTelegram` is reached:
- error -> `TELEGRAM_MEDIA_URL_REQUIRED`.

The dedicated Facebook endpoint now rejects Telegram, Instagram, and YouTube before `service.startFacebookFallback` is reached:
- error -> `MEDIA_AI_SOURCE_NOT_SUPPORTED`.

The attachment parser continues to reject URL injection and literal placeholder input before `service.startAttachment` is reached.

Existing generic preflight and native-start protections remain unchanged:
- Facebook cannot enter generic Supadata native preflight/start;
- Telegram cannot enter generic Supadata native preflight/start.

## Static regression

Temporary hardening workflow run:

`33259019279`

Result: SUCCESS.

The full cloud build/test suite passed before the implementation commit was pushed.

The negative matrix regression uses a service object whose provider/store entry methods fail if reached. All negative matrix requests were rejected before those methods were called.

## Isolated Render live smoke

Live smoke run:

`33259149464`

Result: SUCCESS.

Exact runtime deployed:

`cd8336c568df510beb8a3a8b4488b7e8ac8cd024`

Verified:
- isolated Render service target and feature branch: PASS;
- active durable-store target remains protected Neon PostgreSQL: PASS;
- managed capability remains configured and restart-resilient: PASS;
- Facebook active provider remains free Cobalt with no automatic paid retrieval: PASS;
- Telegram active provider remains `telegram_public_web` with retrieval credits 0: PASS;
- local attachment retrieval provider remains `openai_attachment`: PASS;
- generic Facebook/TG preflight isolation: PASS;
- generic Facebook/TG lookup isolation: PASS;
- generic Facebook/TG native-start isolation: PASS;
- Telegram endpoint rejects Facebook/Instagram/YouTube: PASS;
- Facebook endpoint rejects Telegram/Instagram/YouTube: PASS;
- attachment URL injection and literal placeholder rejected: PASS.

The live smoke did not call the active Cobalt retrieval route, Telegram retrieval route, Supadata transcript work, AssemblyAI STT, or attachment download/transcription. The tested requests terminated at HTTP routing/parser boundaries before the corresponding provider or durable-store service methods.

## Resource boundary

This acceptance did not:
- spend Supadata credits;
- start AssemblyAI STT;
- start Cobalt retrieval;
- start Telegram media retrieval;
- start local attachment transcription;
- request a database write;
- modify Render environment variables;
- change the Neon target;
- delete the retained Render PostgreSQL rollback database;
- merge PR #28;
- touch VoiceBridge `main`;
- authorize external or public rollout.

The temporary live-smoke workflow was removed after successful acceptance.

## Current gate

```text
GENERIC_FACEBOOK_PREFLIGHT: ISOLATED
GENERIC_FACEBOOK_LOOKUP: ISOLATED
GENERIC_FACEBOOK_NATIVE_START: ISOLATED
GENERIC_TELEGRAM_PREFLIGHT: ISOLATED
GENERIC_TELEGRAM_LOOKUP: ISOLATED
GENERIC_TELEGRAM_NATIVE_START: ISOLATED
TELEGRAM_FOREIGN_PLATFORM_INGRESS: BLOCKED
FACEBOOK_FOREIGN_PLATFORM_INGRESS: BLOCKED
ATTACHMENT_URL_INJECTION: BLOCKED
PROVIDER_CONSUMING_WORK_IN_ACCEPTANCE: NONE
NEON_TARGET: UNCHANGED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```
