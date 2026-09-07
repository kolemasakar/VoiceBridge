import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";

const ACTION_TOKEN = "managed-action-token-telegram-123456";
const ACCESS_CODE = "abcdefghijkl";
const TELEGRAM_URL = "https://t.me/techcrimes/12101";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-telegram-123456",
  mediaActionToken: ACTION_TOKEN,
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
