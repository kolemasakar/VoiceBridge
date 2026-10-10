# KRC MEDIA BETA M4 Owner-Only Canary Acceptance

Date: 2026-09-02
Status: OWNER_CANARY_ACCEPTED / ROLLBACK_COMPLETE / PROMOTION_NOT_AUTHORIZED
Scope: isolated KRC MEDIA BETA Render service only

## Authorization

The owner explicitly authorized a bounded M4 owner-only canary after M4 image-parity acceptance.

The canary did not authorize merge, permanent backend promotion, external testers, public rollout, Gemini prerecorded activation, Hybrid C/D activation, or automatic paid fallback.

## Exact target

VoiceBridge branch:

`agent/krc-media-gemini-migration`

M4 image-parity target commit temporarily deployed:

`6a9491359795840ec9e79c9edc0ea82f595e9784`

Isolated Render service:

`voicebridge-krc-media-beta-kolemasakar`

Resolved service ID:

`srv-da1kic5bedkc73d6fk60`

Configured isolated service branch at canary time:

`agent/krc-media-transcript`

Pre-canary live commit captured as rollback target:

`2f0f02769dbdf2e8240e6b08867ecef2faaede16`

## One-shot execution evidence

Temporary workflow creation commit:

`fae32964f54e44509305f422287b205edf3586a4`

Workflow:

`KRC Media M4 Owner Canary`

Run:

`33580592224`

Job:

`100093850490`

Result:

`SUCCESS`

The temporary one-shot workflow was removed after successful execution:

`df007e8df04df5c6dfaba07c3aa9cf793fdc8362`

## Pre-deploy gates

All pre-deploy gates passed before the isolated service was mutated:

```text
Render service identity                         PASS
isolated service branch boundary                PASS
exact rollback commit captured                  PASS
KRC_MEDIA_DATABASE_URL present                  PASS
KRC_MEDIA_ACTION_TOKEN present                  PASS
KRC_MEDIA_BETA_CODES present                    PASS
ASSEMBLYAI_API_KEY present                      PASS
TEST_ACCESS_TOKEN present                       PASS
KRC_MEDIA_COBALT_ENDPOINT present               PASS
Render/Neon database URL identity               PASS
KRC prerecorded selector                        ASSEMBLYAI/default
ScrapeCreators paid route                       INACTIVE
Cobalt transport reachability                   PASS / HTTP 200 / no media request
Neon connectivity                               PASS
required KRC durable tables                     PASS
active nonterminal KRC jobs                     0
```

Secret values were not recorded in repository evidence.

## Canary deployment

Render deploy ID:

`dep-dabnveqjnfac73dnkgbg`

Exact target commit reached live state:

`6a9491359795840ec9e79c9edc0ea82f595e9784`

Live owner-only capability checks passed:

```text
health                                           PASS
unauthenticated managed-media request            HTTP 401 / PASS
mode                                             zero_client_managed_beta
configured                                       true
durable_store                                    postgres
restart_resilient_jobs                           true
facebook_free_retrieval_provider                 cobalt
facebook_free_retrieval_configured               true
facebook_paid_retrieval_configured               false
facebook_automatic_paid_retrieval                false
telegram_public_retrieval                        true
telegram_retrieval_credits                       0
telegram_stt_provider                            assemblyai
telegram_stt_configured                          true
local_attachment_transport                       true
local_attachment_transcription                   true
local_attachment_provider                        assemblyai
user_beta_access_code_required                   false
owner_access_injected_server_side                true
```

The health/capability smoke caused no durable Neon job or STT-charge mutation.

## One real provider-consuming canary job

Previously accepted public Telegram fixture:

`https://t.me/techcrimes/12107`

Exactly one real initial Telegram-to-AssemblyAI job was executed.

KRCM job:

`KRCM_8c0f6a9e-b3c9-4c9a-8978-69d6c5acc535`

Observed result:

```text
status                                           COMPLETED
provider                                         assemblyai
provider_mode                                    telegram_public_retrieval_stt
retrieval_provider                               telegram_public_web
retrieval_credits_charged                        0
managed credits_charged                          0
stt_seconds_charged                              53
segment_count                                    1
transcript_characters                            769
provider_data_deleted                            true
reused on initial request                        false
```

Transcript text was not written to repository evidence.

## Durability and idempotency

Post-job checks passed:

```text
durable status readback                          PASS
segment readback                                 PASS
duplicate same request                           reused=true
same KRCM job reused                              PASS
durable job rows for canary job                  1
STT reservation rows for canary job              1
second provider reservation on duplicate         NONE
```

The duplicate request therefore did not create a second STT reservation.

The invalid/private Telegram boundary was also checked without a provider call and returned the expected `INVALID_REQUEST` behavior.

## Rollback

Rollback was mandatory even after successful canary validation.

Rollback deploy ID:

`dep-dabnvs3tqb8s73d1c68g`

Restored exact pre-canary commit:

`2f0f02769dbdf2e8240e6b08867ecef2faaede16`

Rollback result:

```text
rollback deploy                                  PASS
restored commit identity                         PASS
post-rollback health                             PASS
```

Temporary runner-side secret material was deleted at the end of the job.

## Acceptance conclusion

```text
M3                                             CLOSED
M4_IMAGE_PARITY                                PASS
M4_OWNER_CANARY                                PASS
M4_CANARY_REAL_STT                             PASS
M4_CANARY_DURABILITY                           PASS
M4_CANARY_IDEMPOTENCY                          PASS
M4_CANARY_PROVIDER_CLEANUP                     PASS
M4_CANARY_ROLLBACK                             PASS
M4_PERMANENT_BACKEND_PROMOTION                 NOT_AUTHORIZED
CURRENT_KRC_PRERECORDED_PROVIDER               AssemblyAI universal-2
GEMINI_PRERECORDED_NORMAL_ACTIVATION           FALSE
FUTURE_HYBRID_C_D                              PLANNED / NOT_IMPLEMENTED
```

The canary proves that the M4 target can run the accepted owner-only KRC media path on the real isolated Render/Neon contour and can be rolled back cleanly. It does not itself authorize permanent deployment or any release gate.

## Release boundary

```text
R1 merge                 HOLD
R2 backend promotion     HOLD
R3 external testers      HOLD
R4 public rollout        HOLD
provider cutover         NOT_AUTHORIZED
```

No automatic paid fallback is authorized.
