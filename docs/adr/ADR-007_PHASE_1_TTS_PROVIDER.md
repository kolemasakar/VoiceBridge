# ADR-007 Phase 1 TTS Provider

Status: ACCEPTED

Date: 2026-07-21

Decision Owners: VoiceBridge project

## Context

Phase 1 Milestone 6 requires Ukrainian speech synthesis after each ordered final Ukrainian translation and browser playback with automatic ducking of the original YouTube audio.

The selected solution must:

- preserve the Cloud First boundary;
- keep provider credentials out of the browser;
- support Ukrainian speech;
- preserve translation segment identity and ordering;
- produce browser-playable audio;
- expose synthesis latency and sanitized errors;
- support a controlled free-tier test without enabling paid billing;
- remain replaceable behind a provider-neutral interface;
- avoid persistent storage of synthesized audio.

## Decision

Use Gemini Developer API as the Phase 1 TTS provider.

Use model:

`gemini-2.5-flash-preview-tts`

Use default voice:

`Iapetus`

The model and voice MUST remain configurable through:

- `GEMINI_TTS_MODEL`;
- `GEMINI_TTS_VOICE`.

The existing cloud-only credential is reused:

`GEMINI_API_KEY`

Browser clients MUST NOT receive or store the Gemini key.

## Rationale

Gemini 2.5 Flash Preview TTS is selected because:

- Ukrainian is listed as a supported language;
- the model produces mono 24000 Hz PCM suitable for browser playback;
- the official pricing page lists free-tier input and audio output;
- the existing Gemini API key and cloud integration can be reused;
- the model is intended for low-latency and cost-efficient speech generation;
- the provider remains isolated behind a VoiceBridge TTS interface.

`Iapetus` is selected as the initial voice because the official voice list describes it as clear. Voice quality remains subject to live Ukrainian validation and the voice can be changed without source-code modification.

This is a Phase 1 test binding, not a permanent production provider decision.

## Privacy Restriction

Gemini free-tier inputs and outputs may be used to improve Google products.

Therefore Phase 1 TTS is restricted to:

- controlled public YouTube test content;
- synthetic Ukrainian test text;
- content approved for external provider processing.

The free tier MUST NOT be used for private conversations, confidential meetings, personal communications, regulated content, or production user traffic.

## Provider-Neutral Contract

TTS request:

- translation segment identifier;
- target language `uk`;
- final Ukrainian text;
- selected voice;
- request timestamp;
- cancellation signal.

Normalized TTS result:

- original segment identifier;
- provider identifier;
- voice identifier;
- audio format `pcm_s16le`;
- sample rate `24000`;
- channel count `1`;
- PCM audio bytes;
- estimated audio duration;
- synthesis latency;
- completion timestamp.

Provider-specific response objects MUST NOT be exposed to the browser.

## Processing Policy

- synthesize final Ukrainian translations only;
- never synthesize partial English text;
- preserve translation order through one bounded sequential TTS queue per stream;
- limit one TTS source segment to 4000 characters;
- allow at most 20 pending TTS operations;
- use a 20000-millisecond provider timeout;
- do not retry automatically during Phase 1;
- emit sanitized TTS errors without terminating STT or translation;
- split normalized PCM into bounded output chunks;
- do not persist provider prompts, responses, or synthesized audio.

## Browser Playback Policy

- play Ukrainian PCM through the offscreen AudioContext;
- preserve cloud segment order;
- apply the configured Ukrainian gain;
- lower the complete original tab audio while Ukrainian playback is scheduled;
- restore the configured original background level after the playback queue empties;
- use smooth gain ramps;
- bound queued playback duration;
- release playback nodes and buffers during Stop or failure.

Initial gain defaults remain:

- original audio during Ukrainian speech: 15 percent;
- original audio between Ukrainian segments: 50 percent;
- Ukrainian speech: 100 percent.

## Cost and Quota Policy

- Phase 1 uses the Gemini Developer API free tier without a linked billing account;
- automatic paid upgrade is prohibited;
- quota or rate-limit exhaustion produces a sanitized provider error;
- no automatic provider fallback is enabled;
- request count and generated audio duration MUST be recorded during live tests;
- model availability and pricing MUST be rechecked before production planning.

## Alternatives Considered

Gemini 3.1 Flash TTS Preview:

- supports provider-side streaming;
- offers newer low-latency synthesis;
- free-tier pricing was not selected as the Phase 1 baseline;
- remains a future streaming adapter candidate.

Google Cloud Text-to-Speech:

- supports many languages and audio formats;
- requires billing to be enabled;
- does not meet the no-payment Phase 1 requirement.

Azure Speech TTS:

- supports Ukrainian neural voices;
- requires a separate Azure Speech resource and credential path;
- remains a future provider candidate.

Browser SpeechSynthesis:

- avoids a cloud TTS request;
- voice availability and quality differ by operating system and browser;
- weakens reproducibility and provider control;
- is not selected for the controlled reference implementation.

## Consequences

Positive:

- no new secret is required;
- no payment method is required for the controlled test;
- Ukrainian support and PCM format are documented;
- browser playback can use the existing AudioContext;
- provider credentials remain cloud-side;
- TTS remains replaceable.

Tradeoffs:

- the selected model is a preview model;
- provider-side streaming is not used in the initial implementation;
- complete provider responses are received before VoiceBridge chunks audio to the browser;
- TTS latency and Ukrainian voice quality require live validation;
- free-tier content may be used to improve provider products.

## Validation Requirements

Milestone 6 does not pass until:

- cloud startup reports TTS configuration safely;
- final Ukrainian translations produce ordered Ukrainian PCM audio;
- synthesis latency and playback state are visible;
- Ukrainian volume control changes real playback gain;
- original audio ducks automatically during Ukrainian playback;
- original audio restores smoothly after playback;
- TTS failure does not terminate STT or translation;
- Stop drains or cancels bounded TTS work and releases browser audio resources;
- a controlled live test produces understandable Ukrainian speech;
- no key, raw provider response, or persisted synthesized audio is exposed.

## References

- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-preview-tts
- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-006_PHASE_1_TRANSLATION_PROVIDER](ADR-006_PHASE_1_TRANSLATION_PROVIDER.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-21 | Accepted Gemini 2.5 Flash Preview TTS and Iapetus for controlled Phase 1 Ukrainian speech synthesis |
