# 06_DEVELOPMENT_STANDARD

UA: Standart rozrobky VoiceBridge dlia yakisnoi, bezpechnoi ta pidtrymuvanoi roboty.

Purpose:
Define the approved development standard for the VoiceBridge project.

Scope:
Development principles, code quality, naming, testing, documentation, configuration, dependencies, security, review, and delivery rules.

Out of Scope:
Product requirements, detailed architecture decisions, release notes, provider-specific implementation details, and operational runbooks.

Audience:
Developers, contributors, maintainers, and AI development assistants.

Status:
Approved

Version:
1.0.0

Last Updated:
2026-07-18

## Table of Contents

1. Development Principles
   UA: Pryntsypy rozrobky

2. Work Planning
   UA: Planuvannia roboty

3. Code Organization
   UA: Orhanizatsiia kodu

4. Naming Standard
   UA: Standart naimenuvannia

5. Code Quality
   UA: Yakist kodu

6. Testing Standard
   UA: Standart testuvannia

7. Documentation Standard
   UA: Standart dokumentatsii

8. Configuration and Secrets
   UA: Konfiguratsiia ta sekrety

9. Dependency Management
   UA: Keruvannia zalezhnostiamy

10. Security Standard
    UA: Standart bezpeky

11. AI-Assisted Development
    UA: Rozrobka za dopomohoiu AI

12. Review and Acceptance
    UA: Perehliad ta pryiniattia

13. References
    UA: Posylannia

14. Version History
    UA: Istoriia versii

## 1. Development Principles

VoiceBridge development MUST prioritize correctness, maintainability, security, and clear project history.

All development work MUST follow these principles:

- one change SHOULD solve one clearly defined problem;
- implementation choices MUST support the approved architecture;
- code MUST be understandable before it is clever;
- behavior MUST be testable where practical;
- permanent rules MUST be documented in the repository;
- temporary decisions MUST have an owner, purpose, and resolution path;
- security and privacy MUST be considered before integration with external providers.

Developers MUST NOT introduce hidden behavior, undocumented permanent exceptions, or unreviewed architecture changes.

## 2. Work Planning

Before implementation starts, the intended change MUST be understood in terms of:

- user or project goal;
- affected files and directories;
- expected behavior;
- validation method;
- documentation impact;
- security impact;
- compatibility impact.

Large changes SHOULD be split into smaller logical changes.

A change requiring an architecture decision MUST be supported by an ADR before or together with the implementation.

A change requiring repository governance updates MUST be documented in the relevant governance file.

## 3. Code Organization

Application source code MUST be stored in approved source directories.

Production code MUST NOT be stored in:

- `docs/`;
- `patches/`;
- `examples/`;
- `assets/`;
- repository root.

One module SHOULD have one primary responsibility.

Shared logic SHOULD be extracted only when reuse is clear.

Code organization MUST preserve replaceable boundaries for:

- audio capture;
- speech recognition;
- translation;
- speech synthesis;
- provider adapters;
- configuration;
- user interface state.

Generated files MUST NOT be committed unless they are required for reproducible builds, auditability, or release distribution.

## 4. Naming Standard

All names MUST use ASCII characters only.

Directory names MUST use lowercase `snake_case` unless a framework requires another format.

Root governance document names MUST use a two-digit numeric prefix and uppercase `SNAKE_CASE`.

Markdown governance files SHOULD use names such as:

```text
06_DEVELOPMENT_STANDARD.md
15_REPOSITORY_RULES.md
16_AI_DEVELOPMENT_RULES.md
```

Python files MUST use `snake_case`.

TypeScript and JavaScript source files SHOULD use `kebab-case`.

Test files SHOULD make the tested behavior clear in the file name.

Names MUST NOT use vague temporary wording such as:

```text
new
old
temp
misc
stuff
final
final2
latest
copy
test1
test2
backup
```

Branch and commit naming MUST follow `15_REPOSITORY_RULES.md`.

## 5. Code Quality

Code MUST be readable, maintainable, and consistent with the surrounding codebase.

Code changes SHOULD:

- prefer explicit control flow;
- avoid unnecessary abstraction;
- keep functions focused;
- use typed interfaces where the language supports them;
- validate external input at boundaries;
- handle recoverable errors intentionally;
- avoid duplicated business logic;
- avoid dead code;
- avoid commented-out obsolete code.

Comments SHOULD explain why a decision exists, not restate obvious code behavior.

A temporary workaround MUST include:

- reason;
- scope;
- expected removal condition.

## 6. Testing Standard

Test coverage MUST be added or updated when behavior changes and automated testing is practical.

Tests SHOULD cover:

- normal behavior;
- boundary cases;
- failure cases;
- provider adapter contracts;
- configuration parsing;
- security-sensitive behavior;
- regressions for fixed defects.

Tests MUST be deterministic and SHOULD NOT depend on live external services unless explicitly marked as integration tests.

Network-dependent tests MUST have a clear reason and SHOULD be isolated from default local test runs.

A task is not complete until required checks have been run or the limitation preventing them has been documented.

## 7. Documentation Standard

Documentation MUST follow the repository documentation rules defined in `15_REPOSITORY_RULES.md`.

Repository documentation MUST:

- use Markdown unless another format is required;
- contain ASCII characters only;
- use English as the main language;
- include Ukrainian descriptions in ASCII transliteration where required;
- use relative repository references;
- include version history for governance and standard documents;
- use ISO 8601 dates.

Documentation MUST be updated when a change affects:

- architecture;
- repository structure;
- development workflow;
- configuration;
- security expectations;
- public behavior;
- release process.

Documentation MUST NOT duplicate another authoritative document unless the duplication is intentional and approved.

## 8. Configuration and Secrets

Configuration MUST be explicit and environment-aware.

Secrets MUST NOT be committed to the repository.

Secrets include:

- API keys;
- access tokens;
- passwords;
- private certificates;
- provider credentials;
- personal data not approved for repository storage.

Default configuration SHOULD be safe for local development.

Example configuration files MAY be committed only when they contain placeholder values and do not expose private data.

Configuration changes MUST be documented when they affect setup, deployment, testing, or security.

## 9. Dependency Management

Dependencies MUST be added only when they provide clear project value.

Before adding a dependency, developers SHOULD consider:

- necessity;
- maintenance status;
- license compatibility;
- security history;
- bundle or runtime impact;
- replacement difficulty;
- compatibility with the approved technology stack.

Dependency changes SHOULD be isolated from unrelated code changes.

Unused dependencies MUST be removed.

Lockfiles SHOULD be committed when required for reproducible builds.

## 10. Security Standard

Security-sensitive code MUST be written defensively.

Development MUST protect:

- user audio data;
- transcripts;
- translations;
- credentials;
- provider responses;
- runtime configuration;
- logs and diagnostic output.

Logs MUST NOT expose secrets or sensitive user content unless explicitly approved for a controlled debugging context.

External input MUST be validated before use.

Provider integrations MUST fail safely and SHOULD expose clear error states.

Security changes MUST be reviewed carefully and documented when they affect project behavior or risk.

## 11. AI-Assisted Development

AI-assisted development MUST follow `16_AI_DEVELOPMENT_RULES.md`.

AI assistants MUST:

- follow approved repository rules;
- preserve project intent;
- avoid fabricated results;
- report commands and validation results accurately;
- keep changes scoped to the task;
- avoid modifying unrelated files;
- avoid creating undocumented permanent exceptions.

AI-generated changes are not accepted until they are written to the repository, validated, and committed according to project rules.

## 12. Review and Acceptance

A change is ready for review only when:

- the implementation is complete for the approved scope;
- required documentation is updated;
- required tests or checks have been run;
- failures or skipped checks are explained;
- repository status is understood;
- commit history represents the change clearly.

A change MUST NOT be accepted when it contains:

- known unreported failures;
- secrets;
- unrelated modifications;
- undocumented architecture changes;
- undocumented permanent exceptions;
- generated artifacts that are not required.

## 13. References

- `15_REPOSITORY_RULES.md`
- `16_AI_DEVELOPMENT_RULES.md`
- `../architecture/04_ARCHITECTURE.md`
- `../architecture/05_TECHNOLOGY_STACK.md`
- `../planning/02_REPOSITORY_STRUCTURE.md`
- `../planning/03_ROADMAP.md`

## 14. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Initial approved development standard |
