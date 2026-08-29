# KRC MEDIA Neon Rollback Observation Window

Status: ACTIVE
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Purpose

Record the operational state after the accepted Render PostgreSQL -> Neon PostgreSQL 18 cutover and the successful owner-only post-cutover live durability regression.

This checkpoint does not authorize release, merge, production promotion, external testing, public sharing, paid Facebook fallback, ScrapeCreators activation, or deletion of the original Render PostgreSQL database.

## 2. Accepted pre-observation evidence

Database migration:
- Neon PostgreSQL 18 provisioning: PASS
- restore and exact structural/data verification: PASS
- fresh pre-cutover source/Neon equality: PASS
- guarded database cutover: PASS
- managed capability after cutover: PASS
- restart resilience after cutover: PASS

Post-cutover live durability regression:
- one controlled Supadata native provider start: PASS
- provider credits charged: 1
- completed managed job persisted in Neon: PASS
- API job read before restart: PASS
- API segment read before restart: PASS
- exact-head Render redeploy/restart: PASS
- API job/segment read after restart: PASS
- same-request idempotent replay: PASS
- duplicate provider start: NOT OBSERVED
- paid Facebook fallback: NOT USED
- ScrapeCreators: NOT USED

Authoritative regression record:
- docs/history/KRC_MEDIA_NEON_POSTCUTOVER_LIVE_REGRESSION_2026-08-29.md

## 3. Active durable-store state

Application runtime:
- isolated Render service: voicebridge-krc-media-beta-kolemasakar
- branch: agent/krc-media-transcript

Active durable store:
- Neon PostgreSQL 18
- project: krc-media-beta-neon
- database: krc_media_beta
- direct TLS connection through protected environment configuration

Rollback store:
- original Render PostgreSQL: voicebridge-krc-media-beta-db
- retained intact
- deletion not authorized

## 4. Observation rules

During this observation window:
- keep Neon as the active durable store unless a verified rollback trigger occurs;
- keep RELEASE_HOLD_OWNER_TESTING active;
- do not merge PR #28 or modify VoiceBridge main;
- do not delete the original Render PostgreSQL database;
- do not perform provider-consuming tests merely to prove observation stability;
- prefer read-only capability, durable-state, connectivity, and CI checks;
- keep Facebook on free Cobalt only, with Cobalt failure -> unavailable/STOP;
- do not activate or offer ScrapeCreators paid fallback;
- keep Telegram retrieval at zero credits;
- keep local attachment retrieval at zero credits;
- never print or commit database connection strings, bearer tokens, provider keys, or transcript payloads.

## 5. Rollback triggers

Rollback remains required if a verified Neon-attributable persistence regression is observed, including:
- managed capability no longer configured;
- durable_store no longer postgres;
- persistence initialization failure;
- durable state cannot be read;
- new durable writes fail;
- restart/redeploy loses durable state;
- idempotency changes and causes duplicate provider work;
- materially unstable database connectivity.

A provider-specific media retrieval/STT failure is not by itself a database rollback trigger unless persistence behavior is also implicated.

## 6. Observation exit criteria

The observation window may be proposed for closure only after:
- at least one later read-only observation checkpoint confirms the isolated Render runtime still targets Neon and managed capability remains healthy;
- the previously completed regression job and its segments remain readable after normal runtime inactivity/resume behavior;
- no verified Neon persistence rollback trigger has appeared;
- exact-head feature-branch CI remains green;
- the original Render PostgreSQL rollback source is still available at the time the owner considers ending rollback protection.

Closing the observation window is not authorization to delete the original Render database. Database deletion remains a separate irreversible operation requiring explicit owner approval.

Closing the observation window is also not authorization to merge PR #28, promote production, onboard external testers, or publish the GPT.

## 7. First later read-only checkpoint - PASS

Observation workflow:
- KRC MEDIA Neon Read-Only Observation
- successful run ID: 33249015989
- workflow commit: 929985720dcb448fc6cba0d1a2326e672bbe2d14
- result: SUCCESS

Verified without provider-consuming work or runtime/database mutation:
- isolated Render service still targets the protected Neon direct TLS URL: PASS
- managed capability contract after inactivity/resume: PASS
- PostgreSQL major 18: PASS
- current managed-job rows: 1
- non-terminal managed jobs: 0
- accepted post-cutover regression job remains COMPLETED: PASS
- persisted regression segment count remains 321: PASS
- regression job API read: PASS
- regression segments API read: PASS
- rollback trigger observed: NO

The first harness attempt, run 33248936436, stopped only because it assumed at least two historical managed-job rows would still exist. The current row count is 1. The required post-cutover regression row was present and readable, so the assumption was removed and the corrected read-only workflow passed. No provider work was repeated.

Authoritative checkpoint:
- docs/history/KRC_MEDIA_NEON_OBSERVATION_CHECKPOINT_2026-08-29.md

## 8. Current gate

DATABASE_CUTOVER: PASS
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
POST_CUTOVER_LIVE_MEDIA_JOB: PASS
NEON_DURABLE_WRITE: PASS
RESTART_RESILIENCE: PASS
IDEMPOTENT_REPLAY: PASS
READ_ONLY_OBSERVATION_CHECKPOINT: PASS
MANAGED_CAPABILITY_OBSERVATION: PASS
PRIOR_REGRESSION_JOB_READ: PASS
PRIOR_REGRESSION_SEGMENT_READ: PASS
NON_TERMINAL_MANAGED_JOBS: 0
ROLLBACK_TRIGGER_OBSERVED: NO
ROLLBACK_OBSERVATION_WINDOW: ACTIVE
ORIGINAL_RENDER_POSTGRESQL: RETAINED_FOR_ROLLBACK
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next allowed migration-stream action: continue the rollback observation window. Before proposing closure, re-confirm exact-head CI and the availability of the original Render PostgreSQL rollback source. No additional provider-consuming media job is required.
