# AssemblyAI STT Model Guard

Date: 2026-08-02

Status: IMPLEMENTED - DEPLOYMENT VALIDATION PENDING

## Context

AssemblyAI announced that requests with an empty `speech_model` parameter will
use `universal-3-5-pro` starting on 2026-09-02.

VoiceBridge already sent `universal-streaming-english` explicitly. This
maintenance change adds fail-closed controls so a future empty or unapproved
configuration cannot silently change the selected STT model.

## Implemented Controls

- approved STT model constant: `universal-streaming-english`;
- optional deployment variable: `ASSEMBLYAI_SPEECH_MODEL`;
- default to the approved model when the variable is absent;
- reject empty model values during service startup;
- reject models not explicitly approved in code;
- send a non-empty `speech_model` query parameter on every AssemblyAI stream;
- record `stt_provider` and `stt_model` in the structured startup event;
- automated tests for default, empty, unapproved, disabled-provider, and
  outbound-query behavior.

## Security and Privacy

- no API keys or secret values are added to source control;
- provider credentials remain in Render environment configuration;
- no audio, transcript, translation, or synthesized speech persistence changes.

## Deployment Verification

After merge and deployment:

1. Confirm the Render deployment completes successfully.
2. Confirm the startup log reports:

```text
stt_provider=assemblyai
stt_model=universal-streaming-english
```

3. Run a short controlled YouTube session.
4. Confirm STT reaches `READY` and final English segments are produced.
5. Press Stop once and confirm clean completion with no pending queues.

The validated Phase 1 product baseline remains unchanged until this maintenance
build passes live deployment verification.
