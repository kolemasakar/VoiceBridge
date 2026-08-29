# Gemini 3.5 Transcribe Live STT Acceptance

Date: 2026-08-29

Status: ACCEPTED

## Decision

VoiceBridge accepts Gemini 3.5 Transcribe Live as the default English streaming
STT provider behind the existing `SttProvider` boundary.

AssemblyAI `universal-streaming-english` remains supported as the explicit
rollback provider.

No automatic paid usage or automatic paid fallback is introduced.

## Scope

The migration preserved the validated downstream pipeline:

```text
Browser PCM capture
    -> VoiceBridge Cloud
    -> selected STT provider
    -> Azure Translator primary
    -> Gemini translation fallback
    -> Azure Speech Ukrainian TTS
    -> browser playback
```

Browser audio transport, translation provider selection, translation fallback,
and Azure Speech TTS remain unchanged except for the separately accepted bounded
user-Stop playback behavior recorded during validation.

## Google Access and Data Use

The exact Gemini model accepted for the migration is:

`gemini-3.5-transcribe-live`

Official Google documentation was re-verified on 2026-08-29 before live use.
The controlled Google AI Studio test confirmed that the project behind the
Render `GEMINI_API_KEY` could use Gemini 3.5 Transcribe Live.

Free Tier content use by Google for product improvement was explicitly accepted
for this controlled migration. Paid usage and automatic paid fallback remain
prohibited.

## Implementation Findings

Two live-integration defects were found and corrected before acceptance:

- initial setup diagnostics did not distinguish WebSocket open from setup
  acknowledgement timeout;
- Gemini JSON WebSocket responses can arrive in binary frames, so the adapter
  must parse JSON payloads from both text and binary frames.

After the binary-frame correction, live Gemini streaming completed end to end.

## Controlled Same-Duration A/B

The final comparable A/B used approximately 59 seconds of the same English
source fragment.

Gemini run:

- provider: `gemini`;
- frames sent: 2938;
- approximate capture duration: 58.76 s;
- dropped frames: 1;
- unacknowledged at completion: 8;
- final STT segments: 6;
- reported recognition latency: 363 ms;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms;
- playback: completed.

AssemblyAI rollback run:

- provider: `assemblyai`;
- frames sent: 2945;
- approximate capture duration: 58.90 s;
- dropped frames: 7;
- unacknowledged at completion: 5;
- final STT segments: 4;
- reported recognition latency: 378 ms;
- translation pending after Stop: 0;
- TTS pending after Stop: 0;
- queued playback after Stop: 0 ms;
- playback: completed.

The latency difference is small and is treated as near parity. The dropped-frame
counts are recorded as test evidence, not as a statistically established
provider-level performance difference.

## Transcript Quality Review

The same source fragment was reviewed side by side without a human reference
transcript. No WER claim is therefore made.

Gemini preserved a more coherent version of several difficult phrases and proper
names in the reviewed overlap, including variants corresponding to:

- `Rose House, Clinton House, Thomas Lodge`;
- `Infield Lane`;
- `Fordlands, Goldsmiths, Lantern`;
- `Someone stole Confidential Care Home account information...`.

AssemblyAI produced more disruptive substitutions in those passages. Gemini
still showed minor formatting/recognition defects such as repeated words and
missing spaces, but these did not outweigh the observed coherence advantage.

Decision from the controlled review: Gemini candidate ACCEPTED.

## Stop Behavior

During live validation, the old user Stop behavior could leave tens of seconds
of already queued Ukrainian audio playing after capture stopped.

The accepted user-Stop policy now:

- stops new capture/STT input;
- allows completed English text and translation to drain;
- prevents new TTS audio from extending the playback backlog after Stop;
- gives already-started playback a bounded grace period of at most 5 seconds;
- cancels the remaining queued playback and returns to an idle/completed state.

Final validation showed queued playback `0 ms` after Stop for both Gemini and
AssemblyAI runs.

## Remaining Non-Blocking Defect

`Played segments` can report `0` even when playback is audibly completed and the
playback state is `COMPLETED`. This is an instrumentation defect and did not block
the STT provider acceptance. It should be repaired separately.

## Rollback

Rollback requires no code removal and no provider reimplementation.

Set:

```text
STT_PROVIDER=assemblyai
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english
```

The AssemblyAI adapter, model guard, API key support, and conservative turn
settings remain in the repository.
