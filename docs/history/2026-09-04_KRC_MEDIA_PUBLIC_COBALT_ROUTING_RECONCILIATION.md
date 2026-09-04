# KRC MEDIA public YouTube/Instagram Cobalt routing reconciliation

Date: 2026-09-04
Status: REPOSITORY_PATCH / NO_DEPLOYMENT / NO_PROVIDER_CONSUMING_CANARY

## Decision implemented in this patch

The public MEDIA candidate no longer requires Supadata for YouTube or Instagram.

Public free-only routing target:

```text
YouTube   -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Instagram -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Facebook  -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Telegram  -> public web retrieval -> AssemblyAI STT -> durable KRCM
```

Supadata remains only as historical/private managed-native code. It is not activated by `KRC_MEDIA_PUBLIC_MODE` after this patch.

No paid retrieval fallback is added. ScrapeCreators remains forbidden in public free-tier mode.

## Rationale

The earlier owner-only YouTube path using Supadata was accepted for private beta, but the permanent public free-media architecture had not been separately accepted. Live R2 canary attempts exposed Supadata plan/account coupling as a public deployment blocker.

The existing self-hosted Cobalt service is already part of the accepted Facebook route. Upstream Cobalt supports YouTube and Instagram media/audio retrieval, so the public candidate can reuse the same zero-retrieval-credit infrastructure rather than requiring a separate managed transcript provider.

## Repository behavior

`KRC_MEDIA_PUBLIC_MODE=true` now requires:

```text
KRC_MEDIA_ACTION_TOKEN
KRC_MEDIA_FREE_TIER_ONLY=true
KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY=true
ASSEMBLYAI_API_KEY
KRC_MEDIA_COBALT_ENDPOINT
```

It no longer requires `SUPADATA_API_KEY`.

A public-mode Cobalt handler owns the generic YouTube/Instagram managed routes before the legacy managed handler:

```text
POST /api/v1/media/managed/preflight
POST /api/v1/media/managed/lookup
POST /api/v1/media/managed/transcriptions
GET  /api/v1/media/managed/transcriptions/{job_id}
GET  /api/v1/media/managed/transcriptions/{job_id}/segments
```

The public preflight reports zero retrieval credits and no Supadata credit consent requirement. The transcription route accepts the public YouTube/Instagram request without Supadata consent fields.

Cobalt is requested with `downloadMode=audio`, `audioFormat=mp3`, and no provider metadata embedding. Initial Instagram public scope fails closed on multi-asset picker responses instead of selecting media implicitly.

Durable KRCM storage, duplicate reuse, STT quota reservation, provider cleanup reporting and Action bearer authentication are retained.

## Failure policy

```text
Cobalt failure -> MEDIA FAILED/unavailable
AssemblyAI unavailable/quota denied -> MEDIA FAILED/unavailable
paid retrieval fallback -> NONE
paid STT fallback -> NONE
Core KRC -> unaffected
```

There is no automatic Supadata fallback from the public Cobalt route.

## Release boundary

This patch is repository-only. It does not authorize or perform:

- Render deployment or environment mutation;
- Neon mutation;
- provider-consuming canary;
- Gemini prerecorded activation;
- GPT Builder/Action schema update;
- public rollout.

A bounded YouTube/Instagram Cobalt live canary is required after CI acceptance and a separate deployment authorization.
