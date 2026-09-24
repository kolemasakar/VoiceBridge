import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import type { ManagedTelegramPipeline } from "../src/telegram_managed_pipeline.js";
import type { TelegramPublicMediaAsset } from "../src/telegram_public_retrieval.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import { ManagedMediaService } from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";

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

class FakeTelegramPipeline implements ManagedTelegramPipeline {
  readonly configured = true;
  retrieveCalls = 0;
  sttCalls = 0;

  async retrieve(sourceUrl: string): Promise<TelegramPublicMediaAsset> {
    this.retrieveCalls += 1;
    return {
      source_url: sourceUrl,
      media_url: "https://cdn4.cdn-telegram.org/file/test.mp4?token=test",
      duration_seconds: 12,
      provider: "telegram_public_web",
      provider_mode: "telegram_post",
      credits_charged: 0
    };
  }

  async transcribe(
    _asset: TelegramPublicMediaAsset,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void
  ) {
    this.sttCalls += 1;
    reserveSttSeconds(12);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "en",
      language_confidence: 0.96,
      duration_seconds: 12,
      transcript_text: "Telegram HTTP transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: 12000,
        text: "Telegram HTTP transcript",
        confidence: 0.95
      }]
    };
  }
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

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${ACTION_TOKEN}`,
    "content-type": "application/json"
  };
}

test("A9.9 managed Telegram HTTP route is zero-client and reuses common job/segment reads", async () => {
  const pipeline = new FakeTelegramPipeline();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { telegramPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer((request, response) => {
    void handler.handle(request, response);
  });
  const base = await listen(server);
  try {
    const capabilityResponse = await fetch(`${base}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as Record<string, unknown>;
    assert.deepEqual(capability.platforms, ["youtube", "instagram", "facebook", "telegram"]);
    assert.equal(capability.telegram_public_retrieval, true);
    assert.equal(capability.telegram_retrieval_provider, "telegram_public_web");
    assert.equal(capability.telegram_retrieval_credits, 0);

    const startResponse = await fetch(`${base}/api/v1/media/managed/telegram`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ url: TELEGRAM_URL, language_hint: "auto" })
    });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json() as Record<string, unknown>;
    assert.equal(started.status, "COMPLETED");
    assert.equal(started.provider_mode, "telegram_public_retrieval_stt");
    assert.equal(started.retrieval_provider, "telegram_public_web");
    assert.equal(started.retrieval_credits_charged, 0);
    const jobId = String(started.job_id);

    const getResponse = await fetch(`${base}/api/v1/media/managed/transcriptions/${jobId}`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(getResponse.status, 200);
    const job = await getResponse.json() as Record<string, unknown>;
    assert.equal(job.status, "COMPLETED");

    const segmentsResponse = await fetch(
      `${base}/api/v1/media/managed/transcriptions/${jobId}/segments?cursor=0&limit=20`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}` } }
    );
    assert.equal(segmentsResponse.status, 200);
    const page = await segmentsResponse.json() as { segments?: Array<{ text?: string }> };
    assert.equal(page.segments?.[0]?.text, "Telegram HTTP transcript");
    assert.equal(pipeline.retrieveCalls, 1);
    assert.equal(pipeline.sttCalls, 1);
  } finally {
    await close(server);
  }
});
