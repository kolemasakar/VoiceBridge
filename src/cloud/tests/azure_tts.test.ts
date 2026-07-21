import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import {
  AzureTtsProvider,
  TtsProviderError,
  createTtsProvider,
  type TtsRequest
} from "../src/tts_provider.js";

const TOKEN = "voicebridge-test-token-123456789";

function ttsRequest(): TtsRequest {
  const controller = new AbortController();
  return {
    segmentId: "segment-azure-1",
    language: "uk",
    text: "Pryvit & svite.",
    voice: "uk-UA-OstapNeural",
    requestedAt: new Date().toISOString(),
    signal: controller.signal
  };
}

test("configuration exposes selectable Azure TTS settings", () => {
  const defaults = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(defaults.ttsProvider, "gemini");
  assert.equal(defaults.azureSpeechKey, null);
  assert.equal(defaults.azureSpeechRegion, "eastus");
  assert.equal(defaults.azureTtsVoice, "uk-UA-OstapNeural");

  const azure = loadConfig({
    TEST_ACCESS_TOKEN: TOKEN,
    TTS_PROVIDER: "azure",
    AZURE_SPEECH_KEY: "azure-test-key",
    AZURE_SPEECH_REGION: "EASTUS",
    AZURE_TTS_VOICE: "uk-UA-PolinaNeural"
  });
  assert.equal(azure.ttsProvider, "azure");
  assert.equal(azure.azureSpeechKey, "azure-test-key");
  assert.equal(azure.azureSpeechRegion, "eastus");
  assert.equal(azure.azureTtsVoice, "uk-UA-PolinaNeural");

  assert.throws(
    () => loadConfig({
      TEST_ACCESS_TOKEN: TOKEN,
      TTS_PROVIDER: "unsupported"
    }),
    /TTS_PROVIDER/
  );
});

test("Azure factory remains safely not configured without a key", () => {
  const provider = createTtsProvider({
    provider: "azure",
    azureSpeechKey: null,
    azureSpeechRegion: "eastus",
    azureVoice: "uk-UA-OstapNeural"
  });
  assert.equal(provider.name, "azure");
  assert.equal(provider.configured, false);
});

test("Azure TTS adapter sends SSML and normalizes raw PCM", async () => {
  let requestedUrl = "";
  let requestedHeaders = new Headers();
  let requestedBody = "";
  const pcm = Buffer.alloc(48000);
  const provider = new AzureTtsProvider(
    "azure-test-key",
    "eastus",
    "uk-UA-OstapNeural",
    "https://eastus.tts.test/cognitiveservices/v1",
    async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      requestedBody = String(init?.body);
      return new Response(pcm, {
        status: 200,
        headers: { "content-type": "audio/basic" }
      });
    },
    1000
  );

  const result = await provider.synthesize(ttsRequest());
  assert.equal(requestedUrl, "https://eastus.tts.test/cognitiveservices/v1");
  assert.equal(
    requestedHeaders.get("Ocp-Apim-Subscription-Key"),
    "azure-test-key"
  );
  assert.equal(
    requestedHeaders.get("X-Microsoft-OutputFormat"),
    "raw-24khz-16bit-mono-pcm"
  );
  assert.equal(requestedHeaders.get("User-Agent"), "VoiceBridge");
  assert.match(requestedBody, /xml:lang="uk-UA"/);
  assert.match(requestedBody, /name="uk-UA-OstapNeural"/);
  assert.match(requestedBody, /Pryvit &amp; svite\./);
  assert.equal(result.provider, "azure");
  assert.equal(result.voice, "uk-UA-OstapNeural");
  assert.equal(result.audioFormat, "pcm_s16le");
  assert.equal(result.sampleRateHz, 24000);
  assert.equal(result.channels, 1);
  assert.equal(result.audio.byteLength, 48000);
  assert.equal(result.audioDurationMs, 1000);
});

test("Azure TTS adapter maps quota response with Retry-After", async () => {
  const provider = new AzureTtsProvider(
    "azure-test-key",
    "eastus",
    "uk-UA-OstapNeural",
    "https://eastus.tts.test/cognitiveservices/v1",
    async () => new Response("", {
      status: 429,
      headers: { "retry-after": "7" }
    }),
    1000
  );

  await assert.rejects(
    provider.synthesize(ttsRequest()),
    (error: unknown) =>
      error instanceof TtsProviderError &&
      error.code === "TTS_RATE_LIMITED" &&
      error.retryable === true &&
      error.retryAfterMs === 7000
  );
});
