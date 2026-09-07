# KRC Media M3 Reference Transcript Preparation

Status: REFERENCE ARTIFACT CANDIDATES HASHED - INDEPENDENT AUDIO REVIEW REQUIRED
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Lock independent reference-text origins and byte-stable candidate reference artifacts for the three accepted M3 clean-public assets without deriving ground truth from either candidate transcription provider.

This checkpoint does not store reference transcript bytes in GitHub. Candidate transcript artifacts remain outside GitHub. GitHub records only provenance metadata, byte-format policy, candidate SHA-256 values, and review state.

Candidate SHA-256 values are not accepted final reference digests until the exact accepted audio has been independently listened to and reconciled. Any correction changes the transcript bytes and requires a new SHA-256.

## Byte representation policy

All three candidate reference artifacts were prepared using:

```text
encoding: UTF-8
line_endings: LF
terminal_newline: exactly one
normalization_before_hash: NONE
```

The accepted M3 byte-exact rule remains unchanged.

## Reference candidates

### `ua-clean-public-001`

- accepted asset repository: `egorsmkv/speech-recognition-uk`
- accepted asset commit: `597a3b9231621e1318bf4a802234491f4ef0f9fb`
- accepted asset path: `speech-to-text/audio.wav`
- accepted asset SHA-256: `98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c`
- reference source path: `speech-to-text/test_file_wav2vec_lm.py`
- reference source blob: `48f0a76e457690ffd786fc8d51d509cffa451f8b`
- provenance: the upstream test file explicitly binds `audio.wav` to a Ukrainian `references` entry
- candidate reference SHA-256: `d9a6dbf5f2d0d1f8c200b11736982f3c9b2c02741d2303c96a359fe30015e461`
- artifact state: `CANDIDATE_BYTES_HASHED`
- review state: `CANDIDATE_SOURCE_LOCKED / LISTENING_REVIEW_PENDING`
- required review: listen to the exact accepted WAV and reconcile every spoken token against the upstream reference; preserve actual spoken wording rather than model-normalized assumptions

### `ru-clean-public-001`

- accepted asset repository: `sberdevices/golos`
- accepted asset commit: `1d7eac87f82dc2514d7c77450eb1b4017e6cb052`
- accepted asset path: `examples/data/001ce26c07c20eaa0d666b824c6c6924.wav`
- accepted asset SHA-256: `d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5`
- reference source path: `examples/data/example1.json`
- reference source blob: `a778612924440f1f847368f27221640e7d2e6830`
- provenance: Golos describes the corpus as manually annotated and the JSON entry explicitly binds the exact fixture WAV to its text
- candidate reference SHA-256: `1c7ac3953951270a56bf5927c86a26d28281ca9b958981c9ab56776837faaadf`
- artifact state: `CANDIDATE_BYTES_HASHED`
- review state: `CANDIDATE_SOURCE_LOCKED / LISTENING_REVIEW_PENDING`
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
- candidate reference SHA-256: `044267656cd78db47edd50fead3ae70f8f7240f3c1f3523cc53b94594de5ecfa`
- artifact state: `CANDIDATE_BYTES_HASHED`
- review state: `CANDIDATE_SOURCE_LOCKED / LISTENING_REVIEW_PENDING`
- required review: identify the exact start/end boundaries of `jfk.flac`, then reconcile the official transcript wording to the words actually present in the captured fixture; punctuation remains a documented artifact convention rather than evidence of spoken punctuation

## Evidence boundary

Candidate reference transcript bytes are stored outside GitHub. They are not included in the repository, PR body, corpus manifest, or Actions artifacts.

The candidate hashes prove only that a particular byte representation was prepared. They do not prove that the candidate is factually identical to the accepted audio.

Final acceptance requires:

1. a full independent listen-through of each exact accepted asset;
2. correction of any mismatch, clipping boundary, number, name, negation, repetition, or materially relevant token;
3. final artifact save under the same explicit byte representation policy;
4. recomputation of SHA-256 after any edit;
5. `reference_review_state=independent_reviewed` only after the review is actually complete.

## Current state

```text
REFERENCE_SOURCE_CANDIDATES_LOCKED: TRUE
REFERENCE_ARTIFACT_CANDIDATE_BYTES_CREATED: TRUE
REFERENCE_ARTIFACT_CANDIDATE_SHA256_CREATED: TRUE
ua-clean-public-001: CANDIDATE_BYTES_HASHED / LISTENING_REVIEW_PENDING
ru-clean-public-001: CANDIDATE_BYTES_HASHED / LISTENING_REVIEW_PENDING
en-clean-public-001: CANDIDATE_BYTES_HASHED / LISTENING_REVIEW_PENDING
REFERENCE_AUDIO_RECONCILIATION_COMPLETE: FALSE
REFERENCE_SHA256_ACCEPTED: FALSE
READY_FOR_AB: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next transition

```text
CANDIDATE_BYTES_HASHED
  -> independent listening review of exact accepted asset
  -> correct candidate bytes if needed
  -> recompute final reference SHA-256
  -> independent_reviewed
  -> READY_FOR_AB
```

No AssemblyAI or Gemini transcription call is authorized by this checkpoint.
