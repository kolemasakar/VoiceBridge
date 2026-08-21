import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import {
  ManagedMediaService,
  parseManagedMediaPreflightInput,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";
import {
  managedMediaPlatform,
  normalizeManagedMediaUrl
} from "../src/managed_media_url.js";
import { MediaBetaGate } from "../src/media_beta.js";

const ACCESS_CODE = "abcdefghijkl";

const provider: ManagedNativeTranscriptProvider = {
  async quoteNative() {
    return {
      provider: "supadata",
      mode: "native",
      plan: "Free",
      max_credits: 100,
      used_credits: 3,
      remaining_credits: 97,
      estimated_credits: 1,
      remaining_after_estimate: 96,
      consent_required: true,
      can_continue: true
    };
  },
  async getNativeTranscript() {
    return {
      status: "completed",
      language: "en",
      available_languages: ["en"],
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: 1000,
        text: "Instagram test",
        confidence: null
      }],
      transcript_text: "Instagram test",
      billable_credits: 1
    };
  }
};

test("managed Instagram Reel share URLs canonicalize for credit-safe idempotency", () => {
  assert.equal(
    normalizeManagedMediaUrl(
      "https://www.instagram.com/reel/DEDbGqpyfkT/?igsh=abc123&utm_source=test#fragment"
    ),
    "https://www.instagram.com/reel/DEDbGqpyfkT/"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://m.instagram.com/reel/DEDbGqpyfkT/"),
    "https://www.instagram.com/reel/DEDbGqpyfkT/"
  );
  assert.equal(
    managedMediaPlatform("https://www.instagram.com/reel/DEDbGqpyfkT/"),
    "instagram"
  );
});

test("managed adapter accepts Instagram video posts but rejects profiles/login/non-HTTPS", () => {
  assert.equal(
    normalizeManagedMediaUrl("https://instagram.com/p/ABC_def-123/"),
    "https://www.instagram.com/p/ABC_def-123/"
  );
  assert.throws(() => normalizeManagedMediaUrl("https://instagram.com/example-user/"));
  assert.throws(() => normalizeManagedMediaUrl("https://instagram.com/accounts/login/"));
  assert.throws(() => normalizeManagedMediaUrl("http://instagram.com/reel/DEDbGqpyfkT/"));
  assert.throws(() => normalizeManagedMediaUrl("https://example.com/video"));
});

test("managed request parser accepts Instagram without changing legacy YouTube parser", () => {
  const input = parseManagedMediaPreflightInput({
    url: "https://www.instagram.com/reel/DEDbGqpyfkT/?igsh=test",
    beta_access_code: ACCESS_CODE,
    language_hint: "auto"
  });
  assert.ok(input);
  assert.equal(input.url, "https://www.instagram.com/reel/DEDbGqpyfkT/");
});

test("managed capability advertises YouTube, Instagram and Facebook", () => {
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    testAccessToken: "test-token-1234567890",
    mediaActionToken: "action-token-1234567890",
    mediaBetaCodes: [ACCESS_CODE],
    mediaDailySttSeconds: 7200,
    assemblyAiApiKey: null,
    supadataApiKey: null,
    geminiApiKey: null,
    geminiTranslationModel: "gemini-3.1-flash-lite",
    corsAllowedOrigin: "*",
    maxRequestBodyBytes: 32768,
    rateLimitRequestsPerMinute: 1000
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
  const { capability } = createManagedMediaHttpHandler(config, service);
  assert.deepEqual(capability.platforms, ["youtube", "instagram", "facebook"]);
  assert.equal(capability.facebook_ai_fallback, true);
});