# Phase 1 Milestone 6 Rate Limit Patch

Date: 2026-07-21

Status: IMPLEMENTED; LIVE VALIDATION PENDING

## Trigger

A six-minute controlled public YouTube test produced 87 final English segments, 72 Ukrainian translations, and only 12 Ukrainian speech segments. Audio transport remained healthy with zero dropped frames. Ukrainian speech initially played, then skipped increasingly, and finally stopped while text translation continued.

## Root Cause

The cloud submitted one Gemini TTS request for every translated segment. The preview TTS model returned rate-limit responses. The original queue had no retry or backoff and the browser cleared the visible error after a later READY status. Translation requests had the same no-retry behavior during transient quota pressure.

## Resolution

Cloud service `0.5.1`:

- raises translation and TTS queue capacity from 20 to 60 accepted segments;
- retries transient translation failures up to four attempts;
- retries transient TTS failures up to three attempts;
- honors provider Retry-After when available;
- exposes RATE_LIMITED and BACKOFF status with retry timing;
- batches up to three translated segments into one TTS request;
- waits at least six seconds between TTS requests;
- preserves source-segment counts through batched audio events;
- extends bounded shutdown drains for retry-aware queues.

Browser extension `0.6.1`:

- preserves the last provider error until a successful result arrives;
- displays pending work, buffered TTS segments, and retry counts;
- counts voiced source segments rather than provider request batches;
- reports played source-segment count;
- keeps bounded browser playback and shutdown behavior.

## Validation Target

Run a public YouTube test for at least ten minutes. Translation and speech counts may temporarily lag while BACKOFF is active, but should continue increasing rather than permanently stopping. After Stop, the accepted queues must drain within their bounds or report an explicit timeout instead of silently losing work.
