# Phase 1 Milestone 5 Drain Timeout Adjustment

Date: 2026-07-21

Status: IMPLEMENTED; CONTROLLED LIVE TEST PENDING

## Trigger

The second live Gemini validation used cloud service `0.4.1`. During active operation the counters were equal at 15 English and 15 Ukrainian final segments. After Stop the counters were 32 English and 26 Ukrainian final segments, with zero dropped audio frames.

The six-segment translation backlog required approximately 3.8 seconds at the observed average Gemini latency of 627 milliseconds. The existing 3000-millisecond drain limit could therefore expire before the accepted queue completed.

## Resolution

Cloud service `0.4.2` increases the bounded translation drain limit from 3000 to 10000 milliseconds.

The sequential ordering, segment identity, maximum queue size, provider timeout, immediate disconnect cancellation, and no-persistence policy remain unchanged.

## Automated Validation

The graceful-drain test reproduces six sequential translations at 600 milliseconds each. The queue requires more than three seconds and must complete before `STREAM_COMPLETED` under the new ten-second bound.

The blocked-provider test remains bounded and verifies cancellation after the ten-second drain timeout.

## Versions

- cloud service: `0.4.2`;
- browser extension: `0.5.0` unchanged.

## Next Step

Deploy cloud service `0.4.2` and repeat a one-to-two-minute live test. After Stop, final English and Ukrainian segment counts should match when the accepted queue completes within ten seconds.
