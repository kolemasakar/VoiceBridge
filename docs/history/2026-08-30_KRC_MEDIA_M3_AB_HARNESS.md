# KRC Media M3 A/B Evaluation Harness

Status: ACTIVE - OFFLINE HARNESS
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Prepare the M3 AssemblyAI versus Gemini prerecorded-transcription review without making any provider-consuming call during harness construction.

This document does not authorize live A/B transcription, production cutover, Action URL changes, paid-provider activation, Render environment mutation, Neon mutation, public rollout, or deletion of the legacy KRC endpoint.

## Current provider state

Active KRC prerecorded provider:

`assemblyai / universal-2`

Inactive candidate:

`gemini / gemini-3.5-transcribe`

M2 checkpoint:

`KRC_MEDIA_GEMINI_ADAPTER_UNIT_PASS`

M2 corrected implementation head:

`556a5908cd0644214983b5635da7dbd256835dd1`

M2 final validation run:

`33287981118`

Result: 198/198 cloud tests PASS.

## Offline harness

The M3 harness is implemented in:

`src/cloud/src/krc_media_ab_evaluation.ts`

Regression coverage:

`src/cloud/tests/krc_media_ab_evaluation.test.ts`

The harness consumes already-produced provider result records. It contains no provider client, API key lookup, source downloader, media uploader, or network execution path.

Therefore the harness itself cannot start AssemblyAI or Gemini transcription.

## Corpus manifest contract

Each case contains only evaluation metadata:

- stable non-secret `case_id`;
- `source_class`: `public_web` or `private_attachment`;
- transcription `language_hint`;
- curated `reference_text`;
- optional expected names/terms;
- optional expected numeric tokens;
- optional timestamp requirement.

The evaluator intentionally does not require source URLs, bearer tokens, signed attachment URLs, API keys, owner codes, database URLs, or provider credentials.

Provider execution, when separately authorized, must remain outside this offline scoring module.

## Deterministic metrics

The harness records separately instead of producing a single automatic winner:

- normalized word error rate against the curated reference;
- substitution count;
- insertion count;
- deletion count;
- expected term/name recall;
- expected numeric-token recall;
- timestamp coverage;
- detected-language value actually returned by the provider;
- provider language-confidence value only when actually returned;
- provider cleanup confirmation state;
- end-to-end provider latency supplied by the execution record;
- quota seconds reserved supplied by the execution record.

The evaluator does not invent Gemini confidence values.

## Manual review boundary

Word error rate and token recall are useful but are not equivalent to factual fidelity or hallucination detection.

Every provider evaluation therefore retains:

```text
manual_factual_review_required: true
manual_hallucination_review_required: true
```

Every pair comparison retains:

```text
automatic_winner: null
manual_review_required: true
```

This prevents a lower WER, faster latency, or higher timestamp coverage from being silently converted into a blanket provider-quality conclusion.

## M3 corpus design

A useful controlled corpus should include at least the following classes before any provider preference is accepted:

- Ukrainian clean speech;
- Ukrainian noisy speech;
- Russian clean/noisy speech where policy permits the selected source;
- English clean/noisy speech;
- code-switching samples;
- names and uncommon proper nouns;
- numbers, dates, monetary values, coordinates, and percentages;
- multiple speakers;
- short clips;
- longer clips within the provider limit;
- public web/social media source material;
- owner-approved private attachment material.

The same exact media asset must be used for both providers within each A/B case. A retrieval difference must not be misreported as an STT-provider difference.

## Acceptance criteria before live A/B can be interpreted

- identical source asset per provider pair;
- identical language hint and timestamp/diarization options;
- provider model explicitly recorded;
- source class explicitly recorded;
- reference transcript independently curated or manually reviewed;
- expected names/numbers defined before reading the provider output when practical;
- cleanup state recorded;
- provider failures retained rather than excluding failed cases;
- no automatic winner produced by the harness;
- raw private media or credentials not committed to GitHub.

## Current gate

```text
M0_PREFLIGHT: COMPLETE
M1_PROVIDER_ABSTRACTION: PASS
M2_GEMINI_ADAPTER: PASS
M3_OFFLINE_HARNESS: IMPLEMENTED
M3_LIVE_AB: NOT_RUN
KRC_MEDIA_ACTIVE_STT_PROVIDER: assemblyai
GEMINI_PRERECORDED_PROVIDER_ACTIVE: FALSE
PRODUCTION_CUTOVER: NOT_AUTHORIZED
KRC_ACTION_URL_CHANGE: NOT_AUTHORIZED
PAID_PROVIDER_USE: NOT_AUTHORIZED
LEGACY_ENDPOINT_DELETION: NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next gate

The next M3 step is to validate this offline harness in CI and then prepare a concrete A/B corpus manifest. Actual provider execution is a separate step because it can submit media to external providers and may consume AssemblyAI quota/credits even when Gemini Free Tier is available.
