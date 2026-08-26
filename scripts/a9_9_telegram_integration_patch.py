from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE = ROOT / "src/cloud/src/managed_media_service.ts"
HTTP = ROOT / "src/cloud/src/managed_media_http.ts"
RETRIEVER = ROOT / "src/cloud/src/telegram_public_retrieval.ts"
SERVICE_TEST = ROOT / "src/cloud/tests/managed_media_telegram.test.ts"
HTTP_TEST = ROOT / "src/cloud/tests/managed_media_telegram_http.test.ts"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor is not unique in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    SERVICE,
    '''import {
  isManagedFacebookFreeRetrievalFailure,
  type ManagedFacebookPipeline
} from "./facebook_managed_pipeline.js";
''',
    '''import {
  isManagedFacebookFreeRetrievalFailure,
  type ManagedFacebookPipeline
} from "./facebook_managed_pipeline.js";
import type { ManagedTelegramPipeline } from "./telegram_managed_pipeline.js";
''',
)

replace_once(
    SERVICE,
    '  provider_mode: "native" | "generate" | "facebook_retrieval_stt";\n',
    '''  provider_mode:
    | "native"
    | "generate"
    | "facebook_retrieval_stt"
    | "telegram_public_retrieval_stt";
''',
)

replace_once(
    SERVICE,
    '  retrieval_provider?: "cobalt" | "scrapecreators" | null;\n',
    '  retrieval_provider?: "cobalt" | "scrapecreators" | "telegram_public_web" | null;\n',
)

replace_once(
    SERVICE,
    '''export interface ManagedMediaServiceOptions {
  store?: ManagedMediaJobStore;
  jobTtlSeconds?: number;
  facebookPipeline?: ManagedFacebookPipeline;
}
''',
    '''export interface ManagedMediaServiceOptions {
  store?: ManagedMediaJobStore;
  jobTtlSeconds?: number;
  facebookPipeline?: ManagedFacebookPipeline;
  telegramPipeline?: ManagedTelegramPipeline;
}
''',
)

replace_once(
    SERVICE,
    '''export function managedFacebookFallbackRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `facebook-retrieval-stt|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}
''',
    '''export function managedFacebookFallbackRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `facebook-retrieval-stt|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}

export function managedTelegramRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `telegram-public-retrieval-stt|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}
''',
)

replace_once(
    SERVICE,
    '''  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;
  private readonly facebookPipeline: ManagedFacebookPipeline | null;
  private readonly store: ManagedMediaJobStore;
''',
    '''  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;
  private readonly facebookPipeline: ManagedFacebookPipeline | null;
  private readonly telegramPipeline: ManagedTelegramPipeline | null;
  private readonly store: ManagedMediaJobStore;
''',
)

replace_once(
    SERVICE,
    '''    this.facebookPipeline = options.facebookPipeline ?? null;
    this.store = options.store || new ManagedMediaMemoryStore();
''',
    '''    this.facebookPipeline = options.facebookPipeline ?? null;
    this.telegramPipeline = options.telegramPipeline ?? null;
    this.store = options.store || new ManagedMediaMemoryStore();
''',
)

replace_once(
    SERVICE,
    '''    this.configured = betaGate.configured && Boolean(
      this.transcriptProvider !== null || this.facebookPipeline?.configured
    );
''',
    '''    this.configured = betaGate.configured && Boolean(
      this.transcriptProvider !== null ||
      this.facebookPipeline?.configured ||
      this.telegramPipeline?.configured
    );
''',
)

replace_once(
    SERVICE,
    '''  private authorizeAiProvider(): void {
''',
    '''  private authorizeTelegramPipeline(accessCode: string): void {
    this.authorizeAccess(accessCode);
    if (!this.telegramPipeline?.configured) {
      throw new MediaTranscriptError(
        "TELEGRAM_MANAGED_PIPELINE_NOT_CONFIGURED",
        "The managed Telegram public retrieval and STT path is not configured.",
        503,
        false
      );
    }
  }

  private authorizeAiProvider(): void {
''',
)

telegram_method = '''  async startTelegram(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaJobView> {
    this.authorizeTelegramPipeline(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    if (managedMediaPlatform(sourceUrl) !== "telegram") {
      throw new MediaTranscriptError(
        "TELEGRAM_MEDIA_URL_REQUIRED",
        "The managed Telegram path accepts only public Telegram post URLs.",
        422,
        false
      );
    }
    const requestKey = managedTelegramRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    const existing = await this.reusableRecord(requestKey);
    if (existing) return this.publicJob(existing.job, true);

    const now = new Date().toISOString();
    const job: ManagedMediaJobView = {
      job_id: `KRCM_${randomUUID()}`,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "assemblyai",
      provider_mode: "telegram_public_retrieval_stt",
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 0,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: false,
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      retrieval_provider: "telegram_public_web",
      retrieval_credits_charged: 0,
      stt_seconds_charged: 0,
      provider_data_deleted: null,
      language_confidence: null,
      error: null
    };
    const record: ManagedMediaStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiryFrom(now, job)
    };
    const reservation = await this.store.reserve(record);
    if (!reservation.created) {
      const resolved = reservation.record.job.status === "PROCESSING" &&
        !this.inFlight.has(requestKey)
        ? await this.interruptedRecord(reservation.record)
        : reservation.record;
      return this.publicJob(resolved.job, true);
    }

    this.inFlight.add(requestKey);
    try {
      const asset = await this.telegramPipeline!.retrieve(sourceUrl);
      const stt = await this.telegramPipeline!.transcribe(
        asset,
        input.language_hint,
        (seconds) => {
          const quota = this.betaGate.reserveSttSeconds(seconds);
          if (!quota.allowed) {
            throw new MediaTranscriptError(
              "MEDIA_BETA_STT_QUOTA_EXHAUSTED",
              "The closed MEDIA BETA daily STT quota is exhausted.",
              429,
              false
            );
          }
        }
      );
      const updatedAt = new Date().toISOString();
      const completed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "COMPLETED",
          updated_at: updatedAt,
          detected_language: stt.detected_language,
          available_languages: stt.detected_language ? [stt.detected_language] : [],
          credits_charged: 0,
          credits_remaining_estimate: 0,
          credit_charge_uncertain: false,
          segment_count: stt.segments.length,
          transcript_characters: stt.transcript_text.length,
          media_duration_seconds: stt.duration_seconds,
          retrieval_provider: "telegram_public_web",
          retrieval_credits_charged: 0,
          stt_seconds_charged: Math.ceil(stt.duration_seconds),
          provider_data_deleted: stt.provider_data_deleted,
          language_confidence: stt.language_confidence,
          error: null
        },
        segments: stt.segments.map((segment) => ({ ...segment })),
        expiresAt: this.expiryFrom(updatedAt, job)
      };
      completed.expiresAt = this.expiryFrom(updatedAt, completed.job);
      await this.store.put(completed);
      return this.publicJob(completed.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "TELEGRAM_MANAGED_PIPELINE_FAILED",
          "Managed Telegram public-media processing failed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "FAILED",
          updated_at: updatedAt,
          credit_charge_uncertain: false,
          retrieval_provider: "telegram_public_web",
          retrieval_credits_charged: 0,
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: false
          }
        },
        expiresAt: this.expiryFrom(updatedAt, job)
      };
      await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

'''
replace_once(
    SERVICE,
    '''  async startFacebookFallback(
''',
    telegram_method + '''  async startFacebookFallback(
''',
)

replace_once(
    HTTP,
    '''import {
  AssemblyAiFacebookMediaStt,
  DefaultManagedFacebookPipeline
} from "./facebook_managed_pipeline.js";
''',
    '''import {
  AssemblyAiFacebookMediaStt,
  DefaultManagedFacebookPipeline
} from "./facebook_managed_pipeline.js";
import {
  AssemblyAiTelegramMediaStt,
  DefaultManagedTelegramPipeline
} from "./telegram_managed_pipeline.js";
import { TelegramPublicWebRetriever } from "./telegram_public_retrieval.js";
''',
)

replace_once(
    HTTP,
    '''const FACEBOOK_FALLBACK = `${ROOT}/facebook-fallback`;
''',
    '''const FACEBOOK_FALLBACK = `${ROOT}/facebook-fallback`;
const TELEGRAM_PUBLIC = `${ROOT}/telegram`;
''',
)

replace_once(
    HTTP,
    '''  const facebookPipeline = new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    new AssemblyAiFacebookMediaStt(config.assemblyAiApiKey)
  );
''',
    '''  const facebookPipeline = new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    new AssemblyAiFacebookMediaStt(config.assemblyAiApiKey)
  );
  const telegramPipeline = new DefaultManagedTelegramPipeline(
    new TelegramPublicWebRetriever(),
    new AssemblyAiTelegramMediaStt(config.assemblyAiApiKey)
  );
''',
)

replace_once(
    HTTP,
    '''      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
      facebookPipeline
''',
    '''      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
      facebookPipeline,
      telegramPipeline
''',
)

replace_once(
    HTTP,
    '''    platforms: ["youtube", "instagram", "facebook"],
''',
    '''    platforms: ["youtube", "instagram", "facebook", "telegram"],
''',
)

replace_once(
    HTTP,
    '''    facebook_stt_provider: "assemblyai",
    facebook_stt_configured: Boolean(config.assemblyAiApiKey),
''',
    '''    facebook_stt_provider: "assemblyai",
    facebook_stt_configured: Boolean(config.assemblyAiApiKey),
    telegram_public_retrieval: true,
    telegram_retrieval_provider: "telegram_public_web",
    telegram_retrieval_credits: 0,
    telegram_stt_provider: "assemblyai",
    telegram_stt_configured: Boolean(config.assemblyAiApiKey),
''',
)

telegram_route = '''      if (method === "POST" && path === TELEGRAM_PUBLIC) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The managed Telegram public-media request is not valid.",
            400,
            false
          );
        }
        const job = await service.startTelegram(input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

'''
replace_once(
    HTTP,
    '''if (method === "POST" && path === FACEBOOK_FALLBACK) {
''',
    telegram_route + '''if (method === "POST" && path === FACEBOOK_FALLBACK) {
''',
)

replace_once(
    RETRIEVER,
    '''    if (!response.ok) {
''',
    '''    if (response.url) {
      try {
        const finalUrl = new URL(response.url);
        if (!["t.me", "telegram.me"].includes(finalUrl.hostname.toLowerCase())) {
          throw new TelegramMediaRetrievalError(
            "TELEGRAM_MEDIA_UNAVAILABLE",
            "The Telegram public preview redirected outside the trusted Telegram web surface.",
            422,
            false
          );
        }
      } catch (error) {
        if (error instanceof TelegramMediaRetrievalError) throw error;
        throw new TelegramMediaRetrievalError(
          "TELEGRAM_MEDIA_UNAVAILABLE",
          "The Telegram public preview returned an invalid final URL.",
          422,
          false
        );
      }
    }

    if (!response.ok) {
''',
)

SERVICE_TEST.write_text('''import assert from "node:assert/strict";
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
''', encoding="utf-8")

HTTP_TEST.write_text('''import assert from "node:assert/strict";
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
''', encoding="utf-8")

print("A9.9 Telegram managed integration patch applied")
