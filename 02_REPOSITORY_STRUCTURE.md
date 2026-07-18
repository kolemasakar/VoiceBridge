# 02_REPOSITORY_STRUCTURE

UA: Struktura repozitoriia VoiceBridge ta pravyla rozmishchennia failiv.

Purpose:
Define the approved repository layout and file placement rules for the VoiceBridge project.

Scope:
Repository directories, documentation, source code, tests, tools, patches, assets, and GitHub configuration.

Status:
Approved

Version:
1.0.0

Last Updated:
2026-07-18

## Table of Contents

1. Repository Overview
   UA: Ohliad repozitoriia

2. Top Level Structure
   UA: Verkhnii riven struktury

3. Directory Rules
   UA: Pravyla dlia katalohiv

4. Documentation Layout
   UA: Rozmishchennia dokumentatsii

5. Source Code Layout
   UA: Struktura vykhidnoho kodu

6. Test Layout
   UA: Struktura testiv

7. Patch Directory
   UA: Kataloh patchiv

8. References
   UA: Posylannia

## 1. Repository Overview

VoiceBridge uses a structured repository layout separating governance, documentation, application code, tests, tools, patches, examples, assets, and GitHub automation.

The repository structure MUST remain predictable and easy to navigate.

## 2. Top Level Structure

```text
VoiceBridge/
|
|-- README.md
|-- LICENSE
|-- .gitignore
|
|-- 01_PROJECT_DESCRIPTION.md
|-- 02_REPOSITORY_STRUCTURE.md
|-- 03_ROADMAP.md
|-- 15_REPOSITORY_RULES.md
|-- 16_AI_DEVELOPMENT_RULES.md
|
|-- docs/
|-- src/
|-- tests/
|-- tools/
|-- patches/
|-- examples/
|-- assets/
|-- .github/
```

## 3. Directory Rules

Application code MUST be stored in:

```text
src/
```

Tests MUST be stored in:

```text
tests/
```

Development utilities MUST be stored in:

```text
tools/
```

Temporary modifications MUST be stored in:

```text
patches/
```

## 4. Documentation Layout

```text
docs/
|
|-- adr/
|-- design/
|-- phases/
`-- bootstrap/
```

ADR documents are stored in `docs/adr/`.

Phase documents are stored in `docs/phases/`.

Bootstrap and recovery documents are stored in `docs/bootstrap/`.

## 5. Source Code Layout

The source directory contains active application code.

Internal structure will be defined after technology selection.

## 6. Test Layout

Tests SHOULD mirror the source structure.

## 7. Patch Directory

The patches directory stores temporary, migration, or recovery changes.

Patch files MUST follow the naming standard:

```text
YYYY_MM_DD_NNN_PURPOSE.extension
```

Patches MUST NOT become permanent storage for active code.

## 8. References

- 15_REPOSITORY_RULES.md
- 16_AI_DEVELOPMENT_RULES.md

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-07-18 | Initial approved repository structure definition |
