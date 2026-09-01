# KRC Media M3 Corpus Selection Plan

Status: READY - FIRST CLEAN ASSET TRANCHE ACCEPTED, REFERENCE EVIDENCE REQUIRED
Date: 2026-08-30
Last updated: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Define the minimum A/B corpus and the evidence gates required before provider-consuming execution.

Each case will use the accepted same-asset execution contract. The same normalized media bytes and SHA-256 digest must be used for AssemblyAI `universal-2` and Gemini `gemini-3.5-transcribe`.

## Planned cases

| Case ID | Source class | Test dimension | Language hint | Timestamps | Diarization |
| --- | --- | --- | --- | --- | --- |
| `ua-clean-public-001` | public_web | Ukrainian clean speech | `uk-UA` | yes | no |
| `ua-noisy-public-001` | public_web | Ukrainian noisy/compressed speech | `uk-UA` | yes | no |
| `ru-clean-public-001` | public_web | Russian clean speech | `ru-RU` | yes | no |
| `ru-noisy-public-001` | public_web | Russian noisy/compressed speech | `ru-RU` | yes | no |
| `en-clean-public-001` | public_web | English clean speech | `en-US` | yes | no |
| `en-noisy-public-001` | public_web | English noisy/compressed speech | `en-US` | yes | no |
| `code-switch-public-001` | public_web | multilingual code switching | `auto` | yes | no |
| `proper-nouns-public-001` | public_web | names and uncommon terms | `auto` | yes | no |
| `numbers-public-001` | public_web | dates counts money percentages coordinates | `auto` | yes | no |
| `multi-speaker-public-001` | public_web | multiple speakers | `auto` | yes | yes |
| `long-public-001` | public_web | longer-form omission and drift | `auto` | no | no |
| `private-owner-001` | private_attachment | owner-approved private attachment | `auto` | yes | no |

## Readiness

A case becomes `READY_FOR_AB` only after a real asset is selected, its SHA-256 digest is recorded, the provider-pair options are locked, and an independently reviewed reference transcript is prepared.

Reference transcripts must not be derived from either candidate provider output and then treated as independent ground truth. Names, numbers, dates, and materially important wording should receive explicit manual review.

The accepted offline helper `krc_media_ab_corpus_preparation.ts` provides byte-exact hashing and emits only metadata plus SHA-256 digests. Raw media and reference transcript bytes remain outside GitHub.

## First clean public asset tranche

The original publisher-level source candidates recorded in `docs/history/2026-09-01_KRC_MEDIA_M3_REAL_CORPUS_SOURCE_SELECTION.md` could not yield byte-stable assets from the GitHub-hosted capture environment without cookies, authentication, paid retrieval, or unsupported scraping workarounds. The attempts and the resulting source-reselection decision are retained as historical provenance.

The accepted replacement asset evidence is recorded in:

- `docs/history/2026-09-01_KRC_MEDIA_M3_BYTE_CAPTURE_ACCEPTANCE.md`.

Accepted clean-public assets:

| Case ID | Bytes | Asset SHA-256 | State |
| --- | ---: | --- | --- |
| `ua-clean-public-001` | 136612 | `98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c` | `ASSET_SELECTED` |
| `ru-clean-public-001` | 128044 | `d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5` | `ASSET_SELECTED` |
| `en-clean-public-001` | 1152693 | `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715` | `ASSET_SELECTED` |

The accepted byte-capture workflow is retained as a manual-only reproducibility tool (`workflow_dispatch`). It no longer runs automatically on branch pushes.

## Current state

```text
CORPUS_SELECTION_PLAN: READY
CORPUS_MANIFEST_CONTRACT: PASS
CORPUS_EVIDENCE_PREPARATION: PASS
FIRST_CLEAN_PUBLIC_ASSET_TRANCHE_ACCEPTED: TRUE
REAL_ASSET_BYTES_CAPTURED: TRUE
REAL_ASSETS_SELECTED: TRUE
ASSET_SHA256_ACCEPTED: TRUE
REFERENCE_TRANSCRIPTS_READY: FALSE
REFERENCE_SHA256_ACCEPTED: FALSE
READY_FOR_AB: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next step

Prepare independent reference transcript candidates for the three accepted clean assets, manually reconcile each candidate to the exact captured audio, hash the final reviewed transcript bytes, and only then advance eligible cases to `READY_FOR_AB`.

Provider execution remains a separate later step.
