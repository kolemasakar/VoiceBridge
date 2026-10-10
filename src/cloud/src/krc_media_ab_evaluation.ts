export type KrcMediaAbProvider = "assemblyai" | "gemini";
export type KrcMediaAbSourceClass = "public_web" | "private_attachment";

export interface KrcMediaAbManifestCase {
  case_id: string;
  source_class: KrcMediaAbSourceClass;
  language_hint: string;
  reference_text: string;
  expected_terms?: string[];
  expected_numbers?: string[];
  require_timestamps?: boolean;
}

export interface KrcMediaAbSegment {
  start_ms: number | null;
  end_ms: number | null;
  text: string;
  confidence: number | null;
}

export interface KrcMediaAbRun {
  case_id: string;
  provider: KrcMediaAbProvider;
  provider_model: string;
  transcript_text: string;
  segments: KrcMediaAbSegment[];
  detected_language: string | null;
  language_confidence: number | null;
  provider_data_deleted: boolean | null;
  latency_ms: number;
  quota_seconds_reserved: number;
}

export interface KrcMediaAbEditCounts {
  substitutions: number;
  insertions: number;
  deletions: number;
}

export interface KrcMediaAbEvaluation {
  case_id: string;
  source_class: KrcMediaAbSourceClass;
  provider: KrcMediaAbProvider;
  provider_model: string;
  reference_tokens: number;
  transcript_tokens: number;
  word_error_rate: number;
  edits: KrcMediaAbEditCounts;
  expected_term_recall: number | null;
  expected_number_recall: number | null;
  timestamp_coverage: number;
  detected_language: string | null;
  language_confidence: number | null;
  provider_data_deleted: boolean | null;
  latency_ms: number;
  quota_seconds_reserved: number;
  manual_factual_review_required: true;
  manual_hallucination_review_required: true;
}

export interface KrcMediaAbPairReview {
  case_id: string;
  assemblyai: KrcMediaAbEvaluation;
  gemini: KrcMediaAbEvaluation;
  lower_word_error_rate: KrcMediaAbProvider | "tie";
  higher_expected_term_recall: KrcMediaAbProvider | "tie" | "not_scored";
  higher_expected_number_recall: KrcMediaAbProvider | "tie" | "not_scored";
  higher_timestamp_coverage: KrcMediaAbProvider | "tie";
  lower_latency: KrcMediaAbProvider | "tie";
  automatic_winner: null;
  manual_review_required: true;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function krcMediaAbTokens(value: string): string[] {
  return normalizeText(value).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
}

function canonicalNumber(value: string): string {
  return value.trim().replace(",", ".");
}

export function krcMediaAbNumbers(value: string): string[] {
  return (normalizeText(value).match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map(canonicalNumber);
}

function min3(a: number, b: number, c: number): number {
  return Math.min(a, b, c);
}

export function krcMediaAbEditCounts(
  reference: string[],
  hypothesis: string[]
): KrcMediaAbEditCounts {
  interface Cell extends KrcMediaAbEditCounts {
    total: number;
  }

  const matrix: Cell[][] = Array.from(
    { length: reference.length + 1 },
    () => Array<Cell>(hypothesis.length + 1)
  );

  matrix[0]![0] = { total: 0, substitutions: 0, insertions: 0, deletions: 0 };
  for (let row = 1; row <= reference.length; row += 1) {
    matrix[row]![0] = {
      total: row,
      substitutions: 0,
      insertions: 0,
      deletions: row
    };
  }
  for (let column = 1; column <= hypothesis.length; column += 1) {
    matrix[0]![column] = {
      total: column,
      substitutions: 0,
      insertions: column,
      deletions: 0
    };
  }

  for (let row = 1; row <= reference.length; row += 1) {
    for (let column = 1; column <= hypothesis.length; column += 1) {
      const previousDiagonal = matrix[row - 1]![column - 1]!;
      if (reference[row - 1] === hypothesis[column - 1]) {
        matrix[row]![column] = { ...previousDiagonal };
        continue;
      }

      const substitution = previousDiagonal.total + 1;
      const insertion = matrix[row]![column - 1]!.total + 1;
      const deletion = matrix[row - 1]![column]!.total + 1;
      const best = min3(substitution, insertion, deletion);

      if (best === substitution) {
        matrix[row]![column] = {
          ...previousDiagonal,
          total: best,
          substitutions: previousDiagonal.substitutions + 1
        };
      } else if (best === insertion) {
        const previous = matrix[row]![column - 1]!;
        matrix[row]![column] = {
          ...previous,
          total: best,
          insertions: previous.insertions + 1
        };
      } else {
        const previous = matrix[row - 1]![column]!;
        matrix[row]![column] = {
          ...previous,
          total: best,
          deletions: previous.deletions + 1
        };
      }
    }
  }

  const result = matrix[reference.length]![hypothesis.length]!;
  return {
    substitutions: result.substitutions,
    insertions: result.insertions,
    deletions: result.deletions
  };
}

function recall(expected: string[], actual: string[]): number | null {
  if (expected.length === 0) return null;
  const actualSet = new Set(actual);
  const matched = expected.filter((value) => actualSet.has(value)).length;
  return matched / expected.length;
}

function termRecall(expectedTerms: string[], transcript: string): number | null {
  if (expectedTerms.length === 0) return null;
  const normalizedTranscript = ` ${normalizeText(transcript)} `;
  const matched = expectedTerms.filter((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm.length > 0 && normalizedTranscript.includes(` ${normalizedTerm} `);
  }).length;
  return matched / expectedTerms.length;
}

function timestampCoverage(segments: KrcMediaAbSegment[]): number {
  const nonEmpty = segments.filter((segment) => segment.text.trim().length > 0);
  if (nonEmpty.length === 0) return 0;
  const timed = nonEmpty.filter(
    (segment) => segment.start_ms !== null && segment.end_ms !== null
  ).length;
  return timed / nonEmpty.length;
}

export function validateKrcMediaAbManifestCase(
  value: KrcMediaAbManifestCase
): KrcMediaAbManifestCase {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(value.case_id)) {
    throw new Error("M3 case_id must be a stable non-secret identifier.");
  }
  if (!value.reference_text.trim()) {
    throw new Error("M3 reference_text is required for deterministic scoring.");
  }
  if (!value.language_hint.trim()) {
    throw new Error("M3 language_hint is required.");
  }
  const expectedTerms = value.expected_terms ?? [];
  const expectedNumbers = value.expected_numbers ?? [];
  if (expectedTerms.some((term) => !term.trim())) {
    throw new Error("M3 expected_terms cannot contain empty values.");
  }
  if (expectedNumbers.some((number) => !/^\d+(?:[.,]\d+)?$/.test(number.trim()))) {
    throw new Error("M3 expected_numbers must contain numeric tokens only.");
  }
  return value;
}

export function evaluateKrcMediaAbRun(
  manifestCase: KrcMediaAbManifestCase,
  run: KrcMediaAbRun
): KrcMediaAbEvaluation {
  validateKrcMediaAbManifestCase(manifestCase);
  if (run.case_id !== manifestCase.case_id) {
    throw new Error("M3 run case_id does not match the manifest case.");
  }
  if (!Number.isFinite(run.latency_ms) || run.latency_ms < 0) {
    throw new Error("M3 latency_ms must be a non-negative finite number.");
  }
  if (!Number.isFinite(run.quota_seconds_reserved) || run.quota_seconds_reserved < 0) {
    throw new Error("M3 quota_seconds_reserved must be a non-negative finite number.");
  }

  const referenceTokens = krcMediaAbTokens(manifestCase.reference_text);
  const transcriptTokens = krcMediaAbTokens(run.transcript_text);
  const edits = krcMediaAbEditCounts(referenceTokens, transcriptTokens);
  const editTotal = edits.substitutions + edits.insertions + edits.deletions;
  const wordErrorRate = referenceTokens.length > 0
    ? editTotal / referenceTokens.length
    : 0;
  const expectedNumbers = (manifestCase.expected_numbers ?? []).map(canonicalNumber);
  const transcriptNumbers = krcMediaAbNumbers(run.transcript_text);

  return {
    case_id: manifestCase.case_id,
    source_class: manifestCase.source_class,
    provider: run.provider,
    provider_model: run.provider_model,
    reference_tokens: referenceTokens.length,
    transcript_tokens: transcriptTokens.length,
    word_error_rate: wordErrorRate,
    edits,
    expected_term_recall: termRecall(manifestCase.expected_terms ?? [], run.transcript_text),
    expected_number_recall: recall(expectedNumbers, transcriptNumbers),
    timestamp_coverage: timestampCoverage(run.segments),
    detected_language: run.detected_language,
    language_confidence: run.language_confidence,
    provider_data_deleted: run.provider_data_deleted,
    latency_ms: run.latency_ms,
    quota_seconds_reserved: run.quota_seconds_reserved,
    manual_factual_review_required: true,
    manual_hallucination_review_required: true
  };
}

function compareLower(
  assemblyai: number,
  gemini: number
): KrcMediaAbProvider | "tie" {
  if (assemblyai === gemini) return "tie";
  return assemblyai < gemini ? "assemblyai" : "gemini";
}

function compareHigher(
  assemblyai: number | null,
  gemini: number | null
): KrcMediaAbProvider | "tie" | "not_scored" {
  if (assemblyai === null || gemini === null) return "not_scored";
  if (assemblyai === gemini) return "tie";
  return assemblyai > gemini ? "assemblyai" : "gemini";
}

export function compareKrcMediaAbPair(
  assemblyai: KrcMediaAbEvaluation,
  gemini: KrcMediaAbEvaluation
): KrcMediaAbPairReview {
  if (assemblyai.case_id !== gemini.case_id) {
    throw new Error("M3 provider evaluations must belong to the same case.");
  }
  if (assemblyai.provider !== "assemblyai" || gemini.provider !== "gemini") {
    throw new Error("M3 pair comparison requires AssemblyAI first and Gemini second.");
  }
  return {
    case_id: assemblyai.case_id,
    assemblyai,
    gemini,
    lower_word_error_rate: compareLower(
      assemblyai.word_error_rate,
      gemini.word_error_rate
    ),
    higher_expected_term_recall: compareHigher(
      assemblyai.expected_term_recall,
      gemini.expected_term_recall
    ),
    higher_expected_number_recall: compareHigher(
      assemblyai.expected_number_recall,
      gemini.expected_number_recall
    ),
    higher_timestamp_coverage: compareHigher(
      assemblyai.timestamp_coverage,
      gemini.timestamp_coverage
    ) as KrcMediaAbProvider | "tie",
    lower_latency: compareLower(assemblyai.latency_ms, gemini.latency_ms),
    automatic_winner: null,
    manual_review_required: true
  };
}
