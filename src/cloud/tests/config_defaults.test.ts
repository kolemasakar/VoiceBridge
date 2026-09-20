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
