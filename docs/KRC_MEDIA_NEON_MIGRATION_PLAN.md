# KRC MEDIA Neon Migration Plan

Status: MIGRATION_COMPLETE_OBSERVATION_CLOSED
Updated: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Objective

Move the isolated KRC MEDIA BETA durable PostgreSQL store from Render PostgreSQL to Neon Free PostgreSQL without changing the application data model or MEDIA BETA behavior.

The database cutover, post-cutover durability regression, rollback observation, exit-readiness verification, and owner-approved observation closure are completed and verified. Neon PostgreSQL 18 is the active durable store for the isolated MEDIA BETA service. The original Render PostgreSQL database remains retained as a protected fallback/reference source and is not authorized for deletion.

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

Before cutover this Render database was authoritative. After the verified cutover it is retained as the protected fallback/reference source and must not be deleted without a separate irreversible-operation approval.

## 3. Required PostgreSQL surface

Required relations:
- public.krc_managed_media_jobs
- public.krc_media_client_jobs
- public.krc_media_stt_charges

Required PostgreSQL features include standard text, jsonb, timestamptz, date, integer, primary keys, unique/check constraints, btree indexes, and extension metadata required by the dump.

The persistence implementation uses standard PostgreSQL and psql. No Render-specific SQL dependency was identified.

## 4. Migration strategy

Canonical path executed:

Render PostgreSQL -> owner-authenticated read-only pg_dump custom archive -> PostgreSQL 18 restore -> structural/data verification -> Neon PostgreSQL 18 -> exact verification -> guarded KRC_MEDIA_DATABASE_URL cutover -> runtime/restart verification -> controlled owner-only live durability regression -> later read-only observation checkpoint -> exit-readiness verification -> owner-approved observation closure

The original Render PostgreSQL database remains intact after observation closure. Deletion is separately gated and not authorized.

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

No new media/transcription job was started as part of the cutover workflow. This avoided intentionally consuming retrieval or STT provider resources during the database switch.

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_CUTOVER_2026-08-29.md

## 11. Post-cutover live durability regression - completed

Owner-approved controlled live regression:
- initial guarded workflow run: 33248257261
- successful continuation run: 33248337547
- accepted result: PASS

Verified:
- exactly one Supadata native provider start
- provider credits charged: 1
- completed managed job persisted in Neon
- API job and segments readable before restart
- exact-head Render redeploy/restart: PASS
- API job and segments readable after restart
- same-request replay returned the same durable job with reused = true
- persisted updated_at unchanged on replay
- duplicate provider start: NOT OBSERVED
- Facebook paid fallback/ScrapeCreators: NOT USED

The initial guarded run encountered only a diagnostic harness SQL placeholder defect after provider completion. The continuation reused the already-created durable job and did not repeat provider work.

Historical checkpoint:
- docs/history/KRC_MEDIA_NEON_POSTCUTOVER_LIVE_REGRESSION_2026-08-29.md

## 12. Active durable-store state

Active application durable store:
- Neon PostgreSQL 18
- project: krc-media-beta-neon
- database: krc_media_beta
- direct TLS connection supplied only through protected environment configuration

Original Render PostgreSQL:
- voicebridge-krc-media-beta-db
- retained intact after observation closure
- deletion not authorized

The isolated Render MEDIA BETA application remains the same application/runtime contract; only its protected KRC_MEDIA_DATABASE_URL target changed.

## 13. Later read-only observation checkpoint - completed

Temporary observation workflow:
- KRC MEDIA Neon Read-Only Observation
- successful run ID: 33249015989
- workflow commit: 929985720dcb448fc6cba0d1a2326e672bbe2d14
- result: SUCCESS

Verified without provider-consuming work, redeploy, environment mutation, or database mutation:
- isolated Render service still targets protected Neon direct TLS: PASS
- managed capability after inactivity/resume: PASS
- PostgreSQL major 18: PASS
- current managed-job rows: 1
- non-terminal managed jobs: 0
- accepted post-cutover regression job remains COMPLETED: PASS
- regression segment count remains 321: PASS
- regression job API read: PASS
- regression segments API read: PASS
- rollback trigger observed: NO

The first observation harness run 33248936436 stopped because it assumed at least two historical managed-job rows would still exist. The actual current count is 1. The required accepted regression row remained present and readable; the invalid count assumption was removed and the corrected read-only workflow passed. No provider work was repeated.

Historical checkpoints:
- docs/history/KRC_MEDIA_NEON_OBSERVATION_WINDOW_2026-08-29.md
- docs/history/KRC_MEDIA_NEON_OBSERVATION_CHECKPOINT_2026-08-29.md

## 14. Observation-window rules - completed

During the rollback observation window the following rules were preserved:
1. RELEASE_HOLD_OWNER_TESTING remained active.
2. PR #28 was not merged and VoiceBridge main was not modified.
3. The original Render PostgreSQL database was not deleted.
4. Neon remained the active durable store because no rollback trigger occurred.
5. Observation used read-only capability, durable-state, connectivity, and CI checks.
6. No provider-consuming test was run merely to prove observation stability.
7. Paid Facebook fallback and ScrapeCreators remained inactive.
8. Connection strings, passwords, bearer tokens, provider credentials, and transcript payloads were not intentionally exposed.

## 15. Rollback triggers

Rollback during the observation window would have been required if any of these were observed:
- managed capability is not configured
- durable_store is not postgres
- persistence initialization fails
- existing/new durable state cannot be read as expected
- new durable writes fail
- restart/redeploy durability fails
- idempotency behavior changes
- database connectivity is materially unstable
- a verified persistence regression attributable to Neon is found

No verified Neon-attributable rollback trigger was observed before closure.

A provider-specific retrieval/STT failure is not by itself a database rollback trigger unless persistence behavior is also implicated.

## 16. Fallback procedure retained

If a future separately verified Neon persistence failure requires returning to the retained Render database:
1. Stop new owner test activity.
2. Recover the protected original Render PostgreSQL connection value without printing it.
3. Restore KRC_MEDIA_DATABASE_URL on only the isolated MEDIA BETA service.
4. Redeploy/restart only that service.
5. Verify capability and durable state against the original Render PostgreSQL database.
6. Keep Neon intact for diagnosis.
7. If writes occurred on Neon after cutover, do not automatically merge them back; reconcile explicitly.

Observation closure does not automatically authorize this fallback action; it must be justified by a verified persistence regression.

## 17. Security and release boundaries

- Never print Render or Neon database URLs.
- Never commit database credentials.
- Never upload raw pg_dump archives as Actions artifacts.
- Never upload transcript payloads or segments as migration diagnostics.
- Logs may contain sanitized hashes, row counts, schema metadata, and non-secret status values only.
- Original Render PostgreSQL deletion remains separately gated and not authorized.
- Do not activate paid services without explicit approval.
- Do not change MEDIA BETA retrieval behavior as part of this database migration.
- PR #28 remains draft/open/unmerged unless separately authorized.
- Public sharing, GPT Store publication, external testers, and production promotion remain HOLD.

## 18. Observation exit and closure - completed

Exit criteria:
- later read-only checkpoint confirmed Render still targets Neon and managed capability is healthy: PASS
- accepted regression job and persisted segments remained readable after normal inactivity/resume behavior: PASS
- verified Neon-attributable persistence rollback trigger: NONE
- exact-head feature-branch CI green before final readiness probe: PASS
- original Render PostgreSQL rollback source available/recoverable immediately before exit decision: PASS

Final readiness:
- workflow: KRC MEDIA Neon Observation Exit Readiness
- run ID: 33249264713
- result: SUCCESS
- OBSERVATION_EXIT_READINESS: PASS

Owner decision:
- option 1 approved
- rollback observation window closed
- Neon retained as active durable store
- original Render PostgreSQL retained; deletion not authorized

Closure checkpoint:
- docs/history/KRC_MEDIA_NEON_OBSERVATION_CLOSURE_2026-08-29.md

Closing the observation window does not authorize deletion of the original Render database, merge PR #28, production promotion, external testers, or GPT Store/public rollout.

## 19. Current gate

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
POST_CUTOVER_LIVE_MEDIA_JOB: PASS
IDEMPOTENT_REPLAY: PASS
READ_ONLY_OBSERVATION_CHECKPOINT: PASS
MANAGED_CAPABILITY_OBSERVATION: PASS
PRIOR_REGRESSION_JOB_READ: PASS
PRIOR_REGRESSION_SEGMENT_READ: PASS
NON_TERMINAL_MANAGED_JOBS: 0
ROLLBACK_TRIGGER_OBSERVED: NO
OBSERVATION_EXIT_READINESS: PASS
ROLLBACK_OBSERVATION_WINDOW: CLOSED_OWNER_APPROVED
ORIGINAL_RENDER_POSTGRESQL: RETAINED
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
MIGRATION_STREAM: COMPLETE
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next migration-stream action: none. Any future deletion of the original Render PostgreSQL database is a separate irreversible operation requiring explicit owner approval.
