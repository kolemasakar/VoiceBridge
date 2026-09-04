# KRC MEDIA R2-C - PUBLIC PRIVACY AND RENDER PROMOTION PLAN

Date: 2026-09-04
Status: PLAN_READY / NO_DEPLOYMENT / NO_PROVIDER_CUTOVER

## 1. Scope

R2-C closes repository-side planning for future public KRC MEDIA use without deploying anything.

Initial public MEDIA platform scope:

```text
youtube
telegram
instagram
facebook
```

Public local-file attachment support is not part of the initial public rollout unless separately reviewed and activated.

Free-only invariant:

```text
paid retrieval fallback = forbidden
paid AssemblyAI continuation = forbidden
paid Gemini fallback = forbidden
resource/quota exhaustion = MEDIA unavailable / fail closed
Core KRC = remains usable
```

## 2. AssemblyAI owner evidence

Owner-supplied AssemblyAI dashboard evidence on 2026-09-04 shows:

```text
Plan Details: Free
free credits spent: $1.68
free credits remaining: $48.32
paid Pay-as-you-go: not active in the shown Billing view
Upgrade plan action: available separately
```

The screenshot contains no evidence of an active paid plan. The UI presents Pay-as-you-go as an explicit upgrade path.

This closes the R2-B blocker for current plan/balance evidence. It does not authorize paid AssemblyAI use.

## 3. Post-AssemblyAI product decision

Owner decision recorded on 2026-09-04:

```text
AssemblyAI Free remains current KRC prerecorded provider while free credit is available.
After AssemblyAI Free credit exhaustion, target KRC prerecorded provider = Gemini.
No automatic paid AssemblyAI continuation.
```

Current code state remains intentionally unchanged:

```text
KRC_MEDIA_STT_PROVIDER = assemblyai only
Gemini prerecorded adapter = implemented candidate
Gemini prerecorded normal KRC activation = false
```

Therefore exhaustion does NOT currently cause an automatic runtime cutover. A separately validated provider-router implementation and activation step are still required before the trigger is reached.

## 4. Gemini Free privacy boundary

Official Gemini Developer API pricing checked on 2026-09-04:

- Gemini 3.5 Transcribe (`gemini-3.5-transcribe`) has a Free Tier with free input/output;
- the Free Tier is marked by Google as content being usable to improve Google products;
- the Paid Tier is marked differently for product-improvement use.

Official source:

https://ai.google.dev/gemini-api/docs/pricing

Implication for public KRC MEDIA:

```text
Gemini Free may not be silently enabled for public-user media.
Before the first Gemini Free request, public UX must disclose the data-use boundary.
Explicit user consent is required for Gemini Free processing.
No consent -> fail closed / do not send media to Gemini.
```

The existing Gemini prerecorded adapter uploads normalized audio to the Gemini Files API, calls `gemini-3.5-transcribe`, and attempts provider-file deletion after transcription. Provider-file deletion status must be reported accurately; no deletion guarantee may be fabricated.

## 5. OpenAI public Action privacy requirement

OpenAI currently requires public GPT Actions to include a valid Privacy Policy URL.

Official OpenAI reference checked on 2026-09-04:

https://help.openai.com/en/articles/9442513

Repository-side candidate policy:

https://github.com/kolemasakar/K_Research_Critic/blob/main/docs/PRIVACY_POLICY.md

The policy document may be prepared before R3, but adding it to the live public GPT Action remains an R3 Builder change and is not authorized by R2-C.

## 6. Current authenticated Render baseline

Workspace:

`tea-d9dsqdjrjlhs73ba1ga0`

MEDIA service:

```text
name: voicebridge-krc-media-beta-kolemasakar
service id: srv-da1kic5bedkc73d6fk60
url: https://voicebridge-krc-media-beta-kolemasakar.onrender.com
region: frankfurt
runtime: docker
plan: free
rootDir: src/cloud
healthCheckPath: /api/v1/health
autoDeploy: no
configured branch: agent/krc-media-transcript
```

Current live deploy:

```text
deploy id: dep-dabnvs3tqb8s73d1c68g
commit: 2f0f02769dbdf2e8240e6b08867ecef2faaede16
status: live
```

Known M4 canary:

```text
commit: 6a9491359795840ec9e79c9edc0ea82f595e9784
status: deactivated
rollback to 2f0f027...: confirmed
```

Current configured service branch head is `a0d1d5a380d0d90a42510c3b28f6221385578d52`, so a generic branch-head deploy must NOT be treated as a rollback to the known live baseline.

## 7. Current R2 candidate

```text
branch: agent/krc-media-gemini-migration
head: 0757a00dccaa1c938e2dd454c8369e8e067a3e7b
Validate: 33885047366 / SUCCESS
PR #45: OPEN / DRAFT / UNMERGED / mergeable=true
```

Compared with the current live commit `2f0f027...`, Git history is diverged. Therefore R2 permanent promotion must use an exact candidate commit and must not infer safety from branch names alone.

The current candidate preserves:

```text
KRC prerecorded active provider: AssemblyAI universal-2
Gemini prerecorded candidate: implemented but inactive
Supadata: Free-only guard in public mode
Facebook: Cobalt free path
ScrapeCreators credential in public free-only mode: forbidden
public MEDIA admission/rate/concurrency guards: enabled by config only
```

## 8. Exact Render promotion sequence

This sequence is NOT executed by R2-C.

### P0 - freeze evidence

Immediately before promotion, re-read and record:

```text
Render service id
current live deploy id
current live commit
candidate VoiceBridge head
candidate Validate result
Neon connectivity/schema state
Supadata current Free plan/credits
AssemblyAI current Free plan/balance
Cobalt health
```

Any mismatch with this plan stops promotion for review.

### P1 - preserve exact rollback target

Rollback target remains:

```text
2f0f02769dbdf2e8240e6b08867ecef2faaede16
```

Do not use `agent/krc-media-transcript` branch head as the rollback selector because its current head is not the known-good live commit.

The promotion operator must preserve the ability to deploy the exact known-good commit, using the same exact-commit mechanism proven during M4 canary/rollback.

### P2 - review environment changes before mutation

Required public-mode configuration for the current AssemblyAI-first stage:

```text
KRC_MEDIA_PUBLIC_MODE=true
KRC_MEDIA_FREE_TIER_ONLY=true
KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY=true
KRC_MEDIA_STT_PROVIDER=assemblyai
KRC_MEDIA_TRANSCRIBE_MODEL=gemini-3.5-transcribe
MEDIA_DAILY_STT_SECONDS<=7200
MEDIA_MAX_CONCURRENT_JOBS=1
RATE_LIMIT_REQUESTS_PER_MINUTE<=60
KRC_MEDIA_ACTION_TOKEN=<server secret already coordinated with GPT Action>
SUPADATA_API_KEY=<server secret>
ASSEMBLYAI_API_KEY=<server secret>
KRC_MEDIA_COBALT_ENDPOINT=<current Cobalt endpoint>
KRC_MEDIA_DATABASE_URL=<current durable store>
SCRAPECREATORS_API_KEY must be absent
```

`GEMINI_API_KEY` may remain configured for already existing VoiceBridge functions, but KRC prerecorded Gemini selection must remain inactive in the first AssemblyAI-first public deployment.

No secret value is copied into repository documentation or test output.

### P3 - exact candidate deploy

Deploy exact commit:

`0757a00dccaa1c938e2dd454c8369e8e067a3e7b`

to service:

`srv-da1kic5bedkc73d6fk60`

with `autoDeploy=no` retained.

Do not deploy an unspecified branch head.

### P4 - bounded pre-public canary

Before any Builder R3 update, run only bounded owner/operator checks:

```text
GET /api/v1/health
MEDIA Action auth success/failure
YouTube free native route
Instagram free native route
Telegram public retrieval -> AssemblyAI
Facebook Cobalt -> AssemblyAI
Cobalt forced/unavailable behavior
Supadata quota exhaustion behavior
invalid auth behavior
durable store unavailable behavior
Core health after each MEDIA failure
```

Provider-consuming calls must be minimized and charged only against known remaining free allowance.

### P5 - pass criteria

Promotion candidate may remain live for R3 preparation only if all are true:

```text
health = pass
four public platforms = pass or explicit platform-specific unavailable state behaves correctly
paid fallback = impossible by config and observed behavior
Core remains usable after MEDIA failure injection
no secret/transcript leakage in logs
Neon durable state = healthy
free-only quotas = enforced
AssemblyAI remains Free
```

### P6 - rollback criteria

Rollback immediately to exact `2f0f027...` if any of these occur:

```text
unexpected paid-provider path
public admission bypass
Core route regression
secret leakage
unbounded retry/provider consumption
durable-state corruption
platform route regression without fail-closed behavior
health instability
```

After rollback, verify `/api/v1/health` and the previously accepted owner-only baseline.

## 9. Post-AssemblyAI Gemini cutover sequence

This is a later provider transition, not part of the first R2 permanent promotion.

Trigger:

```text
AssemblyAI Free credits exhausted or effectively unavailable as the free route
```

Required implementation before cutover:

```text
provider-neutral KRC STT router
Gemini Free quota/admission guard
explicit public Gemini Free data-use disclosure + consent
Gemini prerecorded adapter integrated into Facebook/Telegram/media normalization path
no paid AssemblyAI fallback
no paid Gemini fallback
Gemini quota/provider unavailable -> MEDIA fail closed
provider/model/reason recorded without secrets
regression tests + canonical Validate
bounded owner canary
```

Initial recommended replacement route is the already implemented prerecorded adapter:

`gemini-3.5-transcribe`

A more complex Live/unary Hybrid C/D may remain a later optimization and is not required for the first post-AssemblyAI cutover.

## 10. R2-C disposition

```text
AssemblyAI account evidence: PASS for current Free plan/balance
public Privacy Policy candidate: PREPARED
Render live baseline: VERIFIED
exact Render promotion plan: PREPARED
Gemini post-exhaustion product target: RECORDED
Gemini automatic fallback implementation: NOT IMPLEMENTED
Render deployment: NOT PERFORMED
R3 Builder update: NOT PERFORMED
```

Next gate after repository CI is owner authorization for the actual R2 permanent promotion/canary sequence. R3 remains independently held.
