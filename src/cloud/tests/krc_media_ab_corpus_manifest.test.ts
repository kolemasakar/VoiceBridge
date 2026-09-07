import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKrcMediaAbExecutionPairFromCorpus,
  parseKrcMediaAbCorpusManifestEntry,
  validateKrcMediaAbCorpusManifest
} from "../src/krc_media_ab_corpus_manifest.js";

const ASSET = "a".repeat(64);
const REFERENCE = "b".repeat(64);

function entry(overrides: Record<string, unknown> = {}) {
  return {
    case_id: "ua-clean-public-001",
    source_class: "public_web",
    test_dimension: "Ukrainian clean speech",
    asset_sha256: null,
    reference_transcript_sha256: null,
    reference_review_state: "pending",
    language_hint: "uk-UA",
    word_timestamps: true,
    diarization: false,
    ...overrides
  };
}

test("M3 corpus manifest derives PLANNED ASSET_SELECTED and READY_FOR_AB states", () => {
  assert.equal(parseKrcMediaAbCorpusManifestEntry(entry()).readiness, "PLANNED");
  assert.equal(
    parseKrcMediaAbCorpusManifestEntry(entry({ asset_sha256: ASSET })).readiness,
    "ASSET_SELECTED"
  );
  assert.equal(
    parseKrcMediaAbCorpusManifestEntry(entry({
      asset_sha256: ASSET,
      reference_transcript_sha256: REFERENCE,
      reference_review_state: "independent_reviewed"
    })).readiness,
    "READY_FOR_AB"
  );
});

test("M3 corpus manifest never accepts raw media URLs paths transcript text or credentials", () => {
  for (const forbidden of ["source_url", "local_path", "reference_transcript", "api_key", "access_code"]) {
    assert.throws(
      () => parseKrcMediaAbCorpusManifestEntry({ ...entry(), [forbidden]: "sensitive" }),
      new RegExp(`unsupported fields: ${forbidden}`)
    );
  }
});

test("M3 corpus manifest requires valid stable ids and SHA-256 digests", () => {
  assert.throws(
    () => parseKrcMediaAbCorpusManifestEntry(entry({ case_id: "case with spaces" })),
    /stable non-secret identifier/
  );
  assert.throws(
    () => parseKrcMediaAbCorpusManifestEntry(entry({ asset_sha256: "not-a-digest" })),
    /asset_sha256/
  );
  assert.throws(
    () => parseKrcMediaAbCorpusManifestEntry(entry({
      asset_sha256: ASSET,
      reference_transcript_sha256: "not-a-digest"
    })),
    /reference_transcript_sha256/
  );
});

test("M3 corpus reference cannot become independently reviewed before required evidence exists", () => {
  assert.throws(
    () => parseKrcMediaAbCorpusManifestEntry(entry({
      reference_transcript_sha256: REFERENCE,
      reference_review_state: "independent_reviewed"
    })),
    /before the media asset is selected/
  );
  assert.throws(
    () => parseKrcMediaAbCorpusManifestEntry(entry({
      asset_sha256: ASSET,
      reference_review_state: "independent_reviewed"
    })),
    /requires a reference transcript digest/
  );
});

test("M3 corpus manifest rejects duplicate case ids", () => {
  assert.throws(
    () => validateKrcMediaAbCorpusManifest([entry(), entry()]),
    /duplicate case_id/
  );
});

test("M3 corpus manifest keeps a completed reference pending until independent review", () => {
  const parsed = parseKrcMediaAbCorpusManifestEntry(entry({
    asset_sha256: ASSET,
    reference_transcript_sha256: REFERENCE,
    reference_review_state: "pending"
  }));
  assert.equal(parsed.readiness, "ASSET_SELECTED");
});

test("M3 READY_FOR_AB corpus entry creates the fixed same-asset provider pair only", () => {
  const ready = entry({
    asset_sha256: ASSET,
    reference_transcript_sha256: REFERENCE,
    reference_review_state: "independent_reviewed"
  });
  const pair = createKrcMediaAbExecutionPairFromCorpus(ready);
  assert.equal(pair.asset_sha256, ASSET);
  assert.equal(pair.assemblyai.provider_model, "universal-2");
  assert.equal(pair.gemini.provider_model, "gemini-3.5-transcribe");
  assert.equal(pair.assemblyai.language_hint, pair.gemini.language_hint);
  assert.equal(pair.assemblyai.word_timestamps, pair.gemini.word_timestamps);
  assert.equal(pair.assemblyai.diarization, pair.gemini.diarization);
});

test("M3 non-ready corpus entry cannot create provider execution work", () => {
  assert.throws(
    () => createKrcMediaAbExecutionPairFromCorpus(entry({ asset_sha256: ASSET })),
    /not READY_FOR_AB/
  );
});
