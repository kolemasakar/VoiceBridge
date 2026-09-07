import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import {
  ManagedMediaService,
  type ManagedMediaPreflightInput,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";

const ACTION_TOKEN = "managed-action-token-auth-input-replay-123456";
const ACCESS_CODE = "owner-auth-input-replay-2026";
const ROGUE_CODE = "rogue-client-access-code-2026";
const YOUTUBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-auth-input-replay",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaDailySttSeconds: 7200,
  mediaMaxDurationSeconds: 3600,
  assemblyAiApiKey: null,
  supadataApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 512,
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

function actionHeaders(token = ACTION_TOKEN): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    connection: "close"
  };
}

async function jsonError(response: Response): Promise<string | null> {
  const payload = await response.json() as { error?: { code?: string } };
  return payload.error?.code ?? null;
}

test("auth failures terminate before managed service work", async () => {
  let preflightCalls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    preflight: async () => {
      preflightCalls += 1;
      throw new Error("preflight must remain unreachable without valid bearer");
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  try {
    const missing = await fetch(`${base}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify({ url: YOUTUBE_URL })
    });
    assert.equal(missing.status, 401);
    assert.equal(await jsonError(missing), "AUTHENTICATION_REQUIRED");

    for (const authorization of [
      "Bearer wrong-token",
      "Basic wrong-token",
      `bearer ${ACTION_TOKEN}`,
      `Bearer ${ACTION_TOKEN} trailing`
    ]) {
      const response = await fetch(`${base}/api/v1/media/managed/preflight`, {
        method: "POST",
        headers: { authorization, "content-type": "application/json", connection: "close" },
        body: JSON.stringify({ url: YOUTUBE_URL })
      });
      assert.equal(response.status, 401);
      assert.equal(await jsonError(response), "AUTHENTICATION_FAILED");
    }
    assert.equal(preflightCalls, 0);
  } finally {
    await close(server);
  }
});

test("server owner admission overrides any caller supplied beta access code", async () => {
  let capturedAccessCode: string | null = null;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    preflight: async (input: ManagedMediaPreflightInput) => {
      capturedAccessCode = input.beta_access_code;
      return {
        source_url: input.url,
        language_hint: input.language_hint,
        provider: "supadata",
        mode: "native",
        plan: "test",
        credits_available: 1,
        estimated_credits: 1,
        credits_after_estimate: 0,
        can_continue: true,
        consent_required: true,
        consent_options: { approve: 1, reject: 2 }
      };
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  try {
    const response = await fetch(`${base}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({
        url: YOUTUBE_URL,
        language_hint: "auto",
        beta_access_code: ROGUE_CODE
      })
    });
    assert.equal(response.status, 200);
    assert.equal(capturedAccessCode, ACCESS_CODE);
  } finally {
    await close(server);
  }
});

test("malformed and oversized JSON fail before service work", async () => {
  let calls = 0;
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    preflight: async () => {
      calls += 1;
      throw new Error("preflight must remain unreachable for malformed input");
    }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  try {
    const malformed = await fetch(`${base}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: actionHeaders(),
      body: "{not-json"
    });
    assert.equal(malformed.status, 400);
    assert.equal(await jsonError(malformed), "INVALID_REQUEST");

    const oversized = await fetch(`${base}/api/v1/media/managed/preflight`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({ url: YOUTUBE_URL, padding: "x".repeat(1024) })
    });
    assert.equal(oversized.status, 413);
    assert.equal(await jsonError(oversized), "REQUEST_BODY_TOO_LARGE");
    assert.equal(calls, 0);
  } finally {
    await close(server);
  }
});

test("wrong methods, malformed job ids, and pagination injection fail closed before service reads", async () => {
  const calls = { preflight: 0, get: 0, page: 0 };
  const service = {
    configured: true,
    storeKind: "postgres",
    durableStore: true,
    preflight: async () => { calls.preflight += 1; throw new Error("unexpected preflight"); },
    get: async () => { calls.get += 1; throw new Error("unexpected get"); },
    page: async () => { calls.page += 1; throw new Error("unexpected page"); }
  } as unknown as ManagedMediaService;
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  try {
    const wrongMethod = await fetch(`${base}/api/v1/media/managed/preflight`, {
      method: "GET",
      headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" }
    });
    assert.equal(wrongMethod.status, 404);
    assert.equal(await jsonError(wrongMethod), "NOT_FOUND");

    for (const path of [
      "/api/v1/media/managed/transcriptions/KRCM_bad%2Fsegments",
      "/api/v1/media/managed/transcriptions/not-a-job",
      "/api/v1/media/managed/transcriptions/KRCM_../segments"
    ]) {
      const response = await fetch(`${base}${path}`, {
        headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" }
      });
      assert.equal(response.status, 404);
      assert.equal(await jsonError(response), "NOT_FOUND");
    }

    for (const query of [
      "cursor=0%20OR%201%3D1",
      "cursor=-1",
      "cursor=100001",
      "limit=0",
      "limit=51",
      "limit=1e2"
    ]) {
      const response = await fetch(
        `${base}/api/v1/media/managed/transcriptions/KRCM_safe123/segments?${query}`,
        { headers: { authorization: `Bearer ${ACTION_TOKEN}`, connection: "close" } }
      );
      assert.equal(response.status, 400);
      assert.equal(await jsonError(response), "INVALID_PAGINATION");
    }
    assert.deepEqual(calls, { preflight: 0, get: 0, page: 0 });
  } finally {
    await close(server);
  }
});

class FakeProvider implements ManagedNativeTranscriptProvider {
  transcriptCalls = 0;
  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "test",
      max_credits: 100,
      used_credits: 0,
      remaining_credits: 100,
      estimated_credits: 1 as const,
      remaining_after_estimate: 99,
      consent_required: true as const,
      can_continue: true
    };
  }
  async getNativeTranscript() {
    this.transcriptCalls += 1;
    return {
      status: "completed" as const,
      language: "en",
      available_languages: ["en"],
      segments: [{ index: 0, start_ms: 0, end_ms: 1000, text: "replay-safe", confidence: null }],
      transcript_text: "replay-safe",
      billable_credits: 1
    };
  }
}

test("duplicate native replay remains single-provider-start even with caller beta-code variation", async () => {
  const provider = new FakeProvider();
  const service = new ManagedMediaService(new MediaBetaGate([ACCESS_CODE]), null, provider);
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const base = await listen(server);
  const body = {
    url: YOUTUBE_URL,
    language_hint: "auto",
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  };
  try {
    const first = await fetch(`${base}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify(body)
    });
    assert.equal(first.status, 200);
    const firstJob = await first.json() as Record<string, unknown>;

    const second = await fetch(`${base}/api/v1/media/managed/transcriptions`, {
      method: "POST",
      headers: actionHeaders(),
      body: JSON.stringify({ ...body, beta_access_code: ROGUE_CODE })
    });
    assert.equal(second.status, 200);
    const secondJob = await second.json() as Record<string, unknown>;

    assert.equal(secondJob.job_id, firstJob.job_id);
    assert.equal(secondJob.reused, true);
    assert.equal(provider.transcriptCalls, 1);
  } finally {
    await close(server);
  }
});
