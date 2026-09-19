# KRC Media M3 Real Corpus Source Selection

Status: SOURCE CANDIDATES LOCKED - BYTE CAPTURE PENDING
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Lock the first public-source tranche for M3 before any provider-consuming A/B work.

This document records source pages and reference-text origins only. It does not claim `ASSET_SELECTED` or `READY_FOR_AB`. Those states require exact captured media bytes and SHA-256 evidence under the accepted corpus preparation and manifest contracts.

## First tranche

### ua-clean-public-001

- language: `uk-UA`
- source class: `public_web`
- dimension: Ukrainian clean single-speaker address
- media source page: `https://www.president.gov.ua/videos/na-kozhen-rosijskij-udar-bude-nashe-reaguvannya-zvernennya-p-8809`
- upstream embedded media identifier observed from the official page: YouTube `GI5rKSymMK4`
- reference-text source: `https://www.president.gov.ua/news/na-kozhen-rosijskij-udar-bude-nashe-reaguvannya-zvernennya-p-105761`
- source publisher: Office of the President of Ukraine
- pair options: word timestamps=yes, diarization=no
- selection state: `SOURCE_LOCKED_PENDING_BYTE_CAPTURE`

Rationale: official video page and separate official speech-text page for the same dated address. The published text is independent of both candidate STT providers. Final reference evidence still requires manual comparison against the captured media before `independent_reviewed` is asserted.

### ru-clean-public-001

- language: `ru-RU`
- source class: `public_web`
- dimension: Russian clean short single-speaker video address
- source page: `https://kremlin.ru/events/president/news/79449`
- official transcript index: `https://kremlin.ru/events/president/transcripts`
- source publisher: President of Russia official site
- published duration signal: approximately 3 minutes in the official transcript index
- pair options: word timestamps=yes, diarization=no
- selection state: `SOURCE_LOCKED_PENDING_BYTE_CAPTURE`

Rationale: short official video address with an official transcript path. The source was selected for clean Russian speech and bounded duration. Exact media bytes and a manually checked reference artifact remain required before the corpus manifest may advance.

### en-clean-public-001

- language: `en-US`
- source class: `public_web`
- dimension: English clean formal speech
- source/reference page: `https://www.un.org/sg/en/content/sg/statements/2026-07-06/secretary-generals-remarks-the-general-assembly-the-responsibility-protect-prepared-for-delivery-the-chef-de-cabinet`
- source publisher: United Nations
- page evidence: official speech text plus official multimedia video on the same UN page
- pair options: word timestamps=yes, diarization=no
- selection state: `SOURCE_LOCKED_PENDING_BYTE_CAPTURE`

Rationale: official English text and official event video are co-published, while the reference text is not produced by AssemblyAI or Gemini. Because the page labels the text as prepared for delivery, final reference evidence must be manually reconciled to the actual spoken media before `independent_reviewed` is asserted.

## Evidence boundary

None of the three cases currently has an accepted `asset_sha256` or `reference_transcript_sha256`.

The next valid transition is:

```text
SOURCE_LOCKED_PENDING_BYTE_CAPTURE
  -> capture exact media bytes
  -> compute byte-exact asset SHA-256
  -> prepare reference transcript artifact outside GitHub
  -> manually reconcile reference text to actual spoken media
  -> compute reference transcript SHA-256
  -> independent review
  -> READY_FOR_AB
```

## Safety

No AssemblyAI, Gemini, Supadata, Render, or Neon operation is part of source selection. No production endpoint, Action URL, provider default, or release gate is changed.
