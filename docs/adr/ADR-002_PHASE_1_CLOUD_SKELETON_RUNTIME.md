# ADR-002_PHASE_1_CLOUD_SKELETON_RUNTIME

UA: Rishennia pro vykonavche seredovyshche khmarnoho karkasa pershoi fazy.

Purpose:
Record the runtime and implementation decisions for the VoiceBridge Phase 1 Cloud Skeleton.

Status:
Accepted

Date:
2026-07-18

## Context

Phase 1 Milestone 2 requires a deployable cloud service baseline with:

- health endpoint;
- shared test-token validation;
- session creation and lifecycle;
- request and correlation identifiers;
- environment-based secrets;
- automated tests;
- provider-neutral deployment.

The service must remain small, understandable, replaceable, and independent of a specific cloud vendor.

## Decision

The Phase 1 Cloud Skeleton uses:

- TypeScript;
- Node.js 24 or later;
- Node.js built-in HTTP server;
- in-memory authoritative session state for one test instance;
- environment variables for configuration and secrets;
- Docker as the provider-neutral deployment package;
- Node.js built-in test runner;
- zero production npm dependencies.

The service implements:

- `GET /api/v1/health`;
- shared Bearer-token validation;
- session create and read endpoints;
- start, pause, resume, and stop commands;
- canonical errors;
- request and correlation identifiers;
- bounded JSON bodies;
- fixed-window request limiting;
- test-environment CORS.

## Rationale

TypeScript is already an approved VoiceBridge language and aligns with the browser client.

The Node.js built-in HTTP server avoids framework dependency before API behavior and deployment needs are validated.

Docker preserves deployment portability across supported cloud platforms.

In-memory state is sufficient for the single-instance test launch and does not introduce premature persistence.

## Consequences

Positive:

- small dependency surface;
- fast startup;
- provider-neutral deployment;
- shared language across browser and cloud code;
- deterministic tests;
- no database required for Milestone 2.

Tradeoffs:

- one service instance owns all sessions;
- sessions are lost when the service restarts;
- horizontal scaling is not supported yet;
- framework features must be implemented explicitly;
- a persistent or distributed state store will require a later decision.

## Security

- real tokens MUST remain outside the repository;
- the shared token MUST NOT be used for public multi-user production access;
- HTTPS MUST terminate at the deployment boundary;
- CORS MUST be restricted outside controlled testing;
- request and provider cost controls MUST be preserved;
- logs MUST NOT contain tokens or raw user content.

## Supersession

A later ADR is required before:

- changing the production runtime language;
- adding a web framework;
- adding persistent session storage;
- supporting multiple cloud service instances;
- selecting a deployment provider that creates architectural lock-in.

## References

- [ADR-001_CLOUD_FIRST_ARCHITECTURE](ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [13_API_DESIGN](../api/13_API_DESIGN.md)
- [PHASE_1_CLOUD_YOUTUBE_MVP](../phases/PHASE_1_CLOUD_YOUTUBE_MVP.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Accepted Phase 1 Cloud Skeleton runtime decision |
