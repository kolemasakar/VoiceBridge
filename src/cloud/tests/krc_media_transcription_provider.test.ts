import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { createKrcManagedMediaService } from "../src/krc_managed_media_factory.js";
import {
  createMediaTranscriptionProvider,
  KRC_MEDIA_ASSEMBLYAI_MODEL
} from "../src/media_transcription_provider.js";

const TEST_ACCESS_TOKEN = "voicebridge-test-token-123456789";

function config(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    TEST_ACCESS_TOKEN,
    ASSEMBLYAI_API_KEY: "test-assemblyai-key",
    KRC_MEDIA_BETA_CODES: "abcdefghijkl",
    KRC_MEDIA_STT_PROVIDER: "assemblyai",
    STT_PROVIDER: "gemini",
    GEMINI_STT_MODEL: "gemini-3.5-transcribe-live",
    ...overrides
  });
}

test("M1 keeps VoiceBridge live Gemini selection independent from KRC AssemblyAI", () => {
  const loaded = config();
  assert.equal(loaded.sttProvider, "gemini");
  assert.equal(loaded.geminiSttModel, "gemini-3.5-transcribe-live");
  assert.equal(loaded.krcMediaSttProvider, "assemblyai");

  const provider = createMediaTranscriptionProvider(loaded);
  assert.equal(provider.name, "assemblyai");
  assert.equal(provider.model, KRC_MEDIA_ASSEMBLYAI_MODEL);
  assert.equal(provider.configured, true);
  assert.equal(provider.attachmentPipeline.configured, true);
  assert.equal(provider.facebookStt.configured, true);
  assert.equal(provider.telegramStt.configured, true);
});

test("M1 KRC provider remains unconfigured without AssemblyAI key", () => {
  const loaded = config({ ASSEMBLYAI_API_KEY: "" });
  const provider = createMediaTranscriptionProvider(loaded);
  assert.equal(provider.configured, false);
  assert.equal(provider.attachmentPipeline.configured, false);
  assert.equal(provider.facebookStt.configured, false);
  assert.equal(provider.telegramStt.configured, false);
});

test("M1 rejects Gemini as KRC prerecorded provider before M2", () => {
  assert.throws(
    () => config({ KRC_MEDIA_STT_PROVIDER: "gemini" }),
    /KRC_MEDIA_STT_PROVIDER must be one of: assemblyai/
  );
});

test("KRC managed service factory uses the KRC provider boundary", () => {
  const result = createKrcManagedMediaService(config());
  assert.equal(result.transcriptionProvider.name, "assemblyai");
  assert.equal(result.transcriptionProvider.model, "universal-2");
  assert.equal(result.service.storeKind, "memory");
});

test("managed server injects KRC service instead of the legacy internal default factory", async () => {
  const [server, factory] = await Promise.all([
    readFile("src/managed_server.ts", "utf8"),
    readFile("src/krc_managed_media_factory.ts", "utf8")
  ]);

  assert.match(server, /createKrcManagedMediaService\(config\)/);
  assert.match(
    server,
    /createManagedMediaHttpHandler\(config, krcManaged\.service\)/
  );
  assert.match(factory, /createMediaTranscriptionProvider\(config\)/);
  assert.doesNotMatch(factory, /config\.sttProvider/);
  assert.doesNotMatch(factory, /config\.geminiSttModel/);
});
