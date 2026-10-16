# KRC Media M3 Corpus Manifest Contract

Status: ACCEPTED - OFFLINE PRE-EXECUTION GATE
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Convert the M3 corpus-selection plan into a machine-validated readiness contract without starting any provider work.

Implementation:

- `src/cloud/src/krc_media_ab_corpus_manifest.ts`
- `src/cloud/tests/krc_media_ab_corpus_manifest.test.ts`

The contract is metadata-only. It cannot upload media, call AssemblyAI, call Gemini, change the active KRC provider, mutate Render, or mutate Neon.

## Accepted manifest fields

Each case contains only:

- stable non-secret `case_id`;
- `source_class` (`public_web` or `private_attachment`);
- bounded `test_dimension`;
- nullable SHA-256 digest of the selected media asset;
- nullable SHA-256 digest of the independently prepared reference transcript;
- reference-review state;
- language hint;
- timestamp setting;
- diarization setting.

Unsupported fields fail closed. Regression tests explicitly reject raw media URLs, local paths, reference transcript text, API keys, and access codes.

## Derived readiness states

`PLANNED`

- no real media asset digest exists;
- reference material cannot be marked independently reviewed.

`ASSET_SELECTED`

- real media asset digest exists;
- reference transcript is absent, incomplete, or still pending independent review.

`READY_FOR_AB`

- media asset SHA-256 exists;
- reference transcript SHA-256 exists;
- reference state is `independent_reviewed`.

The readiness state is derived by code. It is not a caller-supplied field.

## Execution boundary

Only a `READY_FOR_AB` entry can produce the provider-neutral execution pair.

That pair is still only metadata. It locks:

- AssemblyAI model: `universal-2`;
- Gemini model: `gemini-3.5-transcribe`;
- identical media digest;
- identical language hint;
- identical timestamp option;
- identical diarization option.

A non-ready case fails before any execution pair can be created.

## Validation

Code/test head:

`fba92e79bb541d67934cc156089810ceb682a9bd`

GitHub Actions run:

`33290036894`

Result:

```text
CLOUD_TESTS: 218
PASS: 218
FAIL: 0
BROWSER_EXTENSION: PASS
REPOSITORY_DOCS: PASS
PROVIDER_CALLS: NONE
ASSEMBLYAI_SPEND: NONE
GEMINI_MEDIA_SUBMISSION: NONE
GEMINI_PRERECORDED_ACTIVE: FALSE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Remaining M3 blocker

No real corpus asset has been selected and no independent reference transcript has been accepted yet. Therefore no case is currently `READY_FOR_AB`.

The next valid transition is real asset selection plus reference-transcript preparation. Actual AssemblyAI/Gemini A/B execution remains a later provider-consuming action and is not authorized by this checkpoint.
