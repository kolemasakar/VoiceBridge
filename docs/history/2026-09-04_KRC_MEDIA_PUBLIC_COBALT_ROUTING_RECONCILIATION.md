# KRC MEDIA public YouTube/Instagram Cobalt routing reconciliation

Date: 2026-09-04
Status: REPOSITORY_ACCEPTED / VALIDATE_PASS / NO_DEPLOYMENT / NO_PROVIDER_CONSUMING_CANARY

## Decision implemented

The public MEDIA candidate no longer requires Supadata for YouTube or Instagram.

Public free-only routing target:

```text
YouTube   -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Instagram -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Facebook  -> self-hosted Cobalt -> AssemblyAI STT -> durable KRCM
Telegram  -> public web retrieval -> AssemblyAI STT -> durable KRCM
```

Supadata remains only as historical/private managed-native compatibility code. It is not activated by `KRC_MEDIA_PUBLIC_MODE` after this patch.

No paid retrieval fallback is added. ScrapeCreators remains forbidden in public free-tier mode.

## Why reconciliation was required

The earlier owner-only YouTube path using Supadata was genuinely implemented and accepted for private beta. However, permanent public reliance on Supadata had not been separately validated as the final free-only architecture.

After the first R2 live promotion, authenticated YouTube canary attempts failed closed around the Supadata public/free-tier dependency. A temporary plan-label remediation did not produce a successful public YouTube canary.

Rather than weakening free-only controls or enabling paid behavior, the architecture was reconciled around the already-deployed self-hosted Cobalt retrieval component.

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

The public preflight reports zero retrieval credits and no Supadata credit-consent requirement. The transcription route accepts public YouTube/Instagram requests without Supadata consent fields.

Cobalt is requested with:

```text
downloadMode=audio
audioFormat=mp3
disableMetadata=true
```

Initial Instagram public scope fails closed on multi-asset picker responses instead of selecting media implicitly.

Durable KRCM storage, duplicate reuse, STT quota reservation, provider-cleanup reporting and Action bearer authentication are retained.

## Failure policy

```text
Cobalt failure -> MEDIA FAILED/unavailable
AssemblyAI unavailable/quota denied -> MEDIA FAILED/unavailable
paid retrieval fallback -> NONE
paid STT fallback -> NONE
Supadata automatic public fallback -> NONE
Core KRC -> unaffected
```

## Exact repository acceptance

Branch:

`agent/krc-media-gemini-migration`

Accepted repository candidate:

`4384b8dc8ef949ded7859495808b7f138eb8244d`

Commit:

`R2 public media: route YouTube and Instagram through Cobalt`

Validate:

```text
run: 33916332270
conclusion: SUCCESS
repository-docs: PASS
browser-extension: PASS
krc-image-parity: PASS
cloud: PASS
cloud tests: 239 passed / 0 failed
```

New regression coverage confirms:

```text
public MEDIA config no longer requires Supadata
Cobalt audio mode for YouTube/Instagram
zero retrieval-credit accounting
fail-closed Cobalt failure before STT
duplicate job reuse without repeated retrieval/STT
YouTube public Action start without Supadata credit consent
```

## Current live versus candidate

Read-only Render recheck after repository acceptance:

```text
Render service: voicebridge-krc-media-beta-kolemasakar
service id: srv-da1kic5bedkc73d6fk60
current live deploy: dep-dadfu1mq1p3s73dgv5m0
current live commit: 7c8806713ea75b0809b638f102e31d8d3af86150
current live status: live
```

Therefore:

```text
LIVE:                    7c8806713ea75b0809b638f102e31d8d3af86150
REPOSITORY CANDIDATE:    4384b8dc8ef949ded7859495808b7f138eb8244d
IMMEDIATE ROLLBACK:      7c8806713ea75b0809b638f102e31d8d3af86150
HISTORICAL R2 BASELINE:  2f0f02769dbdf2e8240e6b08867ecef2faaede16
```

The new Cobalt public route is not live yet.

## Cross-repository recovery authority

KRC product/release repository:

`kolemasakar/K_Research_Critic`

Canonical recovery checkpoint:

`subprojects/media_beta/82_R2_PUBLIC_COBALT_RECONCILIATION_REPOSITORY_SYNC_2026_09_04.md`

Recovery pointer:

`docs/KRC_MEDIA_BETA_RECOVERY_POINTER.md`

## Release boundary

This repository state does not authorize or perform:

- Render deployment or environment mutation;
- Neon mutation;
- provider-consuming canary;
- Gemini prerecorded activation;
- public GPT Builder update;
- public rollout;
- PR #45 merge.

The next state-changing step is an exact deployment of the accepted Cobalt candidate followed by bounded authenticated YouTube/Instagram/Facebook/Telegram canaries and Core-isolation verification. That step requires fresh explicit owner authorization.
