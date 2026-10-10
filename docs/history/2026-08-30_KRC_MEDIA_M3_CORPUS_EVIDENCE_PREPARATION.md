# KRC Media M3 Corpus Evidence Preparation

Status: ACCEPTED - PROVIDER EXECUTION NOT STARTED
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Provide an offline, byte-exact preparation step between corpus selection and provider-consuming AssemblyAI/Gemini A/B execution.

The preparation helper accepts local media bytes and, when available, local independently prepared reference-transcript bytes. It emits only metadata and SHA-256 digests. Raw media bytes and reference transcript bytes are not returned by the helper and are not intended for GitHub persistence.

## Implementation

- `src/cloud/src/krc_media_ab_corpus_preparation.ts`
- `src/cloud/tests/krc_media_ab_corpus_preparation.test.ts`

The helper computes SHA-256 over the exact supplied bytes. No newline normalization or text rewriting occurs before hashing. This avoids hidden equivalence rules: if a reference transcript artifact changes byte-for-byte, its digest changes.

The result is passed through the accepted M3 corpus-manifest parser, so readiness remains derived rather than caller asserted:

- selected asset only -> `ASSET_SELECTED`;
- selected asset plus reference transcript with review still pending -> `ASSET_SELECTED`;
- selected asset plus reference transcript plus `independent_reviewed` -> `READY_FOR_AB`.

Independent review cannot be recorded when no reference transcript evidence exists. Empty media or empty reference artifacts fail closed.

## Validation

Implementation/documentation validation:

- implementation/documentation head `5330afd2bf3a2b0217b84ccc697c56e0de727872`
- Validate run `33290550441`: SUCCESS
- cloud: 224/224 tests PASS
- browser-extension: PASS
- repository-docs: PASS

Final corpus-plan checkpoint before this note:

- head `95dd599da0749346a5dd01c83e3735f068dc0879`
- Validate run `33290632093`: SUCCESS
- cloud: PASS
- browser-extension: PASS
- repository-docs: PASS

The six new corpus-preparation regression tests all passed, including exact-byte hashing, raw-evidence non-return, review-state gating, empty-evidence failure, and byte-level digest distinction.

## Privacy and safety

This preparation step:

- does not call AssemblyAI;
- does not call Gemini;
- does not call Supadata;
- does not upload media;
- does not mutate Render configuration;
- does not mutate Neon;
- does not change the KRC Action URL;
- does not activate Gemini prerecorded STT;
- does not authorize merge or production cutover.

Raw media and reference transcript text remain outside GitHub. Only stable non-secret case metadata and SHA-256 digests may be committed after real evidence is selected and reviewed.

## Current boundary

The software path is now ready to accept real local corpus evidence without provider work. No actual corpus asset has been selected or hashed through this process yet, and no case is therefore accepted as `READY_FOR_AB` on the basis of real evidence.

Next valid work is to supply/select actual corpus assets and independently prepared reference transcript artifacts. Provider-consuming execution remains a later explicit step.
