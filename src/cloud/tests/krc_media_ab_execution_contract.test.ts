import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKrcMediaAbExecutionPair,
  parseKrcMediaAbExecutionSpec
} from "../src/krc_media_ab_execution_contract.js";

const DIGEST = "a".repeat(64);

function spec(provider: "assemblyai" | "gemini") {
  return {
    case_id: "ua-public-001",
    source_class: "public_web",
    asset_sha256: DIGEST,
    provider,
    provider_model: provider === "assemblyai"
      ? "universal-2"
      : "gemini-3.5-transcribe",
    language_hint: "uk-UA",
    word_timestamps: true,
    diarization: false
  };
}

test("M3 execution spec accepts only the fixed AssemblyAI and Gemini A/B models", () => {
  assert.equal(parseKrcMediaAbExecutionSpec(spec("assemblyai")).provider_model, "universal-2");
  assert.equal(parseKrcMediaAbExecutionSpec(spec("gemini")).provider_model, "gemini-3.5-transcribe");
  assert.throws(
    () => parseKrcMediaAbExecutionSpec({
      ...spec("gemini"),
      provider_model: "gemini-3.5-transcribe-live"
    }),
    /provider_model/
  );
});

test("M3 execution spec rejects URL credential and other unsupported fields", () => {
  assert.throws(
    () => parseKrcMediaAbExecutionSpec({
      ...spec("gemini"),
      source_url: "https://example.invalid/private"
    }),
    /unsupported fields: source_url/
  );
  assert.throws(
    () => parseKrcMediaAbExecutionSpec({
      ...spec("gemini"),
      api_key: "secret"
    }),
    /unsupported fields: api_key/
  );
});

test("M3 execution spec requires a stable non-secret id and exact SHA-256 asset digest", () => {
  assert.throws(
    () => parseKrcMediaAbExecutionSpec({
      ...spec("assemblyai"),
      case_id: "case with spaces"
    }),
    /stable non-secret identifier/
  );
  assert.throws(
    () => parseKrcMediaAbExecutionSpec({
      ...spec("assemblyai"),
      asset_sha256: "not-a-digest"
    }),
    /SHA-256 digest/
  );
});

test("M3 execution pair requires the identical media asset for both providers", () => {
  assert.throws(
    () => createKrcMediaAbExecutionPair(
      spec("assemblyai"),
      { ...spec("gemini"), asset_sha256: "b".repeat(64) }
    ),
    /asset_sha256 must be identical/
  );
});

test("M3 execution pair requires identical language timestamp and diarization options", () => {
  assert.throws(
    () => createKrcMediaAbExecutionPair(
      spec("assemblyai"),
      { ...spec("gemini"), language_hint: "auto" }
    ),
    /language_hint must be identical/
  );
  assert.throws(
    () => createKrcMediaAbExecutionPair(
      spec("assemblyai"),
      { ...spec("gemini"), word_timestamps: false }
    ),
    /word_timestamps must be identical/
  );
  assert.throws(
    () => createKrcMediaAbExecutionPair(
      spec("assemblyai"),
      { ...spec("gemini"), diarization: true }
    ),
    /diarization must be identical/
  );
});

test("M3 execution pair exposes a provider-neutral same-asset comparison envelope", () => {
  const pair = createKrcMediaAbExecutionPair(spec("assemblyai"), spec("gemini"));
  assert.equal(pair.case_id, "ua-public-001");
  assert.equal(pair.source_class, "public_web");
  assert.equal(pair.asset_sha256, DIGEST);
  assert.equal(pair.language_hint, "uk-UA");
  assert.equal(pair.word_timestamps, true);
  assert.equal(pair.diarization, false);
  assert.equal(pair.assemblyai.provider, "assemblyai");
  assert.equal(pair.gemini.provider, "gemini");
  assert.equal("source_url" in pair, false);
});
