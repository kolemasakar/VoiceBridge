import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { DEFAULT_GEMINI_STT_MODEL } from "../src/gemini_stt_provider.js";
import { createConfiguredSttProvider } from "../src/stt_factory.js";
import { DEFAULT_ASSEMBLYAI_SPEECH_MODEL } from "../src/stt_provider.js";

const TOKEN = "voicebridge-test-token-123456789";

test("STT factory uses Gemini as the accepted default provider", () => {
  const config = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(config.sttProvider, "gemini");
  assert.equal(config.geminiSttModel, DEFAULT_GEMINI_STT_MODEL);

  const provider = createConfiguredSttProvider({
    provider: config.sttProvider ?? "gemini",
    assemblyAiApiKey: null,
    geminiApiKey: null,
    geminiModel: config.geminiSttModel
  });
  assert.equal(provider.name, "gemini");
  assert.equal(provider.configured, false);
  assert.equal(provider.model, DEFAULT_GEMINI_STT_MODEL);
});

test("STT factory keeps AssemblyAI as an explicit rollback provider", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN: TOKEN,
    STT_PROVIDER: "assemblyai"
  });
  assert.equal(config.sttProvider, "assemblyai");

  const provider = createConfiguredSttProvider({
    provider: config.sttProvider ?? "gemini",
    assemblyAiApiKey: null,
    geminiApiKey: null,
    geminiModel: config.geminiSttModel
  });
  assert.equal(provider.name, "assemblyai");
  assert.equal(provider.configured, false);
  assert.equal(provider.model, DEFAULT_ASSEMBLYAI_SPEECH_MODEL);
});

test("STT provider config rejects unknown provider values", () => {
  assert.throws(
    () => loadConfig({
      TEST_ACCESS_TOKEN: TOKEN,
      STT_PROVIDER: "unknown"
    }),
    /STT_PROVIDER must be one of: assemblyai, gemini/
  );
});
