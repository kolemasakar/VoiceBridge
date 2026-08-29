# ADR-009: Gemini 3.5 Transcribe Live as Default STT

Status: Accepted

Date: 2026-08-29

## Context

Phase 1 originally validated AssemblyAI `universal-streaming-english` as the
streaming English STT provider. VoiceBridge subsequently introduced a
provider-neutral `SttProvider` boundary so that STT could be replaced without
redesigning browser capture, translation, TTS, or the stable transcript event
contract.

Gemini 3.5 Transcribe Live became available as a real-time transcription model.
The migration was evaluated as an isolated provider transition with AssemblyAI
retained as rollback.

## Decision

VoiceBridge will use `gemini-3.5-transcribe-live` as the default STT provider.

The runtime default is:

```text
STT_PROVIDER=gemini
GEMINI_STT_MODEL=gemini-3.5-transcribe-live
```

AssemblyAI remains an explicit rollback option:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

The migration does not change the downstream provider decisions:

- Azure Translator remains primary translation;
- Gemini remains translation fallback;
- Azure Speech remains Ukrainian TTS;
- browser PCM transport and the VoiceBridge transcript event contract remain
  stable.

## Evidence

Acceptance required and received:

- current official Google model/API and Free Tier review;
- explicit acceptance of Free Tier content use for Google product improvement;
- Google AI Studio project/model access validation;
- automated provider and contract tests;
- live WebSocket handshake and streaming validation;
- end-to-end STT -> translation -> TTS -> playback validation;
- controlled same-duration AssemblyAI/Gemini A/B;
- explicit user acceptance on 2026-08-29.

The detailed A/B record is in:

`docs/history/2026-08-29_GEMINI_3_5_TRANSCRIBE_STT_ACCEPTED.md`

## Consequences

Positive:

- Gemini becomes the normal STT path behind an existing replaceable interface;
- AssemblyAI remains immediately available for controlled rollback;
- no new browser-side provider credential exposure is introduced;
- no automatic paid fallback is introduced.

Constraints:

- Gemini Live session limits and project quotas remain external operational
  constraints;
- Free Tier data-use terms are accepted for this use;
- provider-specific regressions must be handled behind `SttProvider`, not by
  changing the public VoiceBridge stream contract.

## Rollback

Rollback is configuration-only as long as the AssemblyAI adapter and credential
remain available. Set `STT_PROVIDER=assemblyai` and keep the guarded
`universal-streaming-english` model.

## Supersession

This ADR changes the current provider decision made in
`ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md`. ADR-005 remains part of the Phase 1
historical validation record; this ADR governs the current default STT provider.
