# KRC MEDIA Neon Rollback Observation Window

Status: ACTIVE - EXIT_READY_AWAITING_OWNER_DECISION
Date: 2026-08-29
Repository: kolemasakar/VoiceBridge
Branch: agent/krc-media-transcript
Release state: RELEASE_HOLD_OWNER_TESTING

## 1. Purpose

Record the operational state after the accepted Render PostgreSQL -> Neon PostgreSQL 18 cutover, successful owner-only post-cutover live durability regression, later read-only observation, and final observation-exit readiness verification.

This record does not authorize release, merge, production promotion, external testing, public sharing, paid Facebook fallback, ScrapeCreators activation, or deletion of the original Render PostgreSQL database.

## 2. Accepted evidence

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
- API job/segment read before restart: PASS
- exact-head Render redeploy/restart: PASS
- API job/segment read after restart: PASS
- same-request idempotent replay: PASS
- duplicate provider start: NOT OBSERVED
- paid Facebook fallback: NOT USED
- ScrapeCreators: NOT USED

Later read-only observation:
- isolated Render service still targets Neon direct TLS: PASS
- managed capability after inactivity/resume: PASS
- accepted regression job remains readable: PASS
- accepted persisted segments remain readable: PASS
- non-terminal managed jobs: 0
- provider-consuming work: NONE
- rollback trigger observed: NO

Final exit-readiness verification:
- run ID: 33249264713
- workflow commit: 9352e367cad3fd1f1d5150ae79a154dbf7112719
- result: SUCCESS
- current isolated Render runtime still targets Neon: PASS
- original Render PostgreSQL rollback source is discoverable and connection information remains recoverable: PASS
- managed capability remains healthy: PASS
- Neon durable state remains stable: PASS
- non-terminal managed jobs: 0
- provider-consuming work: NONE
- Render environment mutation: NONE
- database mutation: NONE

Authoritative records:
- docs/history/KRC_MEDIA_NEON_POSTCUTOVER_LIVE_REGRESSION_2026-08-29.md
- docs/history/KRC_MEDIA_NEON_OBSERVATION_CHECKPOINT_2026-08-29.md
- docs/history/KRC_MEDIA_NEON_OBSERVATION_EXIT_READINESS_2026-08-29.md

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
- recoverability re-confirmed immediately before exit-readiness decision
- deletion not authorized

## 4. Observation exit criteria

Required criteria:
- later read-only checkpoint confirms Render still targets Neon and managed capability is healthy: PASS
- accepted regression job/segments remain readable after inactivity/resume: PASS
- no verified Neon-attributable rollback trigger: PASS
- exact-head feature-branch CI green before final readiness probe: PASS
- original Render PostgreSQL rollback source still available/recoverable immediately before exit decision: PASS

Result:
- OBSERVATION_EXIT_READINESS: PASS

The observation window remains ACTIVE until the owner explicitly approves closure.

## 5. Closure boundary

If the owner approves observation-window closure:
- Neon PostgreSQL 18 remains the active durable store;
- original Render PostgreSQL remains retained and must not be deleted as part of closure;
- RELEASE_HOLD_OWNER_TESTING remains active;
- PR #28 remains draft/open/unmerged;
- KRC PR #8 remains draft/open/unmerged;
- no production promotion occurs;
- no external tester onboarding occurs;
- no public sharing/GPT Store publication occurs;
- Facebook remains free Cobalt only with failure -> unavailable/STOP;
- ScrapeCreators remains inactive/reserve-only.

Deleting the original Render PostgreSQL database is a separate irreversible operation requiring explicit owner approval.

## 6. Current gate

DATABASE_CUTOVER: PASS
ACTIVE_DURABLE_STORE: NEON_POSTGRESQL_18
POST_CUTOVER_LIVE_MEDIA_JOB: PASS
RESTART_RESILIENCE: PASS
IDEMPOTENT_REPLAY: PASS
READ_ONLY_OBSERVATION_CHECKPOINT: PASS
MANAGED_CAPABILITY_OBSERVATION: PASS
PRIOR_REGRESSION_JOB_READ: PASS
PRIOR_REGRESSION_SEGMENT_READ: PASS
NON_TERMINAL_MANAGED_JOBS: 0
ROLLBACK_TRIGGER_OBSERVED: NO
ORIGINAL_RENDER_POSTGRESQL_RECOVERABLE: PASS
OBSERVATION_EXIT_READINESS: PASS
ROLLBACK_OBSERVATION_WINDOW: ACTIVE_AWAITING_OWNER_CLOSURE_DECISION
SOURCE_DATABASE_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED

Next action requires an explicit owner decision to close or continue the rollback observation window. No additional provider-consuming media job is required.
