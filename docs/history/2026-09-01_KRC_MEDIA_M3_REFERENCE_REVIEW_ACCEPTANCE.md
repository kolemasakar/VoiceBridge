# KRC Media M3 Reference Review Acceptance

Status: REFERENCE_EVIDENCE_ACCEPTED / READY_FOR_AB
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Close the independent reference-listening gate for the first three accepted M3 clean-public assets without storing raw media or transcript text in GitHub.

All three local media files were verified byte-for-byte against their accepted asset SHA-256 values before review.

## Accepted final reference evidence

### ua-clean-public-001

- asset SHA-256: `98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c`
- full exact audio listened through: YES
- original candidate reference matched audio: NO
- mismatch class: `MATERIAL_LEXICAL_MISMATCH / WRONG_REFERENCE_TEXT`
- corrected reference artifact stored outside GitHub: YES
- corrected byte policy: UTF-8 / LF / exactly one terminal newline / no normalization before hashing
- final corrected reference SHA-256: `2ec614c71321a8747b6bb50fb57a7c341bcad9150a09c5cb2a1825ebfc0f828e`
- reference review state: `independent_reviewed`

The corrected transcript text itself is intentionally not stored in this repository.

### ru-clean-public-001

- asset SHA-256: `d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5`
- full exact audio listened through: YES
- candidate reference matched audio: YES
- candidate bytes changed after review: NO
- final reference SHA-256: `1c7ac3953951270a56bf5927c86a26d28281ca9b958981c9ab56776837faaadf`
- reference review state: `independent_reviewed`

### en-clean-public-001

- asset SHA-256: `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715`
- full exact audio listened through: YES
- candidate reference matched audio: YES
- candidate bytes changed after review: NO
- final reference SHA-256: `044267656cd78db47edd50fead3ae70f8f7240f3c1f3523cc53b94594de5ecfa`
- reference review state: `independent_reviewed`

## Readiness derivation

The accepted manifest contract derives `READY_FOR_AB` when all of the following exist for a case:

- selected media SHA-256;
- final reference transcript SHA-256;
- `reference_review_state=independent_reviewed`.

All three clean-public cases now satisfy that contract.

```text
ASSET_SHA256_ACCEPTED: TRUE 3/3
FINAL_REFERENCE_SHA256_ACCEPTED: TRUE 3/3
REFERENCE_REVIEW_STATE: independent_reviewed 3/3
READY_FOR_AB: TRUE 3/3
M3_PROVIDER_AB: NOT_RUN
ASSEMBLYAI_M3_CALLS: NONE
GEMINI_M3_MEDIA_CALLS: NONE
GEMINI_PRERECORDED_ACTIVE: FALSE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Provider-consumption boundary

This acceptance closes only the evidence-readiness gate.

It does not authorize or imply:

- automatic AssemblyAI corpus submission;
- automatic Gemini corpus submission;
- Gemini activation for normal KRC prerecorded jobs;
- provider or infrastructure cutover;
- merge to VoiceBridge main;
- any KRC release gate.

The next provider-consuming transition is a controlled same-asset AssemblyAI `universal-2` versus Gemini `gemini-3.5-transcribe` A/B run for the three READY_FOR_AB cases.
