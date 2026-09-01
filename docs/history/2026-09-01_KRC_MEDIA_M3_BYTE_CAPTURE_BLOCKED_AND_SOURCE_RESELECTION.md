# KRC Media M3 Byte Capture Blocked and Source Reselection

Fail-closed record of the first byte-capture tranche and the controlled source reselection toward byte-stable public media.

Status: ACCEPTED_CAPTURE_BLOCK / RESELECTION_SUPERSEDED_BY_ACCEPTED_GITHUB_FIXTURES
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the result of the first real byte-capture attempts without promoting unavailable source pages to asset evidence, and preserve the intermediate Wikimedia replacement decision that preceded the accepted version-pinned GitHub fixture tranche.

## Original locked tranche

Historical source-selection record:

`docs/history/2026-09-01_KRC_MEDIA_M3_REAL_CORPUS_SOURCE_SELECTION.md`

Cases:

- `ua-clean-public-001` - Office of the President of Ukraine 2026-08-09 address page;
- `ru-clean-public-001` - Kremlin 2026-04-01 video address page;
- `en-clean-public-001` - UN 2026-07-06 Responsibility to Protect statement/WebTV media.

Those selections were source-level only and never reached `ASSET_SELECTED`.

## Capture attempts

### Attempt 1 - source pages

Workflow run: `33488743683`

Result: `FAILED / FAIL_CLOSED`.

Observed barriers:

- Ukrainian official page: HTTP 403 from the GitHub hosted runner;
- Kremlin page: retrieval timeout;
- UN statement page: no generic yt-dlp media extractor.

### Attempt 2 - known official upstream media endpoints

Workflow run: `33489018047`

Result: `FAILED / FAIL_CLOSED`.

Observed barriers:

- embedded YouTube asset `GI5rKSymMK4`: GitHub runner blocked by YouTube anti-bot challenge;
- official Kremlin Telegram distribution: generic yt-dlp path did not yield a local media file;
- UN WebTV endpoint did not yield a usable generic-download result.

### Attempt 3 - source-specific zero-credit public retrieval

Workflow run: `33489507300`

Result: `FAILED / FAIL_CLOSED`.

The capture logic mirrored the accepted Telegram public-web trust boundary and used the official UN WebTV asset page. Results:

- official Ukrainian Telegram post: public embed exposed no trusted browser-playable MP4;
- official Kremlin Telegram post: public embed exposed no trusted browser-playable MP4;
- UN WebTV page: static HTML exposed no supported direct MP4/HLS URL.

The exact-head normal VoiceBridge validation remained green at commit `cc3c67da228a2e36c78a9da90d9ec3134edc78c9`, run `33489510981` SUCCESS.

### Attempt 4 - Wikimedia Commons replacement redirect

Workflow run: `33489821645`

Result: `FAILED / FAIL_CLOSED`.

Three replacement speech objects were selected on Wikimedia Commons. The hosted runner received HTTP 429 from the Commons public file redirect surface.

### Attempt 5 - direct Wikimedia storage objects

Workflow run: `33490131435`

Result: `FAILED / FAIL_CLOSED`.

Direct `upload.wikimedia.org` original object URLs also returned HTTP 429 to the GitHub-hosted runner. This confirmed an infrastructure rate-limit boundary rather than a missing source-selection record.

## Safety result

Across all failed capture attempts:

```text
ASSEMBLYAI_CALLS: NONE
GEMINI_MEDIA_CALLS: NONE
SUPADATA_CALLS: NONE
PAID_RETRIEVAL: NONE
PROVIDER_CREDENTIALS_USED: NONE
RAW_MEDIA_GITHUB_ARTIFACTS: NONE
ACCEPTED_ASSET_SHA256_FROM_FAILED_ATTEMPTS: NONE
REFERENCE_SHA256: NONE
M3_PROVIDER_AB: NOT_RUN
```

Temporary runner files were deleted and no raw media was uploaded as an Actions artifact.

## Decision

Repeated retries against the same access boundaries would not increase evidence quality. The original publisher tranche is retained as historical source-selection evidence but marked `CAPTURE_BLOCKED` for M3 corpus execution.

The Wikimedia tranche was a valid intermediate public-source reselection but was also blocked by hosted-runner HTTP 429. It is retained as provenance history and is not the accepted M3 asset tranche.

This does not mark those sources false, unavailable to humans, or unsuitable for research. It means only that they did not satisfy the byte-stable automated corpus-capture requirement under the accepted no-cookie/no-auth/no-paid-retrieval boundary in the tested environment.

## Superseding accepted tranche

The final clean-public replacement uses version-pinned public GitHub speech fixtures available as exact `raw.githubusercontent.com` objects. Successful byte evidence is recorded in:

`docs/history/2026-09-01_KRC_MEDIA_M3_BYTE_CAPTURE_ACCEPTANCE.md`

Successful run: `33490716248`.

The three accepted clean-public assets now have byte-exact SHA-256 values and state `ASSET_SELECTED`.

## Historical Wikimedia replacement candidates

The intermediate candidates were:

- Ukrainian: Wikimedia Commons object titled "Volodymyr Zelenskyy address" (`.webm`), approximately 1:26;
- Russian: Wikimedia Commons object from the 2011-12-15 Putin talk excerpt (`.ogv`), approximately 0:52;
- English: Wikimedia Commons Biden inaugural speech clip 2 (`.ogv`), approximately 1:11.

These candidates were not promoted to `ASSET_SELECTED` because no successful byte capture occurred from the GitHub-hosted runner.

## Evidence boundary

Distribution host and underlying speech origin remain distinct provenance concepts. A distribution host does not automatically become the underlying source of the speech.

A captured object becomes a fixed A/B corpus asset only after successful byte capture and SHA-256 acceptance. Independent reference-transcript review remains a separate gate.

## Current historical state

```text
FIRST_PUBLIC_SOURCE_TRANCHE: HISTORICAL / CAPTURE_BLOCKED
WIKIMEDIA_REPLACEMENT_TRANCHE: HISTORICAL / CAPTURE_BLOCKED
VERSION_PINNED_GITHUB_FIXTURE_TRANCHE: ACCEPTED
REAL_ASSET_BYTES_CAPTURED: TRUE
REAL_ASSETS_SELECTED: TRUE
ASSET_SHA256_ACCEPTED: TRUE
REFERENCE_TRANSCRIPTS_READY: FALSE
REFERENCE_SHA256_ACCEPTED: FALSE
READY_FOR_AB: FALSE
M3_PROVIDER_AB: NOT_RUN
CURRENT: M3 REFERENCE TRANSCRIPT PREPARATION + INDEPENDENT REVIEW
```

## Marker

`KRC_MEDIA_M3_CAPTURE_BLOCK_RESELECTION_2026_09_01`
