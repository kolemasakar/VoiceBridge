# VoiceBridge Bootstrap Packages

Purpose:
Store controlled recovery packages used to continue VoiceBridge work across chats or development sessions.

Status:
Approved

Version:
1.1.0

Last Updated:
2026-07-18

## Rules

- Bootstrap packages MUST use Markdown and ASCII-only content.
- Each package MUST represent a verified repository state.
- GitHub remains the Single Source of Truth.
- A package MUST identify its status as `CURRENT` or `ARCHIVED`.
- Only one package SHOULD be marked `CURRENT`.
- An archived package MUST NOT be used as the current recovery entry point.
- Secrets, tokens, credentials, and private configuration values MUST NOT be included.
- A package MUST define the next verified engineering action.
- A package MUST request only the repository documents required for recovery.

## Naming

Recommended format:

```text
BOOTSTRAP_PACKAGE_YYYY_MM_DD_PHASE_OR_MILESTONE.md
```

Historical packages created before this rule MAY retain their original approved names.

## Current Package

No current package is stored yet.

A new current package MUST be created only after an explicit user request.

## Archived Packages

- `BOOTSTRAP_PACKAGE_VOICEBRIDGE_PHASE_DOCUMENTATION_FOUNDATION_COMPLETE.md`

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.1.0 | 2026-07-18 | Required explicit user request before creating a current package |
| 1.0.0 | 2026-07-18 | Created Bootstrap package storage and governance rules |
