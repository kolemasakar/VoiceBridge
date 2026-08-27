# KRC MEDIA Neon Migration Plan

Status: DRY_RUN_PASS_AWAITING_NEON_PROVISIONING
Date: 2026-08-27
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Objective

Move the isolated KRC MEDIA BETA durable PostgreSQL store from the current Render Free PostgreSQL database to Neon Free PostgreSQL without changing the application data model or MEDIA BETA behavior.

This document records the completed pre-provisioning audit and PostgreSQL 18 dry run. It does not authorize Neon provisioning, a Render environment change, a database cutover, a PR merge, source database deletion, or public promotion.

## 2. Verified source baseline

Source service:
- Render service: voicebridge-krc-media-beta-kolemasakar
- Source database: voicebridge-krc-media-beta-db
- Persistence variable: KRC_MEDIA_DATABASE_URL
- Durable store type: postgres
- PostgreSQL version observed during the 2026-08-27 audit: 18.4
- Database size observed: 8,394,431 bytes, about 8.0 MiB
- User tables: 3
- public.krc_managed_media_jobs: 1 row
- public.krc_media_client_jobs: 0 rows
- public.krc_media_stt_charges: 0 rows
- Managed job status distribution: COMPLETED = 1
- Total recorded STT charge seconds: 0
- Extensions observed: plpgsql 1.0
- Sequences observed: none

The source Render database remains authoritative until a separately approved cutover is completed and verified.

## 3. Required PostgreSQL surface

Required relations:
- public.krc_managed_media_jobs
- public.krc_media_client_jobs
- public.krc_media_stt_charges

Required PostgreSQL features include:
- text
- jsonb
- timestamptz
- date
- integer
- primary keys
- unique constraints
- check constraints
- btree indexes
- PostgreSQL extension metadata required by the dump

The current persistence layer uses standard PostgreSQL and psql. No Render-specific SQL was identified in the persistence implementation.

Target compatibility rule:
- Prefer PostgreSQL 18 for the Neon target.
- If PostgreSQL 18 is unavailable at provisioning time, stop and perform a dedicated cross-major compatibility validation before migration.

## 4. Migration strategy

Use PostgreSQL logical dump and restore rather than replication.

Canonical migration path:

Render PostgreSQL -> read-only pg_dump custom archive -> Neon PostgreSQL -> pg_restore -> structural/data verification -> controlled KRC_MEDIA_DATABASE_URL cutover

Reasons:
- The source database is very small.
- The schema is PostgreSQL-native and simple.
- Owner-only beta operation permits a controlled short write-freeze window.
- The existing Render database can remain intact as the rollback source.

## 5. Completed pre-Neon dry run

Direct GitHub-hosted runner connections to the Render external PostgreSQL endpoint repeatedly failed with SSL connection closure. Therefore the final dry run did not depend on the unreliable external PostgreSQL path.

A temporary owner-authenticated internal export handler was deployed only to the isolated KRC MEDIA BETA Render service. It used the service's already working KRC_MEDIA_DATABASE_URL connection and enforced source-side read-only PostgreSQL sessions.

Source safeguards:
- KRC_MEDIA_ACTION_TOKEN authentication was required.
- PGOPTIONS enforced default_transaction_read_only=on.
- The source database was never used as a restore target.
- No INSERT, UPDATE, DELETE, DDL, or migration write was requested against the source.
- No Render environment variable was changed.
- No Neon resource was created.
- The raw dump was transferred only to an ephemeral GitHub runner and was not uploaded as an artifact.
- Temporary local dump and token material was removed at workflow completion.

Dry-run target:
- Ephemeral PostgreSQL 18 Docker container inside GitHub Actions.

Dry-run verification:
- Source export: PASS
- PostgreSQL 18 pg_restore: PASS
- Catalog structural fingerprint equality: PASS
- Logical durable-data fingerprint equality: PASS
- Exact row counts: PASS
- Local temporary material cleanup: PASS

Authoritative dry-run execution:
- Commit: 159bff89988f464a989d426f60628a2fa92ba41e
- Workflow: KRC MEDIA Neon Internal Dry Run Live
- Run ID: 33045161728
- Result: SUCCESS
- Dump bytes: 8701
- Dump SHA256: 9b10f07898e9dcba8e9f55f8ede999181839ea7ea763608b486ff782fbcc0a8e
- Catalog structural fingerprint: 3ec31bd757e74b958c1a5a0226fab9bb
- Source combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- Restored combined fingerprint SHA256: dd6cfd92a6a667c6b8632ed3b2723179e56038599ace0dd3a1088bbb3931cbd5
- Restored krc_managed_media_jobs rows: 1
- Restored krc_media_client_jobs rows: 0
- Restored krc_media_stt_charges rows: 0

The catalog structural fingerprint covers user relations, columns and PostgreSQL types, defaults, nullability, identity/generated metadata, constraints, indexes, and extensions. This replaces the earlier text-serialization hash approach, which was rejected because semantically equivalent schema dumps can serialize differently.

The reusable verification query is preserved in:
- scripts/krc-media-neon-fingerprint.sql

## 6. Dry-run runtime cleanup

The temporary internal export handler and temporary PostgreSQL 18 runtime packaging were removed after the successful dry run.

Cleanup execution:
- Commit: 92fd4190573c14f7239a0e57a30e34529725a03b
- Workflow run ID: 33045297107
- Result: SUCCESS

Cleanup verification confirmed:
- The internal export route no longer exists.
- The removed route reaches the normal legacy routing layer and returns NOT_FOUND with the legacy test token.
- Managed MEDIA capability remains available.
- mode = zero_client_managed_beta
- configured = true
- durable_store = postgres
- No Render environment variable changed.
- No source database write was requested.
- No Neon resource was created.

Exact-head validation after runtime cleanup completed successfully for:
- Validate
- A9.7-F Cobalt Package Validate
- A9.10 Attachment Probe Validate

Temporary dry-run workflows are removed after this record is committed. The historical read-only pre-Neon audit workflow is retained.

## 7. Provisioning gate

The next phase is NEON_PROVISIONING and requires separate owner approval and a Neon account/project owned by the user.

Before provisioning:
- Create or confirm the Neon account under the intended owner identity.
- Confirm Neon Free remains the selected plan.
- Confirm a region suitable for the Frankfurt-hosted Render service.
- Prefer PostgreSQL 18.
- Confirm available storage comfortably exceeds the current approximately 8 MiB source database.
- Use a direct PostgreSQL connection string for initial migration and compatibility testing unless a separate pooling validation is completed.
- Keep all Neon connection strings and credentials only in secret/environment configuration.
- Do not put Neon credentials in GitHub source files, logs, documentation, chat, or Actions artifacts.

No production KRC_MEDIA_DATABASE_URL change is part of provisioning itself.

## 8. Pre-cutover checklist

Before the final source snapshot:
- Keep RELEASE_HOLD_OWNER_TESTING active.
- Do not merge PR #28 into main.
- Do not promote the isolated beta service.
- Pause owner activity that can create new media jobs.
- Confirm no active non-terminal jobs remain.
- Re-run the read-only source audit.
- Record the final source database size and row counts.
- Generate a final source structural/data fingerprint.
- Create the final read-only custom pg_dump archive.
- Verify the Neon target is empty or dedicated to this migration.
- Verify target PostgreSQL major version and TLS connectivity.

If any unexpected source baseline change is observed, stop and investigate before cutover.

## 9. Planned Neon restore and validation

After Neon provisioning is separately approved:
1. Create the Neon Free PostgreSQL target without changing Render.
2. Verify target PostgreSQL version and direct TLS connectivity.
3. Restore the approved custom archive with --no-owner, --no-acl, and --exit-on-error.
4. Run scripts/krc-media-neon-fingerprint.sql against source and target.
5. Require exact catalog structural fingerprint equality.
6. Require exact durable-data fingerprint equality.
7. Require exact row-count equality for all three persistence tables.
8. Check timestamps, job statuses, idempotency keys, payload/segment persistence, constraints, and indexes.
9. Keep the Render database unchanged and authoritative until cutover approval.

## 10. Planned cutover - separate approval required

1. Declare an owner-only migration window.
2. Stop new MEDIA BETA job starts.
3. Wait for active jobs to reach terminal states.
4. Capture the final source snapshot and fingerprint.
5. Restore/refresh the Neon target from the final snapshot.
6. Require exact source/target structural and logical match.
7. Preserve the previous Render KRC_MEDIA_DATABASE_URL securely for rollback without printing it.
8. Change only KRC_MEDIA_DATABASE_URL on the isolated KRC MEDIA BETA Render service.
9. Restart/redeploy only that isolated service if required.
10. Verify managed capability and durable store health.
11. Verify existing durable state can still be read.
12. Execute a controlled live media job and confirm create, process, status read, segment read, and post-restart durability.
13. Verify idempotency after restart/redeploy.
14. Keep the old Render PostgreSQL database intact during the rollback observation window.

## 11. Rollback triggers

Rollback immediately if any of these occur after cutover:
- managed capability is not configured;
- durable_store is not postgres;
- persistence initialization fails;
- existing durable state cannot be read as expected;
- new durable writes fail;
- source and target verification unexpectedly diverges;
- restart/redeploy durability fails;
- idempotency behavior changes;
- database connectivity is materially unstable.

## 12. Rollback procedure

1. Stop new owner test activity.
2. Restore the previous protected Render KRC_MEDIA_DATABASE_URL value.
3. Restart/redeploy only the isolated KRC MEDIA BETA service if needed.
4. Verify capability and durable state against the original Render PostgreSQL database.
5. Keep Neon intact for diagnosis.
6. If writes occurred on Neon after cutover, do not automatically merge them back. Reconcile explicitly.

## 13. Security and release boundaries

- Never print Render or Neon database URLs.
- Never commit database credentials.
- Never upload the raw pg_dump archive as an Actions artifact.
- Never upload transcript payloads or segments as migration diagnostics.
- Logs may contain only sanitized hashes, row counts, schema metadata, and non-secret status values.
- Do not delete the Render source database until migration validation and rollback observation are complete and a separate irreversible-operation approval is given.
- Do not activate paid services without explicit approval.
- Do not change MEDIA BETA retrieval behavior as part of this database migration.

## 14. Current gate

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

Next authorized decision point: create/confirm the owner Neon account and begin NEON_PROVISIONING. Stop before creating a Neon project unless the owner explicitly approves that phase.
