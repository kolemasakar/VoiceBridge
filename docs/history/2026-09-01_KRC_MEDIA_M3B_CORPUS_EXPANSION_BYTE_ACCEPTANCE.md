# KRC Media M3B Corpus Expansion Byte Acceptance

Status: ACCEPTED_BYTES / REFERENCE_REVIEW_PENDING
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING
Scope: KRC MEDIA BETA prerecorded provider evidence only

## Decision

The owner selected BROADEN CORPUS after the first three-case AssemblyAI versus Gemini M3 A/B tranche. This record accepts four additional real public speech fixtures for an M3B pre-provider review tranche.

This checkpoint does not authorize another provider-consuming A/B run and does not activate Gemini for normal KRC jobs.

## Capture execution

Workflow:

`.github/workflows/krc-media-m3b-byte-capture.yml`

Run:

`33536967546`

Result: `SUCCESS`

Execution boundary:

- public `raw.githubusercontent.com` only;
- every asset URL pinned to an exact source repository commit;
- repository metadata size verified during capture;
- SHA-256 calculated from the exact captured bytes;
- temporary media deleted on the runner;
- no raw-media artifact uploaded;
- no AssemblyAI call;
- no Gemini call;
- no provider credentials used;
- no KRC provider selector, deployment, database, Builder, Action URL, or release gate changed.

## Accepted M3B assets

### en-long-harvard-001

Dimension: longer multi-sentence clean English speech.

Source:

- repository: `realpython/python-speech-recognition`
- source commit: `0c07b810808c01144a9611faf84739f24513184e`
- path: `audio_files/harvard.wav`
- source blob: `b05ec794dc272734846ceccb98f4b7a3bacbbdae`
- bytes: `3249924`
- asset SHA-256: `971b4163670445c415c6b0fb6813c38093409ecac2f6b4d429ae3574d24ad470`

Reference-candidate origin: the Real Python speech-recognition tutorial identifies this file as a sequence of Harvard Sentences and publishes recognition/example text. Because published recognizer output contains lexical/casing variants, it is not accepted as ground truth. A candidate transcript is prepared outside GitHub and must be reconciled against the exact accepted audio by independent listening.

Candidate reference SHA-256 under UTF-8 / LF / exactly one terminal newline:

`f9e9eddbd0130ab1505d877a18cb29a26492114ecda86b9e7da92ec29b78b211`

State: `REFERENCE_CANDIDATE / LISTENING_REVIEW_PENDING`.

### en-noisy-jackhammer-001

Dimension: English speech under loud jackhammer background noise.

Source:

- repository: `realpython/python-speech-recognition`
- source commit: `0c07b810808c01144a9611faf84739f24513184e`
- path: `audio_files/jackhammer.wav`
- source blob: `87622f56e9b38368b553a9d2ef9f75db94127c4c`
- bytes: `600204`
- asset SHA-256: `a9484bb0ec40468683ebe6a064f6b4b579bfa800ac8b360a15ae3d225c5037e2`

Reference-candidate origin: the Real Python tutorial explicitly describes the spoken phrase and the loud jackhammer background. The text is still review-only until the owner listens to the exact accepted bytes.

Candidate reference SHA-256 under UTF-8 / LF / exactly one terminal newline:

`cf62ebe3e7e89f77272a5f6fdf296d2860af8e738799d939a672c08fe4484724`

State: `REFERENCE_CANDIDATE / LISTENING_REVIEW_PENDING`.

### en-numeric-vosk-001

Dimension: spoken digit sequences, including the distinction between `zero` and `oh`.

Source:

- repository: `alphacep/vosk-api`
- source commit: `05adbfcc0df27a1535913c6accd4b7fc60ffd59d`
- path: `python/example/test.wav`
- source blob: `c41144a21710590e568e4e612d2a40baf9a71223`
- bytes: `265914`
- asset SHA-256: `dcfea5712c43a43ba7ae8083afb39d36993e5a69c46e88b68aaa72b65cb615bb`

Reference-candidate origin: Vosk repository tests bind the exact sample to number vocabulary and publish recognition examples; independent public human listening also describes the intended three digit sequences. Neither provider output nor the historical Vosk recognition result is treated as ground truth. The candidate must be independently reconciled against the accepted audio.

Candidate reference SHA-256 under UTF-8 / LF / exactly one terminal newline:

`cc73ecc627780d8b6ef02fd5d8b093d85f21420a9a646b871e3ce0a0934eb1f4`

State: `REFERENCE_CANDIDATE / LISTENING_REVIEW_PENDING`.

### en-hard-librispeech-001

Dimension: challenging English speech from the LibriSpeech `test-other` subset.

Source bytes:

- repository: `anasali0006/automatic-speech-to-text-using-speechbrain`
- source commit: `d135b8d488f9b129e2c6c37fbf3011e168f9acd2`
- path: `LibriSpeechWave/1688-142285-0007.wav`
- source blob: `a1d7b63204d2a3299a27b3f4ae221501c6a5c223`
- bytes: `225964`
- asset SHA-256: `078553534e86b6c32eb0d3e30a75be8a4546735a910e14ab924c0b9f51367f4d`

Reference-candidate origin:

- PyTorch Audio tutorial source commit `4e3e282b0e23a0b9133abc8f719e2fa39be2a6e3`, `examples/tutorials/asr_inference_with_ctc_decoder_tutorial.py`, identifies sample `1688-142285-0007` as LibriSpeech `test-other` and publishes its corresponding transcript.
- the pinned source-byte repository also contains the matching `1688-142285-0007` transcription entry.

The candidate remains review-only until independent listening to the exact accepted WAV.

Candidate reference SHA-256 under UTF-8 / LF / exactly one terminal newline:

`a5bbd76f41e8929020cacf75c98208b7d6a42d6b669c95a8e8303f27ac97ec49`

State: `REFERENCE_CANDIDATE / LISTENING_REVIEW_PENDING`.

## M3B gate state

```text
M3_FIRST_TRANCHE_AB                         COMPLETE
M3B_CORPUS_EXPANSION_SELECTED               TRUE
M3B_NEW_CASES                               4
M3B_ASSET_BYTES_CAPTURED                    TRUE 4/4
M3B_ASSET_SHA256_ACCEPTED                   TRUE 4/4
M3B_REFERENCE_CANDIDATES_CREATED            TRUE 4/4 (outside GitHub)
M3B_REFERENCE_CANDIDATE_SHA256_CREATED      TRUE 4/4
M3B_REFERENCE_INDEPENDENT_REVIEW            PENDING 4/4
M3B_READY_FOR_AB                            FALSE
M3B_PROVIDER_CALLS                          NONE
GEMINI_PRERECORDED_ACTIVE                   FALSE
PROVIDER_CUTOVER                            NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING                  PRESERVED
```

## Coverage gained and remaining gaps

This tranche adds materially different conditions without deriving or modifying the media bytes:

- longer clean multi-sentence speech;
- severe background noise;
- numeric/digit wording and `zero` versus `oh`;
- harder audiobook speech from LibriSpeech `test-other`.

It does not yet establish representative coverage for real multi-speaker conversation, code-switching, telephone-bandwidth speech, Ukrainian noisy speech, or Russian noisy speech. Those dimensions may form a later M3C tranche if the seven-case result remains ambiguous.

## Next gate

The next permitted step is independent listening review of all four exact M3B assets against their outside-GitHub reference candidates. Only cases with accepted final reference bytes and SHA-256 may become `READY_FOR_AB`.

A second provider-consuming AssemblyAI/Gemini run requires a separate explicit owner authorization after this review gate closes.
