import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createKrcManagedMediaService } from "../src/krc_managed_media_factory.js";
import { CobaltPublicMediaRetriever } from "../src/public_cobalt_media.js";

const COBALT_API_KEY = "123e4567-e89b-12d3-a456-426614174000";

function publicConfig(cobaltApiKey: string | null): AppConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    testAccessToken: "r2-cobalt-auth-test-token-0123456789",
    mediaActionToken: "r2-cobalt-auth-action-token-0123456789",
    mediaBetaCodes: ["r2-cobalt-auth-derived-admission"],
    mediaPublicMode: true,
    mediaFreeTierOnly: true,
    mediaAssemblyAiFreeTrialOnly: true,
    mediaDailySttSeconds: 7200,
    mediaMaxDurationSeconds: 3600,
    mediaMaxConcurrentJobs: 1,
    assemblyAiApiKey: "assemblyai-free-trial-fixture",
    supadataApiKey: null,
    cobaltEndpoint: "https://cobalt.example.test",
    cobaltApiKey,
    scrapeCreatorsApiKey: null,
    geminiApiKey: null,
    geminiTranslationModel: "gemini-3.1-flash-lite",
    corsAllowedOrigin: "*",
    maxRequestBodyBytes: 32768,
    rateLimitRequestsPerMinute: 60
  };
}

test("R2 public runtime refuses to start without authenticated Cobalt API key wiring", () => {
  assert.throws(
    () => createKrcManagedMediaService(publicConfig(null)),
    /KRC_MEDIA_PUBLIC_MODE requires KRC_MEDIA_COBALT_API_KEY/
  );
});

test("R2 public Cobalt retrieval sends the configured Api-Key authorization header", async () => {
  let authorization: string | null = null;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    authorization = headers.get("authorization");
    return new Response(
      JSON.stringify({ status: "redirect", url: "https://media.example.test/audio.mp3" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const retriever = new CobaltPublicMediaRetriever(
    "https://cobalt.example.test",
    COBALT_API_KEY,
    fetchImpl
  );

  await retriever.retrieve("https://www.youtube.com/watch?v=jNQXAC9IVRw");
  assert.equal(authorization, `Api-Key ${COBALT_API_KEY}`);
});
