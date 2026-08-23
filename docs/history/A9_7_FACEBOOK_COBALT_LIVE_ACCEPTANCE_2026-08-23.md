# A9.7 Facebook Cobalt Live Acceptance

Date: 2026-08-23
Status: LIVE_ACCEPTED_FREE_PATH
Scope: isolated K-Research & Critic MEDIA BETA only

## Accepted runtime path

`Facebook public URL -> isolated VoiceBridge -> Cobalt -> media asset -> AssemblyAI STT -> durable KRCM transcript`

The accepted scope is the free Cobalt retrieval path only.

The ScrapeCreators paid fallback remains unconfigured in the isolated VoiceBridge runtime and is not live accepted. It may run only after a separate explicit one-credit consent and must never run automatically.

## Runtime boundary

Isolated VoiceBridge service:
- service ID: `srv-da1kic5bedkc73d6fk60`;
- runtime code SHA: `e5e2d968d87c6fdbefbcad70ecd05395cf61cec1`;
- managed capability reports `facebook_free_retrieval_configured=true`.

Isolated Cobalt service:
- service ID: `srv-da5ggq6k1f9s738j8d8g`;
- plan: Free;
- region: Frankfurt;
- API-key authentication required;
- unauthenticated processing request rejected with `error.api.auth.key.missing`.

## H1 live evidence

Public Facebook Reel: `1114235920664408`.

Observed managed job:
- job ID: `KRCM_0d2a512d-c90d-4b41-87b7-3d3f47d258bd`;
- start HTTP: 200;
- final status: `COMPLETED`;
- provider: `assemblyai`;
- provider mode: `facebook_retrieval_stt`;
- retrieval provider: `cobalt`;
- retrieval credits charged: 0;
- STT seconds charged: 23;
- segment count: 1;
- transcript characters: 101;
- durable reread status: `COMPLETED`;
- durable segments read: HTTP 200;
- terminal error: none.

The first H1 workflow attempt stopped before the HTTP start because its PR-job Action token was empty. No Facebook, Cobalt, or AssemblyAI request occurred in that setup failure. The corrected H1 run read the already configured Action token server-side from Render and performed the single real acceptance start.

## Provider and cost boundary

H1 did not call ScrapeCreators or Supadata and did not invoke the paid Facebook continuation endpoint. AssemblyAI ran only after Cobalt returned a media asset.

## Historical A9.6 distinction

The previous Supadata-based Facebook route remains not accepted. A9.7 Cobalt acceptance does not retroactively mark A9.6 Facebook complete and does not change the non-replay rules for earlier uncertain provider-charge operations.

## Product boundary

This is backend acceptance for the isolated owner beta. The actual private Custom GPT Builder still requires the A9.7-C Action schema/instruction update and a separate owner new-chat Facebook E2E before private-GPT Facebook acceptance is complete.

Production VoiceBridge, repository `main`, and merge state were not changed by H2.
