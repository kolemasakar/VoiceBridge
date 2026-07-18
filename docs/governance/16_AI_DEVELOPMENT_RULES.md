# 16_AI_DEVELOPMENT_RULES

UA: Pravyla vykorystannia AI dlia rozrobky, dokumentuvannia ta zmin u proiekti VoiceBridge.

Purpose:
Define mandatory rules for AI-assisted development in the VoiceBridge project.

Scope:
AI planning, repository access, code generation, documentation, validation, commits, security, and change control.

Out of Scope:
General AI usage outside the VoiceBridge repository and non-development personal tasks.

Audience:
Project maintainers, contributors, reviewers, and AI development assistants.

Status:
Approved

Version:
1.0.0

Last Updated:
2026-07-18

## Table of Contents

1. Core Principles
   UA: Osnovni pryntsypy

2. Repository Authority
   UA: Avtorytet repozytoriiu

3. Approval Model
   UA: Model zatverdzhennia

4. Task Scope
   UA: Mezhi zavdannia

5. Repository Access
   UA: Dostup do repozytoriiu

6. File Creation and Updates
   UA: Stvorennia ta onovlennia failiv

7. Documentation Rules
   UA: Pravyla dokumentatsii

8. Code Generation Rules
   UA: Pravyla heneratsii kodu

9. Validation and Testing
   UA: Perevirka ta testuvannia

10. Git and Commit Rules
    UA: Pravyla Git ta komitiv

11. Security and Secrets
    UA: Bezpeka ta sekrety

12. Internet and External Sources
    UA: Internet ta zovnishni dzherela

13. Architecture Decisions
    UA: Arkhitekturni rishennia

14. Error Handling
    UA: Obrobka pomylok

15. Prohibited Actions
    UA: Zaboroneni dii

16. Completion Criteria
    UA: Kryterii zavershennia

17. References
    UA: Posylannia

18. Version History
    UA: Istoriia versii

## 1. Core Principles

AI is an implementation assistant, not an independent project authority.

AI MUST:

- follow approved repository rules;
- preserve the accepted architecture and project direction;
- make changes only within the approved task scope;
- clearly distinguish facts, assumptions, proposals, and completed actions;
- prefer minimal, reversible, and reviewable changes;
- maintain repository consistency;
- report failures honestly.

AI MUST NOT:

- invent completed work;
- claim that a file, commit, test, deployment, or repository change exists unless verified;
- replace approved project decisions without explicit approval;
- expand task scope without authorization;
- optimize for speed at the expense of correctness or traceability.

## 2. Repository Authority

GitHub is the single source of truth for VoiceBridge.

AI MUST treat repository content as authoritative over:

- chat history;
- temporary files;
- local drafts;
- previous generated answers;
- undocumented assumptions.

Before modifying an existing file, AI MUST read its current repository version.

When repository content conflicts with remembered context, AI MUST:

1. stop the conflicting change;
2. identify the inconsistency;
3. present the conflict;
4. request or obtain an explicit decision.

AI MUST NOT rely only on conversation memory when current repository state is available.

## 3. Approval Model

AI MAY prepare proposals, drafts, files, patches, and implementation plans without repository write approval.

AI MUST obtain explicit user approval before:

- creating a repository file;
- updating a repository file;
- deleting a repository file;
- creating or modifying a branch;
- creating a commit;
- creating a pull request;
- changing repository settings;
- introducing a dependency;
- changing architecture;
- changing public interfaces;
- adding secrets or environment variables.

The following user instructions count as explicit approval when the intended change is already clear:

```text
approve
approved
write it
apply
commit
proceed
record it
```

Approval applies only to the described change.

Approval for one file or task MUST NOT be treated as approval for unrelated changes.

## 4. Task Scope

Every task MUST have one clear objective.

AI MUST:

- identify the target repository;
- identify the target branch;
- identify files to create, update, or delete;
- identify expected validation;
- identify the commit message before writing.

AI SHOULD complete one logical change per task and per commit.

AI MUST NOT bundle unrelated documentation, code, configuration, and refactoring changes into one commit.

When a task is ambiguous, AI SHOULD use the narrowest safe interpretation or ask for clarification.

## 5. Repository Access

AI MUST verify repository access before attempting write operations.

For repository changes, AI MUST use approved GitHub or Codex tools.

AI MUST NOT:

- simulate repository writes;
- present sandbox files as repository files;
- infer that a connector has write access without verification;
- expose internal tool identifiers, tokens, or credentials.

When a write operation fails, AI MUST report:

- the attempted operation;
- the target path;
- the error status;
- whether any partial change occurred;
- the next required action.

## 6. File Creation and Updates

Before creating a file, AI MUST verify that the target path does not already exist.

Before updating or deleting a file, AI MUST:

- fetch the current file;
- use its current content identifier when required;
- preserve unrelated content;
- avoid parallel write operations to the same path.

AI MUST generate complete file content for replacement operations.

AI SHOULD preserve:

- approved section order;
- version history;
- document metadata;
- relative links;
- formatting conventions.

AI MUST NOT overwrite a file using stale content.

## 7. Documentation Rules

AI-generated repository documentation MUST comply with `15_REPOSITORY_RULES.md`.

Documentation MUST:

- use Markdown unless another format is required;
- use ASCII characters only;
- use English as the main language;
- include the approved Ukrainian ASCII-transliteration helper text;
- use relative links;
- include Version History;
- use ISO 8601 dates;
- use RFC 2119 keywords consistently.

AI MUST validate ASCII-only documents before repository write.

AI MUST NOT introduce:

- Cyrillic characters;
- typographic quotes;
- long dashes;
- emoji;
- decorative Unicode;
- duplicate governance rules without a clear reason.

AI SHOULD avoid unnecessary prose and duplication.

## 8. Code Generation Rules

AI-generated code MUST:

- follow the approved language and naming standards;
- have a clear responsibility;
- avoid unnecessary abstractions;
- include error handling where failure is possible;
- preserve compatibility unless a breaking change is approved;
- include comments only when they add technical value;
- avoid dead code and placeholder logic in committed files.

AI MUST NOT:

- generate application code before the repository foundation is approved;
- introduce frameworks or dependencies without approval;
- add hidden behavior;
- disable validation to make tests pass;
- hard-code secrets;
- copy unverified external code into the repository.

AI SHOULD prefer standard library functionality when it is sufficient.

## 9. Validation and Testing

AI MUST validate every change according to its type.

Documentation changes SHOULD include:

- ASCII validation;
- Markdown structure review;
- relative-link review;
- filename and path validation.

Code changes SHOULD include, when applicable:

- syntax checks;
- unit tests;
- integration tests;
- linting;
- type checks;
- build verification.

AI MUST report exactly which checks were run and their results.

AI MUST NOT claim that validation passed when it was not executed.

When tests cannot be run, AI MUST state why and identify the remaining risk.

## 10. Git and Commit Rules

AI MUST follow the commit standard defined in `15_REPOSITORY_RULES.md`.

Before committing, AI MUST confirm:

- repository;
- branch;
- changed files;
- validation result;
- commit message.

AI MUST use one logical change per commit.

AI MUST report the resulting commit SHA after a successful commit.

AI MUST NOT:

- rewrite published history without explicit approval;
- force-push without explicit approval;
- combine unrelated changes;
- use vague commit messages;
- create empty commits unless explicitly required.

Direct commits to `main` MAY be used during the initial repository foundation phase when explicitly approved.

Later workflow MAY require branches and pull requests.

## 11. Security and Secrets

AI MUST treat all credentials and secrets as sensitive.

AI MUST NOT commit:

- API keys;
- tokens;
- passwords;
- private certificates;
- session cookies;
- personal access tokens;
- service-account credentials;
- private configuration values.

Secrets MUST be stored only in approved secret-management systems.

AI MUST redact secrets from:

- chat output;
- logs;
- examples;
- test fixtures;
- documentation;
- commit messages.

If a secret is detected in repository content, AI MUST stop and report it before continuing.

## 12. Internet and External Sources

Internet access SHOULD remain disabled when the task can be completed using:

- repository content;
- approved local dependencies;
- existing documentation;
- deterministic tooling.

Internet access MAY be enabled when required for:

- installing dependencies;
- checking current official documentation;
- verifying external API contracts;
- retrieving approved public resources;
- security advisories;
- current compatibility information.

When using external technical information, AI SHOULD prefer primary sources:

- official documentation;
- standards;
- upstream repositories;
- vendor security advisories;
- research papers.

AI MUST NOT introduce external code or dependencies solely because they are convenient.

## 13. Architecture Decisions

AI MUST preserve approved architecture.

A new ADR is required when a change affects:

- system boundaries;
- major components;
- communication protocols;
- persistence strategy;
- deployment model;
- security model;
- public interfaces;
- technology selection;
- compatibility guarantees.

AI MAY propose an ADR but MUST NOT mark it as accepted without explicit approval.

Superseded ADRs MUST remain in the repository.

## 14. Error Handling

AI MUST stop when a required operation fails.

AI MUST distinguish between:

- no change made;
- partial change made;
- change completed but not verified;
- change completed and verified.

AI SHOULD provide the smallest safe recovery action.

AI MUST NOT repeat a failed write operation blindly.

For repository write failures, AI SHOULD re-check:

- integration permissions;
- repository selection;
- target branch;
- file existence;
- current file SHA;
- branch protection;
- GitHub App installation.

## 15. Prohibited Actions

AI MUST NOT:

- make repository changes without approval;
- delete files without explicit approval;
- alter licensing without explicit approval;
- modify security settings without explicit approval;
- expose private data;
- fabricate test results;
- fabricate commit SHAs;
- fabricate repository state;
- bypass branch protection;
- disable security checks without approval;
- create undocumented permanent exceptions;
- treat temporary patches as permanent architecture;
- write application code before repository foundation completion.

## 16. Completion Criteria

A task is complete only when all required conditions are satisfied.

For a documentation task:

- content is approved;
- ASCII validation passes;
- target path is correct;
- repository write succeeds;
- commit succeeds;
- commit SHA is reported.

For a code task:

- implementation is complete;
- required tests pass;
- required static checks pass;
- documentation is updated when necessary;
- repository write succeeds;
- commit or pull request is created;
- resulting identifiers are reported.

If any required condition is missing, AI MUST report the task as incomplete.

## 17. References

- `06_DEVELOPMENT_STANDARD.md`
- `07_DECISIONS_REGISTER.md`
- `13_PROJECT_STATUS.md`
- `14_VERSIONING.md`
- `15_REPOSITORY_RULES.md`
- `../adr/`

## 18. Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Initial AI-assisted development governance standard |
