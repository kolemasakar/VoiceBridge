# KRC Media M3 Live A-B Acceptance

Status: LIVE_AB_COMPLETE / NO_CUTOVER / OWNER_DECISION_PENDING
Date: 2026-09-01
Release state: RELEASE_HOLD_OWNER_TESTING

## Scope

Record the first provider-consuming same-asset M3 A/B run for the three independently reviewed clean-public cases.

This record does not activate Gemini for normal KRC prerecorded jobs, change the KRC provider selector, merge PR #45, deploy a new backend, modify Neon, or open any release gate.

## Execution evidence

- workflow run: `33529742510`
- run attempt: `2`
- workflow result: `SUCCESS`
- execution source commit: `acecda62b5c0c0958633f85fd13e5a38e522dbc7`
- result artifact: `krc-media-m3-live-ab-results`
- artifact id: `9810164909`
- artifact digest: `sha256:b8b170f23e94f1a4ca53a811b5463e07c1770d65c08bf1f838a1b12d749986e4`
- result JSON SHA-256 after download: `a9498149cd39abd333700c424255612c0ae93680d2d24a79d7fca6046e0d4127`
- maximum provider submissions: `6`
- automatic resubmit/retry: `FALSE`
- completed provider results: `6/6`
- provider failures: `0/6`
- provider cleanup confirmed: `TRUE 6/6`
- raw media artifact persisted: `FALSE`

## Providers

```text
AssemblyAI prerecorded model: universal-2
Gemini prerecorded model: gemini-3.5-transcribe
normal KRC prerecorded provider: AssemblyAI
Gemini normal KRC activation: FALSE
```

## Deterministic evaluation

The accepted evaluator tokenizes normalized lexical text and ignores punctuation differences for WER.

| case | AssemblyAI WER | Gemini WER | timestamp coverage |
|---|---:|---:|---:|
| ua-clean-public-001 | 0.00% | 0.00% | 100% / 100% |
| ru-clean-public-001 | 16.67% | 33.33% | 100% / 100% |
| en-clean-public-001 | 0.00% | 0.00% | 100% / 100% |

Aggregate over 31 final-reference lexical tokens:

```text
AssemblyAI edits: 1
Gemini edits: 2
AssemblyAI token-weighted WER: 3.23%
Gemini token-weighted WER: 6.45%
AssemblyAI macro-average WER: 5.56%
Gemini macro-average WER: 11.11%
```

## Latency and quota evidence

| case | AssemblyAI latency | Gemini latency |
|---|---:|---:|
| ua-clean-public-001 | 3513 ms | 3634 ms |
| ru-clean-public-001 | 3544 ms | 3406 ms |
| en-clean-public-001 | 3486 ms | 4254 ms |

```text
AssemblyAI mean latency: 3514.3 ms
Gemini mean latency: 3764.7 ms
AssemblyAI quota seconds reserved: 19.266688
Gemini quota seconds reserved: 19.266688
```

No billing invoice or provider-side monetary charge evidence was retrieved by this run, so no actual currency cost is asserted.

## Manual factual and hallucination review

### Ukrainian case

Both providers matched the independently reviewed lexical content. Punctuation differed only. No factual insertion or hallucination was observed.

State: `PASS_BOTH`.

### Russian case

AssemblyAI rendered the spoken number using digits plus the lexical magnitude word. This preserves the reviewed meaning but receives one lexical substitution against the spelled-out reference.

Gemini rendered the same spoken number using a dotted numeric form and omitted the lexical magnitude word. This may be interpreted as the intended amount in some number-format conventions, but it creates avoidable numeric-format ambiguity. For research workflows, ambiguous numeric rendering is materially less desirable than the AssemblyAI rendering.

State: `ASSEMBLYAI_PREFERRED / GEMINI_NUMERIC_FORMAT_AMBIGUITY`.

### English case

Both providers matched the independently reviewed lexical content. Differences were punctuation only. No factual insertion or hallucination was observed.

State: `PASS_BOTH`.

## M3 conclusion

The first clean-public tranche provides positive evidence that Gemini prerecorded transcription is technically functional and can produce strong results. It does not provide evidence sufficient to justify a provider cutover.

For this tranche, AssemblyAI has the lower aggregate WER, avoids the observed Russian numeric-format ambiguity, and has lower mean latency. The sample is only three short clean-public cases and is not representative enough to establish a general provider winner.

Therefore:

```text
M3_PROVIDER_AB: COMPLETE
M3_MANUAL_FACTUAL_REVIEW: COMPLETE
M3_MANUAL_HALLUCINATION_REVIEW: COMPLETE
M3_EVIDENCE_PREFERENCE: ASSEMBLYAI_FOR_THIS_TRANCHE
GEMINI_PRERECORDED_TECHNICAL_FUNCTION: PASS
GEMINI_PRERECORDED_ACTIVE: FALSE
PROVIDER_CUTOVER: NOT_AUTHORIZED
M3_CLOSURE_DECISION: OWNER_DECISION_PENDING
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Next valid transition

An owner decision is required before any M3 closure state is promoted. A closure decision may retain AssemblyAI, request a broader representative corpus before deciding, or separately authorize a future cutover gate. None of those actions is implied by this acceptance record.
