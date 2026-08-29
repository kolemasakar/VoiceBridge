# KRC MEDIA Neon Migration Plan

Status: PRE_CUTOVER_READY_AWAITING_CUTOVER_APPROVAL
Updated: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Objective

Move the isolated KRC MEDIA BETA durable PostgreSQL store from Render PostgreSQL to Neon Free PostgreSQL without changing the application data model or MEDIA BETA behavior.

This document records the completed pre-provisioning audit, PostgreSQL 18 dry run, Neon provisioning, verified restore, independent post-restore validation, and fresh pre-cutover verification. It does not authorize a Render environment change, database cutover, PR merge, source database deletion, external rollout, or public promotion.

## 2. Source authority and baseline

Authoritative source until a separately approved cutover:
- Render service: voicebridge-krc-media-beta-kolemasakar
- Render database: voicebridge-krc-media-beta-db
- Persistence variable: KRC_MEDIA_DATABASE_URL
- Durable store type: postgres
- PostgreSQL version observed: 18.4
- Database size observed during audit: 8,394,431 bytes, about 8 MiB
- public.krc_managed_media_jobs: 1 row
- public.krc_media_client_jobs: 0 rows
- public.krc_media_stt_charges: 0 rows
- Managed job state observed: COMPLETED = 1
- Total recorded STT charge seconds: 0

The Render database remains authoritative until cutover is explicitly approved, completed, and verified.

## 3. Required PostgreSQL surface

Required relations:
- public.krc_managed_media_jobs
- public.krc_media_client_jobs
- public.krc_media_stt_charges

Required PostgreSQL features include standard text, jsonb, timestamptz, date, integer, primary keys, unique/check constraints, btree indexes, and extension metadata required by the dump.

The persistence implementation uses standard PostgreSQL and psql. No Render-specific SQL dependency was identified.

## 4. Migration strategy

Canonical path:

Render PostgreSQL -> owner-authenticated read-only pg_dump custom archive -> PostgreSQL 18 restore -> structural/data verification -> Neon PostgreSQL 18 -> exact verification -> separately approved KRC_MEDIA_DATABASE_URL cutover

The source database is small and owner-only beta operation permits a controlled migration window. Render PostgreSQL is retained as the rollback source.

## 5. Completed PostgreSQL 18 dry run

Direct GitHub-hosted runner connections to the Render external PostgreSQL endpoint repeatedly failed with SSL connection closure and were rejected as an unreliable migration transport.

The accepted transport uses a temporary owner-authenticated internal export handler on the isolated Render MEDIA BETA service. It uses the service-side PostgreSQL connection and enforces source-side read-only PostgreSQL sessions. The handler is removed immediately after use.

Authoritative dry run:
- commit: 159bff89988f464a989d426f60628a2fa92ba41e
- workflow: KRC MEDIA Neon Internal Dry Run Live
- run ID: 33045161728
- result: SUCCESS
- catalog structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- restored combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- restored rows: 1 / 0 / 0

Reusable verifier:
- scripts/krc-media-neon-fingerprint.sql

## 6. Dry-run runtime cleanup

Cleanup commit:
- 92fd4190573c14f7239a0e57a30e34529725a03b

Cleanup workflow run:
- 33045297107
- result: SUCCESS

Verified:
- temporary export route removed
- temporary PostgreSQL 18 runtime packaging removed
- managed capability available
- mode = zero_client_managed_beta
- configured = true
- durable_store = postgres
- Render environment unchanged
- source database writes not requested

## 7. Neon provisioning - completed

Provisioned owner target:
- project: krc-media-beta-neon
- project ID: plain-snow-71973546
- organization: K-Research-Critic-Media
- plan: Free
- region: AWS Europe Central 1 (Frankfurt)
- database: krc_media_beta
- role: krc_media_beta_owner
- PostgreSQL major: 18
- storage limit observed: 512 MiB
- compute range observed: 0.25 to 2 CU
- history retention observed: 6 hours
- branch: production

Migration connection policy:
- direct, non-pooled connection
- TLS required
- credentials stored only in protected secret/environment configuration
- no connection string or password committed to source or documentation

The target public schema was verified to contain 0 tables before restore.

## 8. Verified Neon restore - completed

Owner-approved restore workflow:
- workflow: KRC MEDIA Neon Restore Verify
- run ID: 33246600421
- workflow commit: 0040f95af5c1bda02f78649af668d5af048543ec
- result: SUCCESS

Verified sequence:
- Neon target PostgreSQL 18 and empty public schema: PASS
- isolated Render target: PASS
- temporary read-only export runtime: PASS
- owner-authenticated source fingerprint and pg_dump: PASS
- source snapshot restored into ephemeral PostgreSQL 18: PASS
- source structural/logical self-verification: PASS
- non-terminal managed jobs in source snapshot: 0
- restore into Neon PostgreSQL 18: PASS
- exact source/Neon structural and logical fingerprint comparison: PASS
- temporary export runtime removal: PASS
- normal managed capability after cleanup: PASS
- runner temporary material cleanup: PASS

Restore evidence:
- dump bytes: 8701
- dump SHA256: 58157d2f208b8d8f9c1728e5a755a0bf5521ca78ae19271821898f679c02a84e
- catalog structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- Neon combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- row counts: 1 / 0 / 0

Independent read-only post-restore verification:
- workflow: KRC MEDIA Neon Post Restore Verify
- run ID: 33246741240
- workflow commit: 58f783de14a1b5149b094969c88d4067b6bb988d
- result: SUCCESS
- PostgreSQL major: 18
- structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- row counts: 1 / 0 / 0

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_RESTORE_VERIFY_2026-08-29.md

## 9. Fresh pre-cutover verification - completed

Owner approved cutover preparation without authorizing the cutover itself.

Verification workflow:
- workflow: KRC MEDIA Neon Precutover Verify
- run ID: 33247095949
- workflow commit: 152a9ba9cf4fb1f743da7b4e03578ea3fc1aaa86
- result: SUCCESS

Fresh source evidence:
- dump bytes: 8701
- dump SHA256: a52547159e131d871aa1999414179698f6796b4ffc072601ea2e1f455b0e7fc5
- source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- non-terminal managed jobs: 0
- row counts managed/client/stt: 1 / 0 / 0

Existing Neon copy:
- combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5

Result:
- fresh source/Neon exact structural and logical equality: PASS
- source baseline changed since verified restore: NO
- Neon refresh required before cutover: NO
- normal Render runtime restored after check: PASS
- temporary export route removed: PASS
- Render environment changed: NO
- KRC_MEDIA_DATABASE_URL changed: NO
- database cutover performed: NO

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_PRECUTOVER_VERIFY_2026-08-29.md

## 10. Security and non-cutover guarantees

Confirmed boundaries:
- Render KRC_MEDIA_DATABASE_URL changed: NO
- Render environment changed by migration/pre-cutover workflows: NO
- database cutover performed: NO
- source Render PostgreSQL writes requested: NO
- raw pg_dump uploaded as Actions artifact: NO
- source Render PostgreSQL deleted: NO
- PR #28 merged: NO
- main modified: NO
- paid Facebook fallback activated: NO
- ScrapeCreators activated: NO

The normal isolated Render MEDIA BETA runtime is active and the temporary export route is absent.

## 11. Cutover readiness rule

The fresh pre-cutover check passed and Neon still exactly matches the authoritative Render source.

Before executing cutover:
1. Keep RELEASE_HOLD_OWNER_TESTING active.
2. Do not merge PR #28 or touch main.
3. Keep owner MEDIA activity paused from the decision point through cutover verification.
4. If any new MEDIA job is created before cutover, stop and repeat the fresh source/Neon equality check.
5. Preserve the current Render database and protected Render KRC_MEDIA_DATABASE_URL for rollback.
6. Obtain separate explicit owner authorization before changing KRC_MEDIA_DATABASE_URL.

## 12. Planned cutover - not authorized

Only after explicit owner approval:
1. Declare the owner-only migration window.
2. Confirm no new or non-terminal MEDIA BETA jobs exist.
3. Preserve the previous Render KRC_MEDIA_DATABASE_URL securely without printing it.
4. Change only KRC_MEDIA_DATABASE_URL on the isolated KRC MEDIA BETA Render service to the verified Neon direct TLS connection.
5. Restart/redeploy only that isolated service if required.
6. Verify managed capability and durable store health.
7. Verify the existing durable state can still be read.
8. Execute a controlled owner-only live media job and verify create/process/status/segments/post-restart durability.
9. Verify idempotency after restart/redeploy.
10. Keep old Render PostgreSQL intact during the rollback observation window.

## 13. Rollback triggers

Rollback immediately if after cutover:
- managed capability is not configured
- durable_store is not postgres
- persistence initialization fails
- existing durable state cannot be read
- new durable writes fail
- source/target verification unexpectedly diverges
- restart/redeploy durability fails
- idempotency behavior changes
- database connectivity is materially unstable

## 14. Rollback procedure

1. Stop new owner test activity.
2. Restore the previous protected Render KRC_MEDIA_DATABASE_URL value.
3. Restart/redeploy only the isolated KRC MEDIA BETA service if needed.
4. Verify capability and durable state against the original Render PostgreSQL database.
5. Keep Neon intact for diagnosis.
6. If writes occurred on Neon after cutover, do not automatically merge them back; reconcile explicitly.

## 15. Security and release boundaries

- Never print Render or Neon database URLs.
- Never commit database credentials.
- Never upload raw pg_dump archives as Actions artifacts.
- Never upload transcript payloads or segments as migration diagnostics.
- Logs may contain sanitized hashes, row counts, schema metadata, and non-secret status values only.
- Do not delete Render PostgreSQL until migration validation and rollback observation are complete and a separate irreversible-operation approval is given.
- Do not activate paid services without explicit approval.
- Do not change MEDIA BETA retrieval behavior as part of this database migration.

## 16. Current gate

NEON_MIGRATION_PLAN: PASS
POSTGRESQL_18_DRY_RUN: PASS
NEON_PROVISIONING: COMPLETE
NEON_TARGET_RESTORE: PASS
NEON_POST_RESTORE_VERIFY: PASS
CUTOVER_PREPARATION: PASS
FRESH_SOURCE_SNAPSHOT: PASS
NON_TERMINAL_JOBS: 0
SOURCE_NEON_EXACT_MATCH: PASS
NEON_REFRESH_REQUIRED: NO
TEMP_EXPORT_RUNTIME_REMOVED: VERIFIED
RENDER_ENV_CHANGE: NONE
KRC_MEDIA_DATABASE_URL_CHANGE: NONE
DATABASE_CUTOVER: NOT_STARTED
SOURCE_RENDER_DATABASE: AUTHORITATIVE
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next authorized decision point: separately approve the database cutover. Cutover preparation is complete; it does not authorize changing KRC_MEDIA_DATABASE_URL.
