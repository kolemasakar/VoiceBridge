import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { loadConfig, type AppConfig } from "../src/config.js";
import { MediaBetaGate } from "../src/media_beta.js";
import { MediaTranscriptError } from "../src/media_transcript.js";
import {
  GeminiYoutubeDirectProvider,
  PublicGeminiYoutubeEngine,
  createPublicGeminiYoutubeHttpHandler,
  type GeminiFreeConsent,
  type GeminiYoutubeDirectResult,
  type PublicGeminiYoutubeProvider
} from "../src/public_gemini_youtube.js";

const ACCESS_CODE = "public-gemini-youtube-access-2026";
const ACTION_TOKEN = "public-gemini-youtube-action-token-2026-0123456789";
const R3E1_ACTION_TOKEN = "public-gemini-youtube-r3e1-token-2026-0123456789";
const R39_ACTION_TOKEN = "public-gemini-youtube-r39-token-2026-0123456789";
const YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const CONSENT: GeminiFreeConsent = {
  provider: "google_gemini",
  tier: "free",
  data_use_acknowledged: true
};

class FixtureGeminiYoutubeProvider implements PublicGeminiYoutubeProvider {
  readonly configured = true;
  readonly model = "gemini-3.7-flash";
  calls = 0;
  fail = false;

  async transcribe(sourceUrl: string): Promise<GeminiYoutubeDirectResult> {
    this.calls += 1;
    if (this.fail) {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_FAILED",
        "fixture Gemini failure",
        422,
        false
      );
    }
    assert.equal(sourceUrl, YOUTUBE_URL);
    return {
      provider: "gemini",
      provider_model: this.model,
      transcript_text: "fixture direct youtube transcript",
      segments: [
        {
          index: 0,
          start_ms: null,
          end_ms: null,
          text: "fixture direct youtube transcript",
          confidence: null
        }
      ],
      detected_language: null,
      language_confidence: null,
      provider_data_deleted: null
    };
  }
}

function publicEnvironment(): NodeJS.ProcessEnv {
  return {
    TEST_ACCESS_TOKEN: "test-access-token-0123456789",
    KRC_MEDIA_ACTION_TOKEN: ACTION_TOKEN,
    KRC_MEDIA_PUBLIC_MODE: "true",
    KRC_MEDIA_FREE_TIER_ONLY: "true",
    KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY: "true",
    ASSEMBLYAI_API_KEY: "assemblyai-free-fixture",
    KRC_MEDIA_COBALT_ENDPOINT: "https://cobalt.example.test",
    KRC_MEDIA_COBALT_API_KEY: "cobalt-fixture-key",
    GEMINI_API_KEY: "gemini-free-fixture",
    RATE_LIMIT_REQUESTS_PER_MINUTE: "60",
    MEDIA_MAX_CONCURRENT_JOBS: "1",
    MEDIA_DAILY_STT_SECONDS: "7200"
  };
}

function publicConfig(): AppConfig {
  const config = loadConfig(publicEnvironment());
  return {
    ...config,
    host: "127.0.0.1",
    port: 0,
    mediaBetaCodes: [ACCESS_CODE]
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("Gemini direct YouTube provider sends only public URL and transcript prompt", async () => {
  const capture: {
    headers?: Headers;
    body?: Record<string, unknown>;
  } = {};
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    capture.headers = new Headers(init?.headers);
    capture.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ output_text: "hello from direct youtube" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const provider = new GeminiYoutubeDirectProvider(
    "gemini-fixture-key",
    true,
    "gemini-3.7-flash",
    fetchImpl
  );
  const result = await provider.transcribe(YOUTUBE_URL, "auto");

  assert.equal(result.provider, "gemini");
  assert.equal(result.provider_model, "gemini-3.7-flash");
  assert.equal(result.transcript_text, "hello from direct youtube");
  assert.equal(result.segments.length, 1);
  assert.equal(capture.headers?.get("x-goog-api-key"), "gemini-fixture-key");
  assert.equal(capture.headers?.get("authorization"), null);
  assert.equal(capture.headers?.get("cookie"), null);
  assert.equal(capture.body?.model, "gemini-3.7-flash");
  const input = capture.body?.input as Array<Record<string, unknown>>;
  assert.equal(input[1]?.type, "video");
  assert.equal(input[1]?.uri, YOUTUBE_URL);

  await assert.rejects(
    () => provider.transcribe("https://www.instagram.com/reel/ABC123xyz_/", "auto"),
    (error: unknown) => (error as { code?: string }).code === "GEMINI_YOUTUBE_URL_REQUIRED"
  );
});

test("Gemini direct YouTube provider canonicalizes youtu.be share URLs", async () => {
  let body: Record<string, unknown> | undefined;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({ output_text: "canonicalized youtube transcript" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const provider = new GeminiYoutubeDirectProvider(
    "gemini-fixture-key",
    true,
    "gemini-3.7-flash",
    fetchImpl
  );
  await provider.transcribe(
    "https://youtu.be/jNQXAC9IVRw?si=tracking-token",
    "auto"
  );

  const input = body?.input as Array<Record<string, unknown>>;
  assert.equal(input[1]?.uri, YOUTUBE_URL);
});

test("Gemini failed job preserves sanitized upstream status and retryability", async () => {
  const fetchImpl = (async () => new Response(
    JSON.stringify({
      error: {
        code: 429,
        message: "quota text must not be persisted",
        status: "RESOURCE_EXHAUSTED"
      }
    }),
    { status: 429, headers: { "content-type": "application/json" } }
  )) as typeof fetch;

  const provider = new GeminiYoutubeDirectProvider(
    "gemini-fixture-key",
    true,
    "gemini-3.7-flash",
    fetchImpl
  );
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );

  const job = await engine.start({
    url: YOUTUBE_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  }, CONSENT);

  assert.equal(job.status, "FAILED");
  assert.equal(job.error?.code, "GEMINI_YOUTUBE_FAILED");
  assert.equal(job.error?.retryable, true);
  assert.equal(job.provider_http_status, 429);
  assert.equal(job.provider_error_status, "RESOURCE_EXHAUSTED");
  assert.doesNotMatch(job.error?.message || "", /quota text/i);
});

test("Gemini YouTube engine requires explicit Free Tier data-use consent before provider work", async () => {
  const provider = new FixtureGeminiYoutubeProvider();
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );
  const input = {
    url: YOUTUBE_URL,
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };

  const quote = await engine.preflight(input);
  assert.equal(quote.provider, "gemini");
  assert.equal(quote.mode, "youtube_direct");
  assert.equal(quote.consent_required, true);
  assert.equal(quote.automatic_paid_fallback, false);
  assert.match(quote.data_use_notice, /may be used by Google/i);

  await assert.rejects(
    () => engine.start(input, null),
    (error: unknown) => (error as { code?: string }).code === "GEMINI_FREE_CONSENT_REQUIRED"
  );
  assert.equal(provider.calls, 0);

  const first = await engine.start(input, CONSENT);
  assert.equal(first.status, "COMPLETED");
  assert.equal(first.provider, "gemini");
  assert.equal(first.provider_mode, "youtube_gemini_direct");
  assert.equal(first.retrieval_provider, "gemini_youtube_url");
  assert.equal(first.provider_model, "gemini-3.7-flash");
  assert.equal(first.retrieval_credits_charged, 0);
  assert.equal(first.stt_seconds_charged, 0);
  assert.equal(first.gemini_free_data_use_acknowledged, true);

  const second = await engine.start(input, CONSENT);
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.reused, true);
  assert.equal(provider.calls, 1);

  const page = await engine.page(first.job_id, 0, 20);
  assert.equal(page?.segments.length, 1);
});

test("Gemini YouTube engine fails closed with zero paid or AssemblyAI fallback", async () => {
  const provider = new FixtureGeminiYoutubeProvider();
  provider.fail = true;
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );

  const input = {
    url: YOUTUBE_URL,
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };
  const job = await engine.start(input, CONSENT);

  assert.equal(job.status, "FAILED");
  assert.equal(job.error?.code, "GEMINI_YOUTUBE_FAILED");
  assert.equal(job.retrieval_credits_charged, 0);
  assert.equal(job.stt_seconds_charged, 0);
  assert.equal(provider.calls, 1);

  provider.fail = false;
  const retry = await engine.start(input, CONSENT);
  assert.notEqual(retry.job_id, job.job_id);
  assert.equal(retry.status, "COMPLETED");
  assert.equal(retry.reused, false);
  assert.equal(provider.calls, 2);

  const lookup = await engine.lookup(input);
  assert.equal(lookup?.job_id, retry.job_id);
  assert.equal(lookup?.status, "COMPLETED");
  const duplicate = await engine.start(input, CONSENT);
  assert.equal(duplicate.job_id, retry.job_id);
  assert.equal(duplicate.reused, true);
  assert.equal(provider.calls, 2);
});

test("R3-E1 token is accepted only by the Gemini YouTube handler", async () => {
  const previous = process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
  process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = "true";
  const provider = new FixtureGeminiYoutubeProvider();
  const config = { ...publicConfig(), mediaR3e1ActionToken: R3E1_ACTION_TOKEN };
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );
  const handler = createPublicGeminiYoutubeHttpHandler(config, engine);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);

  try {
    const lookup = await fetch(`${base}/api/v1/media/youtube-gemini/lookup`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${R3E1_ACTION_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: YOUTUBE_URL, language_hint: "auto" })
    });
    assert.equal(lookup.status, 404);
    assert.equal(provider.calls, 0);

    const invalid = await fetch(`${base}/api/v1/media/youtube-gemini/lookup`, {
      method: "POST",
      headers: {
        authorization: "Bearer invalid-r3e1-token-value",
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: YOUTUBE_URL, language_hint: "auto" })
    });
    assert.equal(invalid.status, 401);
    assert.equal(provider.calls, 0);
  } finally {
    await close(server);
    if (previous === undefined) {
      delete process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
    } else {
      process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = previous;
    }
  }
});

test("R3.9 unified token is accepted by Gemini YouTube read-only routes", async () => {
  const previous = process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
  process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = "true";
  const provider = new FixtureGeminiYoutubeProvider();
  const config = { ...publicConfig(), mediaR39ActionToken: R39_ACTION_TOKEN };
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );
  const handler = createPublicGeminiYoutubeHttpHandler(config, engine);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  try {
    const capability = await fetch(`${base}/api/v1/media/public-capabilities`, {
      headers: { authorization: `Bearer ${R39_ACTION_TOKEN}` }
    });
    assert.equal(capability.status, 200);
    const body = await capability.json() as Record<string, unknown>;
    assert.equal(body.youtube_retrieval_provider, "gemini_youtube_url");
    assert.equal(provider.calls, 0);
  } finally {
    await close(server);
    if (previous === undefined) delete process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
    else process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = previous;
  }
});

test("Gemini YouTube HTTP route exposes consent preflight and rejects unconsented start", async () => {
  const previous = process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
  process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = "true";
  const provider = new FixtureGeminiYoutubeProvider();
  const config = publicConfig();
  const engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    true,
    provider.model,
    { provider }
  );
  const handler = createPublicGeminiYoutubeHttpHandler(config, engine);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);

  try {
    const capabilityResponse = await fetch(`${base}/api/v1/media/public-capabilities`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as Record<string, unknown>;
    assert.equal(capability.youtube_retrieval_provider, "gemini_youtube_url");
    assert.equal(capability.youtube_stt_provider, "gemini");
    assert.equal(capability.youtube_gemini_consent_required, true);
    assert.equal(capability.automatic_paid_fallback, false);

    const preflightResponse = await fetch(`${base}/api/v1/media/youtube-gemini/preflight`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: YOUTUBE_URL, language_hint: "auto" })
    });
    assert.equal(preflightResponse.status, 200);
    const preflight = await preflightResponse.json() as Record<string, unknown>;
    assert.equal(preflight.consent_required, true);

    const deniedResponse = await fetch(`${base}/api/v1/media/youtube-gemini/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: YOUTUBE_URL, language_hint: "auto" })
    });
    assert.equal(deniedResponse.status, 409);
    assert.equal(provider.calls, 0);

    const startResponse = await fetch(`${base}/api/v1/media/youtube-gemini/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        url: YOUTUBE_URL,
        language_hint: "auto",
        gemini_free_consent: CONSENT
      })
    });
    assert.equal(startResponse.status, 200);
    const job = await startResponse.json() as Record<string, unknown>;
    assert.equal(job.status, "COMPLETED");
    assert.equal(job.provider_mode, "youtube_gemini_direct");
    assert.equal(provider.calls, 1);
  } finally {
    await close(server);
    if (previous === undefined) {
      delete process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY;
    } else {
      process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY = previous;
    }
  }
});
