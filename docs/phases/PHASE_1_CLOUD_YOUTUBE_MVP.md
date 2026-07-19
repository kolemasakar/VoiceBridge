# PHASE_1_CLOUD_YOUTUBE_MVP

UA: Plan realizatsii pershoi fazy khmarnoho YouTube MVP VoiceBridge.

Purpose:
Define the executable Phase 1 plan for validating English-to-Ukrainian real-time AI voice translation for YouTube through a browser client and cloud processing pipeline.

Scope:
Browser audio capture, cloud API, secure streaming, STT, translation, TTS, session orchestration, browser playback, simplified test authentication, observability, validation, and recovery.

Out of Scope:
Public multi-user production access, full user accounts, billing, mobile applications, external meeting platforms, bidirectional interpreter mode, persistent user-content history, and local VoiceBridge Agent implementation.

Status:
Draft

Version:
1.4.0

Last Updated:
2026-07-18

## Table of Contents

1. Phase Objective
2. Target User Scenario
3. Phase Principles
4. Phase Scope
5. Phase Exclusions
6. Reference Runtime
7. Critical Feasibility Gate
8. Cloud Service Decomposition
9. Test Authentication
10. Provider Selection Gates
11. Streaming Transport Gate
12. Milestones
13. Validation Metrics
14. Testing Strategy
15. Security and Privacy
16. Cost Controls
17. Risks and Mitigations
18. Completion Criteria
19. Recovery and Documentation
20. Deliverables
21. References
22. Version History

## 1. Phase Objective

Create and validate the first end-to-end VoiceBridge demonstration.

The Phase 1 result is a browser-based workflow in which a user opens an English YouTube video and hears Ukrainian AI voice translation produced by the cloud pipeline.

Phase 1 MUST prove:

- browser tab audio can be captured with explicit user action;
- captured audio can be streamed securely to the cloud;
- cloud STT can produce incremental English text;
- cloud translation can produce understandable Ukrainian text;
- cloud TTS can produce playable Ukrainian speech;
- translated audio can be returned to and played in the browser;
- session state remains controlled by the cloud;
- the workflow can recover safely from expected failures;
- latency and quality can be measured.

## 2. Target User Scenario

1. The user opens a supported English YouTube video in a Chromium-based browser.
2. The user invokes the VoiceBridge browser extension.
3. The extension requests permission and starts tab-audio capture.
4. The extension creates an authenticated cloud translation session.
5. The extension streams captured audio to the cloud.
6. The cloud recognizes English speech.
7. The cloud translates recognized text into Ukrainian.
8. The cloud synthesizes Ukrainian speech.
9. The cloud streams translated audio and session events to the extension.
10. The extension plays translated audio and displays session state.
11. The user can stop the session.
12. The cloud and browser release session resources.

## 3. Phase Principles

Phase 1 MUST follow these principles:

- Cloud First;
- browser as primary client;
- minimal end-to-end scope;
- explicit user action for capture;
- provider-independent service boundaries;
- one shared revocable test token;
- no user-content retention by default;
- measurable latency and quality;
- bounded buffering and retries;
- safe failure;
- documented checkpoints.

## 4. Phase Scope

### 4.1 Browser Client

Phase 1 includes:

- Chromium browser extension prototype;
- explicit start and stop controls;
- current-tab audio capture;
- audio normalization and chunking;
- authenticated cloud session creation;
- secure audio upload;
- session event handling;
- translated audio playback;
- user-visible state and sanitized errors;
- cleanup on stop, tab close, stream end, or failure.

### 4.2 Cloud Platform

Phase 1 includes:

- HTTPS API under `/api/v1`;
- test-token validation;
- session creation and lifecycle;
- secure bidirectional streaming endpoint;
- audio ingestion;
- audio segmentation or buffering;
- STT adapter;
- translation adapter;
- TTS adapter;
- output streaming;
- authoritative session state;
- structured logs and timing metrics;
- request, provider, and cost limits.

### 4.3 Supported Languages

Phase 1 supports:

- source language: English;
- target language: Ukrainian.

Automatic language detection is not required.

### 4.4 Supported Content

Phase 1 validation uses a controlled set of selected YouTube videos.

The test set SHOULD include:

- one speaker with clean studio audio;
- conversational speech;
- moderate background music;
- different speaking speeds;
- at least one low-quality or noisy sample.

### 4.5 Audio Mixing and Automatic Ducking

Phase 1 MUST mix the original YouTube audio and Ukrainian synthesized speech in the browser.

Default behavior:

- Ukrainian speech plays at the configured primary volume;
- the complete original tab audio is reduced automatically while Ukrainian speech is active;
- the original tab audio rises to a configurable background level during gaps in Ukrainian speech;
- gain changes use smooth ramps and MUST NOT produce abrupt clicks or jumps;
- the user can adjust `Original volume` and `Ukrainian volume`;
- the user can mute the original audio completely.

Recommended initial defaults:

- original audio during Ukrainian speech: 15 percent;
- original audio during Ukrainian pauses: 50 percent;
- Ukrainian speech: 100 percent.

Phase 1 lowers the complete original audio track, including speech, music, and sound effects.

Separating source speech from music and effects is outside Phase 1 scope.

## 5. Phase Exclusions

Phase 1 does not include:

- Firefox or Safari support;
- mobile browsers;
- a local VoiceBridge Agent;
- microphone interpreter mode;
- two-way translation;
- multiple simultaneous target languages;
- user registration;
- passwords;
- social login;
- organizations or tenants;
- persistent transcripts;
- persistent audio history;
- billing;
- public production release;
- automatic provider failover unless required for a validation experiment;
- source separation between speech, music, and sound effects.

## 6. Reference Runtime

The Phase 1 reference client is a Chromium Manifest V3 browser extension.

The reference cloud runtime MUST remain provider-neutral at the architecture boundary.

Logical runtime:

```text
YouTube Tab
    |
    v
Browser Extension
    |
    | HTTPS control
    | Secure binary audio stream
    v
Cloud API Gateway
    |
    v
Session Orchestrator
    |
    +-- Audio Ingestion
    +-- STT Adapter
    +-- Translation Adapter
    +-- TTS Adapter
    +-- Session State
    |
    v
Secure output stream
    |
    v
Browser Playback
```

The initial implementation SHOULD use the smallest deployable structure that preserves these boundaries.

Separate independently deployed microservices are NOT required for Phase 1.

## 7. Critical Feasibility Gate

### 7.1 Objective

Prove browser tab-audio capture and local playback behavior before implementing the complete cloud pipeline.

### 7.2 Technical Basis

Chrome `tabCapture` provides a media stream for the active tab after the user invokes the extension.

The capture prototype MUST verify:

- capture starts only after explicit extension invocation;
- the active YouTube tab produces an audio stream;
- audio continues across normal navigation behavior expected for the test;
- original tab audio behavior is understood;
- reconnecting captured audio through `AudioContext` preserves local playback when required;
- captured audio can be converted into a cloud-compatible stream format;
- capture stops and resources are released correctly.

### 7.3 Prototype Deliverable

Create a minimal browser extension that:

- starts capture from an extension action;
- displays capture state;
- reports audio format and timing metadata;
- sends audio to a temporary local sink or controlled test endpoint;
- preserves or intentionally controls original audio playback;
- stops cleanly.

### 7.4 Exit Criteria

The feasibility gate passes only when:

- capture works on at least three selected YouTube videos;
- no local programming environment is required for the end user;
- audio frames are produced continuously for at least ten minutes;
- start and stop behavior is repeatable;
- original and translated playback strategy is documented;
- unsupported or failed capture produces a clear error;
- the prototype does not expose credentials.

If the gate fails, Phase 1 MUST stop before broad cloud implementation and document the failure.

The local VoiceBridge Agent MUST NOT be introduced as an automatic Phase 1 fallback.

## 8. Cloud Service Decomposition

### 8.1 API Gateway

Responsibilities:

- terminate secure transport;
- validate the shared test token;
- validate requests;
- apply request and connection limits;
- assign request and correlation identifiers;
- route session and streaming traffic.

### 8.2 Session Orchestrator

Responsibilities:

- create sessions;
- own authoritative session state;
- validate state transitions;
- coordinate pipeline stages;
- manage timeouts and cleanup;
- expose sanitized errors;
- record timing and outcome metrics.

### 8.3 Audio Ingestion

Responsibilities:

- accept authenticated audio streams;
- validate session binding and format;
- apply bounded buffering;
- normalize or segment audio;
- signal backpressure;
- reject excess or malformed data safely.

### 8.4 STT Adapter

Responsibilities:

- convert English audio into incremental text;
- normalize partial and final results;
- expose timing and confidence when available;
- map provider errors;
- protect provider credentials.

### 8.5 Translation Adapter

Responsibilities:

- translate English text into Ukrainian;
- preserve segment identity and ordering;
- normalize provider responses;
- map provider errors;
- avoid hidden provider coupling.

### 8.6 TTS Adapter

Responsibilities:

- generate Ukrainian speech;
- return audio and timing metadata;
- normalize audio format for browser playback;
- map provider errors;
- protect provider credentials.

### 8.7 Output Streaming

Responsibilities:

- deliver ordered events and translated audio;
- apply bounded queues;
- expose disconnect and recovery state;
- prevent cross-session delivery;
- release output buffers during cleanup.

### 8.8 Session State

Phase 1 MAY use an in-memory cloud state implementation for a single test instance when deployment limits are documented.

Authoritative state MUST remain in the cloud.

Persistent user content MUST NOT be introduced.

A future distributed state store MAY be added when multi-instance or recovery requirements justify it.

## 9. Test Authentication

Phase 1 uses one shared revocable Bearer token.

Required controls:

- token stored through cloud secret configuration;
- token validation at HTTPS and streaming boundaries;
- rotation without source-code changes;
- immediate revocation;
- no token in URLs;
- no token in logs;
- no token committed to the repository;
- request and connection limits;
- provider quota and cost limits.

The browser distribution method for the test token MUST be controlled.

A token embedded in a publicly distributed extension bundle is prohibited.

## 10. Provider Selection Gates

Provider selection MUST be documented before adapter implementation.

### 10.1 STT Criteria

Evaluate:

- English streaming support;
- partial and final results;
- expected latency;
- audio format support;
- WebSocket or streaming API availability;
- error and timeout behavior;
- Ukrainian transcription support for future phases;
- pricing and test limits;
- credential security;
- data-retention and privacy terms;
- SDK and documentation quality.

### 10.2 Translation Criteria

Evaluate:

- English-to-Ukrainian quality;
- conversational tone preservation;
- incremental segment handling;
- context support;
- latency;
- pricing and limits;
- error behavior;
- data-retention and privacy terms.

### 10.3 TTS Criteria

Evaluate:

- Ukrainian voice availability;
- pronunciation quality;
- speech naturalness;
- streaming or low-latency output;
- audio format support;
- speaking-rate control;
- pricing and limits;
- error behavior;
- data-retention and privacy terms.

### 10.4 Selection Output

The selection step MUST produce:

- one primary provider per capability;
- documented alternatives;
- estimated test cost;
- provider limits;
- required credentials;
- known risks;
- adapter contract mapping;
- approval before implementation.

Provider selection that creates long-term architectural lock-in requires an ADR.

## 11. Streaming Transport Gate

Phase 1 SHOULD evaluate standard WebSocket as the initial transport.

The transport spike MUST verify:

- browser and cloud compatibility;
- binary audio frames;
- ordered session events;
- authentication;
- reconnect behavior;
- maximum message size;
- keepalive behavior;
- bounded client and server queues;
- application-level backpressure;
- translated audio delivery.

Standard WebSocket does not provide automatic backpressure.

Phase 1 MUST implement explicit queue limits and flow-control messages if WebSocket is selected.

WebSocketStream MUST NOT be the only supported transport because its browser support is limited.

The final transport decision MUST be recorded in the Phase 1 document or an ADR before the end-to-end implementation milestone.

## 12. Milestones

### Current Milestone Status

Completed milestones:

- 1 - Browser Capture Feasibility: PASSED.
- 2 - Cloud Skeleton: PASSED.
- 3 - Streaming Transport: PASSED.

Active milestone:
4 - STT Integration.

Milestone 2 result:
The Docker service is live on Render, the HTTPS health endpoint is available, and extension version 0.2.0 completed the authenticated create, start, and stop session lifecycle.

Implementation path:

`src/cloud/`

Completed Milestone 2 checks:

- TypeScript compilation;
- 8 automated tests;
- authenticated HTTP session lifecycle smoke test;
- health endpoint;
- shared Bearer-token validation;
- create and read session endpoints;
- start, pause, resume, and stop commands;
- request and correlation identifiers;
- bounded JSON bodies;
- request limiting;
- environment-based secret configuration;
- Dockerfile;
- ASCII and secret-pattern validation.

Completed deployment and integration validation:

- Render Web Service selected for the Phase 1 test deployment;
- Docker image built and deployed from `src/cloud/`;
- shared test token configured through Render environment variables;
- public HTTPS health endpoint returned `status: ok`;
- browser extension 0.2.0 connected to the deployed API;
- authenticated connection test returned `READY`;
- capture and cloud session reached `ACTIVE`;
- test ducking displayed and applied `DUCKING 15%`;
- Stop returned capture to `IDLE` and cloud session to `COMPLETED`.

Validation record:

`docs/phases/PHASE_1_MILESTONE_2_CLOUD_SKELETON_VALIDATION.md`

Milestone 3 status:
PASSED.

Milestone 3 implementation:

- standard WebSocket transport;
- one-time 60-second stream ticket bound to an `ACTIVE` session;
- shared token excluded from WebSocket URLs;
- mono `pcm_s16le` binary frames;
- 20 millisecond browser audio frames;
- 32768-byte maximum binary frame;
- acknowledgement every 10 frames;
- maximum 50 unacknowledged client frames;
- 262144-byte browser output-buffer limit;
- excess-frame drop counters;
- unexpected disconnect cleanup;
- visible stream status, frames, bytes, dropped frames, and unacknowledged frames;
- 10 automated tests.

Completed Milestone 3 exit validation:

- cloud service 0.2.0 deployed to Render;
- browser extension 0.3.0 confirmed;
- real YouTube audio streamed for 10 minutes and 3 seconds;
- 30902 frames and 59331840 bytes sent;
- zero frames dropped;
- unacknowledged frames remained below the maximum of 50;
- clean Stop returned capture to `IDLE` and both stream and session to `COMPLETED`.

Validation record:

`docs/phases/PHASE_1_MILESTONE_3_STREAMING_TRANSPORT_VALIDATION.md`

Milestone 4 status:
Implementation complete; Render configuration and live browser validation pending.

Milestone 4 implementation:

- Deepgram Nova-3 selected behind a provider-neutral cloud interface;
- cloud service 0.3.0 forwards ordered PCM frames to the STT provider;
- provider credentials remain in `DEEPGRAM_API_KEY` cloud configuration;
- partial and final English transcript events;
- confidence, audio timing, recognition latency, status, and error events;
- bounded provider output buffering;
- graceful provider stream close;
- browser extension 0.4.0 transcript, status, count, latency, and error display;
- bounded browser session transcript state;
- 11 automated cloud tests.

Pending Milestone 4 exit validation:

- configure `DEEPGRAM_API_KEY` in Render;
- deploy and verify cloud service 0.3.0;
- load browser extension 0.4.0;
- validate partial and final English text for at least ten minutes;
- record transcript quality, latency, failures, and cost evidence;
- confirm clean Stop and zero secret exposure.

Decision:

`docs/adr/ADR-005_PHASE_1_STREAMING_STT_PROVIDER.md`

Validation record:

`docs/phases/PHASE_1_MILESTONE_4_STT_INTEGRATION_VALIDATION.md`

### Milestone 1 - Browser Capture Feasibility

Deliver:

- minimal Chromium extension;
- tab-audio capture;
- local playback decision;
- audio metadata inspection;
- clean stop and cleanup;
- feasibility report.

Exit:
Critical feasibility gate passed.

### Milestone 2 - Cloud Skeleton

Deliver:

- deployable cloud service;
- `/api/v1/health`;
- shared-token validation;
- session creation and state;
- structured request and session identifiers;
- environment-based secret configuration.

Exit:
Authenticated session can be created and stopped from the extension.

### Milestone 3 - Streaming Transport

Deliver:

- authenticated bidirectional stream;
- binary audio upload;
- event envelope;
- bounded queues;
- flow-control behavior;
- disconnect handling.

Exit:
Ten-minute synthetic or captured audio stream completes without unbounded memory growth.

### Milestone 4 - STT Integration

Deliver:

- STT provider decision;
- provider adapter;
- partial and final recognition results;
- timeout and error mapping;
- latency measurements.

Exit:
Selected English test videos produce usable ordered transcripts.

### Milestone 5 - Translation Integration

Deliver:

- translation provider decision;
- provider adapter;
- English-to-Ukrainian segment translation;
- context policy;
- latency and quality measurements.

Exit:
Ukrainian output is understandable on the approved test set.

### Milestone 6 - TTS and Playback

Deliver:

- TTS provider decision;
- provider adapter;
- Ukrainian audio streaming;
- browser playback queue;
- automatic ducking and browser audio mixing;
- separate original and Ukrainian volume controls;
- documented default gain levels;
- playback cleanup.

Exit:
User hears ordered Ukrainian translated speech during YouTube playback.

### Milestone 7 - End-to-End Hardening

Deliver:

- end-to-end session recovery;
- sanitized errors;
- request and cost limits;
- observability;
- representative test set;
- documented known limitations.

Exit:
Phase 1 completion criteria passed.

### Milestone 8 - Documentation and Recovery

Deliver:

- updated architecture and requirements when behavior changed;
- implementation and setup instructions;
- test report;
- project history update;
- recovery bootstrap;
- next-phase entry criteria.

Exit:
Repository is ready for a clean continuation.

## 13. Validation Metrics

Before final Phase 1 approval, the team MUST record:

- capture start success rate;
- uninterrupted capture duration;
- audio upload stability;
- STT latency;
- translation latency;
- TTS latency;
- end-to-end segment latency;
- translation quality observations;
- Ukrainian voice quality observations;
- playback ordering failures;
- session failure and recovery counts;
- provider request count;
- estimated cost per test minute.

Initial numeric release thresholds are not fixed by this plan.

Milestone 1 and provider spikes MUST produce evidence used to approve realistic thresholds.

## 14. Testing Strategy

Required test categories:

- browser capture start, stop, navigation, and tab-close behavior;
- valid, empty, unsupported, and interrupted audio;
- valid and invalid test token;
- token rotation and revocation;
- session state transitions;
- stream ordering and disconnects;
- bounded buffering and flow control;
- provider success, timeout, unavailable, rate-limit, and malformed response;
- pipeline cleanup;
- secret and user-content exclusion from logs;
- selected YouTube end-to-end scenarios;
- ten-minute stability test.

Provider adapters SHOULD use mocks or fakes for automated contract tests.

Live provider tests MUST use controlled credentials, quotas, and cost limits.

## 15. Security and Privacy

Phase 1 MUST:

- use secure transport;
- protect the shared token;
- keep provider credentials in the cloud;
- validate browser input and provider responses;
- deny cross-session access;
- avoid persistent raw audio, transcripts, translations, and synthesized audio;
- sanitize errors;
- avoid secrets and raw user content in telemetry;
- release session content during cleanup;
- document all data sent to external providers.

## 16. Cost Controls

Before live provider tests:

- define provider spending limits where supported;
- define request and session limits;
- define maximum session duration;
- define maximum concurrent test sessions;
- define maximum audio rate and buffer size;
- monitor provider usage;
- document an emergency token or credential revocation procedure.

The test environment MUST fail closed when approved limits are exceeded.

## 17. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Browser cannot capture required audio | Phase 1 blocked | Execute capture feasibility gate first |
| Original audio becomes unavailable | Poor listening experience | Validate AudioContext playback and mixing strategy |
| End-to-end latency is too high | Translation becomes unusable | Measure each stage and use incremental processing |
| WebSocket buffers grow | Memory and stability failure | Bounded queues and application flow control |
| Translation segments lose context | Poor translation quality | Define context window and final-result policy |
| TTS output falls behind video | Playback backlog | Queue limits, pacing, skip or resync policy |
| Shared token leaks | Unauthorized use and cost | Controlled distribution, rotation, revocation, limits |
| Provider costs exceed plan | Budget impact | Quotas, session duration limits, monitoring |
| Provider lock-in | Expensive future change | Adapter contracts and documented alternatives |
| User content appears in logs | Privacy incident | Structured metadata-only observability |

## 18. Completion Criteria

Phase 1 is complete only when:

- the browser capture feasibility gate passed;
- the extension starts and stops a session reliably;
- the browser streams YouTube audio to the cloud;
- the cloud performs STT, English-to-Ukrainian translation, and Ukrainian TTS;
- the browser plays translated audio;
- automatic ducking lowers original tab audio during Ukrainian speech;
- original and Ukrainian volume controls work independently;
- the shared test token protects control and streaming access;
- provider credentials remain in the cloud;
- session state is authoritative in the cloud;
- buffering and retries are bounded;
- expected failures produce clear sanitized errors;
- no user content is retained by default;
- latency, quality, stability, and cost evidence is recorded;
- documentation and project history are updated;
- a recovery bootstrap is created;
- the next phase entry criteria are defined.

## 19. Recovery and Documentation

Every completed milestone MUST record:

- completed scope;
- changed files;
- decisions;
- validation commands and evidence;
- known limitations;
- current deployment state;
- current credentials and secrets location without secret values;
- next action;
- recovery instructions.

Secrets MUST NOT appear in recovery documents.

## 20. Deliverables

Expected Phase 1 repository outputs:

```text
src/
    browser_extension/
    cloud/
tests/
    browser_extension/
    cloud/
    contract/
    integration/
docs/
    adr/
    api/
    phases/
    history/
tools/
```

Final file names and internal code structure MUST be confirmed when the implementation stack is selected.

## 21. References

Project references:

- [ADR-001_CLOUD_FIRST_ARCHITECTURE](../adr/ADR-001_CLOUD_FIRST_ARCHITECTURE.md)
- [01_PROJECT_OVERVIEW](../overview/01_PROJECT_OVERVIEW.md)
- [03_ROADMAP](../planning/03_ROADMAP.md)
- [04_ARCHITECTURE](../architecture/04_ARCHITECTURE.md)
- [05_TECHNOLOGY_STACK](../architecture/05_TECHNOLOGY_STACK.md)
- [09_FUNCTIONAL_REQUIREMENTS](../requirements/09_FUNCTIONAL_REQUIREMENTS.md)
- [10_SYSTEM_DESIGN](../design/10_SYSTEM_DESIGN.md)
- [11_NON_FUNCTIONAL_REQUIREMENTS](../requirements/11_NON_FUNCTIONAL_REQUIREMENTS.md)
- [12_SECURITY_MODEL](../security/12_SECURITY_MODEL.md)
- [13_API_DESIGN](../api/13_API_DESIGN.md)

Technical references:

- [Chrome tabCapture API](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MDN WebSockets API overview](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

## 22. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.8.0 | 2026-07-19 | Added Milestone 4 Deepgram STT implementation and pending live validation |
| 1.7.0 | 2026-07-19 | Completed ten-minute Milestone 3 streaming validation and activated Milestone 4 |
| 1.6.0 | 2026-07-18 | Added Milestone 3 WebSocket transport implementation and pending live validation |
| 1.5.0 | 2026-07-18 | Completed Milestone 2 deployment and extension lifecycle validation; activated Milestone 3 |
| 1.4.0 | 2026-07-18 | Added Milestone 2 Cloud Skeleton implementation and pending deployment status |
| 1.3.0 | 2026-07-18 | Completed Milestone 1 browser capture validation and activated Milestone 2 |
| 1.2.0 | 2026-07-18 | Added Milestone 1 prototype status and pending browser validation |
| 1.1.0 | 2026-07-18 | Added automatic original-audio ducking and independent volume controls |
| 1.0.0 | 2026-07-18 | Created Phase 1 Cloud YouTube MVP implementation plan |
