# KRC MEDIA Durable Fail-Closed Negative Matrix Acceptance

Date: 2026-08-29
Status: ACCEPTED
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

This owner-testing block verifies that durable-store and durable STT-quota failures stop MEDIA BETA work before billable AssemblyAI provider start, and that both active managed KRCM routes and the legacy KRCC client-assisted route preserve the shared fail-closed quota boundary.

No live media provider work was required for this acceptance.

## Accepted regression coverage

Retained regression file:

`src/cloud/tests/managed_media_durable_fail_closed.test.ts`

Accepted assertions:
- managed durable-store initialization outage maps to `MANAGED_DURABLE_STORE_UNAVAILABLE` and rejects before job reservation or provider work;
- managed durable quota-ledger outage produces a terminal failed job before AssemblyAI provider start;
- failed managed quota-ledger case records zero retrieval credits and zero STT seconds and does not mark provider charge uncertainty;
- attachment, Telegram, and Facebook managed STT routes share the `reserveSttQuota` fail-closed callback;
- legacy KRCC reserves durable quota before constructing the AssemblyAI transcriber;
- KRCC durable quota/store failures have explicit 503-class fail-closed error surfaces;
- quota ledger keys are based on durable job/day accounting rather than storing the owner access digest directly in the STT charge key.

## Validation trail

Initial workflow run `33265879771` failed after 155 tests passed and three new static-source assertions failed. The failures were test-harness path errors only: compiled tests resolved TypeScript source paths below `dist/src`, which does not exist. The two behavioral outage tests had already passed, including the assertion that AssemblyAI provider start count remained zero.

The test harness paths were corrected to read repository source files from the cloud working directory. No runtime implementation change was required.

Final matrix workflow run `33265955398`: SUCCESS.

The workflow executed the full cloud build/test suite and the no-spend matrix, then removed its own temporary workflow from the feature branch.

Final feature-branch code/test head after temporary workflow cleanup:

`8a66e610b89a7e1398b5e8cbe4ac59334ffee5d2`

Exact-head verification run `33266043667`: SUCCESS.

It checked out exactly `8a66e610b89a7e1398b5e8cbe4ac59334ffee5d2`, ran the complete cloud validation, and verified the retained durable fail-closed regression file. The exact-head verifier was then removed from the ops branch.

## Resource / safety accounting

- AssemblyAI provider-consuming work: NONE;
- Supadata provider-consuming work: NONE;
- Facebook paid retrieval: NONE;
- ScrapeCreators activation: NONE;
- Render environment mutation: NONE;
- Neon data mutation from this acceptance block: NONE;
- release-gate transition: NONE.

## Release and infrastructure state

- active durable store: Neon PostgreSQL 18;
- original Render PostgreSQL: retained; deletion NOT AUTHORIZED;
- Facebook automatic paid fallback: false;
- ScrapeCreators: inactive/reserve-only;
- VoiceBridge PR #28: remains release-gated;
- KRC PR #8: remains release-gated;
- merge to main: HOLD;
- production promotion: HOLD;
- external testers: HOLD;
- public/Store rollout: HOLD.

This acceptance authorizes no release transition. Owner testing continues under `RELEASE_HOLD_OWNER_TESTING`.
