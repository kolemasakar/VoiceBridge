# A9.7-I DIAG-FIX Isolated Deploy Checkpoint

Date: 2026-08-23
Status: DEPLOYED_READ_ONLY_VERIFIED_E2E_PENDING
Scope: isolated K-Research & Critic MEDIA BETA only

## Runtime

Isolated VoiceBridge service:
- service ID: `srv-da1kic5bedkc73d6fk60`;
- deployed runtime SHA: `5246be583101ca9693e356da3b5c3f42687e577e`;
- Render deploy ID: `dep-da5j4b3ncjis7393mnh0`;
- deploy status: `live`.

Read-only postdeploy verification:
- health HTTP: `200`;
- health status: `ok`;
- managed capability HTTP: `200`;
- `facebook_free_retrieval_configured=true`;
- `facebook_paid_retrieval_configured=false`;
- `facebook_stt_configured=true`.

## Observability hardening

The deployed runtime preserves safe free Facebook retrieval diagnostics when Cobalt does not return a usable media asset:
- `free_retrieval_error_code`;
- `free_retrieval_provider`;
- `free_retrieval_http_status_class`;
- structured event `facebook_free_retrieval_failed`.

The hardening does not persist or log source/media URLs, provider response bodies, beta access codes, API keys, or secrets.

Mock regression coverage includes:
- `FACEBOOK_COBALT_UNREACHABLE`;
- `FACEBOOK_COBALT_FAILED`;
- `FACEBOOK_RETRIEVAL_INVALID_JSON`;
- `FACEBOOK_COBALT_NO_DIRECT_MEDIA`.

Canonical validation before deploy: cloud `114/114 PASS`; browser extension PASS; repository docs PASS; A9.7-F Cobalt package validation PASS.

## Private GPT E2E state

The actual private GPT Builder has already been updated to the A9.7-C Action schema/instructions.

The first owner NEW-chat Facebook E2E correctly used the free Facebook path and stopped at the paid fallback gate after Cobalt did not return usable media. Zero retrieval credits were charged. ScrapeCreators was not invoked. AssemblyAI was not started in that failed E2E.

Therefore private-GPT Facebook E2E remains **PENDING / NOT COMPLETE**. A new E2E is a separate explicit gate.

## Paid fallback boundary

ScrapeCreators remains unconfigured and not live accepted. Automatic paid continuation and automatic replay remain forbidden. Any real ScrapeCreators request requires a separate explicit approval with `max_credits=1`.

## Isolation boundary

The deploy and verification targeted only the isolated MEDIA BETA service. Production VoiceBridge, repository `main`, and merge state were not changed.
