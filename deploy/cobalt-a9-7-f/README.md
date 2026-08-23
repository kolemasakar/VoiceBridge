# A9.7-F Cobalt deployment package

Status: CODE ONLY / INERT. This package does not create or modify Render services by itself.

## Purpose

Provide the free first-attempt Facebook media retrieval service used by the A9.7 pipeline:

Facebook URL -> Cobalt -> existing AssemblyAI STT -> durable KRCM segments

If Cobalt cannot retrieve the public Facebook media, VoiceBridge stops at AWAITING_RETRIEVAL_CONSENT. ScrapeCreators remains a separate explicitly approved paid fallback and is not configured by this package.

## Pinned upstream

Official image repository:

- ghcr.io/imputnet/cobalt
- audited release tag: 11.7.1
- immutable multi-architecture manifest digest:
  sha256:63186dd68afd57ce3bb1f62cc4c139f5fa95b9c3e87a3cf5c6e4c7a570523f62

The Blueprint uses the digest, not latest or the moving major tag.

Before any future deployment, re-check the official GHCR package page and Cobalt Facebook issue status. Do not silently change the digest.

## Render target

Proposed beta service:

- name: krc-cobalt-media-beta-kolemasakar
- type: web
- runtime: image
- plan: free
- region: frankfurt
- expected URL: https://krc-cobalt-media-beta-kolemasakar.onrender.com
- health endpoint: GET /

The Blueprint is intentionally stored below deploy/cobalt-a9-7-f instead of the repository root. It is not linked to Render and cannot provision anything until an operator explicitly creates a Blueprint using this custom path.

If Render reports that the proposed service name is unavailable, STOP. Choose a new name and update both API_URL in render.cobalt-beta.yaml and KRC_MEDIA_COBALT_ENDPOINT in voicebridge.env.example before creating the service.

## Authentication design

Cobalt API-key authentication is mandatory.

The service configuration sets:

- API_KEY_URL=file:///etc/secrets/cobalt-keys.json
- API_AUTH_REQUIRED=1
- CORS_WILDCARD=0
- CORS_URL=https://voicebridge-krc-media-beta-kolemasakar.onrender.com

CORS is defense in depth only. API-key authentication is the actual access control.

Render Free web services do not receive private-network traffic, so the beta Cobalt endpoint must be reachable over public HTTPS. The required API key protects the processing endpoint.

### Secret file

Do not commit a real API key.

At deployment time:

1. Generate a fresh UUIDv4.
2. Copy cobalt-keys.json.example.
3. Replace REPLACE_WITH_GENERATED_UUID_V4 with that UUID.
4. In the Cobalt Render service, upload the result as the secret file named cobalt-keys.json.
5. Render exposes it to the Docker service at /etc/secrets/cobalt-keys.json.

The key is restricted to:

- allowedServices: facebook
- limit: 20 requests per 60-second rate-limit window

Do not use the example placeholder as a real credential.

## VoiceBridge wiring

After the Cobalt service exists and passes its own health/auth checks, add only to the isolated VoiceBridge service:

- KRC_MEDIA_COBALT_ENDPOINT=https://krc-cobalt-media-beta-kolemasakar.onrender.com
- KRC_MEDIA_COBALT_API_KEY=<the same generated UUIDv4>

Use voicebridge.env.example as the exact template.

Initial configuration should use Render Save only. Do not redeploy VoiceBridge until the separate acceptance step explicitly authorizes it.

The existing VoiceBridge adapter sends:

Authorization: Api-Key <KRC_MEDIA_COBALT_API_KEY>

and uses Cobalt only as the zero-credit first retrieval attempt.

## No paid-provider coupling

This package does not add or change:

- SCRAPECREATORS_API_KEY
- SUPADATA_API_KEY
- ASSEMBLYAI_API_KEY
- KRC_MEDIA_DATABASE_URL

AssemblyAI is already configured on isolated VoiceBridge. ScrapeCreators remains unconfigured and therefore cannot be called by the normal beta path.

## Resource controls

The proposed Cobalt service sets:

- API_PORT=10000
- API_LISTEN_ADDRESS=0.0.0.0
- DURATION_LIMIT=3600
- RATELIMIT_WINDOW=60
- RATELIMIT_MAX=20

Free Render is suitable only for closed-beta validation. It can spin down after inactivity and has an ephemeral filesystem. The API key database is a Render secret file, so it is remounted by Render rather than persisted as application state.

## Future deployment gate

A future A9.7-G deployment must require separate explicit approval before creating infrastructure.

Required sequence:

1. Re-check the pinned Cobalt image and known Facebook support status.
2. Confirm the proposed Render service name/URL.
3. Generate one new UUIDv4 credential.
4. Create the Cobalt service from render.cobalt-beta.yaml only.
5. Upload cobalt-keys.json as a Render secret file.
6. Verify GET / returns healthy Cobalt metadata.
7. Verify an unauthenticated processing request is rejected without using a Facebook URL.
8. Verify an authenticated non-billable API contract request without retrieving Facebook media.
9. Add the two KRC_MEDIA_COBALT_* variables to isolated VoiceBridge using Save only.
10. Redeploy isolated VoiceBridge only after an explicit approval.
11. Verify managed capability reports facebook_free_retrieval_configured=true.
12. Only then request separate approval for a real public Facebook retrieval acceptance test.

No step in A9.7-F performs any of the actions above.

## Rollback

If Cobalt acceptance later fails:

- remove or clear KRC_MEDIA_COBALT_ENDPOINT from isolated VoiceBridge;
- redeploy isolated VoiceBridge;
- confirm facebook_free_retrieval_configured=false;
- leave the paid ScrapeCreators path unconfigured unless separately approved.

This restores the current A9.7-D behavior without touching production or main.
