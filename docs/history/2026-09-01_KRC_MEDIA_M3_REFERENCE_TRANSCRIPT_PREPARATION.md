# KRC Media M3 Reference Transcript Preparation

Status: REFERENCE SOURCE CANDIDATES LOCKED - INDEPENDENT AUDIO REVIEW REQUIRED
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Lock independent reference-text origins for the three accepted M3 clean-public assets without deriving ground truth from either candidate transcription provider.

This checkpoint does not store final reference transcript artifact bytes in GitHub and does not accept reference SHA-256 values. Final transcript artifacts remain outside GitHub under the existing corpus evidence boundary.

## Reference candidates

### `ua-clean-public-001`

- accepted asset repository: `egorsmkv/speech-recognition-uk`
- accepted asset commit: `597a3b9231621e1318bf4a802234491f4ef0f9fb`
- accepted asset path: `speech-to-text/audio.wav`
- accepted asset SHA-256: `98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c`
- reference source path: `speech-to-text/test_file_wav2vec_lm.py`
- reference source blob: `48f0a76e457690ffd786fc8d51d509cffa451f8b`
- provenance: the upstream test file explicitly binds `audio.wav` to a Ukrainian `references` entry
- review state: `CANDIDATE_SOURCE_LOCKED`
- required review: listen to the exact accepted WAV and reconcile every spoken token against the upstream reference; preserve actual spoken wording rather than model-normalized assumptions

### `ru-clean-public-001`

- accepted asset repository: `sberdevices/golos`
- accepted asset commit: `1d7eac87f82dc2514d7c77450eb1b4017e6cb052`
- accepted asset path: `examples/data/001ce26c07c20eaa0d666b824c6c6924.wav`
- accepted asset SHA-256: `d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5`
- reference source path: `examples/data/example1.json`
- reference source blob: `a778612924440f1f847368f27221640e7d2e6830`
- provenance: Golos describes the corpus as manually annotated and the JSON entry explicitly binds the exact fixture WAV to its text
- review state: `CANDIDATE_SOURCE_LOCKED`
- required review: listen to the exact accepted WAV and verify lexical content, number wording, and clipping boundaries against the upstream annotation

### `en-clean-public-001`

- accepted asset repository: `openai/whisper`
- accepted asset commit: `86098128c0b4f24f0e2aa2994de830614b474227`
- accepted asset path: `tests/jfk.flac`
- accepted asset SHA-256: `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715`
- upstream test source: `tests/test_transcribe.py`
- upstream test source blob: `599221af593a0381463e462ceacd9740c1b81d1b`
- upstream fixture evidence: the Whisper test asserts English output and checks characteristic JFK wording in the fixture
- independent reference origin: John F. Kennedy Presidential Library and Museum, `Inaugural Address - Transcript`, 20 January 1961; digital speech identifier `USG-17`
- reference URL: `https://www.jfklibrary.org/node/11526`
- speech metadata URL: `https://www.jfklibrary.org/learn/about-jfk/historic-speeches/inaugural-address`
- review state: `CANDIDATE_SOURCE_LOCKED`
- required review: identify the exact start/end boundaries of `jfk.flac`, then reconcile the official transcript wording and punctuation policy to the words actually present in the captured fixture

## Reference artifact policy

For each case, the final reference transcript artifact must:

- be derived from the locked independent source candidate plus manual listening review;
- reflect the exact accepted audio asset, including clipping boundaries;
- not be copied from AssemblyAI or Gemini candidate output;
- use an explicitly recorded UTF-8 byte representation;
- be hashed byte-for-byte only after review is complete;
- remain outside GitHub; GitHub records only the final SHA-256, provenance metadata, and review state.

## Current state

```text
REFERENCE_SOURCE_CANDIDATES_LOCKED: TRUE
ua-clean-public-001: CANDIDATE_SOURCE_LOCKED
ru-clean-public-001: CANDIDATE_SOURCE_LOCKED
en-clean-public-001: CANDIDATE_SOURCE_LOCKED
REFERENCE_ARTIFACT_BYTES_CREATED: FALSE
REFERENCE_AUDIO_RECONCILIATION_COMPLETE: FALSE
REFERENCE_SHA256_ACCEPTED: FALSE
READY_FOR_AB: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next transition

```text
CANDIDATE_SOURCE_LOCKED
  -> independent listening review of exact accepted asset
  -> final reference transcript artifact outside GitHub
  -> byte-exact reference SHA-256
  -> evidence record update
  -> READY_FOR_AB
```

No AssemblyAI or Gemini transcription call is authorized by this checkpoint.
