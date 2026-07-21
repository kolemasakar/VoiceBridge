# Phase 1 Milestone 5 Translation Provider Decision

Status: ACCEPTED

Date: 2026-07-21

## Purpose

Preserve the provider decision that begins Phase 1 Milestone 5 English-to-Ukrainian Translation Integration.

## Decision

- provider: Gemini Developer API;
- model: `gemini-3.1-flash-lite`;
- billing mode: free tier without a linked billing account;
- credential: `GEMINI_API_KEY` in VoiceBridge Cloud only;
- model override: `GEMINI_TRANSLATION_MODEL`;
- input scope: controlled public YouTube and synthetic test content only.

## Required Boundaries

- provider integration remains behind a `TranslationProvider` interface;
- final STT segments are translated in a bounded ordered queue;
- partial transcripts are not translated;
- provider output is validated before browser delivery;
- errors are sanitized and do not terminate STT;
- translations are not persisted;
- free-tier processing is prohibited for private or confidential content;
- paid usage and automatic billing are not enabled.

## Planned Versions

- cloud service: `0.4.0`;
- browser extension: `0.5.0`.

## Result

The translation-provider gate is complete.

Milestone 5 implementation may proceed according to:

- `docs/adr/ADR-006_PHASE_1_TRANSLATION_PROVIDER.md`;
- `docs/phases/PHASE_1_MILESTONE_5_TRANSLATION_INTEGRATION.md`.
