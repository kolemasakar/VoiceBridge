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
          text: "Керований тестовий сегмент",
          confidence: null
        }
      ],
      transcript_text: "Керований тестовий сегмент",
      billable_credits: 1
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

test("managed HTTP preflight reports credit balance and blocks spend without consent", async () => {
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
        beta_access_code: ACCESS_CODE,
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
        beta_access_code: ACCESS_CODE,
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
        beta_access_code: ACCESS_CODE,
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
  } finally {
    await close(server);
  }
});
