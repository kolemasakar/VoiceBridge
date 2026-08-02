# AssemblyAI Turn Detection Tuning

Date: 2026-08-02

Status: IMPLEMENTED - LIVE VALIDATION PENDING

## Context

The validated free AssemblyAI model produced complete technical delivery but
fragmented English turns on a difficult YouTube sample. Translation and TTS
correctly processed every final STT segment, so the first quality adjustment is
limited to STT turn segmentation.

## Decision

Keep the approved free model:

```text
universal-streaming-english
```

Apply the documented conservative turn-detection preset:

```text
end_of_turn_confidence_threshold=0.7
min_turn_silence=800
max_turn_silence=3600
```

These parameters give the model more time and semantic context before finalizing
a turn. They may increase final-segment latency. They do not select a paid model
or a paid AssemblyAI feature.

## Scope

- cloud STT query parameters;
- automated query-parameter validation;
- cloud service documentation.

The browser extension, translation provider policy, TTS provider, audio format,
and provider credentials are unchanged.

## Live Validation

1. Deploy the merged commit on Render.
2. Confirm the service reaches Live.
3. Use the same YouTube test fragment used before this change.
4. Compare sentence coherence and final-segment count.
5. Record recognition latency and confirm translation and TTS counts still match.
6. Press Stop once and confirm bounded drain to IDLE.

A quality improvement is accepted only if transcript coherence improves without
unacceptable delay or pipeline loss.
