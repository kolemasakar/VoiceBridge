# KRC MEDIA BETA M3B Reference Review Acceptance

Date: 2026-09-01
State: ACCEPTED / READY_FOR_AB

## Scope

This record closes the independent reference-listening gate for the four-case M3B corpus expansion. It does not authorize provider-consuming A/B execution, provider cutover, normal Gemini prerecorded activation, merge, deployment, or release.

## Exact asset verification

The owner downloaded the four commit-pinned public assets and independently verified SHA-256 locally with Windows `certutil` before listening.

| case | accepted asset SHA-256 | local verification |
|---|---|---|
| `en-long-harvard-001` | `971b4163670445c415c6b0fb6813c38093409ecac2f6b4d429ae3574d24ad470` | MATCH |
| `en-noisy-jackhammer-001` | `a9484bb0ec40468683ebe6a064f6b4b579bfa800ac8b360a15ae3d225c5037e2` | MATCH |
| `en-numeric-vosk-001` | `dcfea5712c43a43ba7ae8083afb39d36993e5a69c46e88b68aaa72b65cb615bb` | MATCH |
| `en-hard-librispeech-001` | `078553534e86b6c32eb0d3e30a75be8a4546735a910e14ab924c0b9f51367f4d` | MATCH |

Byte-capture workflow authority remains run `33536967546` (`SUCCESS`, 4/4).

## Independent listening review

The owner listened to every accepted file from start to finish and compared the spoken lexical content against the candidate reference artifact outside GitHub.

| case | listening result | correction required |
|---|---|---|
| `en-noisy-jackhammer-001` | PASS | NO |
| `en-numeric-vosk-001` | PASS | NO |
| `en-hard-librispeech-001` | PASS | NO |
| `en-long-harvard-001` | PASS | NO |

No provider output was used to establish ground truth.

## Final accepted reference hashes

Reference byte convention remains UTF-8, LF, exactly one terminal newline. Because no listening correction was required, the candidate hashes are promoted unchanged to final accepted reference hashes.

```text
en-long-harvard-001
FINAL_REFERENCE_SHA256=f9e9eddbd0130ab1505d877a18cb29a26492114ecda86b9e7da92ec29b78b211

en-noisy-jackhammer-001
FINAL_REFERENCE_SHA256=cf62ebe3e7e89f77272a5f6fdf296d2860af8e738799d939a672c08fe4484724

en-numeric-vosk-001
FINAL_REFERENCE_SHA256=cc73ecc627780d8b6ef02fd5d8b093d85f21420a9a646b871e3ce0a0934eb1f4

en-hard-librispeech-001
FINAL_REFERENCE_SHA256=a5bbd76f41e8929020cacf75c98208b7d6a42d6b669c95a8e8303f27ac97ec49
```

Transcript bodies remain outside GitHub.

## Accepted state

```text
M3_FIRST_TRANCHE_AB                         COMPLETE 3/3
M3B_NEW_CASES                               4
M3B_ASSET_BYTES_CAPTURED                    TRUE 4/4
M3B_ASSET_SHA256_ACCEPTED                   TRUE 4/4
M3B_LOCAL_ASSET_SHA256_VERIFIED             TRUE 4/4
M3B_REFERENCE_INDEPENDENT_REVIEW            COMPLETE 4/4
M3B_FINAL_REFERENCE_SHA256_ACCEPTED          TRUE 4/4
M3B_READY_FOR_AB                            TRUE 4/4
M3B_PROVIDER_AB                             NOT_RUN
M3B_PROVIDER_CALLS                          NONE
GEMINI_PRERECORDED_ACTIVE                   FALSE
PROVIDER_CUTOVER                            NOT_AUTHORIZED
RELEASE_HOLD_OWNER_TESTING                  PRESERVED
```

## Next gate

A second controlled same-asset prerecorded provider A/B may be executed only after separate owner authorization. The intended comparison remains AssemblyAI `universal-2` versus Gemini `gemini-3.5-transcribe` on these exact four accepted assets and references.
