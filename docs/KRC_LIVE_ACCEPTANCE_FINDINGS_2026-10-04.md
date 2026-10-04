# Live acceptance findings and Facebook URL repair — 2026-10-04

Owner approved independent video selection, Gemini Free data use, free STT minutes and confirmed Render workspace My Workspace (tea-d9dsqdjrjlhs73ba1ga0).

Actual Instagram start produced durable failed job KRCM_2c69d8b7-41f3-491c-ad3e-9589682b53df, FACEBOOK_AUDIO_NORMALIZATION_FAILED, request f12a3163-a888-4cdf-9309-91be9c16a738. Status read confirms the same identity and error. Shared facebook_managed_pipeline.ts normalizer discards ffmpeg stderr and returns this Facebook-named error for a nonzero exit on the Instagram path. This is NOT evidence of cross-platform dispatch. Actual cause of ffmpeg exit remains unestablished; no STT seconds charged.

Actual Facebook start produced durable failed job KRCM_54d7f28a-1a04-44c8-b2a4-769abef45035, FACEBOOK_RETRIEVAL_UNAVAILABLE, request 2e7556ab-0b25-4245-8929-259513cd5a31. Status read confirms the same identity/error. The source URL lost the numeric video ID from the descriptive NASA link. Free provider unavailable and 0 STT seconds; paid fallback disabled.

Reproduced source defect: managed_media_url.ts previously retained the first token after /videos/, which is a title slug in /videos/<slug>/<numeric-ID>/. Fix canonicalizes that form to /videos/<numeric-ID>/, preserving asset/job identity, and rejects ambiguous extra path components. Direct single-token video links remain accepted. Two videos with the same slug and different IDs remain distinct.

Regression: TypeScript build PASS; all Facebook suites 28/28 PASS, including 3 new tests for real descriptive URL/parser identity, distinct IDs and ambiguous paths. This repair does not establish that Facebook retrieval will succeed after rollout; live error may have further causes. No production VoiceBridge deployment or provider replay performed.

Actual Telegram start produced durable failed job KRCM_91086416-6df8-4178-8f52-5b9ecebfd4da, TELEGRAM_MEDIA_UNAVAILABLE, request 8f1a7afb-d808-4030-8f7a-ed39701f9f0f. Official GeneralStaffZSU/4530 post exposes no browser-playable asset. Status confirms FAILED and 0 STT seconds.

E2/E3/E4 were activated one at a time via non-replacing env merges; Render automatically deployed KRC commit 4b7458b3c836dc4f9cb9df3cd39054683474e147. Each was restored to probe-only=true and verified through health. No paid fallback, secret rotation, new infrastructure, main merge or plugin publication.

YouTube read-only lookup initially 429, after canonical health warmup 404. No reusable job established; earlier uncertain start was NOT replayed. Cause of 429 remains OPEN. Render request-log queries returned no entries, including a window with successful real jobs, so empty logs cannot prove requests never reached the service. App logs show lifecycle events only.

Full live transcript acceptance remains incomplete for every direction. This commit repairs one confirmed source defect and records terminal evidence; it is not a live provider PASS.
