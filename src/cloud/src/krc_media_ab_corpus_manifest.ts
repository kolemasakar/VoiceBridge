import {
  createKrcMediaAbExecutionPair,
  type KrcMediaAbExecutionPair,
  type KrcMediaAbExecutionSourceClass,
  KRC_M3_ASSEMBLYAI_MODEL,
  KRC_M3_GEMINI_MODEL
} from "./krc_media_ab_execution_contract.js";

export type KrcMediaAbReferenceReviewState = "pending" | "independent_reviewed";
export type KrcMediaAbCorpusReadiness = "PLANNED" | "ASSET_SELECTED" | "READY_FOR_AB";

export interface KrcMediaAbCorpusManifestEntry {
  case_id: string;
  source_class: KrcMediaAbExecutionSourceClass;
  test_dimension: string;
  asset_sha256: string | null;
  reference_transcript_sha256: string | null;
  reference_review_state: KrcMediaAbReferenceReviewState;
  language_hint: string;
  word_timestamps: boolean;
  diarization: boolean;
  readiness: KrcMediaAbCorpusReadiness;
}

const MANIFEST_KEYS = new Set([
  "case_id",
  "source_class",
  "test_dimension",
  "asset_sha256",
  "reference_transcript_sha256",
  "reference_review_state",
  "language_hint",
  "word_timestamps",
  "diarization"
]);

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("M3 corpus manifest entry must be an object.");
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !MANIFEST_KEYS.has(key));
  if (unexpected.length > 0) {
    throw new Error(`M3 corpus manifest contains unsupported fields: ${unexpected.join(", ")}.`);
  }
  return record;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`M3 corpus manifest requires ${key}.`);
  }
  return value.trim();
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`M3 corpus manifest requires boolean ${key}.`);
  }
  return value;
}

function nullableDigest(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value !== "string" || !/^[A-Fa-f0-9]{64}$/.test(value)) {
    throw new Error(`M3 corpus manifest ${key} must be null or a 64-character SHA-256 digest.`);
  }
  return value.toLowerCase();
}

function deriveReadiness(
  assetSha256: string | null,
  referenceTranscriptSha256: string | null,
  referenceReviewState: KrcMediaAbReferenceReviewState
): KrcMediaAbCorpusReadiness {
  if (!assetSha256) {
    if (referenceTranscriptSha256 || referenceReviewState === "independent_reviewed") {
      throw new Error("M3 corpus reference cannot be ready before the media asset is selected.");
    }
    return "PLANNED";
  }
  if (!referenceTranscriptSha256) {
    if (referenceReviewState === "independent_reviewed") {
      throw new Error("M3 corpus independent review requires a reference transcript digest.");
    }
    return "ASSET_SELECTED";
  }
  if (referenceReviewState !== "independent_reviewed") {
    return "ASSET_SELECTED";
  }
  return "READY_FOR_AB";
}

export function parseKrcMediaAbCorpusManifestEntry(
  value: unknown
): KrcMediaAbCorpusManifestEntry {
  const record = exactObject(value);
  const caseId = requiredString(record, "case_id");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(caseId)) {
    throw new Error("M3 corpus case_id must be a stable non-secret identifier.");
  }

  const sourceClass = requiredString(record, "source_class");
  if (sourceClass !== "public_web" && sourceClass !== "private_attachment") {
    throw new Error("M3 corpus source_class must be public_web or private_attachment.");
  }

  const testDimension = requiredString(record, "test_dimension");
  if (testDimension.length > 160) {
    throw new Error("M3 corpus test_dimension is too long.");
  }

  const assetSha256 = nullableDigest(record, "asset_sha256");
  const referenceTranscriptSha256 = nullableDigest(record, "reference_transcript_sha256");

  const reviewState = requiredString(record, "reference_review_state");
  if (reviewState !== "pending" && reviewState !== "independent_reviewed") {
    throw new Error("M3 corpus reference_review_state must be pending or independent_reviewed.");
  }

  const languageHint = requiredString(record, "language_hint");
  if (languageHint.length > 64) {
    throw new Error("M3 corpus language_hint is too long.");
  }

  const readiness = deriveReadiness(
    assetSha256,
    referenceTranscriptSha256,
    reviewState
  );

  return {
    case_id: caseId,
    source_class: sourceClass,
    test_dimension: testDimension,
    asset_sha256: assetSha256,
    reference_transcript_sha256: referenceTranscriptSha256,
    reference_review_state: reviewState,
    language_hint: languageHint,
    word_timestamps: requiredBoolean(record, "word_timestamps"),
    diarization: requiredBoolean(record, "diarization"),
    readiness
  };
}

export function validateKrcMediaAbCorpusManifest(
  values: unknown
): KrcMediaAbCorpusManifestEntry[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("M3 corpus manifest must be a non-empty array.");
  }
  const entries = values.map(parseKrcMediaAbCorpusManifestEntry);
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.case_id)) {
      throw new Error(`M3 corpus manifest duplicate case_id: ${entry.case_id}.`);
    }
    seen.add(entry.case_id);
  }
  return entries;
}

export function createKrcMediaAbExecutionPairFromCorpus(
  value: unknown
): KrcMediaAbExecutionPair {
  const entry = parseKrcMediaAbCorpusManifestEntry(value);
  if (entry.readiness !== "READY_FOR_AB" || !entry.asset_sha256) {
    throw new Error("M3 corpus case is not READY_FOR_AB.");
  }

  const common = {
    case_id: entry.case_id,
    source_class: entry.source_class,
    asset_sha256: entry.asset_sha256,
    language_hint: entry.language_hint,
    word_timestamps: entry.word_timestamps,
    diarization: entry.diarization
  };

  return createKrcMediaAbExecutionPair(
    {
      ...common,
      provider: "assemblyai",
      provider_model: KRC_M3_ASSEMBLYAI_MODEL
    },
    {
      ...common,
      provider: "gemini",
      provider_model: KRC_M3_GEMINI_MODEL
    }
  );
}
