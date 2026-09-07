export type KrcMediaAbExecutionProvider = "assemblyai" | "gemini";
export type KrcMediaAbExecutionSourceClass = "public_web" | "private_attachment";

export const KRC_M3_ASSEMBLYAI_MODEL = "universal-2" as const;
export const KRC_M3_GEMINI_MODEL = "gemini-3.5-transcribe" as const;

export interface KrcMediaAbExecutionSpec {
  case_id: string;
  source_class: KrcMediaAbExecutionSourceClass;
  asset_sha256: string;
  provider: KrcMediaAbExecutionProvider;
  provider_model: string;
  language_hint: string;
  word_timestamps: boolean;
  diarization: boolean;
}

export interface KrcMediaAbExecutionPair {
  case_id: string;
  source_class: KrcMediaAbExecutionSourceClass;
  asset_sha256: string;
  language_hint: string;
  word_timestamps: boolean;
  diarization: boolean;
  assemblyai: KrcMediaAbExecutionSpec;
  gemini: KrcMediaAbExecutionSpec;
}

const SPEC_KEYS = new Set([
  "case_id",
  "source_class",
  "asset_sha256",
  "provider",
  "provider_model",
  "language_hint",
  "word_timestamps",
  "diarization"
]);

function exactObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("M3 execution spec must be an object.");
  }
  const record = value as Record<string, unknown>;
  const unexpected = Object.keys(record).filter((key) => !SPEC_KEYS.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `M3 execution spec contains unsupported fields: ${unexpected.join(", ")}.`
    );
  }
  return record;
}

function requiredString(
  record: Record<string, unknown>,
  key: string
): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`M3 execution spec requires ${key}.`);
  }
  return value.trim();
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`M3 execution spec requires boolean ${key}.`);
  }
  return value;
}

export function parseKrcMediaAbExecutionSpec(
  value: unknown
): KrcMediaAbExecutionSpec {
  const record = exactObject(value);
  const caseId = requiredString(record, "case_id");
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(caseId)) {
    throw new Error("M3 case_id must be a stable non-secret identifier.");
  }

  const sourceClass = requiredString(record, "source_class");
  if (sourceClass !== "public_web" && sourceClass !== "private_attachment") {
    throw new Error("M3 source_class must be public_web or private_attachment.");
  }

  const assetSha256 = requiredString(record, "asset_sha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(assetSha256)) {
    throw new Error("M3 asset_sha256 must be a 64-character lowercase SHA-256 digest.");
  }

  const provider = requiredString(record, "provider");
  if (provider !== "assemblyai" && provider !== "gemini") {
    throw new Error("M3 provider must be assemblyai or gemini.");
  }

  const providerModel = requiredString(record, "provider_model");
  if (
    (provider === "assemblyai" && providerModel !== KRC_M3_ASSEMBLYAI_MODEL) ||
    (provider === "gemini" && providerModel !== KRC_M3_GEMINI_MODEL)
  ) {
    throw new Error("M3 provider_model does not match the accepted A/B provider model.");
  }

  const languageHint = requiredString(record, "language_hint");
  if (languageHint.length > 64) {
    throw new Error("M3 language_hint is too long.");
  }

  return {
    case_id: caseId,
    source_class: sourceClass,
    asset_sha256: assetSha256,
    provider,
    provider_model: providerModel,
    language_hint: languageHint,
    word_timestamps: requiredBoolean(record, "word_timestamps"),
    diarization: requiredBoolean(record, "diarization")
  };
}

function equalOption(
  name: string,
  assemblyai: string | boolean,
  gemini: string | boolean
): void {
  if (assemblyai !== gemini) {
    throw new Error(`M3 A/B pair mismatch: ${name} must be identical for both providers.`);
  }
}

export function createKrcMediaAbExecutionPair(
  assemblyaiValue: unknown,
  geminiValue: unknown
): KrcMediaAbExecutionPair {
  const assemblyai = parseKrcMediaAbExecutionSpec(assemblyaiValue);
  const gemini = parseKrcMediaAbExecutionSpec(geminiValue);

  if (assemblyai.provider !== "assemblyai" || gemini.provider !== "gemini") {
    throw new Error("M3 A/B pair requires AssemblyAI first and Gemini second.");
  }
  if (assemblyai.case_id !== gemini.case_id) {
    throw new Error("M3 A/B pair mismatch: case_id must be identical.");
  }
  if (assemblyai.source_class !== gemini.source_class) {
    throw new Error("M3 A/B pair mismatch: source_class must be identical.");
  }
  if (assemblyai.asset_sha256 !== gemini.asset_sha256) {
    throw new Error("M3 A/B pair mismatch: asset_sha256 must be identical.");
  }
  equalOption("language_hint", assemblyai.language_hint, gemini.language_hint);
  equalOption("word_timestamps", assemblyai.word_timestamps, gemini.word_timestamps);
  equalOption("diarization", assemblyai.diarization, gemini.diarization);

  return {
    case_id: assemblyai.case_id,
    source_class: assemblyai.source_class,
    asset_sha256: assemblyai.asset_sha256,
    language_hint: assemblyai.language_hint,
    word_timestamps: assemblyai.word_timestamps,
    diarization: assemblyai.diarization,
    assemblyai,
    gemini
  };
}
