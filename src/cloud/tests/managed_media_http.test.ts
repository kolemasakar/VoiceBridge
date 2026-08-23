import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import type { ManagedFacebookPipeline } from "../src/facebook_managed_pipeline.js";
import type {
  FacebookMediaAsset,
  FacebookRetrievalCreditConsent
} from "../src/facebook_media_retrieval.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import {
  ManagedMediaService,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";
import { createManagedVoiceBridgeServer } from "../src/managed_server.js";

const ACTION_TOKEN = "managed-action-token-1234567890";
const TEST_TOKEN = "voicebridge-test-token-123456789";
const ACCESS_CODE = "abcdefghijkl";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: TEST_TOKEN,
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

class FakeManagedProvider implements ManagedNativeTranscriptProvider {
  transcriptCalls = 0;

  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 23,
      remaining_credits: 77,
      estimated_credits: 1 as const,
      remaining_after_estimate: 76,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getNativeTranscript() {
    this.transcriptCalls += 1;
    return {
      status: "completed" as const,
      language: "uk",
      available_languages: ["uk"],
      segments: [
        {
          index: 0,
          start_ms: 1200,
          end_ms: 3100,
          text: "Managed test segment",
          confidence: null
        }
      ],
      transcript_text: "Managed test segment",
      billable_credits: 1
    };
  }
}

class FakeAiManagedProvider implements ManagedNativeTranscriptProvider {
  nativeCalls = 0;
  aiCalls = 0;

  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 3,
      remaining_credits: 97,
      estimated_credits: 1 as const,
      remaining_after_estimate: 96,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getNativeTranscript() {
    this.nativeCalls += 1;
    return {
      status: "unavailable" as const,
      billable_credits: 1
    };
  }

  async quoteGenerateInstagramReel() {
    return {
      provider: "supadata" as const,
      mode: "generate" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 4,
      remaining_credits: 96,
      estimated_credits: 40,
      maximum_credits: 40,
      credits_per_minute: 2,
      maximum_duration_minutes: 20,
      remaining_after_estimate: 56,
      conservative_maximum: true as const,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getGeneratedTranscript() {
    this.aiCalls += 1;
    return {
      status: "completed" as const,
      language: "en",
      available_languages: ["en"],
      segments: [
        {
          index: 0,
          start_ms: 0,
          end_ms: 18000,
          text: "AI managed segment",
          confidence: null
        }
      ],
      transcript_text: "AI managed segment",
      billable_credits: 2
    };
  }
}


class FakeFacebookPipeline implements ManagedFacebookPipeline {
  readonly configured = true;
  freeCalls = 0;
  paidCalls = 0;
  sttCalls = 0;

  constructor(private readonly freeSucceeds: boolean) {}

  async freeRetrieve(sourceUrl: string): Promise<FacebookMediaAsset | null> {
    this.freeCalls += 1;
    if (!this.freeSucceeds) return null;
    return {
      source_url: sourceUrl,
      media_url: "https://media.example/free-facebook.mp4",
      duration_seconds: 12,
      provider: "cobalt",
      provider_mode: "self_hosted",
      credits_charged: 0,
      credits_remaining: null,
      cached: false
    };
  }

  async paidRetrieve(
    sourceUrl: string,
    consent: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset> {
    this.paidCalls += 1;
    assert.deepEqual(consent, {
      provider: "scrapecreators",
      mode: "facebook_post",
      max_credits: 1
    });
    return {
      source_url: sourceUrl,
      media_url: "https://media.example/paid-facebook.mp4",
      duration_seconds: 18,
      provider: "scrapecreators",
      provider_mode: "facebook_post",
      credits_charged: 1,
      credits_remaining: 41,
      cached: false
    };
  }

  async transcribe(
    asset: FacebookMediaAsset,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void
  ) {
    this.sttCalls += 1;
    const duration = asset.duration_seconds ?? 10;
    reserveSttSeconds(duration);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "uk",
      language_confidence: 0.97,
      duration_seconds: duration,
      transcript_text: "Managed Facebook HTTP fallback transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: Math.ceil(duration * 1000),
        text: "Managed Facebook HTTP fallback transcript",
        confidence: 0.95
      }]
    };
  }
}

function actionHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${ACTION_TOKEN}`,
    "content-type": "application/json",
    connection: "close"
  };
}

test("managed HTTP injects owner access after Action auth and preserves credit consent gate", async () => {
  const provider = new FakeManagedProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
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
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://youtu.be/abc123",
        language_hint: "auto"
      })
    });
    assert.equal(preflight.status, 200);
    const quote = await preflight.json() as Record<string, unknown>;
    assert.equal(quote.credits_available, 77);
    assert.equal(quote.estimated_credits, 1);
    assert.equal(quote.credits_after_estimate, 76);
    assert.deepEqual(quote.consent_options, { approve: 1, reject: 2 });
    assert.equal(provider.transcriptCalls, 0);

    const denied = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://youtu.be/abc123",
        language_hint: "auto"
      })
    });
    assert.equal(denied.status, 409);
    const deniedBody = await denied.json() as {
      error?: { code?: string };
    };
    assert.equal(deniedBody.error?.code, "MEDIA_CREDIT_CONSENT_REQUIRED");
    assert.equal(provider.transcriptCalls, 0);

    const approved = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://youtu.be/abc123",
        language_hint: "auto",
        credit_consent: {
          provider: "supadata",
          mode: "native",
          max_credits: 1
        }
      })
    });
    assert.equal(approved.status, 200);
    const job = await approved.json() as Record<string, unknown>;
    assert.equal(job.status, "COMPLETED");
    assert.equal(job.credits_charged, 1);
    assert.equal(job.credits_remaining_estimate, 76);
    assert.equal(provider.transcriptCalls, 1);

    const jobId = String(job.job_id);
    const segments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/segments`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
    );
    assert.equal(segments.status, 200);
    const page = await segments.json() as { segments?: unknown[] };
    assert.equal(page.segments?.length, 1);
  } finally {
    await close(server);
  }
});

test("managed HTTP exposes AI preflight and requires a separate 40-credit consent", async () => {
  const provider = new FakeAiManagedProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const nativeStart = await fetch(`${baseUrl}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://www.instagram.com/reel/ABC123/?igsh=tracking",
        language_hint: "auto",
        credit_consent: {
          provider: "supadata",
          mode: "native",
          max_credits: 1
        }
      })
    });
    assert.equal(nativeStart.status, 200);
    const nativeJob = await nativeStart.json() as Record<string, unknown>;
    assert.equal(nativeJob.status, "AWAITING_AI_CONSENT");
    assert.equal(provider.nativeCalls, 1);
    assert.equal(provider.aiCalls, 0);
    const jobId = String(nativeJob.job_id);

    const aiPreflight = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/ai-preflight`,
      {
        headers: {
          authorization: `Bearer ${ACTION_TOKEN}`,
          connection: "close"
        }
      }
    );
    assert.equal(aiPreflight.status, 200);
    const quote = await aiPreflight.json() as Record<string, unknown>;
    assert.equal(quote.mode, "generate");
    assert.equal(quote.credits_available, 96);
    assert.equal(quote.estimated_credits, 40);
    assert.equal(quote.maximum_credits, 40);
    assert.equal(quote.credits_after_estimate, 56);
    assert.equal(quote.credits_per_minute, 2);
    assert.equal(quote.maximum_duration_minutes, 20);
    assert.equal(provider.aiCalls, 0);

    const denied = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/ai`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify({})
      }
    );
    assert.equal(denied.status, 409);
    const deniedBody = await denied.json() as { error?: { code?: string } };
    assert.equal(deniedBody.error?.code, "MEDIA_AI_CREDIT_CONSENT_REQUIRED");
    assert.equal(provider.aiCalls, 0);

    const approved = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/ai`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify({
          credit_consent: {
            provider: "supadata",
            mode: "generate",
            max_credits: 40
          }
        })
      }
    );
    assert.equal(approved.status, 200);
    const completed = await approved.json() as Record<string, unknown>;
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.provider_mode, "generate");
    assert.equal(completed.credits_charged, 3);
    assert.equal(completed.credits_remaining_estimate, 94);
    assert.equal(completed.segment_count, 1);
    assert.equal(provider.aiCalls, 1);

    const duplicate = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/ai`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify({
          credit_consent: {
            provider: "supadata",
            mode: "generate",
            max_credits: 40
          }
        })
      }
    );
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json() as Record<string, unknown>;
    assert.equal(duplicateBody.reused, true);
    assert.equal(provider.aiCalls, 1);
  } finally {
    await close(server);
  }
});

test("managed HTTP still rejects missing or invalid Action bearer before owner code injection", async () => {
  const provider = new FakeManagedProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const missing = await fetch(`${baseUrl}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ url: "https://youtu.be/abc123" })
    });
    assert.equal(missing.status, 401);

    const invalid = await fetch(`${baseUrl}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: {
        authorization: "Bearer wrong-token",
        "content-type": "application/json",
        connection: "close"
      },
      body: JSON.stringify({ url: "https://youtu.be/abc123" })
    });
    assert.equal(invalid.status, 401);
    assert.equal(provider.transcriptCalls, 0);
  } finally {
    await close(server);
  }
});

test("managed server preserves legacy health and exposes disabled managed capability without key", async () => {
  const server = createManagedVoiceBridgeServer(CONFIG);
  const baseUrl = await listen(server);
  try {
    const health = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { connection: "close" }
    });
    assert.equal(health.status, 200);
    const healthBody = await health.json() as Record<string, unknown>;
    assert.equal(healthBody.status, "ok");

    const capability = await fetch(`${baseUrl}/api/v1/media/managed`, {
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        connection: "close"
      }
    });
    assert.equal(capability.status, 200);
    const capabilityBody = await capability.json() as Record<string, unknown>;
    assert.equal(capabilityBody.mode, "zero_client_managed_beta");
    assert.equal(capabilityBody.provider, "supadata");
    assert.equal(capabilityBody.configured, false);
    assert.equal(capabilityBody.explicit_user_consent_required, true);
    assert.equal(capabilityBody.automatic_ai_fallback, false);
    assert.equal(capabilityBody.instagram_reel_ai_fallback, true);
    assert.equal(capabilityBody.facebook_ai_fallback, true);
    assert.equal(capabilityBody.facebook_ai_requires_duration_metadata, true);
    assert.equal(capabilityBody.facebook_ai_metadata_credits, 1);
    assert.equal(capabilityBody.ai_requires_separate_preflight, true);
    assert.equal(capabilityBody.ai_requires_separate_user_consent, true);
    assert.equal(capabilityBody.ai_generate_credits_per_minute, 2);
    assert.equal(capabilityBody.instagram_reel_ai_max_credits, 40);
    assert.equal(capabilityBody.user_beta_access_code_required, false);
    assert.equal(capabilityBody.owner_access_injected_server_side, true);
  } finally {
    await close(server);
  }
});


test("managed HTTP free Facebook fallback completes through injected Cobalt and AssemblyAI adapters", async () => {
  const pipeline = new FakeFacebookPipeline(true);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    undefined,
    { facebookPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/1114235920664408/",
        language_hint: "auto"
      })
    });
    assert.equal(response.status, 200);
    const job = await response.json() as Record<string, unknown>;
    assert.equal(job.status, "COMPLETED");
    assert.equal(job.provider, "assemblyai");
    assert.equal(job.provider_mode, "facebook_retrieval_stt");
    assert.equal(job.retrieval_provider, "cobalt");
    assert.equal(job.retrieval_credits_charged, 0);
    assert.equal(job.stt_seconds_charged, 12);
    assert.equal(job.segment_count, 1);
    assert.equal(pipeline.freeCalls, 1);
    assert.equal(pipeline.paidCalls, 0);
    assert.equal(pipeline.sttCalls, 1);

    const segments = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${String(job.job_id)}/segments`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
    );
    assert.equal(segments.status, 200);
    const page = await segments.json() as { segments?: unknown[] };
    assert.equal(page.segments?.length, 1);
  } finally {
    await close(server);
  }
});

test("managed HTTP paid Facebook retrieval requires local preflight and exact one-credit consent", async () => {
  const pipeline = new FakeFacebookPipeline(false);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    undefined,
    { facebookPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const initial = await fetch(`${baseUrl}/api/v1/media/managed/facebook-fallback`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: "https://www.facebook.com/reel/1114235920664408/",
        language_hint: "auto"
      })
    });
    assert.equal(initial.status, 200);
    const waiting = await initial.json() as Record<string, unknown>;
    assert.equal(waiting.status, "AWAITING_RETRIEVAL_CONSENT");
    assert.equal(pipeline.freeCalls, 1);
    assert.equal(pipeline.paidCalls, 0);
    assert.equal(pipeline.sttCalls, 0);
    const jobId = String(waiting.job_id);

    const preflight = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval-preflight`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
    );
    assert.equal(preflight.status, 200);
    const quote = await preflight.json() as Record<string, unknown>;
    assert.equal(quote.provider, "scrapecreators");
    assert.equal(quote.mode, "facebook_post");
    assert.equal(quote.estimated_credits, 1);
    assert.equal(quote.maximum_credits, 1);
    assert.equal(quote.provider_balance_lookup_performed, false);
    assert.equal(pipeline.paidCalls, 0);

    const denied = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify({})
      }
    );
    assert.equal(denied.status, 409);
    const deniedBody = await denied.json() as { error?: { code?: string } };
    assert.equal(
      deniedBody.error?.code,
      "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED"
    );
    assert.equal(pipeline.paidCalls, 0);

    const approvedBody = {
      credit_consent: {
        provider: "scrapecreators",
        mode: "facebook_post",
        max_credits: 1
      }
    };
    const approved = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify(approvedBody)
      }
    );
    assert.equal(approved.status, 200);
    const completed = await approved.json() as Record<string, unknown>;
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.retrieval_provider, "scrapecreators");
    assert.equal(completed.retrieval_credits_charged, 1);
    assert.equal(completed.credits_charged, 1);
    assert.equal(completed.credits_remaining_estimate, 41);
    assert.equal(completed.stt_seconds_charged, 18);
    assert.equal(pipeline.paidCalls, 1);
    assert.equal(pipeline.sttCalls, 1);

    const duplicate = await fetch(
      `${baseUrl}/api/v1/media/managed/transcriptions/${jobId}/facebook-retrieval`,
      {
        method: "POST",
        headers: actionHeaders(),
        body: JSON.stringify(approvedBody)
      }
    );
    assert.equal(duplicate.status, 200);
    const duplicateBody = await duplicate.json() as Record<string, unknown>;
    assert.equal(duplicateBody.reused, true);
    assert.equal(pipeline.paidCalls, 1);
    assert.equal(pipeline.sttCalls, 1);
  } finally {
    await close(server);
  }
});

test("managed default runtime factory advertises configured Facebook retrieval without making provider calls", async () => {
  const runtimeConfig: AppConfig = {
    ...CONFIG,
    assemblyAiApiKey: "assemblyai-test-key",
    cobaltEndpoint: "http://127.0.0.1:65534",
    cobaltApiKey: null,
    scrapeCreatorsApiKey: null,
    scrapeCreatorsEndpoint: "http://127.0.0.1:65533",
    scrapeCreatorsCacheMaxAge: "30d"
  };
  const handler = createManagedMediaHttpHandler(runtimeConfig);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);
  try {
    const response = await fetch(`${baseUrl}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" }
    });
    assert.equal(response.status, 200);
    const capability = await response.json() as Record<string, unknown>;
    assert.equal(capability.configured, true);
    assert.equal(capability.facebook_retrieval_stt_fallback, true);
    assert.equal(capability.facebook_free_retrieval_provider, "cobalt");
    assert.equal(capability.facebook_free_retrieval_configured, true);
    assert.equal(capability.facebook_paid_retrieval_provider, "scrapecreators");
    assert.equal(capability.facebook_paid_retrieval_configured, false);
    assert.equal(capability.facebook_paid_retrieval_max_credits, 1);
    assert.equal(capability.facebook_paid_retrieval_requires_separate_consent, true);
    assert.equal(capability.facebook_automatic_paid_retrieval, false);
    assert.equal(capability.facebook_stt_provider, "assemblyai");
    assert.equal(capability.facebook_stt_configured, true);
  } finally {
    await close(server);
  }
});
