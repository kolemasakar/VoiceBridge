import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import {
  AzureTranslationProvider,
  FallbackTranslationProvider,
  GeminiTranslationProvider,
  createTranslationProvider,
  type TranslationRequest
} from "../src/translation_provider.js";

const TOKEN = "voicebridge-test-token-123456789";

function request(): TranslationRequest {
  return {
    segmentId: "segment-azure-1",
    sourceLanguage: "en",
    targetLanguage: "uk",
    sourceText: "Hello world.",
    context: ["Previous sentence."],
    requestedAt: new Date().toISOString(),
    signal: new AbortController().signal
  };
}

test("configuration selects Azure translation with Gemini fallback", () => {
  const config = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(config.translationProvider, "azure");
  assert.equal(config.translationFallbackProvider, "gemini");
  assert.equal(config.azureTranslatorRegion, "eastus");
  assert.equal(
    config.azureTranslatorEndpoint,
    "https://api.cognitive.microsofttranslator.com"
  );
});

test("Azure Translator adapter sends regional v3 request", async () => {
  let requestedUrl = "";
  let requestedHeaders = new Headers();
  let requestedBody: Array<{ Text: string }> = [];

  const provider = new AzureTranslationProvider(
    "azure-test-key",
    "eastus",
    "https://translator.test",
    async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([{
        translations: [{ text: "Pryvit, svite.", to: "uk" }]
      }]), { status: 200 });
    },
    1000
  );

  const result = await provider.translate(request());
  assert.equal(
    requestedUrl,
    "https://translator.test/translate?api-version=3.0&from=en&to=uk&textType=plain"
  );
  assert.equal(
    requestedHeaders.get("Ocp-Apim-Subscription-Key"),
    "azure-test-key"
  );
  assert.equal(
    requestedHeaders.get("Ocp-Apim-Subscription-Region"),
    "eastus"
  );
  assert.deepEqual(requestedBody, [{ Text: "Hello world." }]);
  assert.equal(result.provider, "azure");
  assert.equal(result.translatedText, "Pryvit, svite.");
});

test("Gemini fallback is used when Azure is rate limited", async () => {
  const azure = new AzureTranslationProvider(
    "azure-test-key",
    "eastus",
    "https://translator.test",
    async () => new Response("", {
      status: 429,
      headers: { "retry-after": "1" }
    }),
    1000
  );
  const gemini = new GeminiTranslationProvider(
    "gemini-test-key",
    "gemini-test-model",
    "https://gemini.test/models",
    async () => new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ translation: "Rezervnyi pereklad." })
          }]
        }
      }]
    }), { status: 200 }),
    1000
  );

  const provider = new FallbackTranslationProvider(azure, gemini);
  const result = await provider.translate(request());
  assert.equal(result.provider, "gemini-fallback");
  assert.equal(result.translatedText, "Rezervnyi pereklad.");
});

test("factory stays configured through Gemini before Azure key is added", () => {
  const provider = createTranslationProvider({
    provider: "azure",
    fallbackProvider: "gemini",
    azureTranslatorKey: null,
    geminiApiKey: "gemini-test-key",
    geminiModel: "gemini-test-model"
  });
  assert.equal(provider.name, "azure+gemini");
  assert.equal(provider.configured, true);
});
