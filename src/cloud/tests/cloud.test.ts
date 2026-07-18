import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { AppConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import { createVoiceBridgeServer } from "../src/server.js";

const TOKEN = "voicebridge-test-token-123456789";
const config: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: TOKEN,
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

let server: Server;
let baseUrl: string;

before(async () => {
  server = createVoiceBridgeServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function api(
  path: string,
  init: RequestInit = {},
  token: string | null = TOKEN
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(baseUrl + path, { ...init, headers });
}

function validSessionRequest() {
  return {
    source_language: "en",
    target_language: "uk",
    runtime_mode: "YOUTUBE_MVP",
    input_type: "BROWSER_AUDIO",
    output_type: "BROWSER_PLAYBACK",
    provider_preferences: {
      recognition: null,
      translation: null,
      synthesis: null
    },
    voice: {
      voice_id: null,
      speaking_rate: null
    }
  };
}

test("health endpoint is public and returns identifiers", async () => {
  const response = await api(
    "/api/v1/health",
    {
      headers: {
        "x-request-id": "test-health",
        "x-correlation-id": "test-correlation"
      }
    },
    null
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "test-health");
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.request_id, "test-health");
  assert.equal(body.correlation_id, "test-correlation");
});

test("configuration requires a sufficiently long token", () => {
  assert.throws(
    () => loadConfig({ TEST_ACCESS_TOKEN: "short" }),
    /at least 16 characters/
  );
});

test("protected endpoint rejects a missing token", async () => {
  const response = await api("/api/v1/sessions", { method: "POST" }, null);
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "AUTHENTICATION_REQUIRED");
});

test("protected endpoint rejects an invalid token", async () => {
  const response = await api(
    "/api/v1/sessions",
    { method: "POST" },
    "invalid-token-value"
  );
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.code, "AUTHENTICATION_FAILED");
});

test("session lifecycle is authenticated and idempotent", async () => {
  const createResponse = await api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.state, "CREATED");
  assert.match(created.session_id, /^[0-9a-f-]{36}$/);

  const startResponse = await api(
    `/api/v1/sessions/${created.session_id}/start`,
    { method: "POST" }
  );
  assert.equal(startResponse.status, 200);
  const started = await startResponse.json();
  assert.equal(started.state, "ACTIVE");

  const repeatedStartResponse = await api(
    `/api/v1/sessions/${created.session_id}/start`,
    { method: "POST" }
  );
  assert.equal(repeatedStartResponse.status, 200);
  const repeatedStart = await repeatedStartResponse.json();
  assert.equal(repeatedStart.state, "ACTIVE");

  const getResponse = await api(
    `/api/v1/sessions/${created.session_id}`
  );
  assert.equal(getResponse.status, 200);
  const fetched = await getResponse.json();
  assert.equal(fetched.state, "ACTIVE");

  const pauseResponse = await api(
    `/api/v1/sessions/${created.session_id}/pause`,
    { method: "POST" }
  );
  assert.equal(pauseResponse.status, 200);
  const paused = await pauseResponse.json();
  assert.equal(paused.state, "PAUSED");

  const resumeResponse = await api(
    `/api/v1/sessions/${created.session_id}/resume`,
    { method: "POST" }
  );
  assert.equal(resumeResponse.status, 200);
  const resumed = await resumeResponse.json();
  assert.equal(resumed.state, "ACTIVE");

  const stopResponse = await api(
    `/api/v1/sessions/${created.session_id}/stop`,
    { method: "POST" }
  );
  assert.equal(stopResponse.status, 200);
  const stopped = await stopResponse.json();
  assert.equal(stopped.state, "COMPLETED");

  const repeatedStopResponse = await api(
    `/api/v1/sessions/${created.session_id}/stop`,
    { method: "POST" }
  );
  assert.equal(repeatedStopResponse.status, 200);
  const repeatedStop = await repeatedStopResponse.json();
  assert.equal(repeatedStop.state, "COMPLETED");
});

test("invalid session transition returns canonical error", async () => {
  const createResponse = await api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  const created = await createResponse.json();

  const pauseResponse = await api(
    `/api/v1/sessions/${created.session_id}/pause`,
    { method: "POST" }
  );
  assert.equal(pauseResponse.status, 409);
  const body = await pauseResponse.json();
  assert.equal(body.error.code, "INVALID_SESSION_STATE");
  assert.equal(body.error.session_id, created.session_id);
});

test("invalid session request is rejected", async () => {
  const response = await api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source_language: "en" })
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, "INVALID_REQUEST");
});

test("unknown session returns canonical error", async () => {
  const response = await api(
    "/api/v1/sessions/00000000-0000-0000-0000-000000000000"
  );
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.error.code, "SESSION_NOT_FOUND");
});
