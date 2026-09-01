# KRC Media M3 Byte Capture Blocked and Source Reselection
Фіксація fail-closed результату першого byte-capture tranche та контрольованої заміни джерел на byte-stable public media.

Status: ACCEPTED_CAPTURE_BLOCK / RESELECTION_ACTIVE
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the result of the first real byte-capture attempts without promoting unavailable source pages to asset evidence, and select replacement public sources that expose stable downloadable media bytes without cookies, authentication, paid retrieval, provider credentials, AssemblyAI, Gemini, or Supadata.

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

## Safety result

Across all attempts:

```text
ASSEMBLYAI_CALLS: NONE
GEMINI_MEDIA_CALLS: NONE
SUPADATA_CALLS: NONE
PAID_RETRIEVAL: NONE
PROVIDER_CREDENTIALS_USED: NONE
RAW_MEDIA_GITHUB_ARTIFACTS: NONE
ACCEPTED_ASSET_SHA256: NONE
REFERENCE_SHA256: NONE
READY_FOR_AB: FALSE
M3_PROVIDER_AB: NOT_RUN
```

Temporary runner files were deleted and no raw media was uploaded as an Actions artifact.

## Decision

Repeated retries against the same access boundaries would not increase evidence quality. The original tranche is therefore retained as historical source-selection evidence but marked `CAPTURE_BLOCKED` for M3 corpus execution.

This does not mark the original sources false, unavailable to humans, or unsuitable for research. It means only that they do not currently satisfy the byte-stable automated corpus-capture requirement under the accepted no-cookie/no-auth/no-paid-retrieval boundary.

## Replacement tranche criteria

Replacement sources must provide:

- real public speech;
- target language appropriate for the case;
- direct/stable downloadable media bytes;
- lawful public reuse/access metadata;
- traceable source/origin metadata;
- no login, cookies, personal session, or paid retrieval;
- no STT-provider call during capture;
- independent reference transcript preparation remains a later manual evidence step.

## Replacement source candidates

### `ua-clean-public-001`

Wikimedia Commons file:

`File:Звернення Володимира Зеленського.webm`

Characteristics:

- Ukrainian speech;
- duration about 1:26;
- public Commons media object;
- page identifies Ukrinform TV / OPU / President.gov.ua provenance;
- CC BY 3.0 attribution metadata on Commons;
- stable file redirect can resolve to `upload.wikimedia.org`.

State: `SOURCE_RESELECTED_PENDING_BYTE_CAPTURE`.

### `ru-clean-public-001`

Wikimedia Commons file:

`File:Putin talk 2011-12-15 09888-09940 Идите ко мне, бандерлоги.ogv`

Characteristics:

- Russian clean/studio speech excerpt;
- duration about 0:52;
- source identifies the Press Office of the Government of Russia / premier.gov.ru;
- Commons records CC BY licensing and Russian timed text;
- stable file redirect can resolve to `upload.wikimedia.org`.

State: `SOURCE_RESELECTED_PENDING_BYTE_CAPTURE`.

### `en-clean-public-001`

Wikimedia Commons file:

`File:Biden clip from inaugural speech 2.ogv`

Characteristics:

- English clean public speech;
- duration about 1:11;
- White House source attribution;
- public-domain US federal government work metadata on Commons;
- stable file redirect can resolve to `upload.wikimedia.org`.

State: `SOURCE_RESELECTED_PENDING_BYTE_CAPTURE`.

## Evidence boundary

Wikimedia Commons is the distribution host for these replacement corpus bytes. It is not automatically the underlying origin of the speech. Provenance must preserve the source/author metadata recorded on each file description page.

The captured bytes, if successful, become the fixed A/B corpus asset only after SHA-256 is recorded. The existing source pages and Commons metadata remain provenance evidence; neither substitutes for independent reference-transcript review.

## Current state

```text
FIRST_PUBLIC_SOURCE_TRANCHE_LOCKED: HISTORICAL / CAPTURE_BLOCKED
REPLACEMENT_PUBLIC_SOURCE_TRANCHE: SELECTED_PENDING_BYTE_CAPTURE
REAL_ASSET_BYTES_CAPTURED: FALSE
REAL_ASSETS_SELECTED: FALSE
ASSET_SHA256: NOT_CREATED
REFERENCE_TRANSCRIPTS_READY: FALSE
REFERENCE_SHA256: NOT_CREATED
READY_FOR_AB: FALSE
M3_PROVIDER_AB: NOT_RUN
CURRENT: M3 REPLACEMENT BYTE CAPTURE + SHA-256
```

## Marker

`KRC_MEDIA_M3_CAPTURE_BLOCK_RESELECTION_2026_09_01`
