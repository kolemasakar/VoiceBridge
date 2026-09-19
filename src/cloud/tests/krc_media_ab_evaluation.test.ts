import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareKrcMediaAbPair,
  evaluateKrcMediaAbRun,
  krcMediaAbEditCounts,
  krcMediaAbNumbers,
  krcMediaAbTokens,
  validateKrcMediaAbManifestCase,
  type KrcMediaAbManifestCase,
  type KrcMediaAbRun
} from "../src/krc_media_ab_evaluation.js";

const manifestCase: KrcMediaAbManifestCase = {
  case_id: "ua-public-001",
  source_class: "public_web",
  language_hint: "uk-UA",
  reference_text: "Президент сказав, що 12 літаків прибули до Києва о 14.30.",
  expected_terms: ["Президент", "Києва"],
  expected_numbers: ["12", "14.30"],
  require_timestamps: true
};

function run(
  provider: "assemblyai" | "gemini",
  transcriptText: string,
  options: {
    latencyMs?: number;
    timed?: boolean;
    languageConfidence?: number | null;
  } = {}
): KrcMediaAbRun {
  return {
    case_id: manifestCase.case_id,
    provider,
    provider_model: provider === "assemblyai" ? "universal-2" : "gemini-3.5-transcribe",
    transcript_text: transcriptText,
    segments: [{
      start_ms: options.timed === false ? null : 100,
      end_ms: options.timed === false ? null : 1300,
      text: transcriptText,
      confidence: provider === "assemblyai" ? 0.93 : null
    }],
    detected_language: provider === "assemblyai" ? "uk" : null,
    language_confidence: options.languageConfidence ?? null,
    provider_data_deleted: true,
    latency_ms: options.latencyMs ?? 1000,
    quota_seconds_reserved: provider === "assemblyai" ? 15 : 0
  };
}

test("M3 tokenizer and numeric normalization preserve multilingual evidence tokens", () => {
  assert.deepEqual(
    krcMediaAbTokens("Київ — Kyiv, 14.30; O’Connor"),
    ["київ", "kyiv", "14", "30", "o'connor"]
  );
  assert.deepEqual(krcMediaAbNumbers("12,5 14.30 7"), ["12.5", "14.30", "7"]);
});

test("M3 edit accounting distinguishes substitutions, insertions, and deletions", () => {
  const substitution = krcMediaAbEditCounts(["one", "two"], ["one", "three"]);
  assert.deepEqual(substitution, {
    substitutions: 1,
    insertions: 0,
    deletions: 0
  });

  const insertion = krcMediaAbEditCounts(["one", "two"], ["one", "extra", "two"]);
  assert.deepEqual(insertion, {
    substitutions: 0,
    insertions: 1,
    deletions: 0
  });

  const deletion = krcMediaAbEditCounts(["one", "two"], ["one"]);
  assert.deepEqual(deletion, {
    substitutions: 0,
    insertions: 0,
    deletions: 1
  });
});

test("M3 evaluation scores names numbers timestamps and keeps manual factual review mandatory", () => {
  const evaluation = evaluateKrcMediaAbRun(
    manifestCase,
    run("gemini", "Президент сказав що 12 літаків прибули до Києва о 14.30.")
  );

  assert.equal(evaluation.source_class, "public_web");
  assert.equal(evaluation.provider, "gemini");
  assert.equal(evaluation.expected_term_recall, 1);
  assert.equal(evaluation.expected_number_recall, 1);
  assert.equal(evaluation.timestamp_coverage, 1);
  assert.equal(evaluation.language_confidence, null);
  assert.equal(evaluation.manual_factual_review_required, true);
  assert.equal(evaluation.manual_hallucination_review_required, true);
});

test("M3 evaluation preserves private-attachment source classification without source URLs", () => {
  const privateCase: KrcMediaAbManifestCase = {
    case_id: "private-owner-001",
    source_class: "private_attachment",
    language_hint: "auto",
    reference_text: "Private owner test reference."
  };
  const privateRun: KrcMediaAbRun = {
    case_id: privateCase.case_id,
    provider: "gemini",
    provider_model: "gemini-3.5-transcribe",
    transcript_text: "Private owner test reference.",
    segments: [],
    detected_language: null,
    language_confidence: null,
    provider_data_deleted: true,
    latency_ms: 800,
    quota_seconds_reserved: 0
  };

  const evaluation = evaluateKrcMediaAbRun(privateCase, privateRun);
  assert.equal(evaluation.source_class, "private_attachment");
  assert.equal("source_url" in privateCase, false);
  assert.equal(evaluation.timestamp_coverage, 0);
});

test("M3 manifest validation rejects unstable identifiers and malformed expected numbers", () => {
  assert.throws(
    () => validateKrcMediaAbManifestCase({
      ...manifestCase,
      case_id: "contains secret spaces"
    }),
    /stable non-secret identifier/
  );
  assert.throws(
    () => validateKrcMediaAbManifestCase({
      ...manifestCase,
      expected_numbers: ["twelve"]
    }),
    /numeric tokens only/
  );
});

test("M3 pair review exposes metric directions but never invents an automatic winner", () => {
  const assemblyai = evaluateKrcMediaAbRun(
    manifestCase,
    run(
      "assemblyai",
      "Президент сказав що 12 літаків прибули до Києва о 14.30.",
      { latencyMs: 1500, timed: true, languageConfidence: 0.94 }
    )
  );
  const gemini = evaluateKrcMediaAbRun(
    manifestCase,
    run(
      "gemini",
      "Президент сказав що 12 літаків прибули у Київ о 14.30.",
      { latencyMs: 900, timed: false }
    )
  );

  const review = compareKrcMediaAbPair(assemblyai, gemini);
  assert.equal(review.case_id, manifestCase.case_id);
  assert.equal(review.lower_word_error_rate, "assemblyai");
  assert.equal(review.higher_expected_term_recall, "assemblyai");
  assert.equal(review.higher_expected_number_recall, "tie");
  assert.equal(review.higher_timestamp_coverage, "assemblyai");
  assert.equal(review.lower_latency, "gemini");
  assert.equal(review.automatic_winner, null);
  assert.equal(review.manual_review_required, true);
});
