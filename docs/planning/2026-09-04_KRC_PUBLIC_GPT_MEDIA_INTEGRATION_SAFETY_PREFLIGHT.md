# KRC public-GPT MEDIA integration safety preflight

Date: 2026-09-04
Status: PLANNED / NOT_IMPLEMENTED / NO_DEPLOYMENT
Applies to: VoiceBridge technical work supporting future integration of KRC MEDIA into the already-published K-Research & Critic GPT
Product authority: `kolemasakar/K_Research_Critic`

## Product constraint

The public KRC GPT already exists and is user-accessible. The separate KRC MEDIA BETA GPT is private/owner-only and was not published as a separate public GPT.

Therefore VoiceBridge must support an additive integration into the existing public KRC identity. It must not require users to switch to the private MEDIA BETA GPT and must not create a technical dependency that can disable Core KRC behavior when MEDIA is unavailable.

## Technical invariant

```text
Core KRC availability is independent of MEDIA backend availability.
```

MEDIA Action/backend failures must be scoped to MEDIA operations only.

Expected behavior:

```text
MEDIA route healthy      -> MEDIA operation may proceed
MEDIA route unavailable  -> MEDIA operation reports unavailable/fails closed
                           -> Core KRC remains usable
```

## Integration stages

### T0 - Planning only

Current state remains unchanged:

- no merge to public KRC main;
- no permanent M4 backend promotion;
- no Builder/Action configuration update;
- AssemblyAI `universal-2` remains current KRC prerecorded provider;
- Gemini prerecorded normal activation remains false;
- Hybrid C/D remains deferred;
- no automatic paid fallback.

### T1 - Repository/API compatibility audit

Before product-side R1:

- enumerate exact KRC MEDIA routes/actions intended for public KRC;
- compare existing published KRC Action schema/configuration with MEDIA additions;
- make MEDIA additions additive rather than destructive replacements;
- verify existing Core endpoints/instructions do not become conditional on VoiceBridge availability;
- verify errors/timeouts from MEDIA routes cannot cascade into Core workflow termination;
- preserve CriticProfile-before-Research semantics and existing provenance/reporting contracts;
- preserve API backward compatibility where public KRC may already depend on existing Action behavior.

No live GPT change is part of T1.

### T2 - Public-user admission/auth design

The current MEDIA BETA contour was validated as owner-only. That assumption must not be silently carried into a public GPT.

Before permanent backend promotion or public GPT update, explicitly define and test:

- how the public KRC Action authenticates to the backend;
- how backend-side admission distinguishes authorized public-GPT traffic from arbitrary direct calls;
- whether per-user beta codes are removed, retained, or replaced;
- how owner-only server-side admission is changed without exposing secrets;
- rate/quota controls for public-user concurrency;
- abuse protection and bounded resource use;
- privacy/retention behavior for non-owner media;
- failure behavior when admission/quota is denied.

Public users must never be asked to paste provider API keys or hidden Action credentials.

### T3 - Failure isolation tests

Add explicit regression proving that all of the following MEDIA failures remain local to MEDIA:

```text
VoiceBridge unavailable
Render cold-start/timeout
Neon unavailable
AssemblyAI unavailable/quota denied
Cobalt unavailable
Telegram retrieval unavailable
attachment validation failure
unsupported platform
quota/admission rejection
```

Expected result for every case:

```text
MEDIA -> explicit unavailable/failure state
Core KRC -> unaffected
```

### T4 - Backend promotion readiness

Before product-side R2:

- reverify exact VoiceBridge head and CI;
- reverify exact Render live baseline and rollback target;
- reverify Neon schema/connectivity;
- verify current provider state and credit policy;
- verify Cobalt-only Facebook policy;
- verify no automatic paid fallback;
- verify local attachment limits and cleanup;
- verify public-user admission/auth design from T2;
- verify observability without secret/transcript leakage;
- keep rollback to known-good backend tested and documented.

No live GPT update is implied by backend readiness.

### T5 - Existing-public-GPT draft support

When product-side R3 preflight confirms that the already-published KRC can still be edited and updated safely, prepare only the minimal Action/API changes needed by that same GPT identity.

Required technical properties:

- existing Core Action behavior remains compatible;
- MEDIA endpoints are additive;
- media backend base URL/domain is stable and intended for public use;
- public Action/privacy-policy requirements are satisfied at execution time;
- Action errors are bounded and user-readable;
- no dependency on private MEDIA BETA GPT identity;
- no secret values embedded in repository documentation or user-visible instructions.

### T6 - Preview regression support

Before live `Update` of the existing published KRC, support Preview validation for:

- Core-only research task with zero MEDIA calls;
- supported public media task;
- unsupported media task;
- forced MEDIA backend failure while Core remains usable;
- provider quota/fail-closed behavior;
- Cobalt failure -> unavailable with no paid fallback;
- Telegram zero-retrieval-credit route;
- local attachment path where supported;
- durable readback/idempotency;
- privacy/cleanup metadata.

### T7 - Post-update verification support

After an explicitly authorized product-side R3 Update, support immediate R4 checks:

- health and Action compatibility;
- public Core requests succeed without MEDIA;
- public MEDIA requests reach intended backend;
- owner-only/private-beta assumptions do not block legitimate public KRC traffic;
- no unexpected provider selector change;
- no duplicate paid/provider work;
- rollback path remains available.

If a critical public-access/Core regression is detected, backend rollback must be available immediately while the product-side GPT rollback procedure is followed.

## Safety boundaries

This plan does not authorize:

- merge of PR #45;
- permanent Render promotion;
- changes to Neon data/schema;
- activation of Gemini prerecorded;
- Hybrid C/D implementation;
- paid AssemblyAI fallback;
- Builder/GPT Action update;
- creation/publication of a new GPT;
- exposure of owner secrets;
- public rollout by itself.

## Cross-repository gate mapping

Product-side authority defines:

```text
R0  Public KRC Update Safety Preflight
R1  Repository integration
R2  Permanent MEDIA backend promotion/readiness
R3  Update existing published KRC GPT
R4  Post-update public-access + Core regression verification
```

VoiceBridge technical work must stop at the boundary of each gate until the corresponding explicit owner authorization exists.

## Current evidence retained

M4 owner-only canary remains accepted evidence:

```text
run: 33580592224
result: SUCCESS
exact tested target: 6a9491359795840ec9e79c9edc0ea82f595e9784
real Telegram -> AssemblyAI job: PASS
Neon durability/idempotency: PASS
mandatory rollback: PASS
```

This owner-only evidence is necessary but not sufficient for public-user exposure. Public admission/privacy/load behavior requires separate validation before R2/R3.