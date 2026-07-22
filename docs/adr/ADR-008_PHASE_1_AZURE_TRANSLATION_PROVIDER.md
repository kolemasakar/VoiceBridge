# ADR-008 Phase 1 Azure Translation Provider

Status: ACCEPTED

Date: 2026-07-22

Decision Owners: VoiceBridge project

## Context

The Gemini free-tier translation path reached its daily request quota during
controlled endurance testing. English STT and Azure Speech TTS remained stable,
but translation stopped before the session ended.

## Decision

Use Azure Translator as the primary Phase 1 translation provider.

Use Gemini 3.1 Flash Lite as the fallback provider.

```text
AssemblyAI STT
    -> Azure Translator
    -> Azure Speech TTS
```

Fallback path:

```text
AssemblyAI STT
    -> Gemini 3.1 Flash Lite translation
    -> Azure Speech TTS
```

Configuration:

```text
TRANSLATION_PROVIDER=azure
TRANSLATION_FALLBACK_PROVIDER=gemini
AZURE_TRANSLATOR_KEY=<secret>
AZURE_TRANSLATOR_REGION=eastus
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
```

The existing `GEMINI_API_KEY` and `GEMINI_TRANSLATION_MODEL` remain configured
for fallback only.

## Runtime Policy

- Azure is attempted first for every accepted final English segment.
- Gemini is used when Azure is unavailable, rate limited, timed out, rejected,
  or not yet configured.
- A fallback result reports provider `gemini-fallback`.
- Translation order remains controlled by the existing sequential queue.
- Provider errors do not stop STT or TTS processing already accepted.
- No translation text or provider response is persisted.
- Provider keys are never sent to the browser.

## Validation Requirements

- Azure adapter request and response normalization pass automated tests.
- Regional authentication headers are present.
- Gemini fallback activates after an Azure quota response.
- Live translation count matches final STT segment count.
- Azure Speech voices every translated segment.
- Stop drains translation and TTS queues with one user command.
- No provider secret or translated content is persisted.

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-22 | Accepted Azure Translator primary with Gemini fallback |
