# KRC MEDIA Neon Dry Run Checkpoint - 2026-08-27

Status: PASS
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the verified pre-provisioning PostgreSQL migration dry run for KRC MEDIA BETA before any Neon account/project resource is used for the migration.

## Source baseline

Source service: voicebridge-krc-media-beta-kolemasakar
Source database: voicebridge-krc-media-beta-db
Persistence variable: KRC_MEDIA_DATABASE_URL
PostgreSQL: 18.4
Observed source database size: 8,394,431 bytes, about 8.0 MiB
Observed durable rows:
- krc_managed_media_jobs: 1
- krc_media_client_jobs: 0
- krc_media_stt_charges: 0

## Transport decision

Direct GitHub-hosted runner connections to the Render external PostgreSQL endpoint repeatedly failed with SSL connection closure. This path was not accepted as a reliable migration transport.

The successful dry run used a temporary owner-authenticated internal export handler in the existing isolated Render KRC MEDIA BETA service. The handler used the service's already working database connection and source-side read-only PostgreSQL settings.

No source database write was requested.
No Render environment variable was changed.
No Neon resource was created.
No raw dump was uploaded as a GitHub artifact.
No database credential or connection string was written to the repository or logs.

## Successful dry run

Commit: 159bff89988f464a989d426f60628a2fa92ba41e
Workflow: KRC MEDIA Neon Internal Dry Run Live
Run ID: 33045161728
Result: SUCCESS

Verified stages:
- isolated Render target verification: PASS
- exact feature-branch deploy: PASS
- owner-authenticated read-only source export: PASS
- pg_dump custom archive validation: PASS
- restore into ephemeral PostgreSQL 18: PASS
- catalog structural fingerprint equality: PASS
- logical durable-data fingerprint equality: PASS
- exact per-table row-count equality: PASS
- ephemeral runner cleanup: PASS

Dry-run evidence:
- dump bytes: 8701
- dump SHA256: 9b10f07898e9dcba8e9f55f8ede999181839ea7ea763608b486ff782fbcc0a8e
- catalog structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- restored combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- restored krc_managed_media_jobs rows: 1
- restored krc_media_client_jobs rows: 0
- restored krc_media_stt_charges rows: 0

The structural fingerprint covers relations, columns/types/defaults/nullability, identity/generated metadata, constraints, indexes, and extensions using PostgreSQL catalog functions. This semantic catalog comparison replaced an earlier textual schema dump hash because equivalent schemas can serialize differently.

Reusable verification logic is retained in:
- scripts/krc-media-neon-fingerprint.sql

## Runtime cleanup

Cleanup commit: 92fd4190573c14f7239a0e57a30e34529725a03b
Cleanup workflow run ID: 33045297107
Result: SUCCESS

Verified cleanup:
- temporary internal export handler removed: PASS
- temporary PostgreSQL 18 runtime packaging removed: PASS
- normal managed capability available: PASS
- mode zero_client_managed_beta: PASS
- configured true: PASS
- durable_store postgres: PASS
- source database writes: NONE
- Render environment changes: NONE
- Neon resources: NONE

Exact-head standard validation after cleanup:
- Validate: SUCCESS
- A9.7-F Cobalt Package Validate: SUCCESS
- A9.10 Attachment Probe Validate: SUCCESS

## Repository cleanup policy

Remove after this checkpoint is committed:
- .github/workflows/krc-media-neon-internal-dry-run-live.yml
- .github/workflows/krc-media-neon-export-sanitized-probe.yml

Retain:
- scripts/krc-media-neon-fingerprint.sql
- .github/workflows/krc-media-postgres-pre-neon-audit.yml
- docs/KRC_MEDIA_NEON_MIGRATION_PLAN.md
- this checkpoint

## Current migration gate

NEON_MIGRATION_PLAN: PASS
POSTGRESQL_18_DRY_RUN: PASS
STRUCTURAL_SCHEMA_MATCH: PASS
LOGICAL_DATA_MATCH: PASS
TEMP_EXPORT_RUNTIME_REMOVED: VERIFIED
NEON_PROVISIONING: NOT_STARTED
RENDER_ENV_CHANGE: NONE
DATABASE_CUTOVER: NOT_STARTED
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

## Next action

The next phase is NEON_PROVISIONING.

At that point the owner should create or confirm the Neon account. Neon credentials and connection strings must remain only in protected secret/environment configuration and must never be committed or pasted into project documentation.

Creating a Neon project, restoring data to Neon, or changing KRC_MEDIA_DATABASE_URL requires a separate explicit owner approval.
