import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
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
