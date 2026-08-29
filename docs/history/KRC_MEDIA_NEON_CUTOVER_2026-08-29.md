# KRC MEDIA Neon Cutover Checkpoint

Status: CUTOVER_PASS_OBSERVATION_WINDOW
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Decision

The owner explicitly approved the database cutover after the fresh pre-cutover equality gate passed.

Scope was limited to the isolated KRC MEDIA BETA Render service. No merge to main, public promotion, external tester onboarding, source database deletion, or media-provider policy change was authorized.

## 2. Cutover execution

Workflow:
- KRC MEDIA Neon Cutover Live
- run ID: 33247641497
- workflow commit: 146211c8b17d396b01feb2ee14414ad517be9bb4
- result: SUCCESS

Before mutation the workflow verified:
- isolated Render service identity and feature branch
- protected Neon direct TLS target
- previous Render KRC_MEDIA_DATABASE_URL was recoverable for rollback without printing it
- original Render PostgreSQL resource remained available
- final authoritative Render source fingerprint exactly matched Neon
- row counts managed/client/stt were 1 / 0 / 0
- non-terminal managed jobs were 0

## 3. Approved mutation

The only application environment change was:
- KRC_MEDIA_DATABASE_URL on voicebridge-krc-media-beta-kolemasakar was replaced with the protected Neon direct TLS connection value

No database URL, password, bearer token, or connection credential was committed to source, documentation, or intentionally printed in logs.

After the variable change, only the isolated MEDIA BETA service was redeployed.

## 4. Post-cutover verification

Result: PASS

Verified after cutover:
- managed capability HTTP check: PASS
- mode = zero_client_managed_beta
- configured = true
- durable_store = postgres
- restart_resilient_jobs = true
- facebook_automatic_paid_retrieval = false
- telegram_retrieval_credits = 0
- local_attachment_retrieval_provider = openai_attachment
- Neon durable row counts remained 1 / 0 / 0
- non-terminal managed jobs remained 0
- temporary internal export endpoint was absent
- second redeploy/restart completed successfully
- managed capability after restart: PASS

The conditional API read of a previously stored job was attempted only if an unexpired persisted job existed. The migration evidence does not treat absence of an unexpired historical job as a failure; durable table contents and exact fingerprints were already independently verified before cutover.

No new media/transcription job was started by the cutover workflow, so no STT/retrieval credits were intentionally consumed as part of this database switch.

## 5. Rollback state

Rollback remains available.

The original Render PostgreSQL database was not deleted or modified by the cutover workflow. Its connection information was verified recoverable before mutation, and the previous KRC_MEDIA_DATABASE_URL value was held only in masked ephemeral runner state during the workflow.

If rollback is required during the observation window:
1. stop owner test activity
2. restore the protected Render PostgreSQL KRC_MEDIA_DATABASE_URL value
3. redeploy only the isolated MEDIA BETA service
4. verify capability and durable state
5. keep Neon intact for diagnosis
6. do not automatically merge any writes made to Neon back into Render

## 6. Security and release boundaries

Confirmed:
- PR #28 merge: NOT AUTHORIZED
- main modification: NONE
- public/production promotion: NOT AUTHORIZED
- external testers: NOT AUTHORIZED
- paid Facebook fallback: NOT ACTIVATED
- ScrapeCreators: NOT ACTIVATED
- source Render PostgreSQL deletion: NOT AUTHORIZED
- raw pg_dump artifact upload: NONE
- secrets committed: NONE

## 7. Current state

NEON_PROVISIONING: COMPLETE
NEON_RESTORE: PASS
PRE_CUTOVER_EQUALITY: PASS
DATABASE_CUTOVER: PASS
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
MANAGED_CAPABILITY_AFTER_CUTOVER: PASS
RESTART_RESILIENCE: PASS
ORIGINAL_RENDER_POSTGRESQL: RETAINED_FOR_ROLLBACK
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next gate: owner-only post-cutover regression and observation. A controlled live media job, if used, is a separate test action because it can invoke retrieval/STT providers and may consume provider resources.