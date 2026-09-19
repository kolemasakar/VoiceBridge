import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { loadConfig, type AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";

const ACTION_TOKEN = "managed-action-token-1234567890";
const R3E3_ACTION_TOKEN = "managed-r3e3-facebook-token-1234567890";
const ACCESS_CODE = "abcdefghijkl";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-123456789",
  mediaActionToken: ACTION_TOKEN,
  mediaR3e3ActionToken: R3E3_ACTION_TOKEN,
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

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${ACTION_TOKEN}`,
    "content-type": "application/json",
    connection: "close"
  };
}

function r3e3Headers(): Record<string, string> {
  return {
    authorization: `Bearer ${R3E3_ACTION_TOKEN}`,
    "content-type": "application/json",
    connection: "close"
  };
}

test("active Facebook intake cannot enter generic Supadata native routes", async () => {
  let preflightCalls = 0;
  let nativeCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async preflight() {
      preflightCalls += 1;
      throw new Error("generic Facebook preflight must remain unreachable");
    },
    async startNative() {
      nativeCalls += 1;
      throw new Error("generic Facebook native start must remain unreachable");
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const preflight = await fetch(`${baseUrl}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url: FACEBOOK_URL, language_hint: "auto" })
    });
    assert.equal(preflight.status, 400);
    const preflightBody = await preflight.json() as { error?: { code?: string } };
    assert.equal(preflightBody.error?.code, "FACEBOOK_FREE_RETRIEVAL_REQUIRED");

    const start = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        url: FACEBOOK_URL,
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      })
    });
    assert.equal(start.status, 409);
    const startBody = await start.json() as { error?: { code?: string } };
    assert.equal(startBody.error?.code, "FACEBOOK_FREE_RETRIEVAL_REQUIRED");
    assert.equal(preflightCalls, 0);
    assert.equal(nativeCalls, 0);
  } finally {
    await close(server);
  }
});

test("managed capability does not advertise Facebook AI generation as active", () => {
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true
  } as unknown as ManagedMediaService;
  const { capability } = createManagedMediaHttpHandler(CONFIG, service);
  assert.equal(capability.facebook_ai_fallback, false);
  assert.equal(capability.facebook_ai_requires_duration_metadata, false);
  assert.equal(capability.facebook_ai_metadata_credits, 0);
  assert.equal(capability.facebook_retrieval_stt_fallback, true);
  assert.equal(capability.facebook_automatic_paid_retrieval, false);
});

test("R3-E3 scoped bearer can reach only free Facebook start", async () => {
  let facebookStarts = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async startFacebookFallback(input: { url: string }) {
      facebookStarts += 1;
      return {
        job_id: "KRCM_r3e3-facebook",
        source_url: input.url,
        status: "COMPLETED",
        provider: "assemblyai",
        provider_mode: "cobalt_retrieval_stt",
        retrieval_provider: "cobalt",
        retrieval_credits_charged: 0
      };
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const start = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: r3e3Headers(),
      body: JSON.stringify({ url: FACEBOOK_URL, language_hint: "auto" })
    });
    assert.equal(start.status, 200);
    assert.equal(facebookStarts, 1);

    const telegram = await fetch(`${baseUrl}/api/v1/media/managed/telegram`, {
      method: "POST",
      headers: r3e3Headers(),
      body: JSON.stringify({ url: "https://t.me/techcrimes/12107", language_hint: "auto" })
    });
    assert.equal(telegram.status, 403);

    const native = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: r3e3Headers(),
      body: JSON.stringify({ url: FACEBOOK_URL })
    });
    assert.equal(native.status, 403);
    assert.equal(facebookStarts, 1);
  } finally {
    await close(server);
  }
});

test("R3-E3 scoped bearer cannot read non-Facebook jobs", async () => {
  const facebookJob = {
    job_id: "KRCM_fb",
    source_url: FACEBOOK_URL,
    status: "COMPLETED"
  };
  const instagramJob = {
    job_id: "KRCM_ig",
    source_url: "https://www.instagram.com/reel/ABC123xyz_/",
    status: "COMPLETED"
  };
  let pageCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async get(jobId: string) {
      if (jobId === "KRCM_fb") return facebookJob;
      if (jobId === "KRCM_ig") return instagramJob;
      return null;
    },
    async page(jobId: string) {
      pageCalls += 1;
      return { job_id: jobId, segments: [], next_cursor: null };
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const facebookStatus = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_fb`,
      { headers: r3e3Headers() }
    );
    assert.equal(facebookStatus.status, 200);

    const instagramStatus = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_ig`,
      { headers: r3e3Headers() }
    );
    assert.equal(instagramStatus.status, 403);

    const facebookSegments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_fb/segments`,
      { headers: r3e3Headers() }
    );
    assert.equal(facebookSegments.status, 200);
    const instagramSegments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_ig/segments`,
      { headers: r3e3Headers() }
    );
    assert.equal(instagramSegments.status, 403);
    assert.equal(pageCalls, 1);
  } finally {
    await close(server);
  }
});

test("R3-E3 action token config is optional and length-validated", () => {
  const base: NodeJS.ProcessEnv = {
    TEST_ACCESS_TOKEN: "voicebridge-test-token-123456789",
    KRC_MEDIA_R3E3_ACTION_TOKEN: R3E3_ACTION_TOKEN
  };
  const config = loadConfig(base);
  assert.equal(config.mediaR3e3ActionToken, R3E3_ACTION_TOKEN);

  assert.throws(
    () => loadConfig({
      ...base,
      KRC_MEDIA_R3E3_ACTION_TOKEN: "too-short"
    }),
    /KRC_MEDIA_R3E3_ACTION_TOKEN must contain at least 24 characters/
  );
});

test("R3-E3 scoped bearer permits Facebook durable lookup without provider work", async () => {
  let lookupCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async lookup(input: { url: string }) {
      lookupCalls += 1;
      assert.equal(input.url, FACEBOOK_URL);
      return null;
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const lookup = await fetch(`${baseUrl}/api/v1/media/managed/lookup`, {
      method: "POST",
      headers: r3e3Headers(),
      body: JSON.stringify({ url: FACEBOOK_URL, language_hint: "auto" })
    });
    assert.equal(lookup.status, 404);
    assert.equal(lookupCalls, 1);

    const crossPlatform = await fetch(`${baseUrl}/api/v1/media/managed/lookup`, {
      method: "POST",
      headers: r3e3Headers(),
      body: JSON.stringify({
        url: "https://www.instagram.com/reel/DF1CIrPSVmf/",
        language_hint: "auto"
      })
    });
    assert.equal(crossPlatform.status, 403);
    assert.equal(lookupCalls, 1);
  } finally {
    await close(server);
  }
});

test("R3-E3 scoped bearer cannot enter paid or AI Facebook continuation routes", async () => {
  let continuationCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async facebookFallbackPreflight() { continuationCalls += 1; return {}; },
    async continueFacebookFallback() { continuationCalls += 1; return {}; },
    async facebookMetadataPreflight() { continuationCalls += 1; return {}; },
    async startFacebookMetadata() { continuationCalls += 1; return {}; },
    async aiPreflight() { continuationCalls += 1; return {}; },
    async startAi() { continuationCalls += 1; return {}; }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  const paths = [
    "/api/v1/media/managed/transcriptions/KRCM_fb/facebook-retrieval-preflight",
    "/api/v1/media/managed/transcriptions/KRCM_fb/facebook-retrieval",
    "/api/v1/media/managed/transcriptions/KRCM_fb/facebook-ai-estimate-preflight",
    "/api/v1/media/managed/transcriptions/KRCM_fb/facebook-ai-estimate",
    "/api/v1/media/managed/transcriptions/KRCM_fb/ai-preflight",
    "/api/v1/media/managed/transcriptions/KRCM_fb/ai"
  ];
  try {
    for (const path of paths) {
      const isPreflight = path.endsWith("preflight");
      const init: RequestInit = {
        method: isPreflight ? "GET" : "POST",
        headers: r3e3Headers()
      };
      if (!isPreflight) init.body = JSON.stringify({});
      const response = await fetch(baseUrl + path, init);
      assert.equal(response.status, 403, path);
    }
    assert.equal(continuationCalls, 0);
  } finally {
    await close(server);
  }
});
