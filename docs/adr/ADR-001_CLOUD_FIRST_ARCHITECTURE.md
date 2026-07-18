# ADR-001_CLOUD_FIRST_ARCHITECTURE

UA: Rishennia pro khmarnu arkhitekturu VoiceBridge.

Purpose:
Record the decision to use a Cloud First architecture for VoiceBridge.

Status:
Accepted

Date:
2026-07-18

## Context

VoiceBridge requires browser-accessible development and operation without requiring users to install a local programming environment.

The project must support a YouTube MVP and later expand to generic audio, external platforms, and two-way interpreter workflows.

The earlier documentation baseline allowed a local-first runtime with optional future cloud services. That direction no longer matches the approved development strategy.

Browser and operating-system security may prevent direct system-audio capture in some future scenarios.

The test launch needs access protection without delaying MVP validation with a complete identity platform.

## Decision

VoiceBridge will use a Cloud First architecture.

The browser is the primary client for Phases 1 through 4.

The following capabilities run in the cloud:

- speech recognition;
- translation;
- speech synthesis;
- session orchestration;
- authoritative session state;
- provider integration;
- secrets management;
- operational logging and metrics.

A minimal local cross-platform VoiceBridge Agent MAY be introduced only in a later phase when browser or operating-system security prevents required system-audio capture.

The Agent is limited to approved local edge functions such as capture and secure forwarding. It MUST NOT become the authoritative runtime for STT, translation, TTS, orchestration, or state.

The test launch MAY use one shared test access token validated at the cloud API boundary.

The test authentication model excludes:

- user registration;
- passwords;
- account recovery;
- social login;
- organizations;
- tenant administration;
- persistent user profiles.

The shared test token MUST be replaceable, revocable, protected as a secret, and supported by abuse and cost controls.

A production authentication and authorization design MUST be approved before public multi-user deployment.

## Consequences

Positive consequences:

- development and execution remain browser-accessible;
- AI providers and secrets remain outside the browser;
- the MVP and later platform modes use one cloud processing model;
- provider replacement and centralized observability are easier;
- a future Agent can be added without moving core processing out of the cloud.

Tradeoffs:

- the MVP depends on cloud availability and network connectivity;
- streaming latency and provider cost require active control;
- cloud security, rate limits, secrets, and operational monitoring become early requirements;
- simplified test authentication is not suitable for public production use.

## Rejected Alternatives

### Local First

Rejected because it requires local runtime management and conflicts with browser-accessible project operation.

### Browser-only AI processing

Rejected as the primary model because provider secrets, capability limits, performance, and browser restrictions make it unsuitable for the complete pipeline.

### Full identity platform before MVP

Rejected for the test launch because it adds implementation scope before end-to-end translation validation.

## Compliance

Architecture, roadmap, technology stack, system design, API design, security, and project history documents MUST remain aligned with this ADR.

Any change that moves authoritative AI processing, orchestration, or state out of the cloud requires a superseding ADR.

## References

- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [10_SYSTEM_DESIGN](../design/10_SYSTEM_DESIGN.md)
- [12_SECURITY_MODEL](../security/12_SECURITY_MODEL.md)

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Accepted Cloud First architecture decision |
