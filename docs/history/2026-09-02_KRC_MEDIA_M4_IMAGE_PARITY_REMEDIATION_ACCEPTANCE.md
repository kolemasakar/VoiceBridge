# KRC MEDIA BETA M4 Image-Parity Remediation Acceptance

Date: 2026-09-02
Status: IMAGE_PARITY_ACCEPTED / OWNER_DEPLOYMENT_CANARY_DECISION_PENDING
Scope: VoiceBridge feature-branch final runtime image and no-provider-call startup validation
Deployment: NOT_PERFORMED
Canary: NOT_RUN / NOT_AUTHORIZED

## Preflight blockers

The preceding M4 preflight identified two hard final-image blockers:

```text
ffmpeg/ffprobe missing from runtime image
psql missing from runtime image
```

These tools are required by accepted KRC paths:

- local attachment normalization and duration probing use `ffmpeg` / `ffprobe`;
- durable PostgreSQL/Neon managed-media persistence uses CLI `psql`.

## Remediation

`src/cloud/Dockerfile` now installs the minimum required runtime packages in the final Node 24 Alpine stage:

```text
ffmpeg
postgresql-client
```

No provider selector, provider credentials, KRC API contract, database schema, Action URL, Builder package, or deployed environment was changed.

## CI evidence

VoiceBridge branch:

`agent/krc-media-gemini-migration`

Remediation-validation head:

`ee841d04d88ceb89c87d619fa9b29df9f421268e`

Validate run:

`33576886341`

Result:

```text
krc-image-parity: SUCCESS
cloud: SUCCESS
browser-extension: SUCCESS
repository-docs: SUCCESS
```

### Final-image parity checks

The CI job built the final `src/cloud/Dockerfile` image and verified inside that final runtime image:

```text
command -v ffmpeg
command -v ffprobe
command -v psql
ffmpeg -version
ffprobe -version
psql --version
```

All checks passed.

### No-provider-call startup smoke

CI started the final image with synthetic local test bearer tokens only and without provider API keys or database configuration.

The smoke test verified:

```text
GET /api/v1/health -> service status ok
GET /api/v1/media/managed with synthetic bearer -> managed KRC capability route responds
mode = zero_client_managed_beta
local_attachment_transport = true
```

The smoke did not start a transcription job, retrieval job, database operation, or provider call.

## Acceptance state

```text
M3: CLOSED
CURRENT_KRC_PRERECORDED_PROVIDER: AssemblyAI universal-2
GEMINI_PRERECORDED_NORMAL_ACTIVATION: FALSE
FUTURE_HYBRID_C_D: PLANNED / NOT_IMPLEMENTED
M4_PREFLIGHT: COMPLETE
M4_IMAGE_PARITY_REMEDIATION: COMPLETE
M4_IMAGE_PARITY: PASS
M4_CANARY_PREREQUISITE_IMAGE_PARITY: PASS
M4_DEPLOYMENT: NOT_PERFORMED
M4_CANARY: NOT_RUN / NOT_AUTHORIZED
```

## Remaining gate

Image parity is necessary but does not authorize deployment.

Before any M4 owner canary, a separate owner decision is required to authorize the deployment/canary operation and its exact scope. At that point the current deployment environment, secrets/configuration, Render service state, Neon connectivity, rollback target, and external mutable dependencies must be revalidated.

## Safety boundary

```text
R1 merge: HOLD
R2 backend/production promotion: HOLD
R3 external testers: HOLD
R4 public rollout: HOLD
provider cutover: NOT_AUTHORIZED
```

No automatic paid fallback is authorized. AssemblyAI remains the current KRC prerecorded provider while the current free-credit plan remains in effect.
