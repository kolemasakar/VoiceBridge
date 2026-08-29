# KRC MEDIA Neon Migration Plan

Status: CUTOVER_PASS_OBSERVATION_WINDOW
Updated: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Objective

Move the isolated KRC MEDIA BETA durable PostgreSQL store from Render PostgreSQL to Neon Free PostgreSQL without changing the application data model or MEDIA BETA behavior.

The database cutover is now completed and verified. Neon PostgreSQL 18 is the active durable store for the isolated MEDIA BETA service. The original Render PostgreSQL database is retained unchanged as the rollback source during the observation window.

This migration does not authorize a PR merge, public or production promotion, external tester onboarding, source database deletion, or any change to the accepted MEDIA BETA retrieval/provider contract.

## 2. Original Render source and rollback baseline

Original database:
- Render service: voicebridge-krc-media-beta-kolemasakar
- Render database: voicebridge-krc-media-beta-db
- persistence variable: KRC_MEDIA_DATABASE_URL
- PostgreSQL version observed: 18.4
- database size observed during audit: 8,394,431 bytes, about 8 MiB
- public.krc_managed_media_jobs: 1 row
- public.krc_media_client_jobs: 0 rows
- public.krc_media_stt_charges: 0 rows
- managed job state observed: COMPLETED = 1
- total recorded STT charge seconds: 0

Before cutover this Render database was authoritative. After the verified cutover it is retained as the protected rollback source and must not be deleted without a separate irreversible-operation approval.

## 3. Required PostgreSQL surface

Required relations:
- public.krc_managed_media_jobs
- public.krc_media_client_jobs
- public.krc_media_stt_charges

Required PostgreSQL features include standard text, jsonb, timestamptz, date, integer, primary keys, unique/check constraints, btree indexes, and extension metadata required by the dump.

The persistence implementation uses standard PostgreSQL and psql. No Render-specific SQL dependency was identified.

## 4. Migration strategy

Canonical path executed:

Render PostgreSQL -> owner-authenticated read-only pg_dump custom archive -> PostgreSQL 18 restore -> structural/data verification -> Neon PostgreSQL 18 -> exact verification -> guarded KRC_MEDIA_DATABASE_URL cutover -> runtime/restart verification

The original Render PostgreSQL database remains intact for rollback during the observation window.

## 5. Completed PostgreSQL 18 dry run

Direct GitHub-hosted runner connections to the Render external PostgreSQL endpoint repeatedly failed with SSL connection closure and were rejected as an unreliable migration transport.

The accepted transport used a temporary owner-authenticated internal export handler on the isolated Render MEDIA BETA service. It used the service-side PostgreSQL connection and enforced source-side read-only PostgreSQL sessions. The handler was removed immediately after each controlled use.

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
- Render environment unchanged by the dry run
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
- Render environment changed during preparation: NO
- KRC_MEDIA_DATABASE_URL changed during preparation: NO
- database cutover during preparation: NO

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_PRECUTOVER_VERIFY_2026-08-29.md

## 10. Verified database cutover - completed

The owner separately approved the cutover after the pre-cutover gate passed.

Cutover workflow:
- workflow: KRC MEDIA Neon Cutover Live
- run ID: 33247641497
- workflow commit: 146211c8b17d396b01feb2ee14414ad517be9bb4
- result: SUCCESS

Guard conditions immediately before mutation:
- isolated Render service identity: PASS
- current feature branch: PASS
- protected Neon target direct and TLS-required: PASS
- previous Render KRC_MEDIA_DATABASE_URL captured only into masked ephemeral runner state for rollback: PASS
- original Render PostgreSQL connection information recoverable through authenticated Render API: PASS
- final Render source and Neon structural/logical fingerprint equality: PASS
- row counts managed/client/stt: 1 / 0 / 0
- non-terminal managed jobs: 0

Approved mutation:
- changed only KRC_MEDIA_DATABASE_URL on the isolated Render MEDIA BETA service to the protected Neon direct TLS value
- redeployed only the isolated MEDIA BETA service

Post-cutover verification:
- managed capability: PASS
- mode = zero_client_managed_beta
- configured = true
- durable_store = postgres
- restart_resilient_jobs = true
- facebook_automatic_paid_retrieval = false
- telegram_retrieval_credits = 0
- local_attachment_retrieval_provider = openai_attachment
- Neon row counts remained 1 / 0 / 0
- non-terminal managed jobs remained 0
- temporary export route absent: PASS
- second redeploy/restart: PASS
- managed capability after restart: PASS
- automatic rollback: NOT TRIGGERED

No new media/transcription job was started as part of the cutover workflow. This avoided intentionally consuming retrieval or STT provider resources during the database switch. A controlled live media regression remains a separate owner-only test action.

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_CUTOVER_2026-08-29.md

## 11. Active durable-store state

Active application durable store:
- Neon PostgreSQL 18
- project: krc-media-beta-neon
- database: krc_media_beta
- direct TLS connection supplied only through protected environment configuration

Rollback store:
- original Render PostgreSQL database voicebridge-krc-media-beta-db
- retained intact
- deletion not authorized

The isolated Render MEDIA BETA application remains the same application/runtime contract; only its protected KRC_MEDIA_DATABASE_URL target changed.

## 12. Observation-window rules

During the rollback observation window:
1. Keep RELEASE_HOLD_OWNER_TESTING active.
2. Do not merge PR #28 or touch VoiceBridge main.
3. Do not delete the original Render PostgreSQL database.
4. Keep Neon as the active durable store unless a rollback trigger occurs.
5. Run only owner-authorized regressions.
6. If a controlled live media job is used, record provider route, durable write/read behavior, restart behavior, and idempotency.
7. Do not activate paid Facebook fallback or ScrapeCreators.
8. Do not expose connection strings, passwords, bearer tokens, or provider credentials.

## 13. Rollback triggers

Rollback immediately if any of these are observed:
- managed capability is not configured
- durable_store is not postgres
- persistence initialization fails
- existing/new durable state cannot be read as expected
- new durable writes fail
- restart/redeploy durability fails
- idempotency behavior changes
- database connectivity is materially unstable
- a verified persistence regression attributable to Neon is found

## 14. Rollback procedure

1. Stop new owner test activity.
2. Recover the protected original Render PostgreSQL connection value without printing it.
3. Restore KRC_MEDIA_DATABASE_URL on only the isolated MEDIA BETA service.
4. Redeploy/restart only that service.
5. Verify capability and durable state against the original Render PostgreSQL database.
6. Keep Neon intact for diagnosis.
7. If writes occurred on Neon after cutover, do not automatically merge them back; reconcile explicitly.

## 15. Security and release boundaries

- Never print Render or Neon database URLs.
- Never commit database credentials.
- Never upload raw pg_dump archives as Actions artifacts.
- Never upload transcript payloads or segments as migration diagnostics.
- Logs may contain sanitized hashes, row counts, schema metadata, and non-secret status values only.
- Do not delete Render PostgreSQL until migration validation and rollback observation are complete and a separate irreversible-operation approval is given.
- Do not activate paid services without explicit approval.
- Do not change MEDIA BETA retrieval behavior as part of this database migration.
- PR #28 remains draft/open/unmerged unless separately authorized.
- Public sharing, GPT Store publication, external testers, and production promotion remain HOLD.

## 16. Current gate

NEON_MIGRATION_PLAN: PASS
POSTGRESQL_18_DRY_RUN: PASS
NEON_PROVISIONING: COMPLETE
NEON_TARGET_RESTORE: PASS
NEON_POST_RESTORE_VERIFY: PASS
CUTOVER_PREPARATION: PASS
FRESH_SOURCE_SNAPSHOT: PASS
NON_TERMINAL_JOBS_AT_CUTOVER: 0
SOURCE_NEON_EXACT_MATCH_BEFORE_CUTOVER: PASS
DATABASE_CUTOVER: PASS
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
MANAGED_CAPABILITY_AFTER_CUTOVER: PASS
RESTART_RESILIENCE_AFTER_CUTOVER: PASS
TEMP_EXPORT_RUNTIME_REMOVED: VERIFIED
ORIGINAL_RENDER_POSTGRESQL: RETAINED_FOR_ROLLBACK
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next gate: owner-only post-cutover regression and observation. A controlled live media job is separate from the completed database cutover because it can invoke retrieval/STT providers and may consume provider resources.