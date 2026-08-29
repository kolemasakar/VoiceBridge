# KRC MEDIA Privacy / Cleanup Negative Matrix Acceptance

Date: 2026-08-29
Status: ACCEPTED
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

This owner-testing block verifies privacy, signed-attachment URL handling, public job projection, provider cleanup-state reporting, durable persistence boundaries, and retained cleanup guards for AssemblyAI-backed prerecorded MEDIA BETA paths.

No live provider-consuming media operation was required.

## Accepted regression coverage

Retained regression file:

`src/cloud/tests/managed_media_privacy_cleanup.test.ts`

Accepted assertions:
- an OpenAI attachment signed download URL is passed only to the active attachment pipeline and is not persisted in the durable managed-media record;
- the raw server owner admission code is never persisted or returned in the public managed job view;
- attachment public job projection does not expose `requestKey`, `accessCodeDigest`, signed download URL, or transcript text;
- the durable attachment record uses `attachment://local-media` instead of persisting the signed attachment transport URL;
- canonical transcript segments remain persisted as the intended evidence payload;
- a provider cleanup failure remains explicitly represented as `provider_data_deleted=false` rather than being silently upgraded to deleted;
- attachment, Facebook, Telegram, and legacy KRCC AssemblyAI paths retain provider-delete cleanup guards;
- attachment, Facebook, and legacy KRCC local temporary media paths retain local filesystem cleanup guards;
- the durable schema does not contain attachment `download_link` or raw `beta_access_code` fields, while access ownership remains digest-based.

## Validation

VoiceBridge implementation/test commit:

`9d8a3e89823a6228fc76046bc5d9ffe378b79bf0`

Workflow run `33266496940`: SUCCESS.

Full cloud result:

```text
tests: 162
pass: 162
fail: 0
```

The four new privacy/cleanup tests all passed:
- attachment signed URL and raw owner admission are never persisted or exposed in public job view;
- provider cleanup failure remains explicit instead of being silently reported as deleted;
- AssemblyAI media paths retain provider-delete and local-temp cleanup guards;
- durable schema does not persist attachment download links or raw beta access codes.

The existing Supadata diagnostic regression also remained green and continued to expose response shape without transcript text.

## Resource / safety accounting

- AssemblyAI provider-consuming work: NONE;
- Supadata provider-consuming work: NONE;
- Facebook paid retrieval: NONE;
- ScrapeCreators activation: NONE;
- Render environment mutation: NONE;
- Neon data mutation requested: NONE;
- secrets printed to logs: NONE;
- signed attachment URL printed to logs: NONE;
- release-gate transition: NONE.

## Release and infrastructure state

- active durable store: Neon PostgreSQL 18;
- original Render PostgreSQL: retained; deletion NOT AUTHORIZED;
- Facebook automatic paid fallback: false;
- ScrapeCreators: inactive/reserve-only;
- VoiceBridge PR #28: remains release-gated;
- KRC PR #8: remains release-gated;
- merge to main: HOLD;
- production promotion: HOLD;
- external testers: HOLD;
- public/Store rollout: HOLD.

This acceptance authorizes no provider migration and does not activate the separate pending Gemini 3.5 Transcribe transition plan. Owner testing continues under `RELEASE_HOLD_OWNER_TESTING`.
