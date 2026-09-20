import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";

const TEST_ACCESS_TOKEN = "voicebridge-test-token-123456789";

test("accepted provider defaults match the validated Phase 1 runtime", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN
  });

  assert.equal(config.sttProvider, "gemini");
  assert.equal(config.geminiSttModel, "gemini-3.5-transcribe-live");
  assert.equal(config.translationProvider, "azure");
  assert.equal(config.translationFallbackProvider, "gemini");
  assert.equal(config.ttsProvider, "azure");
  assert.equal(config.azureTtsVoice, "uk-UA-OstapNeural");
});

test("explicit Gemini TTS rollback remains selectable", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN,
    TTS_PROVIDER: "gemini"
  });

  assert.equal(config.ttsProvider, "gemini");
});


test("R3-E3 route token override takes precedence over legacy token", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN,
    KRC_MEDIA_R3E3_ACTION_TOKEN: "legacy-r3e3-action-token-123456789",
    KRC_MEDIA_R3E3_ACTION_TOKEN_OVERRIDE: "override-r3e3-action-token-123456789"
  });

  assert.equal(
    config.mediaR3e3ActionToken,
    "override-r3e3-action-token-123456789"
  );
});


test("R3-E3 public mode derives a stable scoped token", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN,
    KRC_MEDIA_ACTION_TOKEN: "general-media-action-token-123456789",
    KRC_MEDIA_PUBLIC_MODE: "true",
    KRC_MEDIA_FREE_TIER_ONLY: "true",
    KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY: "true",
    ASSEMBLYAI_API_KEY: "test-assembly-key",
    KRC_MEDIA_COBALT_ENDPOINT: "https://cobalt.invalid"
  });

  assert.equal(
    config.mediaR3e3ActionToken,
    "r3e3-b9e9c294b678947317d24274938f4417715d95c2c082413abe48d81633604f9d"
  );
});


test("R3-E3 public mode prefers legacy route material before general token", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN,
    KRC_MEDIA_ACTION_TOKEN: "general-media-action-token-123456789",
    KRC_MEDIA_R3E3_ACTION_TOKEN: "legacy-r3e3-action-token-123456789",
    KRC_MEDIA_PUBLIC_MODE: "true",
    KRC_MEDIA_FREE_TIER_ONLY: "true",
    KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY: "true",
    ASSEMBLYAI_API_KEY: "test-assembly-key",
    KRC_MEDIA_COBALT_ENDPOINT: "https://cobalt.invalid"
  });

  assert.equal(
    config.mediaR3e3ActionToken,
    "r3e3-a29da52483bb9d528b7b5ffab3713b4553a669c3c9cf554117d92f31e3d7aa13"
  );
});
