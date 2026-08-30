# KRC Media M3 Corpus Selection Plan

Status: READY - ASSET SELECTION PENDING
Date: 2026-08-30
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Define the minimum A/B corpus before selecting real media assets.

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

Current state:

```text
CORPUS_SELECTION_PLAN: READY
REAL_ASSETS_SELECTED: FALSE
REFERENCE_TRANSCRIPTS_READY: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next step

Select real corpus assets and prepare independent reference transcripts. Provider execution remains a separate later step.
