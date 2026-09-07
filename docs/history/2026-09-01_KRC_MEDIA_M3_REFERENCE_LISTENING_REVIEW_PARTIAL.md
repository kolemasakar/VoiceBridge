# KRC Media M3 Reference Listening Review - Partial

Status: PARTIAL_REVIEW_ACCEPTED / UA_REFERENCE_MISMATCH
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the independent owner listening review of the three exact accepted M3 clean-public audio assets without storing transcript text or media bytes in GitHub.

The local audio files were first verified byte-for-byte against the accepted asset SHA-256 values before listening review.

## Local exact-asset verification

```text
en-clean-public-001 asset SHA-256
63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715
MATCH

ru-clean-public-001 asset SHA-256
d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5
MATCH

ua-clean-public-001 asset SHA-256
98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c
MATCH
```

## Independent listening result

### en-clean-public-001

- full exact audio listened through: YES
- candidate reference matched spoken lexical content: YES
- candidate bytes changed after review: NO
- final reference SHA-256 accepted:
  `044267656cd78db47edd50fead3ae70f8f7240f3c1f3523cc53b94594de5ecfa`
- reference review state: `independent_reviewed`

### ru-clean-public-001

- full exact audio listened through: YES
- candidate reference matched spoken lexical content: YES
- candidate bytes changed after review: NO
- final reference SHA-256 accepted:
  `1c7ac3953951270a56bf5927c86a26d28281ca9b958981c9ab56776837faaadf`
- reference review state: `independent_reviewed`

### ua-clean-public-001

- exact accepted audio was listened to: YES
- candidate reference matched spoken lexical content: NO
- mismatch class: MATERIAL_LEXICAL_MISMATCH / WRONG_REFERENCE_TEXT
- candidate reference SHA-256 `d9a6dbf5f2d0d1f8c200b11736982f3c9b2c02741d2303c96a359fe30015e461` is NOT accepted as a final reference digest
- owner reported that the audio contains a short Ukrainian phrase that is materially different from the unrelated candidate text
- corrected final reference bytes: PENDING
- corrected final reference SHA-256: PENDING
- reference review state: `review_mismatch_correction_required`

No transcript text is stored in this repository record. The corrected Ukrainian reference artifact must remain outside GitHub under the existing evidence boundary.

## Current M3 readiness

```text
ASSET_SHA256_ACCEPTED: TRUE 3/3
REFERENCE_LISTENING_REVIEW_COMPLETED: TRUE 3/3
REFERENCE_MATCH_ACCEPTED: TRUE 2/3
REFERENCE_MISMATCH: TRUE 1/3
FINAL_REFERENCE_SHA256_ACCEPTED: TRUE 2/3
UA_REFERENCE_CORRECTION_REQUIRED: TRUE
READY_FOR_AB: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next transition

```text
ua-clean-public-001
  -> confirm complete exact spoken wording for the full clip
  -> save corrected reference artifact outside GitHub using UTF-8 / LF / one terminal newline
  -> compute corrected SHA-256
  -> accept UA reference as independent_reviewed
  -> READY_FOR_AB for the three-case clean tranche
```

No AssemblyAI or Gemini prerecorded corpus call is authorized until all three cases are READY_FOR_AB.
