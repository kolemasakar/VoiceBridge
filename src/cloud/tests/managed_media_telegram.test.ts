import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagedTelegramPipeline } from "../src/telegram_managed_pipeline.js";
import type { TelegramPublicMediaAsset } from "../src/telegram_public_retrieval.js";
import { ManagedMediaService } from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const ACCESS_CODE = "abcdefghijkl";
const TELEGRAM_URL = "https://t.me/techcrimes/12101";

class FakeTelegramPipeline implements ManagedTelegramPipeline {
  readonly configured = true;
  retrieveCalls = 0;
  sttCalls = 0;

  constructor(private readonly failRetrieval = false) {}

  async retrieve(sourceUrl: string): Promise<TelegramPublicMediaAsset> {
    this.retrieveCalls += 1;
    if (this.failRetrieval) {
      throw new MediaTranscriptError(
        "TELEGRAM_MEDIA_UNAVAILABLE",
        "public Telegram media unavailable",
        422,
        false
      );
    }
    return {
      source_url: sourceUrl,
      media_url: "https://cdn4.cdn-telegram.org/file/test.mp4?token=test",
      duration_seconds: 16,
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
    reserveSttSeconds(16);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "uk",
      language_confidence: 0.98,
      duration_seconds: 16,
      transcript_text: "Telegram managed transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: 16000,
        text: "Telegram managed transcript",
        confidence: 0.97
      }]
    };
  }
}

test("A9.9 Telegram managed path completes durably with zero retrieval credits", async () => {
  const pipeline = new FakeTelegramPipeline();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { telegramPipeline: pipeline }
  );
  const input = {
    url: TELEGRAM_URL,
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };
  const completed = await service.startTelegram(input);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.provider, "assemblyai");
  assert.equal(completed.provider_mode, "telegram_public_retrieval_stt");
  assert.equal(completed.retrieval_provider, "telegram_public_web");
  assert.equal(completed.retrieval_credits_charged, 0);
  assert.equal(completed.credits_charged, 0);
  assert.equal(completed.stt_seconds_charged, 16);
  assert.equal(completed.segment_count, 1);
  assert.equal(completed.provider_data_deleted, true);
  assert.equal(pipeline.retrieveCalls, 1);
  assert.equal(pipeline.sttCalls, 1);

  const page = await service.page(completed.job_id, 0, 20);
  assert.ok(page);
  assert.equal(page.status, "COMPLETED");
  assert.equal(page.segments.length, 1);
  assert.equal(page.segments[0]?.text, "Telegram managed transcript");

  const duplicate = await service.startTelegram(input);
  assert.equal(duplicate.job_id, completed.job_id);
  assert.equal(duplicate.reused, true);
  assert.equal(pipeline.retrieveCalls, 1);
  assert.equal(pipeline.sttCalls, 1);
});

test("A9.9 Telegram unavailable is terminal durable state and duplicate does not retry", async () => {
  const pipeline = new FakeTelegramPipeline(true);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { telegramPipeline: pipeline }
  );
  const input = {
    url: TELEGRAM_URL,
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };
  const failed = await service.startTelegram(input);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error?.code, "TELEGRAM_MEDIA_UNAVAILABLE");
  assert.equal(failed.error?.retryable, false);
  assert.equal(failed.retrieval_credits_charged, 0);
  assert.equal(pipeline.retrieveCalls, 1);
  assert.equal(pipeline.sttCalls, 0);

  const duplicate = await service.startTelegram(input);
  assert.equal(duplicate.job_id, failed.job_id);
  assert.equal(duplicate.status, "FAILED");
  assert.equal(duplicate.reused, true);
  assert.equal(pipeline.retrieveCalls, 1);
  assert.equal(pipeline.sttCalls, 0);
});
