# VoiceBridge Phase 2 M4 Language Capability Registry

Status: COMPLETE - AUTOMATED VALIDATION PASSED

Date: 2026-08-29

## 1. Objective

Replace the hard-coded `en -> uk` session language types with centralized BCP 47 validation and a cloud-owned capability registry, without advertising language combinations that have not been validated in VoiceBridge.

P2-M4 is a capability-boundary milestone. It does not add browser language selectors; configurable UI belongs to P2-M5.

## 2. Entry Gate

P2-M3 is complete.

Accepted entry evidence:

- generic non-YouTube active-tab capture passed controlled Chromium acceptance;
- YouTube regression passed;
- silent and restricted source guards passed;
- Issue #39 closed as completed;
- P2-M3 canonical closure merged through PR #40;
- entry `main` commit: `2a3118fb3be0afdfd7522ff99202d97aea77b836`;
- entry post-merge Validate run: `33272444010 - SUCCESS`.

## 3. Conservative Capability Policy

P2-M4 MUST NOT infer VoiceBridge support from broad provider marketing matrices.

The initial registry exposes only the language pair already validated end-to-end in VoiceBridge:

```text
source API tag: en
STT locale:      en-US
target API tag: uk
TTS locale:      uk-UA
```

Validated pair:

`en -> uk`

No additional language is enabled by P2-M4.

## 4. Central BCP 47 Validation

Cloud module:

`src/cloud/src/language_capabilities.ts`

It owns:

- BCP 47 canonicalization using the runtime locale implementation;
- validated source-language options;
- validated target-language options;
- validated source/target pairs;
- provider-facing locale metadata for future pipeline generalization;
- the sanitized public capability payload.

Examples:

- `EN` canonicalizes to `en`;
- `UK` canonicalizes to `uk`;
- malformed tags are rejected;
- valid but unsupported combinations such as `de -> uk` or `en -> fr` are rejected;
- `en-US -> uk` remains unsupported until that API form is separately approved.

## 5. Session Contract

`CreateSessionInput` and persisted `Session` no longer encode language fields as TypeScript literals.

Session creation resolves language input through the central registry before a session is created.

Accepted Phase 1 and Phase 2 defaults remain:

```json
{
  "source_language": "en",
  "target_language": "uk"
}
```

Canonical equivalent input such as `EN` / `UK` is normalized to `en` / `uk`.

Malformed or unsupported language combinations fail with the existing `400 INVALID_REQUEST` validation boundary before a stream ticket or provider session can be created.

## 6. Browser-Facing Capability Surface

The existing unauthenticated health surface includes:

```json
{
  "capabilities": {
    "languages": {
      "registry_version": "1.0.0",
      "validation_policy": "validated_pairs_only",
      "source_languages": [
        { "tag": "en", "label": "English" }
      ],
      "target_languages": [
        { "tag": "uk", "label": "Ukrainian" }
      ],
      "pairs": [
        { "source_language": "en", "target_language": "uk" }
      ],
      "defaults": {
        "source_language": "en",
        "target_language": "uk"
      }
    }
  }
}
```

This payload is intentionally sanitized. It contains no API keys, secrets, billing data, account identifiers, or provider endpoints.

P2-M5 may consume this cloud-owned surface for UI choices instead of maintaining a browser-side provider support matrix.

## 7. Provider Boundary

P2-M4 does not claim provider-general language execution.

The existing provider pipeline remains safe because the registry accepts only the already-operational `en -> uk` pair. Provider request adapters still execute the accepted English-to-Ukrainian path.

Before any additional pair is added to the registry, provider adapters and controlled acceptance MUST demonstrate that pair end-to-end. Registry membership is an explicit VoiceBridge validation decision, not a reflection of every language a provider may support.

## 8. Automated Coverage

`language_capabilities.test.ts` covers:

- centralized BCP 47 canonicalization;
- malformed-tag rejection;
- current pair resolution;
- rejection of valid but unsupported pairs;
- provider-facing locale metadata for the validated pair;
- sanitized public capability metadata.

Extended `session_contract.test.ts` covers:

- existing `en -> uk` compatibility;
- canonical `EN -> UK` normalization;
- malformed source-language rejection;
- unsupported source-language rejection;
- unsupported target-language rejection;
- rejection before streaming/session-provider work;
- browser-facing health capability metadata.

## 9. Automated Validation Evidence

Pull request:

`#41 - Implement Phase 2 M4 language capability registry`

Initial validated implementation head:

`52335c5c3a5e595925a1570cec3516fa8c92fd17`

Initial Validate run:

`33272707724 - SUCCESS`

Final PR head:

`3e5ce6819fc058b3a175d0f0ded082e946fa949b`

Final PR Validate run:

`33272779359 - SUCCESS`

Merged main commit:

`e0e9f2801ce3ec14fd011f13a93a3d84162a9b78`

Post-merge Validate run:

`33272842674 - SUCCESS`

Required jobs remained green:

- `browser-extension` - SUCCESS;
- `repository-docs` - SUCCESS;
- `cloud` - SUCCESS.

No separate live Chromium gate was required for P2-M4 because it enabled no new language and changed no browser capture/playback behavior. The next user-visible language UI change belongs to P2-M5 and requires its own controlled browser acceptance.

## 10. Explicitly Unchanged

P2-M4 does NOT:

- add a language selector to the extension;
- enable any new source or target language;
- change Gemini STT default or AssemblyAI rollback policy;
- change Azure Translator primary or Gemini fallback policy;
- change Azure Speech TTS;
- change source capture, PCM transport, stream tickets, playback, ducking, or Stop;
- add persistence;
- add automatic paid fallback;
- modify KRC Media.

## 11. Acceptance Result

P2-M4 is complete.

Accepted baseline:

- main commit: `e0e9f2801ce3ec14fd011f13a93a3d84162a9b78`;
- registry policy: `validated_pairs_only`;
- accepted pair: `en -> uk`;
- BCP 47 validation centralized;
- unsupported pairs rejected before provider work;
- sanitized language capability metadata exposed by cloud;
- existing browser and cloud regression suites green.

## 12. Next Gate

P2-M5 may begin:

`P2-M5 - Configurable Language UI`

P2-M5 must consume the cloud registry and must not invent unsupported language options locally.
