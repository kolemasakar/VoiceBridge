# KRC MEDIA Neon Migration Plan

Status: PREPARED_NOT_EXECUTED
Date: 2026-08-27
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Objective

Move the isolated KRC MEDIA BETA durable PostgreSQL store from the existing Render PostgreSQL database to Neon without changing the application data model or MEDIA BETA behavior.

This document prepares the migration only. It does not authorize Neon provisioning, a database write, a Render environment change, a production promotion, or a PR merge.

## 2. Current verified source baseline

Source service:
- Render service: voicebridge-krc-media-beta-kolemasakar
- Durable store type: postgres
- PostgreSQL major version observed during the 2026-08-27 audit: 18
- Database size observed: 8,394,431 bytes (about 8.0 MiB)
- User tables: 3
- krc_managed_media_jobs: 1 row
- krc_media_client_jobs: 0 rows
- krc_media_stt_charges: 0 rows
- Managed job status distribution: COMPLETED = 1
- Total recorded STT charge seconds: 0
- Custom internal-audit schema fingerprint captured on 2026-08-27:
  d2f2c3a3635809d91f3aff8cc0e95c88a47cc603e5f2ddd0e8c94e13895d208f

The source database remains authoritative until an explicitly approved cutover is completed and verified.

## 3. Database surface that must remain compatible

The current runtime uses standard PostgreSQL through psql. No Render-specific SQL is required by the persistence layer.

Required relations:
- public.krc_managed_media_jobs
- public.krc_media_client_jobs
- public.krc_media_stt_charges

Required data types and features include:
- text
- jsonb
- timestamptz
- date
- integer
- primary keys
- unique constraints
- check constraints
- btree indexes
- built-in plpgsql extension state as emitted by pg_dump

Target compatibility gate:
- Prefer the same PostgreSQL major version as the source.
- If Neon cannot provide the same major version at execution time, stop and perform a dedicated compatibility test before migration approval.
- Do not assume cross-major compatibility merely because pg_restore succeeds.

## 4. Migration strategy

For the current database size, use PostgreSQL logical dump and restore rather than replication.

Canonical path:

Render PostgreSQL -> pg_dump custom archive -> Neon PostgreSQL -> pg_restore -> structural and logical verification -> Render KRC_MEDIA_DATABASE_URL cutover

Reasons:
- The database is small.
- The schema is simple and PostgreSQL-native.
- The owner-only beta permits a controlled write-freeze window.
- Logical dump/restore is easy to verify and easy to roll back from because the source database can remain intact.

## 5. Prepared dry-run

The repository contains a GitHub Actions dry-run that does not use Neon.

Dry-run target:
- An ephemeral local PostgreSQL 18 Docker container inside the GitHub Actions runner.

Dry-run operations:
1. Identify the existing isolated Render service and PostgreSQL database through Render API GET requests only.
2. Obtain the existing source external connection string without printing it.
3. Enforce default_transaction_read_only=on for every source PostgreSQL session.
4. Verify that the expected three source tables are present.
5. Capture a sanitized source logical fingerprint.
6. Create a custom pg_dump archive from the source.
7. Restore that archive into an ephemeral local PostgreSQL 18 database.
8. Compare normalized schema-only dump hashes.
9. Compare sanitized logical data fingerprints and exact row counts.
10. Delete the local dump, fingerprints, connection material, and local PostgreSQL container.

Raw row payloads and the raw database dump are never uploaded as GitHub artifacts.

## 6. Dry-run acceptance gates

The dry-run is PASS only when all of the following hold:
- Source PostgreSQL connectivity succeeds with default_transaction_read_only=on.
- The expected table set is present.
- pg_dump completes without source writes.
- pg_restore into a clean PostgreSQL 18 database completes.
- Normalized source schema SHA256 equals normalized restored schema SHA256.
- Source logical fingerprint SHA256 equals restored logical fingerprint SHA256.
- Per-table exact row counts match.
- No Neon endpoint, Neon API token, or Neon database URL is required.
- No Render environment variable is changed.
- No Render deploy is requested.

A dry-run PASS demonstrates dump/restore compatibility with PostgreSQL 18. It does not by itself prove a future Neon cutover because target configuration, network access, target PostgreSQL version, and credentials are not part of this dry-run.

## 7. Future provisioning gate - not authorized by this plan

Before actual provisioning:
- Confirm Neon organization/project ownership.
- Confirm region selection.
- Confirm target PostgreSQL major version.
- Confirm storage and compute plan.
- Confirm backup/retention requirements.
- Confirm connection pooling policy.
- Confirm whether the runtime should use a pooled or direct connection string. The current psql-per-operation implementation should default to a direct PostgreSQL connection unless a dedicated pooling compatibility check is completed.
- Confirm SSL requirements.
- Define the exact secret name that will replace the current KRC_MEDIA_DATABASE_URL value on Render.

No provisioning should occur without explicit owner approval.

## 8. Pre-cutover checklist

Before the final source dump:
- Keep RELEASE_HOLD_OWNER_TESTING active.
- Do not merge PR #28 into main.
- Do not promote the isolated beta service to production.
- Stop owner test activity that can create new media jobs.
- Confirm there are no active non-terminal jobs.
- Re-run the read-only pre-Neon audit.
- Re-run the migration dry-run against the current source database.
- Record source database size, row counts, schema hash, and logical fingerprints.
- Verify the Neon target is empty or is a newly created migration target.
- Verify target major version and SSL connectivity.

If any baseline changes unexpectedly, stop and investigate before cutover.

## 9. Planned cutover procedure - requires separate approval

1. Declare an owner-only migration window.
2. Stop new MEDIA BETA job starts.
3. Wait for any active job to reach a terminal state or explicitly cancel the migration.
4. Capture the final source fingerprint and schema hash.
5. Create a final custom pg_dump archive with --no-owner and --no-acl.
6. Restore into the approved Neon target with --no-owner, --no-acl, and --exit-on-error.
7. Generate target schema hash and logical fingerprints.
8. Require exact match with the final source snapshot.
9. Preserve the current Render KRC_MEDIA_DATABASE_URL value securely for rollback; never print it.
10. Replace only KRC_MEDIA_DATABASE_URL on the isolated Render service with the approved Neon connection string.
11. Restart/redeploy only the isolated feature-branch service if required for the environment change to take effect.
12. Verify getManagedMediaCapability returns:
    - mode = zero_client_managed_beta
    - configured = true
    - durable_store = postgres
    - restart_resilient_jobs = true
13. Verify an existing durable job lookup still works when a non-expired row is available.
14. Resume owner-only testing.
15. Keep the old Render PostgreSQL database intact during the rollback observation window.

## 10. Rollback triggers

Rollback immediately if any of these occur after cutover:
- Managed capability is not configured.
- durable_store is not postgres.
- Persistence initialization fails.
- Existing durable job lookup fails unexpectedly.
- New durable writes fail.
- Schema or logical fingerprints differ from the approved final source snapshot.
- Connection instability is materially worse than the source baseline.
- Any unexpected provider behavior appears that is plausibly caused by persistence failure.

## 11. Rollback procedure

1. Stop new owner test activity.
2. Restore the previous Render KRC_MEDIA_DATABASE_URL value from the protected rollback copy.
3. Restart/redeploy only the isolated beta service if required.
4. Verify capability and durable store health against the original Render PostgreSQL database.
5. Keep Neon intact for diagnosis; do not delete either database until the incident is understood.
6. Record whether any writes occurred on Neon after cutover. If writes occurred, do not attempt an automatic reverse merge. Reconcile explicitly.

## 12. Post-cutover observation window

Minimum acceptance before considering source retirement:
- Multiple successful service restarts with durable state preserved.
- Owner regression coverage for YouTube, Instagram, Facebook free retrieval, Telegram public retrieval, and one local attachment path where applicable.
- No unexpected persistence errors.
- No divergence in job status behavior.
- No change to the no-automatic-paid-Facebook-fallback contract.

Source deletion is a separate irreversible operation and requires explicit approval.

## 13. Security rules

- Never print Render or Neon database URLs.
- Never upload a raw pg_dump archive as an Actions artifact.
- Never upload transcript payloads or segments as migration diagnostics.
- GitHub logs may contain only sanitized hashes, row counts, schema metadata, and non-secret status values.
- Use temporary runner files with restrictive permissions for connection material.
- Remove temporary connection strings and dump files in an always-run cleanup step.

## 14. Current gate

NEON_MIGRATION_PLAN: PREPARED
NEON_DRY_RUN: PENDING_EXECUTION
NEON_PROVISIONING: NOT_AUTHORIZED
RENDER_ENV_CHANGE: NOT_AUTHORIZED
DATABASE_CUTOVER: NOT_AUTHORIZED
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
