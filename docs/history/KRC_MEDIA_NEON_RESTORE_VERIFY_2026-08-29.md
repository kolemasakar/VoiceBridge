# KRC MEDIA Neon Restore Verification - 2026-08-29

Status: PASS
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the owner-approved restore of a verified read-only Render PostgreSQL snapshot into the provisioned Neon PostgreSQL 18 target, without changing the isolated Render service persistence configuration and without performing database cutover.

## Neon target

- Project: krc-media-beta-neon
- Region: AWS Europe Central 1 (Frankfurt)
- Database: krc_media_beta
- PostgreSQL major: 18
- Connection used for migration verification: direct, non-pooled, TLS required
- Target state before restore: public schema contained 0 tables

No Neon credential or connection string is stored in this document.

## Source snapshot and restore verification

Authoritative workflow:
- Workflow: KRC MEDIA Neon Restore Verify
- Run ID: 33246600421
- Workflow commit: 0040f95af5c1bda02f78649af668d5af048543ec
- Result: SUCCESS

Verified stages:
- protected Neon migration secret present: PASS
- direct non-pooled Neon URL requirement: PASS
- TLS-required Neon URL requirement: PASS
- empty PostgreSQL 18 Neon target: PASS
- isolated Render target: PASS
- temporary read-only export runtime: PASS
- owner-authenticated source fingerprint export: PASS
- owner-authenticated pg_dump custom archive export: PASS
- restore into ephemeral PostgreSQL 18: PASS
- source snapshot structural/logical self-verification: PASS
- non-terminal managed jobs in source snapshot: 0
- restore into Neon PostgreSQL 18: PASS
- exact source/Neon structural and logical fingerprint equality: PASS
- temporary Render export runtime removal: PASS
- normal managed MEDIA capability after cleanup: PASS
- runner temporary material cleanup: PASS

Migration evidence:
- dump bytes: 8701
- dump SHA256: 58157d2f208b8d8f9c1728e5a755a0bf5521ca78ae19271821898f679c02a84e
- catalog structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- Neon combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- krc_managed_media_jobs rows: 1
- krc_media_client_jobs rows: 0
- krc_media_stt_charges rows: 0

A separate read-only post-restore workflow confirmed the target state:
- Workflow: KRC MEDIA Neon Post Restore Verify
- Run ID: 33246741240
- Workflow commit: 58f783de14a1b5149b094969c88d4067b6bb988d
- Result: SUCCESS
- PostgreSQL major: 18
- structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- row counts: 1 / 0 / 0

## Safety boundaries preserved

- Render KRC_MEDIA_DATABASE_URL changed: NO
- Render environment changed by migration workflow: NO
- database cutover performed: NO
- source Render PostgreSQL writes requested: NO
- raw pg_dump uploaded as Actions artifact: NO
- source Render PostgreSQL deleted: NO
- paid Facebook fallback activated: NO
- ScrapeCreators activated: NO
- PR #28 merged: NO
- main branch modified: NO

The temporary export runtime was removed after the restore and normal runtime capability was verified with mode=zero_client_managed_beta, configured=true, durable_store=postgres.

## Important cutover rule

This verified Neon copy is not itself cutover authorization. The Render PostgreSQL database remains authoritative.

Before any future cutover, owner MEDIA activity must be paused again and the source must be rechecked. If the source database has changed since this snapshot, capture a fresh read-only snapshot, refresh Neon from that snapshot, and require exact structural/data verification again before changing KRC_MEDIA_DATABASE_URL.

## Current gate

NEON_MIGRATION_PLAN: PASS
POSTGRESQL_18_DRY_RUN: PASS
NEON_PROVISIONING: COMPLETE
NEON_TARGET_RESTORE: PASS
NEON_POST_RESTORE_VERIFY: PASS
STRUCTURAL_SCHEMA_MATCH: PASS
LOGICAL_DATA_MATCH: PASS
TEMP_EXPORT_RUNTIME_REMOVED: VERIFIED
RENDER_ENV_CHANGE: NONE
KRC_MEDIA_DATABASE_URL_CHANGE: NONE
DATABASE_CUTOVER: NOT_STARTED
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next decision point: separately authorize cutover preparation. No cutover is implied by this checkpoint.
