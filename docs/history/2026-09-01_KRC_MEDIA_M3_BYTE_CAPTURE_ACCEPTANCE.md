# KRC Media M3 Byte Capture Acceptance

Status: ACCEPTED - ASSET BYTES CAPTURED AND HASHED
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Purpose

Record the first accepted byte-exact public-media asset tranche for KRC Media M3 provider A/B preparation.

This checkpoint accepts only asset identity and byte evidence. It does not mark any case `READY_FOR_AB`: independently reviewed reference transcripts and reference transcript SHA-256 values are still required before provider-consuming execution.

## Capture execution

- Repository: `kolemasakar/VoiceBridge`
- Branch: `agent/krc-media-gemini-migration`
- Workflow: `KRC Media M3 Byte Capture`
- Workflow run: `33490716248`
- Capture job: `99801288878`
- Capture source commit: `97860be3b403061ecdf7c8d25b1e6550f3b2a00f`
- Job conclusion: `success`
- Retrieval host: `raw.githubusercontent.com`
- Source objects: pinned to exact upstream commits and verified against repository metadata byte sizes

## Accepted assets

| Case ID | Language | Upstream repository | Upstream commit | Source blob | Bytes | SHA-256 | Format |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `ua-clean-public-001` | `uk-UA` | `egorsmkv/speech-recognition-uk` | `597a3b9231621e1318bf4a802234491f4ef0f9fb` | `dc8dab689bef38e69f9aaef5428b71cca39d36c3` | 136612 | `98e29c2276533699c67454de16b713d9846f668b6cc32b7591a0b2eb8a275a8c` | `wav` |
| `ru-clean-public-001` | `ru-RU` | `sberdevices/golos` | `1d7eac87f82dc2514d7c77450eb1b4017e6cb052` | `a22344f48668fcfcc17947459a91fe9e84742aa2` | 128044 | `d066239503c4e7406ebeb47423334b5109aa6b30d62046d0338a04e41b4c52f5` | `wav` |
| `en-clean-public-001` | `en-US` | `openai/whisper` | `86098128c0b4f24f0e2aa2994de830614b474227` | `e44b7c13897eae7f78beb220c61fe77429a3961d` | 1152693 | `63a4b1e4c1dc655ac70961ffbf518acd249df237e5a0152faae9a4a836949715` | `flac` |

## Evidence semantics

The SHA-256 values above were computed from the exact bytes downloaded during the successful workflow run. The workflow rejected a capture if its observed size differed from the upstream GitHub repository metadata size.

The accepted assets replace the earlier source candidates for the three clean-public M3 cases because those original public publisher/CDN surfaces could not yield byte-stable assets from the GitHub-hosted runner without cookies, authentication, paid retrieval, or unsupported scraping workarounds. The previous source-selection and capture-blocker records remain historical provenance and are not rewritten.

## Safety boundary

The accepted capture run:

- did not call AssemblyAI;
- did not call Gemini prerecorded transcription;
- did not call Supadata;
- did not use provider credentials;
- did not invoke a paid retrieval fallback;
- did not upload raw media as a workflow artifact;
- deleted temporary media files from the runner after hashing;
- did not change KRC Action URLs, Render configuration, Neon state, provider defaults, or production routing.

## Current state

```text
M3_BYTE_CAPTURE_EXECUTION: SUCCESS
REAL_ASSET_BYTES_CAPTURED: TRUE
REAL_ASSETS_SELECTED: TRUE
ASSET_SHA256_ACCEPTED: TRUE
REFERENCE_TRANSCRIPTS_READY: FALSE
REFERENCE_SHA256_ACCEPTED: FALSE
READY_FOR_AB: FALSE
M3_LIVE_AB: NOT_RUN
PROVIDER_CONSUMING_WORK: NONE
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next transition

```text
ASSET_SELECTED
  -> prepare independent reference transcript candidate
  -> manually reconcile candidate to exact captured audio
  -> mark independent review complete
  -> compute byte-exact reference transcript SHA-256
  -> READY_FOR_AB
```

No provider-consuming A/B execution is authorized by this checkpoint.
