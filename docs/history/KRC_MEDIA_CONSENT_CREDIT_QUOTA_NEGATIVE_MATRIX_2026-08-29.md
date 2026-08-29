# KRC MEDIA Consent / Credit / Quota Negative Matrix Acceptance

Date: 2026-08-29
Status: ACCEPTED
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

This acceptance closes the owner-testing hardening block for consent validation, provider-credit boundaries, and shared durable STT quota enforcement across active managed MEDIA routes and the legacy client-assisted KRCC path.

## Accepted implementation

VoiceBridge implementation commit:

`30d71868987b4ffba3f0ed52e3860f6751242cf7`

The implementation preserves the existing MEDIA behavior contract. It does not activate paid Facebook retrieval, ScrapeCreators fallback, public rollout, external testing, or any production/main merge.

## Consent and provider-credit boundaries

Accepted:
- native Supadata consent rejects provider/mode/credit-cap substitutions before quote/provider work;
- metadata consent rejects substitutions before metadata-provider work;
- AI-generate consent rejects stale/wrong provider, mode, and cap before generated transcript work;
- Facebook reserve retrieval consent rejects invalid provider/mode/cap before paid retrieval and before state mutation;
- exhausted balance and stale AI cap fail closed;
- invalid quota durations (`NaN`, infinity, zero, negative) fail closed without corrupting usage;
- cross-route ingress remains blocked before foreign provider/store work.

Static hardening workflow run `33263666540` completed successfully with the full cloud suite at 153/153 PASS and PostgreSQL 18 durable quota-ledger checks PASS.

## Live no-spend consent smoke

Isolated owner runtime workflow run `33263832119`: SUCCESS.

Observed live results:
- invalid native consent -> `409 / MEDIA_CREDIT_CONSENT_REQUIRED`;
- invalid metadata consent -> `409 / MEDIA_METADATA_CREDIT_CONSENT_REQUIRED`;
- invalid AI consent -> `409 / MEDIA_AI_CREDIT_CONSENT_REQUIRED`;
- invalid Facebook reserve consent -> `409 / FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED`;
- Neon managed-job count: unchanged;
- Neon client-job count: unchanged;
- Neon STT-charge row count: unchanged;
- Neon total charged seconds: unchanged;
- provider-consuming media work: NONE;
- Render environment mutation: NONE.

The temporary live-smoke workflow was removed after success.

## Shared durable STT quota

The active managed KRCM routes and legacy client-assisted KRCC audio path now compete against one shared PostgreSQL daily STT ledger in `krc_media_stt_charges`.

Accepted properties:
- quota reservation occurs before AssemblyAI provider start;
- KRCM and KRCC use the same UTC-day ledger and lock key;
- reservation is idempotent by job ID;
- over-cap requests are denied before provider work;
- concurrent KRCM/KRCC reservations cannot both overrun the daily limit;
- durable-store errors fail closed instead of falling back to an in-memory allowance;
- both persistent stores serialize shared schema initialization to avoid concurrent `CREATE TABLE IF NOT EXISTS` races.

The final concurrency repair uses an explicit transaction and acquires the transaction-scoped PostgreSQL advisory lock in a statement before the quota-reading statement. This is required so a waiter obtains a fresh MVCC snapshot after the preceding reservation commits.

Final shared-quota workflow run `33264731836`: SUCCESS.

Validation in PostgreSQL 18 included:
- concurrent KRCM 40s and KRCC 40s against a 60s limit -> exactly one allowed;
- durable total after the race -> 40s;
- same-job replay -> no double charge;
- 31s request against 30s remaining -> denied;
- exact 30s request against 30s remaining -> allowed;
- reverse KRCC/KRCM concurrency order -> exactly one allowed;
- full cloud suite after the final repair -> 153/153 PASS.

## Repair trail

Intermediate failures were diagnostic hardening harness failures, not provider/runtime-data failures:
- run `33264047557`: TypeScript `exactOptionalPropertyTypes` harness compile defect; no accepted implementation commit pushed;
- run `33264128168`: full cloud suite PASS, then concurrent schema initialization exposed a PostgreSQL DDL race;
- run `33264573788`: full cloud suite PASS, then the shared quota race test exposed that acquiring the advisory lock inside the same SQL statement does not refresh that statement's MVCC snapshot after waiting;
- run `33264731836`: both defects repaired; shared quota and full suite PASS.

No paid provider activation or live provider-consuming regression was required to close these defects.

## Release and infrastructure state

- active durable store: Neon PostgreSQL 18;
- original Render PostgreSQL: retained for rollback/history, deletion NOT AUTHORIZED;
- Facebook automatic paid fallback: false;
- ScrapeCreators: inactive/reserve-only;
- PR #28: remains draft/open/unmerged;
- KRC PR #8: remains release-gated;
- merge to main: HOLD;
- production promotion: HOLD;
- external testers: HOLD;
- public/Store rollout: HOLD.

This record authorizes no release-gate transition. Owner testing may continue under `RELEASE_HOLD_OWNER_TESTING`.
