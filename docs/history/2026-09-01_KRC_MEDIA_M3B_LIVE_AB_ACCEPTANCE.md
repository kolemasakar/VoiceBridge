# KRC MEDIA M3B Live A/B Acceptance

Date: 2026-09-01
State: ACCEPTED_EVIDENCE / OWNER_DECISION_PENDING

## Scope

This record accepts the controlled provider-consuming M3B same-asset prerecorded STT comparison for the four independently reviewed expanded-corpus assets.

Providers:

- AssemblyAI `universal-2`
- Gemini `gemini-3.5-transcribe`

Normal KRC prerecorded provider remains AssemblyAI. This evidence does not authorize provider cutover, deployment, merge, external testing, or release.

## Execution

```text
workflow: KRC Media M3B Live A-B
run: 33545803364
source commit: 4f55dab95abe5518b9205cb5666ad457795416d7
result: SUCCESS
cases: 4
providers per case: 2
maximum provider submissions: 8
automatic resubmit/retry: FALSE
provider result records: 8/8 SUCCESS
provider failure observed: FALSE
raw media artifact: FALSE
artifact id: 9815474860
artifact digest: sha256:27553dfea4c4b641f54cfd8113b9a91396f262a6d2b9dc4c928a57f72964e80f
```

Credential preflight succeeded before provider execution. Provider secrets were masked and were not printed.

## Deterministic lexical WER

Normalization: Unicode NFKC, lower-case, punctuation removed, digit strings retained as digit tokens. This intentionally does not convert written digits back into spoken lexical words.

| case | reference tokens | AssemblyAI WER | Gemini WER |
|---|---:|---:|---:|
| `en-long-harvard-001` | 43 | 0.00% | 0.00% |
| `en-noisy-jackhammer-001` | 7 | 0.00% | 0.00% |
| `en-numeric-vosk-001` | 15 | 100.00% | 100.00% |
| `en-hard-librispeech-001` | 21 | 0.00% | 0.00% |

M3B aggregate over 86 reviewed reference tokens:

```text
AssemblyAI token-weighted WER: 17.44%
Gemini token-weighted WER: 17.44%
AssemblyAI mean provider latency: 3220.5 ms
Gemini mean provider latency: 3399.25 ms
```

The aggregate lexical WER is dominated by the numeric fixture because both providers rendered spoken number words as digit strings.

## Numeric semantic review

Final independently reviewed spoken sequence maps to the digit sequence:

`100019021001803`

Provider numeric rendering review:

```text
AssemblyAI normalized digit sequence: 1000190210018
edit distance: 2 / 15 digits
numeric sequence error rate: 13.33%
final two digits omitted: 03

Gemini normalized digit sequence: 100019021001803
edit distance: 0 / 15 digits
numeric sequence error rate: 0.00%
```

Both providers lose the lexical distinction between spoken `zero` and `oh` by converting speech to digits. Therefore neither passes the lexical zero-versus-oh preservation dimension. Gemini is preferred for numeric sequence factual completeness in this fixture because it preserves the complete digit sequence; AssemblyAI omits the final two digits.

## Manual factual and hallucination review

```text
en-long-harvard-001: PASS_BOTH
en-noisy-jackhammer-001: PASS_BOTH
en-hard-librispeech-001: PASS_BOTH
en-numeric-vosk-001:
  lexical_zero_oh_preservation: FAIL_BOTH
  numeric_sequence_factual_fidelity: GEMINI_PREFERRED
  AssemblyAI omission: final 03
  Gemini sequence completeness: PASS
```

No hallucinated lexical content was observed in the three non-numeric fixtures. The numeric AssemblyAI result contains an omission, not an invented digit sequence.

## Combined seven-case evidence

The first three-case M3 tranche remains accepted:

```text
reference tokens: 31
AssemblyAI errors: 1
Gemini errors: 2
```

Combining the first M3 tranche with M3B under the same lexical-WER accounting gives:

```text
total reviewed reference tokens: 117
AssemblyAI lexical errors: 16
Gemini lexical errors: 17
AssemblyAI token-weighted WER: 13.68%
Gemini token-weighted WER: 14.53%
AssemblyAI mean provider latency across 7 cases: 3346.43 ms
Gemini mean provider latency across 7 cases: 3555.86 ms
```

These aggregate WER values must not be interpreted as a decisive provider ranking because the numeric fixture penalizes digit rendering as a lexical mismatch, while manual semantic review shows a Gemini advantage in exact digit-sequence completeness. The first RU fixture showed an AssemblyAI advantage in numeric-format clarity. The evidence is therefore mixed rather than a cutover mandate.

## Accepted interpretation

```text
M3B_PROVIDER_AB: COMPLETE
M3B_PROVIDER_RESULTS: SUCCESS 8/8
M3B_MANUAL_FACTUAL_REVIEW: COMPLETE
M3B_MANUAL_HALLUCINATION_REVIEW: COMPLETE
M3B_LEXICAL_WER: TIE_FOR_THIS_TRANCHE
M3B_NUMERIC_SEQUENCE_FIDELITY: GEMINI_PREFERRED_FOR_THIS_FIXTURE
SEVEN_CASE_GLOBAL_WINNER: NOT_ESTABLISHED
GEMINI_PRERECORDED_TECHNICAL_FUNCTION: PASS
GEMINI_PRERECORDED_ACTIVE: FALSE
PROVIDER_CUTOVER: NOT_AUTHORIZED
M3_CLOSURE_DECISION: OWNER_DECISION_PENDING
RELEASE_HOLD_OWNER_TESTING: PRESERVED
```

## Safety boundary

- No automatic provider retries or resubmissions were used.
- Raw media was removed from the runner and not uploaded as an artifact.
- Provider transcript deletion/cleanup was reported true for all eight provider results.
- Normal KRC provider selector was not changed.
- No deployment, Builder, Action URL, database, or release gate was changed.
- PR #45 remains draft/open/unmerged unless separately changed by owner decision.
