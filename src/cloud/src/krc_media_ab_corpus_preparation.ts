import { createHash } from "node:crypto";
import {
  parseKrcMediaAbCorpusManifestEntry,
  type KrcMediaAbCorpusManifestEntry,
  type KrcMediaAbReferenceReviewState
} from "./krc_media_ab_corpus_manifest.js";
import type { KrcMediaAbExecutionSourceClass } from "./krc_media_ab_execution_contract.js";

export interface KrcMediaAbCorpusPreparationInput {
  case_id: string;
  source_class: KrcMediaAbExecutionSourceClass;
  test_dimension: string;
  language_hint: string;
  word_timestamps: boolean;
  diarization: boolean;
  asset_bytes: Uint8Array;
  reference_transcript_bytes: Uint8Array | null;
  reference_review_state: KrcMediaAbReferenceReviewState;
}

function nonEmptyBytes(value: Uint8Array, field: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength === 0) {
    throw new Error(`M3 corpus preparation requires non-empty ${field}.`);
  }
  return value;
}

export function krcMediaSha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function prepareKrcMediaAbCorpusEvidence(
  input: KrcMediaAbCorpusPreparationInput
): KrcMediaAbCorpusManifestEntry {
  const assetBytes = nonEmptyBytes(input.asset_bytes, "asset_bytes");
  const referenceBytes = input.reference_transcript_bytes === null
    ? null
    : nonEmptyBytes(input.reference_transcript_bytes, "reference_transcript_bytes");

  if (input.reference_review_state === "independent_reviewed" && referenceBytes === null) {
    throw new Error(
      "M3 corpus independent review cannot be recorded without reference transcript bytes."
    );
  }

  return parseKrcMediaAbCorpusManifestEntry({
    case_id: input.case_id,
    source_class: input.source_class,
    test_dimension: input.test_dimension,
    asset_sha256: krcMediaSha256Hex(assetBytes),
    reference_transcript_sha256: referenceBytes === null
      ? null
      : krcMediaSha256Hex(referenceBytes),
    reference_review_state: input.reference_review_state,
    language_hint: input.language_hint,
    word_timestamps: input.word_timestamps,
    diarization: input.diarization
  });
}
