import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig } from "../src/config.js";
import { createVoiceBridgeServer } from "../src/server.js";

const TOKEN = "voicebridge-session-contract-token";
let server: Server;
let baseUrl: string;

function phase1Request() {
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
      voice_id: "uk-UA-OstapNeural",
      speaking_rate: null
    }
  };
}

function universalRequest() {
  return {
    ...phase1Request(),
    runtime_mode: "UNIVERSAL_BROWSER_AUDIO",
    source: {
      kind: "BROWSER_TAB",
      adapter: "chromium_tab"
    }
  };
}

async function api(
  path: string,
  init: RequestInit = {},
  authenticated = true
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authenticated) {
    headers.set("authorization", `Bearer ${TOKEN}`);
  }
  return fetch(baseUrl + path, { ...init, headers });
}

async function createSession(body: unknown): Promise<Response> {
  return api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

before(async () => {
  const config = {
    ...loadConfig({ TEST_ACCESS_TOKEN: TOKEN }),
    host: "127.0.0.1",
    port: 0,
    rateLimitRequestsPerMinute: 1000
  };
  server = createVoiceBridgeServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("Phase 1 YOUTUBE_MVP request remains backward compatible", async () => {
  const response = await createSession(phase1Request());
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.source_language, "en");
  assert.equal(created.target_language, "uk");
  assert.equal(created.runtime_mode, "YOUTUBE_MVP");
  assert.equal(created.source, null);
  assert.deepEqual(created.provider_preferences, {
    recognition: null,
    translation: null,
    synthesis: null
  });

  const read = await api(`/api/v1/sessions/${created.session_id}`);
  assert.equal(read.status, 200);
  const stored = await read.json();
  assert.equal(stored.runtime_mode, "YOUTUBE_MVP");
  assert.equal(stored.source, null);
});

test("UNIVERSAL_BROWSER_AUDIO stores normalized browser source metadata", async () => {
  const response = await createSession({
    ...universalRequest(),
    source: {
      kind: "BROWSER_TAB",
      adapter: "chromium_tab",
      display_label: "Untrusted client label"
    }
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.runtime_mode, "UNIVERSAL_BROWSER_AUDIO");
  assert.deepEqual(created.source, {
    kind: "BROWSER_TAB",
    adapter: "chromium_tab"
  });

  const read = await api(`/api/v1/sessions/${created.session_id}`);
  assert.equal(read.status, 200);
  const stored = await read.json();
  assert.deepEqual(stored.source, {
    kind: "BROWSER_TAB",
    adapter: "chromium_tab"
  });
});

test("session language tags are canonicalized through the registry", async () => {
  const response = await createSession({
    ...universalRequest(),
    source_language: "EN",
    target_language: "UK"
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.source_language, "en");
  assert.equal(created.target_language, "uk");
});

test("malformed and unsupported language combinations fail before streaming", async () => {
  for (const body of [
    { ...universalRequest(), source_language: "not_a_language" },
    { ...universalRequest(), source_language: "de" },
    { ...universalRequest(), target_language: "fr" },
    { ...universalRequest(), source_language: "en-US" }
  ]) {
    const response = await createSession(body);
    assert.equal(response.status, 400);
    const error = await response.json();
    assert.equal(error.error.code, "INVALID_REQUEST");
  }
});

test("health exposes sanitized validated language capabilities", async () => {
  const response = await api("/api/v1/health", {}, false);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.capabilities.languages, {
    registry_version: "1.0.0",
    validation_policy: "validated_pairs_only",
    source_languages: [{ tag: "en", label: "English" }],
    target_languages: [{ tag: "uk", label: "Ukrainian" }],
    pairs: [{ source_language: "en", target_language: "uk" }],
    defaults: { source_language: "en", target_language: "uk" }
  });
});

test("universal session rejects missing or invalid source before streaming", async () => {
  const missingSource = universalRequest() as Record<string, unknown>;
  delete missingSource.source;
  const missing = await createSession(missingSource);
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, "INVALID_REQUEST");

  const invalidKind = await createSession({
    ...universalRequest(),
    source: { kind: "REMOTE_URL", adapter: "chromium_tab" }
  });
  assert.equal(invalidKind.status, 400);
  assert.equal((await invalidKind.json()).error.code, "INVALID_REQUEST");

  const invalidAdapter = await createSession({
    ...universalRequest(),
    source: { kind: "BROWSER_TAB", adapter: "website_specific" }
  });
  assert.equal(invalidAdapter.status, 400);
  assert.equal((await invalidAdapter.json()).error.code, "INVALID_REQUEST");
});

test("provider preferences remain metadata and do not change cloud provider policy", async () => {
  const beforeHealth = await api("/api/v1/health", {}, false);
  assert.equal(beforeHealth.status, 200);
  const beforeCapabilities = (await beforeHealth.json()).capabilities;

  const response = await createSession({
    ...universalRequest(),
    provider_preferences: {
      recognition: "client-selected-stt",
      translation: "client-selected-translation",
      synthesis: "client-selected-tts"
    }
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.deepEqual(created.provider_preferences, {
    recognition: "client-selected-stt",
    translation: "client-selected-translation",
    synthesis: "client-selected-tts"
  });

  const afterHealth = await api("/api/v1/health", {}, false);
  assert.equal(afterHealth.status, 200);
  const afterCapabilities = (await afterHealth.json()).capabilities;
  assert.deepEqual(afterCapabilities, beforeCapabilities);
});
