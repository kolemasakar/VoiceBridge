import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { loadConfig, type AppConfig } from "../src/config.js";
import { MediaBetaGate } from "../src/media_beta.js";
import { MediaTranscriptError } from "../src/media_transcript.js";
import {
  CobaltPublicMediaRetriever,
  PublicCobaltMediaEngine,
  createPublicCobaltMediaHttpHandler,
  type CobaltPublicMediaAsset,
  type PublicCobaltRetriever,
  type PublicCobaltStt
} from "../src/public_cobalt_media.js";

const ACCESS_CODE = "public-cobalt-access-code-2026";
const ACTION_TOKEN = "public-cobalt-action-token-2026-0123456789";
const YOUTUBE_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const INSTAGRAM_URL = "https://www.instagram.com/reel/ABC123xyz_/";

class FixtureRetriever implements PublicCobaltRetriever {
  readonly configured = true;
  calls = 0;
  fail = false;

  async retrieve(sourceUrl: string): Promise<CobaltPublicMediaAsset> {
    this.calls += 1;
    if (this.fail) {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_FAILED",
        "fixture retrieval failed",
        422,
        false
      );
    }
    return {
      source_url: sourceUrl,
      media_url: "https://media.example.test/audio.mp3",
      duration_seconds: null,
      provider: "cobalt",
      provider_mode: "self_hosted",
      credits_charged: 0,
      credits_remaining: null,
      cached: false
    };
  }
}

class FixtureStt implements PublicCobaltStt {
  readonly configured = true;
  calls = 0;

  async transcribe(
    _asset: CobaltPublicMediaAsset,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ) {
    this.calls += 1;
    await reserveSttSeconds(7.2);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "en",
      language_confidence: 0.99,
      duration_seconds: 7.2,
      transcript_text: "fixture transcript",
      segments: [
        {
          index: 0,
          start_ms: 0,
          end_ms: 7200,
          text: "fixture transcript",
          confidence: 0.99
        }
      ]
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

test("public MEDIA config no longer requires Supadata", () => {
  const config = loadConfig(publicEnvironment());
  assert.equal(config.mediaPublicMode, true);
  assert.equal(config.supadataApiKey, null);
  assert.equal(config.cobaltEndpoint, "https://cobalt.example.test");
  assert.equal(config.assemblyAiApiKey, "assemblyai-free-fixture");
});

test("Cobalt public retriever requests zero-credit audio mode for YouTube and Instagram", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ status: "redirect", url: "https://media.example.test/audio.mp3" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
  const retriever = new CobaltPublicMediaRetriever(
    "https://cobalt.example.test",
    null,
    fetchImpl
  );

  const youtube = await retriever.retrieve(YOUTUBE_URL);
  const instagram = await retriever.retrieve(INSTAGRAM_URL);
  assert.equal(youtube.provider, "cobalt");
  assert.equal(instagram.provider, "cobalt");
  assert.equal(seen.length, 2);
  for (const body of seen) {
    assert.equal(body.downloadMode, "audio");
    assert.equal(body.audioFormat, "mp3");
    assert.equal(body.disableMetadata, true);
  }

  await assert.rejects(
    () => retriever.retrieve("https://www.facebook.com/reel/123456789/"),
    (error: unknown) =>
      (error as { code?: string }).code === "COBALT_PUBLIC_MEDIA_URL_REQUIRED"
  );
});

test("public Cobalt engine persists zero retrieval credits and reuses duplicate jobs", async () => {
  const retriever = new FixtureRetriever();
  const stt = new FixtureStt();
  const engine = new PublicCobaltMediaEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    null,
    null,
    { retriever, stt }
  );

  const input = {
    url: YOUTUBE_URL,
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };
  const quote = await engine.preflight(input);
  assert.equal(quote.provider, "cobalt");
  assert.equal(quote.estimated_retrieval_credits, 0);
  assert.equal(quote.consent_required, false);

  const first = await engine.start(input);
  assert.equal(first.status, "COMPLETED");
  assert.equal(first.provider, "assemblyai");
  assert.equal(first.provider_mode, "cobalt_retrieval_stt");
  assert.equal(first.retrieval_provider, "cobalt");
  assert.equal(first.retrieval_credits_charged, 0);
  assert.equal(first.stt_seconds_charged, 8);
  assert.equal(first.provider_data_deleted, true);
  assert.equal(first.reused, false);

  const second = await engine.start(input);
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.reused, true);
  assert.equal(retriever.calls, 1);
  assert.equal(stt.calls, 1);

  const page = await engine.page(first.job_id, 0, 20);
  assert.equal(page?.segments.length, 1);
});

test("public Cobalt retrieval failure stops before STT and remains fail-closed", async () => {
  const retriever = new FixtureRetriever();
  retriever.fail = true;
  const stt = new FixtureStt();
  const engine = new PublicCobaltMediaEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    null,
    null,
    { retriever, stt }
  );

  const job = await engine.start({
    url: INSTAGRAM_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(job.status, "FAILED");
  assert.equal(job.error?.code, "COBALT_PUBLIC_MEDIA_FAILED");
  assert.equal(job.retrieval_credits_charged, 0);
  assert.equal(stt.calls, 0);
});

test("public Cobalt HTTP route accepts YouTube without Supadata credit consent", async () => {
  const retriever = new FixtureRetriever();
  const stt = new FixtureStt();
  const config = publicConfig();
  const engine = new PublicCobaltMediaEngine(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    null,
    null,
    { retriever, stt }
  );
  const handler = createPublicCobaltMediaHttpHandler(config, engine);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);

  try {
    const capabilityResponse = await fetch(`${base}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as Record<string, unknown>;
    assert.equal(capability.supadata_public_active, false);
    assert.equal(capability.youtube_retrieval_provider, "cobalt");
    assert.equal(capability.instagram_retrieval_provider, "cobalt");

    const response = await fetch(`${base}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: YOUTUBE_URL, language_hint: "auto" })
    });
    assert.equal(response.status, 200);
    const job = await response.json() as Record<string, unknown>;
    assert.equal(job.provider_mode, "cobalt_retrieval_stt");
    assert.equal(job.retrieval_provider, "cobalt");
    assert.equal(job.retrieval_credits_charged, 0);
  } finally {
    await close(server);
  }
});
