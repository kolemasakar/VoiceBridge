import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";

const ACTION_TOKEN = "managed-action-token-telegram-123456";
const R3E4_ACTION_TOKEN = "managed-r3e4-telegram-token-1234567890";
const ACCESS_CODE = "abcdefghijkl";
const TELEGRAM_URL = "https://t.me/techcrimes/12101";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-telegram-123456",
  mediaActionToken: ACTION_TOKEN,
  mediaR3e4ActionToken: R3E4_ACTION_TOKEN,
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

function r3e4Headers(): Record<string, string> {
  return {
    authorization: `Bearer ${R3E4_ACTION_TOKEN}`,
    "content-type": "application/json",
    connection: "close"
  };
}

test("active Telegram intake cannot enter generic Supadata native routes", async () => {
  let preflightCalls = 0;
  let nativeCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async preflight() {
      preflightCalls += 1;
      throw new Error("generic Telegram preflight must remain unreachable");
    },
    async startNative() {
      nativeCalls += 1;
      throw new Error("generic Telegram native start must remain unreachable");
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
      body: JSON.stringify({ url: TELEGRAM_URL, language_hint: "auto" })
    });
    assert.equal(preflight.status, 400);
    const preflightBody = await preflight.json() as { error?: { code?: string } };
    assert.equal(preflightBody.error?.code, "TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED");

    const start = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        url: TELEGRAM_URL,
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      })
    });
    assert.equal(start.status, 409);
    const startBody = await start.json() as { error?: { code?: string } };
    assert.equal(startBody.error?.code, "TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED");
    assert.equal(preflightCalls, 0);
    assert.equal(nativeCalls, 0);
  } finally {
    await close(server);
  }
});

test("Telegram capability remains public retrieval with zero retrieval credits", () => {
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true
  } as unknown as ManagedMediaService;
  const { capability } = createManagedMediaHttpHandler(CONFIG, service);
  assert.equal(capability.telegram_public_retrieval, true);
  assert.equal(capability.telegram_retrieval_provider, "telegram_public_web");
  assert.equal(capability.telegram_retrieval_credits, 0);
});

test("R3-E4 scoped bearer can reach only public Telegram start", async () => {
  let telegramStarts = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async startTelegram(input: { url: string }) {
      telegramStarts += 1;
      return {
        job_id: "KRCM_r3e4-telegram",
        source_url: input.url,
        status: "COMPLETED",
        provider: "assemblyai",
        provider_mode: "telegram_public_stt",
        retrieval_provider: "telegram_public_web",
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
    const start = await fetch(`${baseUrl}/api/v1/media/managed/telegram`, {
      method: "POST",
      headers: r3e4Headers(),
      body: JSON.stringify({ url: TELEGRAM_URL, language_hint: "auto" })
    });
    assert.equal(start.status, 200);
    assert.equal(telegramStarts, 1);

    const facebook = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: r3e4Headers(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/636216875539019/",
        language_hint: "auto"
      })
    });
    assert.equal(facebook.status, 403);

    const native = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: r3e4Headers(),
      body: JSON.stringify({ url: TELEGRAM_URL })
    });
    assert.equal(native.status, 403);
    assert.equal(telegramStarts, 1);
  } finally {
    await close(server);
  }
});

test("R3-E4 scoped bearer supports Telegram lookup and blocks cross-platform jobs", async () => {
  const telegramJob = { job_id: "KRCM_tg", source_url: TELEGRAM_URL, status: "COMPLETED" };
  const facebookJob = {
    job_id: "KRCM_fb",
    source_url: "https://www.facebook.com/reel/636216875539019/",
    status: "COMPLETED"
  };
  let lookupCalls = 0;
  let pageCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async lookup(input: { url: string }) {
      lookupCalls += 1;
      assert.equal(input.url, TELEGRAM_URL);
      return null;
    },
    async get(jobId: string) {
      if (jobId === "KRCM_tg") return telegramJob;
      if (jobId === "KRCM_fb") return facebookJob;
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
    const lookup = await fetch(`${baseUrl}/api/v1/media/managed/lookup`, {
      method: "POST",
      headers: r3e4Headers(),
      body: JSON.stringify({ url: TELEGRAM_URL, language_hint: "auto" })
    });
    assert.equal(lookup.status, 404);
    assert.equal(lookupCalls, 1);

    const crossLookup = await fetch(`${baseUrl}/api/v1/media/managed/lookup`, {
      method: "POST",
      headers: r3e4Headers(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/636216875539019/",
        language_hint: "auto"
      })
    });
    assert.equal(crossLookup.status, 403);
    assert.equal(lookupCalls, 1);

    const telegramStatus = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_tg`,
      { headers: r3e4Headers() }
    );
    assert.equal(telegramStatus.status, 200);

    const facebookStatus = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_fb`,
      { headers: r3e4Headers() }
    );
    assert.equal(facebookStatus.status, 403);

    const telegramSegments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_tg/segments`,
      { headers: r3e4Headers() }
    );
    assert.equal(telegramSegments.status, 200);

    const facebookSegments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/KRCM_fb/segments`,
      { headers: r3e4Headers() }
    );
    assert.equal(facebookSegments.status, 403);
    assert.equal(pageCalls, 1);
  } finally {
    await close(server);
  }
});
