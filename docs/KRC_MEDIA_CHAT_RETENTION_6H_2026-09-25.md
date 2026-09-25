# KRC MEDIA chat-scoped retention: implementation and acceptance

Status: candidate branch only. No production deployment or Gemini provider execution authorized.

## Agreed behavior
- Keep temporary MEDIA jobs and transcripts for up to six hours after their last persisted update.
- The active chat consumes the completed transcript immediately by reading all segment pages.
- Long-term retention/export happens only on explicit user instruction; do not create an automatic permanent transcript archive.
- Do not retry or re-start Gemini provider work automatically. A new provider run requires fresh explicit consent.
- The six-hour TTL is a technical expiry, not a reliable signal that a ChatGPT conversation ended.

## Implemented in this branch
- Change default MEDIA_JOB_TTL_SECONDS in config from 3600 to 21600.
- Align PublicGeminiYoutubeEngine fallback TTL to 21600 for direct engine construction.
- Environment variable MEDIA_JOB_TTL_SECONDS still overrides the default. Check Render configuration before deploying.

## Required before deployment
1. Verify the effective TTL via health/capability and the Render environment (never disclose secrets).
2. Confirm the client/plugin flow immediately captures job_id from start; if start response is lost, call read-only lookup first.
3. After COMPLETED, request all segment pages until next_cursor is null. Reject missing, duplicated, or out-of-order pages; compare final segment count and character count to status metadata, using the same counting semantics as the server.
4. Make the complete transcript available to the active chat without assuming chat context is durable storage. For oversized transcripts, provide a temporary downloadable file; persist beyond the session only on explicit instruction.
5. Exercise tests: TTL default 21600, env override, lookup on interrupted response without a second provider call, multi-page complete export, missing-page failure, expiry behavior, restart with PostgreSQL.
6. Confirm all tests pass against exact candidate SHA; perform code review and separate deployment authorization.

## Existing implementation caveats
- Engine fallback now defaults to 21600; production handler still passes config.mediaJobTtlSeconds.
- Provider start is synchronous until processing returns; a dropped response may lose job_id, requiring read-only lookup.
- Existing retry-chain lookup can return a FAILED record; never treat lookup alone as authorization to retry.
- Existing PostgreSQL purge physically deletes expired records; this branch does not introduce a permanent archive.

## Validation checkpoint (2026-09-25)
- Exact tested candidate SHA: `0e0b4d0a4904d9dbff372b26e0867f82cbb283e5`.
- Isolated checkout on krc-cobalt under `/tmp/krc-voicebridge-validation-20260925/repo`; Node v24.21.0.
- `npm run check`: TypeScript build PASS, 278 tests PASS / 0 FAIL, exit 0. Dedicated transcript collector suite: 5/5 PASS.
- Added reusable read-only `src/cloud/src/gemini_transcript_collector.ts` and integrity tests. It validates every page, order, total count, and concatenated character count. It never starts provider work and does not archive automatically.
- Integration into the ChatGPT private Plugin / active-chat artifact delivery is NOT implemented by this backend helper. A client must call it or implement equivalent validated pagination and present the transcript in the active chat.
- Provider transcript_text length is not necessarily equal to the simple concatenation of segment texts. Current collector fails closed if unequal; before client integration, verify actual provider segmentation/count semantics and preserve original text without invented separators. Do not silently normalize a mismatch.
- Read-only live Render /health still reports effective job_ttl_seconds=3600, service branch `agent/krc-media-gemini-migration`; candidate remains undeployed. No safe read-only Render environment-variable value API was available here; explicit `MEDIA_JOB_TTL_SECONDS` override cannot be ruled out. Deployment requires separate approval and effective TTL recheck.
