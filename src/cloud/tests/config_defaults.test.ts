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
