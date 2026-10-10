# KRC Media M3 Same-Asset Execution Contract

Status: ACCEPTED - PRE-EXECUTION
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Harden the M3 AssemblyAI-versus-Gemini A/B boundary before any provider-consuming execution.

The contract guarantees that an A/B pair represents the same media asset and the same transcription options. It contains no provider client, source downloader, media uploader, API key lookup, or network execution path.

This checkpoint does not authorize live AssemblyAI/Gemini A/B execution, production cutover, KRC Action URL changes, paid provider activation, Render environment mutation, Neon mutation, public rollout, or deletion of the legacy KRC endpoint.

## Implementation

Execution-contract module:

`src/cloud/src/krc_media_ab_execution_contract.ts`

Regression coverage:

`src/cloud/tests/krc_media_ab_execution_contract.test.ts`

Implementation commit:

`7ef631bc62ff08dc3fb533ba90d752e179b87d68`

Test commit / validated code head:

`199801efa3e21751902e0528e2ba1b7e8d294fe8`

Validation run:

`33289566008`

Result:

```text
cloud tests: 210
pass: 210
fail: 0
browser-extension: PASS
repository-docs: PASS
```

## Fixed provider pair

The M3 comparison contract accepts only:

```text
AssemblyAI model: universal-2
Gemini model: gemini-3.5-transcribe
```

A VoiceBridge live model such as `gemini-3.5-transcribe-live` is rejected for the KRC prerecorded A/B contract.

## Same-asset invariant

Each execution specification contains an opaque lowercase SHA-256 digest:

`asset_sha256`

The AssemblyAI and Gemini specifications must have an identical digest before they can form a valid pair.

This prevents two different downloads, encodings, edits, or source assets from being compared as if the difference came from the STT provider.

The execution contract does not persist or require a source URL.

## Same-options invariant

A valid pair must also have identical:

- `case_id`;
- `source_class`;
- `language_hint`;
- `word_timestamps` setting;
- `diarization` setting.

Provider identity and model are the intended comparison variables.

## Secret and URL exclusion

The parser accepts an exact field set only:

- `case_id`;
- `source_class`;
- `asset_sha256`;
- `provider`;
- `provider_model`;
- `language_hint`;
- `word_timestamps`;
- `diarization`.

Unexpected fields are rejected. Regression tests explicitly reject examples such as `source_url` and `api_key`.

This keeps committed execution metadata separate from raw private media, signed URLs, bearer tokens, provider keys, owner admission codes, database URLs, and other secrets.

## Relationship to the offline evaluator

The same-asset execution contract is a precondition for the offline scorer in:

`src/cloud/src/krc_media_ab_evaluation.ts`

The scorer continues to report metric directions without creating an automatic overall winner. Manual factual and hallucination review remains mandatory.

## Current gate

```text
M0_PREFLIGHT: COMPLETE
M1_PROVIDER_ABSTRACTION: PASS
M2_GEMINI_ADAPTER: PASS
M3_OFFLINE_EVALUATOR: PASS
M3_SAME_ASSET_EXECUTION_CONTRACT: PASS
M3_LIVE_AB: NOT_RUN
KRC_MEDIA_ACTIVE_STT_PROVIDER: assemblyai
GEMINI_PRERECORDED_PROVIDER_ACTIVE: FALSE
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next step

Prepare a concrete corpus manifest using stable non-secret case identifiers and asset SHA-256 digests. Raw media and provider credentials must stay outside GitHub. Live provider execution remains a separate provider-consuming step.
