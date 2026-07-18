# ADR-003: Phase 1 Test Hosting on Render

Status: Accepted

Date: 2026-07-18

Decision Owners: VoiceBridge project

## Context

Milestone 2 required a public HTTPS deployment of the provider-neutral Cloud Skeleton so the Chromium extension could validate authenticated session creation, start, and stop commands.

The deployment is a controlled Phase 1 test environment. It is not the final production hosting contract and does not provide production multi-user authentication.

## Decision

Use a Render Web Service for the Phase 1 test deployment.

Configuration:

- repository: `kolemasakar/VoiceBridge`;
- branch: `main`;
- runtime: Docker;
- service root: `src/cloud`;
- health check: `/api/v1/health`;
- test secret: `TEST_ACCESS_TOKEN` in Render environment configuration;
- public base URL: `https://voicebridge-cloud.onrender.com`;
- instance class: Free for MVP validation;
- automatic deployment: enabled for relevant commits.

The Dockerfile remains the portable deployment boundary. Application code MUST NOT depend on Render-specific runtime APIs.

## Rationale

Render provides the minimum capabilities required by Milestone 2:

- GitHub-connected deployment;
- Docker image build and execution;
- public HTTPS endpoint;
- environment-based secret configuration;
- health checks;
- deployment logs;
- a no-cost test instance.

This permits end-to-end validation without selecting a permanent production platform prematurely.

## Validation

On 2026-07-18:

- Render built the Node.js 24 Alpine Docker image;
- the service reached `Live` state;
- the public health endpoint returned `status: ok`;
- extension version 0.2.0 authenticated successfully;
- an authenticated session reached `ACTIVE`;
- Stop returned the session to `COMPLETED`.

## Consequences

Positive:

- Milestone 2 has a real public HTTPS deployment;
- browser integration can be tested outside the local environment;
- secrets remain outside the repository;
- Docker preserves provider portability.

Tradeoffs:

- the Free instance can spin down during inactivity and produce a cold-start delay;
- in-memory sessions are lost when the service restarts;
- the service is limited to controlled MVP testing;
- Render availability and free-tier limits affect test availability;
- the shared token is not a production identity model.

## Security

- the real test token MUST remain outside GitHub and project documents;
- screenshots and logs MUST NOT expose the token;
- the token MUST be revocable and replaceable;
- provider API keys MUST remain cloud-side;
- production multi-user access requires a later authentication decision;
- CORS and rate limits MUST be tightened before any public production use.

## Exit and Supersession

A later decision is required before:

- selecting the production hosting platform;
- enabling public multi-user use;
- adding persistent or distributed session state;
- requiring multiple service instances;
- accepting provider-specific infrastructure lock-in.

## References

- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME](ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)
- [PHASE_1_MILESTONE_2_CLOUD_SKELETON_VALIDATION](../phases/PHASE_1_MILESTONE_2_CLOUD_SKELETON_VALIDATION.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Accepted Render for the Phase 1 test deployment |
