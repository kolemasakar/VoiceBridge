import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";

const ACTION_TOKEN = "managed-action-token-cross-route-123456";
const ACCESS_CODE = "owner-cross-route-2026";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";
const TELEGRAM_URL = "https://t.me/techcrimes/12101";
const INSTAGRAM_URL = "https://www.instagram.com/reel/DEDbGqpyfkT/";
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-cross-route-123456",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaDailySttSeconds: 7200,
  mediaMaxDurationSeconds: 3600,
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

async function post(
  base: string,
  path: string,
  body: unknown
): Promise<{ status: number; code: string | null }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  const payload = await response.json() as { error?: { code?: string } };
  return {
    status: response.status,
    code: payload.error?.code ?? null
  };
}

test("cross-route negative matrix rejects foreign platform ingress before service/provider/store work", async () => {
  const calls = {
    preflight: 0,
    lookup: 0,
    startNative: 0,
    startTelegram: 0,
    startFacebookFallback: 0,
    startAttachment: 0
  };
  const blocked = (name: keyof typeof calls) => async () => {
    calls[name] += 1;
    throw new Error(`${name} must remain unreachable for negative routing matrix`);
  };
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    preflight: blocked("preflight"),
    lookup: blocked("lookup"),
    startNative: blocked("startNative"),
    startTelegram: blocked("startTelegram"),
    startFacebookFallback: blocked("startFacebookFallback"),
    startAttachment: blocked("startAttachment")
  } as unknown as ManagedMediaService;

  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);

  try {
    for (const [url, expected] of [
      [FACEBOOK_URL, "FACEBOOK_FREE_RETRIEVAL_REQUIRED"],
      [TELEGRAM_URL, "TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED"]
    ] as const) {
      const preflight = await post(base, "/api/v1/media/managed/preflight", {
        url,
        language_hint: "auto"
      });
      assert.equal(preflight.status, 400);
      assert.equal(preflight.code, expected);

      const lookup = await post(base, "/api/v1/media/managed/lookup", {
        url,
        language_hint: "auto"
      });
      assert.equal(lookup.status, 400);
      assert.equal(lookup.code, expected);

      const start = await post(base, "/api/v1/media/managed/transcriptions", {
        url,
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      });
      assert.equal(start.status, 409);
      assert.equal(start.code, expected);
    }

    for (const url of [FACEBOOK_URL, INSTAGRAM_URL, YOUTUBE_URL]) {
      const result = await post(base, "/api/v1/media/managed/telegram", {
        url,
        language_hint: "auto"
      });
      assert.equal(result.status, 422);
      assert.equal(result.code, "TELEGRAM_MEDIA_URL_REQUIRED");
    }

    for (const url of [TELEGRAM_URL, INSTAGRAM_URL, YOUTUBE_URL]) {
      const result = await post(base, "/api/v1/media/managed/facebook-fallback", {
        url,
        language_hint: "auto"
      });
      assert.equal(result.status, 422);
      assert.equal(result.code, "MEDIA_AI_SOURCE_NOT_SUPPORTED");
    }

    const attachmentUrlInjection = await post(base, "/api/v1/media/managed/attachment", {
      url: TELEGRAM_URL,
      language_hint: "auto"
    });
    assert.equal(attachmentUrlInjection.status, 400);
    assert.equal(attachmentUrlInjection.code, "INVALID_REQUEST");

    const attachmentPlaceholder = await post(base, "/api/v1/media/managed/attachment", {
      openaiFileIdRefs: ["literal-placeholder"],
      language_hint: "auto"
    });
    assert.equal(attachmentPlaceholder.status, 400);
    assert.equal(attachmentPlaceholder.code, "INVALID_REQUEST");

    assert.deepEqual(calls, {
      preflight: 0,
      lookup: 0,
      startNative: 0,
      startTelegram: 0,
      startFacebookFallback: 0,
      startAttachment: 0
    });
  } finally {
    await close(server);
  }
});
