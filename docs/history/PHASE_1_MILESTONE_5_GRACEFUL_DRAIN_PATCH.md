# Phase 1 Milestone 5 Graceful Translation Drain Patch

Date: 2026-07-21

Status: IMPLEMENTED; AUTOMATED AND CONTROLLED LIVE VALIDATION PENDING

## Trigger

The first live Gemini translation test completed successfully, but the final counters showed 92 final English segments and 90 delivered Ukrainian segments at Stop.

The two-segment difference indicated that already accepted translation work was cancelled immediately during shutdown.

## Resolution

Cloud service `0.4.1` introduces a bounded graceful drain policy:

- close the STT connection first so provider-finalized English text can enter the translation queue;
- stop accepting new translation work after STT close;
- continue delivering already accepted translations in order;
- wait up to 3000 milliseconds for the queue to drain;
- cancel remaining work only after the drain timeout;
- keep unexpected disconnect cancellation immediate;
- report pending work at Stop and whether the drain timed out.

## Automated Validation

The 11-test cloud suite includes coverage that verifies:

- accepted translations are delivered before `STREAM_COMPLETED`;
- source segment identity and order remain unchanged;
- the queue drain is bounded;
- a blocked provider is cancelled after timeout;
- drain timeout metrics are reported;
- existing STT, translation, browser, and documentation checks remain active.

## Versions

- cloud service: `0.4.1`;
- browser extension: `0.5.0` unchanged.

## Next Step

Complete automated validation, deploy cloud service `0.4.1`, and run a controlled one-to-two-minute live test. The expected result is equality between final English and Ukrainian segment counts after Stop when the queue drains within the bounded timeout.
