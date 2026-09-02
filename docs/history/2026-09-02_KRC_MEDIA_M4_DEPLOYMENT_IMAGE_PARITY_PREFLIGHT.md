# KRC MEDIA BETA M4 Deployment-Image Parity Preflight

Date: 2026-09-02
Status: PREFLIGHT_COMPLETE / CANARY_BLOCKED_ON_IMAGE_PARITY
Scope: repository-defined VoiceBridge cloud image and KRC managed runtime dependencies
Runtime changes: NONE
Deployment: NOT_PERFORMED

## Decision context

M3/M3B provider evidence is complete. The owner decided to keep AssemblyAI `universal-2` as the current accepted KRC prerecorded provider while remaining free credits are available. A future Hybrid C/D Gemini free-first path is separately recorded and deferred until the AssemblyAI free-credit trigger.

M4 may therefore begin only as infrastructure preflight. This record does not authorize deployment, provider cutover, merge, external testing, or public rollout.

## Repository image under review

`src/cloud/Dockerfile` currently uses a two-stage `node:24-alpine` build/runtime image. The runtime stage installs Node production dependencies only and does not install additional operating-system packages.

## Parity checks

### 1. Shared server mounts KRC managed routes - PASS

`src/cloud/src/managed_server.ts` constructs the KRC managed media service and mounts the attachment probe plus managed media HTTP handler before legacy VoiceBridge request listeners.

Result: KRC managed HTTP code is present in the shared server entry path.

### 2. KRC environment/configuration surface - PASS_STATIC

`src/cloud/.env.example` includes the KRC provider selector, action token, database URL, Cobalt settings, Gemini key/model settings, and media limits.

This is static repository evidence only. No claim is made here about the current deployed environment values.

### 3. Local attachment media processing - FAIL_IMAGE_PARITY

`src/cloud/src/attachment_managed_pipeline.ts` spawns both:

```text
ffmpeg
ffprobe
```

for deterministic local attachment normalization and duration probing.

The current `src/cloud/Dockerfile` runtime stage does not install `ffmpeg`. Therefore the repository-defined runtime image cannot guarantee the accepted KRC local-attachment path.

Required remediation before canary:

```text
runtime image must contain ffmpeg and ffprobe
```

On Alpine this is expected to be supplied by the `ffmpeg` package, but the exact package/version must be validated in CI before M4 canary acceptance.

### 4. Durable PostgreSQL/Neon persistence - FAIL_IMAGE_PARITY

`src/cloud/src/managed_media_persistence.ts` implements durable KRC storage by spawning the PostgreSQL CLI:

```text
psql
```

The current runtime image does not install a PostgreSQL client package.

Required remediation before canary:

```text
runtime image must contain psql
```

The exact Alpine package/version must be validated in CI. The database URL must remain supplied through environment configuration; no secret may be embedded in the image.

### 5. Facebook Cobalt retrieval transport - PASS_STATIC

The active free Cobalt retriever is HTTP-based and does not itself require a local retrieval binary in the VoiceBridge image.

Policy remains:

```text
Cobalt success -> continue
Cobalt failure -> unavailable
NO automatic paid fallback
```

### 6. Telegram public route - PASS_STATIC

The Telegram managed path submits the public media URL to the accepted AssemblyAI path and does not introduce a new local binary dependency in the reviewed code path.

### 7. Node/runtime contract - PASS_STATIC

`package.json` requires Node >=24 and the Dockerfile uses Node 24 Alpine.

### 8. Provider/runtime activation - UNCHANGED

```text
KRC active prerecorded provider: AssemblyAI universal-2
Gemini prerecorded normal activation: FALSE
future Hybrid C/D: PLANNED / NOT_IMPLEMENTED
```

## M4 preflight result

```text
M3: CLOSED / RETAIN_ASSEMBLYAI_CURRENT_PROVIDER
M4_PREFLIGHT: COMPLETE
M4_CANARY_READY: FALSE
BLOCKER_1: FFMPEG_FFPROBE_MISSING_FROM_RUNTIME_IMAGE
BLOCKER_2: PSQL_MISSING_FROM_RUNTIME_IMAGE
DEPLOYMENT_PERFORMED: FALSE
PROVIDER_CUTOVER: FALSE
```

## Required next implementation work before M4 canary

1. Update the VoiceBridge cloud runtime image to install the minimum required OS packages for accepted KRC paths: `ffmpeg`/`ffprobe` and `psql`.
2. Add CI image-parity validation that builds the Docker image and verifies the required commands exist in the final runtime stage.
3. Add or run a no-provider-call smoke validation for KRC route startup in the built image.
4. Re-run the complete VoiceBridge validation suite.
5. Only after green image-parity evidence, request/record a separate owner decision before any actual M4 deployment/canary.

## Safety boundary

This preflight is repository-only evidence. It does not inspect or mutate Render, Neon, provider secrets, production runtime, Builder package, Action URL, or any external deployment.

R1/R2/R3/R4 remain HOLD.
