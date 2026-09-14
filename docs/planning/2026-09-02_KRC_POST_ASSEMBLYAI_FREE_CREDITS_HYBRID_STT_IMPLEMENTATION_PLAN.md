# KRC post-AssemblyAI free-credit hybrid STT implementation plan

Date: 2026-09-02
Status: PLANNED / NOT_IMPLEMENTED / NO_RUNTIME_CHANGE
Applies to: K-Research & Critic - MEDIA BETA technical implementation planning
Product authority: `kolemasakar/K_Research_Critic`

## Trigger

Do not implement this plan while the current AssemblyAI free-credit path remains the accepted operating choice.

Implementation consideration begins only after the product-side trigger is confirmed:

`AssemblyAI free credits exhausted / effectively unavailable as the free primary route`.

A fresh explicit owner authorization is required at that time.

## Target technical shape

Planned free-first Hybrid C/D:

```text
KRC media asset
  -> normalize/probe
  -> STT capability + free-quota router
       |
       +-> Gemini 3.5 Transcribe Live
       |     preferred free route for eligible jobs
       |     no word timestamps / no diarization requirement
       |
       +-> Gemini 3.5 Transcribe unary
       |     feature route for timestamps and/or diarization
       |     only while project free quota admits the job
       |
       +-> AssemblyAI universal-2
             retained adapter / rollback capability
             billable use disabled by default after free credits expire
             explicit owner authorization required before paid fallback
```

No automatic paid fallback is part of the planned design.

## Planning snapshot only

Owner-observed Google AI Studio limits in the `VoiceBridge` project around 2026-09-01/02:

```text
Gemini 3.5 Transcribe
RPM 3
TPM 10,000
RPD 25

Gemini 3.5 Transcribe Live
RPM Unlimited
TPM 20,000
RPD Unlimited
```

These are mutable provider limits and MUST NOT be hard-coded as permanent assumptions. Re-read provider limits immediately before implementation and expose them through configuration/observability rather than source constants where possible.

## Proposed implementation work packages

### T0 - no-op planning state

Current state:

- keep `KRC_MEDIA_STT_PROVIDER=assemblyai` normal behavior;
- keep Gemini prerecorded candidate inactive for normal KRC jobs;
- keep existing M3/M3B evidence immutable;
- do not create automatic quota-triggered cutover code now.

### T1 - capability contract

Add a provider-neutral capability model, for example:

```text
language
media_duration
needs_word_timestamps
needs_diarization
speaker_count_hint
needs_code_switching
free_only
allow_billable_fallback
```

Routing output must record the selected provider/mode and the reason.

### T2 - quota/admission interface

Introduce a provider quota abstraction that can represent at least:

```text
RPM
TPM
RPD
session-duration limits
estimated audio-token load
local reserved capacity
provider-reported throttling
```

Admission must happen before the provider call where practical.

No quota failure may silently authorize paid provider use.

### T3 - prerecorded-to-Live transport

Create an isolated adapter for feeding prerecorded audio into the Gemini Live transcription interface.

Required properties:

- bounded session duration;
- deterministic chunk boundaries;
- ordered transcript assembly;
- duplicate suppression across reconnect/retry boundaries;
- explicit partial result state;
- cancellation cleanup;
- timeout cleanup;
- exact source-asset correlation;
- no raw media persistence beyond existing accepted retention rules;
- no change to KRC provenance semantics.

Retries must be bounded and must not multiply provider consumption invisibly.

### T4 - unary Gemini feature path

Retain/use the existing prerecorded Gemini adapter for cases requiring word timestamps and/or diarization, subject to current free quota.

If long media requires chunking, chunk IDs and source offsets must remain traceable to the original KRC media asset.

### T5 - route decision matrix

Initial planned decision logic:

```text
IF free_only = true
AND Live supports required language/features
AND timestamps = false
AND diarization = false
AND Live quota/session admission = pass
THEN Gemini Live

ELSE IF unary Gemini supports required language/features
AND unary free quota admission = pass
THEN Gemini unary

ELSE IF explicit billable AssemblyAI authorization = true
THEN AssemblyAI universal-2

ELSE unavailable / held / fail-closed
```

Exact priority may be changed only by an explicit product decision after targeted validation.

### T6 - language/capability validation

Before activation, validate actual current support and quality for the KRC language set, including at minimum:

- Ukrainian;
- Russian;
- English;
- Polish;
- Belarusian;
- Turkish;
- Arabic;
- Persian/Farsi;
- Hebrew;
- Mandarin Chinese;
- selected South Caucasus and Central Asian languages.

Mandatory code-switching acceptance cases:

```text
UA <-> RU
UA <-> EN
RU <-> EN
PL <-> UA
```

Headline language counts are documentation signals only, not acceptance evidence.

### T7 - targeted M3C acceptance

Before normal hybrid activation, build independently reviewed exact-asset cases for:

- multi-speaker conversation;
- noisy UA;
- noisy RU;
- telephone-bandwidth audio;
- code-switching;
- 10-30 minute real media;
- numeric/date/name fidelity;
- Gemini unary versus Gemini Live parity where both routes apply.

Provider output cannot be the reference transcript.

### T8 - observability

Record per job without secret leakage:

```text
route selected
route reason
provider/model/mode
quota admission state
estimated/actual duration
latency
provider failure category
throttle state
fallback authorization state
cleanup state
```

Never log API keys or sensitive authentication material.

### T9 - rollback and paid-fallback gate

Keep AssemblyAI code path regression-tested even if it is not the free primary after the trigger.

After its free credits expire:

```text
ASSEMBLYAI_BILLABLE_FALLBACK_DEFAULT=false
```

A separate owner decision is required to enable billable AssemblyAI fallback, including budget/limit policy.

### T10 - private owner canary

Only after product authorization and T1-T9 validation:

- private owner traffic only;
- bounded volume;
- no public rollout;
- verify quota behavior under bursts;
- verify Live session boundary behavior;
- verify unary feature route;
- verify fail-closed behavior when both Gemini free routes are unavailable;
- verify no accidental AssemblyAI billing.

## Privacy/data-use planning note

The owner currently accepts provider use of Free Tier data for model/product improvement for this private-owner context.

This acceptance is not automatically transferable to future external testers or public users. If the audience changes, perform a fresh privacy/consent review before using such a free tier for their media.

## Explicitly not implemented by this document

No code, environment, provider selector, deployment, database, API schema, Builder package, Action URL, or release-gate change is authorized or performed by this plan.

The technical plan remains dormant until the AssemblyAI free-credit trigger and a fresh owner implementation approval.
