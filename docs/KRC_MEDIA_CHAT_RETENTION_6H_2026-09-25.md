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
- Environment variable MEDIA_JOB_TTL_SECONDS still overrides the default. Check Render configuration before deploying.

## Required before deployment
1. Verify the effective TTL via health/capability and the Render environment (never disclose secrets).
2. Confirm the client/plugin flow immediately captures job_id from start; if start response is lost, call read-only lookup first.
3. After COMPLETED, request all segment pages until next_cursor is null. Reject missing, duplicated, or out-of-order pages; compare final segment count and character count to status metadata, using the same counting semantics as the server.
4. Make the complete transcript available to the active chat without assuming chat context is durable storage. For oversized transcripts, provide a temporary downloadable file; persist beyond the session only on explicit instruction.
5. Exercise tests: TTL default 21600, env override, lookup on interrupted response without a second provider call, multi-page complete export, missing-page failure, expiry behavior, restart with PostgreSQL.
6. Confirm all tests pass against exact candidate SHA; perform code review and separate deployment authorization.

## Existing implementation caveats
- Engine fallback currently also defaults to 3600 if instantiated without the parsed app config; production handler passes config.mediaJobTtlSeconds.
- Provider start is synchronous until processing returns; a dropped response may lose job_id, requiring read-only lookup.
- Existing retry-chain lookup can return a FAILED record; never treat lookup alone as authorization to retry.
- Existing PostgreSQL purge physically deletes expired records; this branch does not introduce a permanent archive.
