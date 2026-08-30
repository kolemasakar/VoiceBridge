import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";

const ACTION_TOKEN = "managed-action-token-1234567890";
const ACCESS_CODE = "abcdefghijkl";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-123456789",
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
