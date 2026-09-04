import assert from "node:assert/strict";
import { test } from "node:test";
import {
  krcMediaSha256Hex,
  prepareKrcMediaAbCorpusEvidence
} from "../src/krc_media_ab_corpus_preparation.js";

const ASSET = new TextEncoder().encode("stable-media-bytes");
const REFERENCE = new TextEncoder().encode("independently prepared transcript\n");

function baseInput() {
  return {
    case_id: "ua-clean-public-001",
    source_class: "public_web" as const,
    test_dimension: "Ukrainian clean speech",
    language_hint: "uk-UA",
    word_timestamps: true,
    diarization: false,
    asset_bytes: ASSET,
    reference_transcript_bytes: null,
    reference_review_state: "pending" as const
  };
}

test("M3 corpus preparation hashes exact bytes and never returns raw evidence", () => {
  const entry = prepareKrcMediaAbCorpusEvidence(baseInput());
  assert.equal(entry.asset_sha256, krcMediaSha256Hex(ASSET));
  assert.equal(entry.reference_transcript_sha256, null);
  assert.equal(entry.readiness, "ASSET_SELECTED");
  assert.equal("asset_bytes" in entry, false);
  assert.equal("reference_transcript_bytes" in entry, false);
});

test("M3 corpus preparation reaches READY_FOR_AB only with independently reviewed reference bytes", () => {
  const entry = prepareKrcMediaAbCorpusEvidence({
    ...baseInput(),
    reference_transcript_bytes: REFERENCE,
    reference_review_state: "independent_reviewed"
  });
  assert.equal(entry.reference_transcript_sha256, krcMediaSha256Hex(REFERENCE));
  assert.equal(entry.readiness, "READY_FOR_AB");
});

test("M3 corpus preparation keeps a completed but unreviewed reference at ASSET_SELECTED", () => {
  const entry = prepareKrcMediaAbCorpusEvidence({
    ...baseInput(),
    reference_transcript_bytes: REFERENCE,
    reference_review_state: "pending"
  });
  assert.equal(entry.reference_transcript_sha256, krcMediaSha256Hex(REFERENCE));
  assert.equal(entry.readiness, "ASSET_SELECTED");
});

test("M3 corpus preparation fails closed on empty evidence bytes", () => {
  assert.throws(
    () => prepareKrcMediaAbCorpusEvidence({
      ...baseInput(),
      asset_bytes: new Uint8Array()
    }),
    /non-empty asset_bytes/
  );
  assert.throws(
    () => prepareKrcMediaAbCorpusEvidence({
      ...baseInput(),
      reference_transcript_bytes: new Uint8Array()
    }),
    /non-empty reference_transcript_bytes/
  );
});

test("M3 corpus preparation cannot assert independent review without reference evidence", () => {
  assert.throws(
    () => prepareKrcMediaAbCorpusEvidence({
      ...baseInput(),
      reference_review_state: "independent_reviewed"
    }),
    /cannot be recorded without reference transcript bytes/
  );
});

test("M3 corpus SHA-256 is byte exact", () => {
  const first = krcMediaSha256Hex(new TextEncoder().encode("line\n"));
  const second = krcMediaSha256Hex(new TextEncoder().encode("line\r\n"));
  assert.notEqual(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});
