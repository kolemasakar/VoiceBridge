import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import type { ManagedMediaService } from "../src/managed_media_service.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const ACTION_TOKEN = "r2b-public-action-token-2026-0123456789";
const ACCESS_CODE = "r2b-public-derived-owner-code-2026";

const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const INSTAGRAM_URL = "https://www.instagram.com/reel/DEDbGqpyfkT/";
const TELEGRAM_URL = "https://t.me/techcrimes/12101";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "r2b-test-access-token-2026-0123456789",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaPublicMode: true,
  mediaFreeTierOnly: true,
  mediaAssemblyAiFreeTrialOnly: true,
  mediaDailySttSeconds: 7200,
  mediaMaxDurationSeconds: 3600,
  mediaMaxConcurrentJobs: 1,
  assemblyAiApiKey: "assemblyai-free-trial-fixture",
  supadataApiKey: "supadata-free-fixture",
  cobaltEndpoint: "https://cobalt.example.test",
  scrapeCreatorsApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 60
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

function headers(token = ACTION_TOKEN): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    connection: "close"
  };
}

async function post(
  base: string,
  path: string,
  body: unknown,
  token = ACTION_TOKEN
): Promise<{ status: number; code: string | null }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(body)
  });
  const payload = await response.json() as { error?: { code?: string } };
  return { status: response.status, code: payload.error?.code ?? null };
}

async function health(base: string): Promise<number> {
  const response = await fetch(`${base}/api/v1/health`, {
    headers: { connection: "close" }
  });
  return response.status;
}

function mediaError(code: string, message: string, status = 503): never {
  throw new MediaTranscriptError(code, message, status, false);
}

test("R2-B public MEDIA failure matrix fails closed while Core health remains available", async () => {
  const calls = {
    startNative: 0,
    startTelegram: 0,
    startFacebookFallback: 0
  };

  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    async startNative(input: { url: string }) {
      calls.startNative += 1;
      if (input.url.includes("dbfail")) {
        return mediaError(
          "MEDIA_DURABLE_STORE_UNAVAILABLE",
          "Durable MEDIA state is unavailable."
        );
      }
      return mediaError(
        "MANAGED_PROVIDER_CREDITS_EXHAUSTED",
        "The free provider credit pool is exhausted.",
        429
      );
    },
    async startTelegram() {
      calls.startTelegram += 1;
      return mediaError(
        "TELEGRAM_RETRIEVAL_UNAVAILABLE",
        "Public Telegram retrieval is unavailable."
      );
    },
    async startFacebookFallback() {
      calls.startFacebookFallback += 1;
      return mediaError(
        "FACEBOOK_RETRIEVAL_UNAVAILABLE",
        "Free Cobalt retrieval is unavailable; paid fallback is disabled."
      );
    }
  } as unknown as ManagedMediaService;

  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    if (request.url === "/api/v1/health") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);

  try {
    assert.equal(await health(base), 200);

    const authDenied = await post(
      base,
      "/api/v1/media/managed/transcriptions",
      {
        url: YOUTUBE_URL,
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      },
      "invalid-public-action-token-2026"
    );
    assert.equal(authDenied.status, 401);
    assert.ok([
      "AUTHENTICATION_REQUIRED",
      "AUTHENTICATION_FAILED"
    ].includes(authDenied.code ?? ""));
    assert.equal(calls.startNative, 0);
    assert.equal(await health(base), 200);

    for (const url of [YOUTUBE_URL, INSTAGRAM_URL]) {
      const exhausted = await post(
        base,
        "/api/v1/media/managed/transcriptions",
        {
          url,
          language_hint: "auto",
          credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
        }
      );
      assert.equal(exhausted.status, 429);
      assert.equal(exhausted.code, "MANAGED_PROVIDER_CREDITS_EXHAUSTED");
      assert.equal(await health(base), 200);
    }

    const telegramUnavailable = await post(
      base,
      "/api/v1/media/managed/telegram",
      { url: TELEGRAM_URL, language_hint: "auto" }
    );
    assert.equal(telegramUnavailable.status, 503);
    assert.equal(telegramUnavailable.code, "TELEGRAM_RETRIEVAL_UNAVAILABLE");
    assert.equal(await health(base), 200);

    const facebookUnavailable = await post(
      base,
      "/api/v1/media/managed/facebook-fallback",
      { url: FACEBOOK_URL, language_hint: "auto" }
    );
    assert.equal(facebookUnavailable.status, 503);
    assert.equal(facebookUnavailable.code, "FACEBOOK_RETRIEVAL_UNAVAILABLE");
    assert.equal(await health(base), 200);

    const durableStoreUnavailable = await post(
      base,
      "/api/v1/media/managed/transcriptions",
      {
        url: "https://www.youtube.com/watch?v=dbfail123",
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      }
    );
    assert.equal(durableStoreUnavailable.status, 503);
    assert.equal(durableStoreUnavailable.code, "MEDIA_DURABLE_STORE_UNAVAILABLE");
    assert.equal(await health(base), 200);

    const unsupported = await post(
      base,
      "/api/v1/media/managed/transcriptions",
      {
        url: "https://example.com/video.mp4",
        language_hint: "auto",
        credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
      }
    );
    assert.equal(unsupported.status, 409);
    assert.equal(unsupported.code, "MEDIA_CREDIT_CONSENT_REQUIRED");
    assert.equal(await health(base), 200);

    assert.equal(calls.startNative, 3);
    assert.equal(calls.startTelegram, 1);
    assert.equal(calls.startFacebookFallback, 1);
  } finally {
    await close(server);
  }
});
