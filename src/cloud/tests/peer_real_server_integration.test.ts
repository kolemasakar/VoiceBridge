import assert from "node:assert/strict";
import { test } from "node:test";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket from "ws";
import type { AppConfig } from "../src/config.js";
import { createVoiceBridgeServer, type PeerDiagnosticResearchOptions } from "../src/server.js";
import { PeerWindowCoordinator } from "../src/peer_window_coordinator.js";
import type { PeerObservation } from "../src/peer_observation.js";
import { FixedWindowRateLimiter } from "../src/rate_limit.js";
import type { SttProvider } from "../src/stt_provider.js";
import type { TranslationProvider } from "../src/translation_provider.js";
import type { TtsProvider } from "../src/tts_provider.js";

const TOKEN = "research-only-test-token";
const SECRET_ERROR = "diagnostic-private-error 127.0.0.1 203.0.113.9 " + TOKEN;
const CONFIG: AppConfig = {
  host: "127.0.0.1", port: 0, testAccessToken: TOKEN,
  assemblyAiApiKey: null, geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*", maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 60
};
class RecordingCoordinator extends PeerWindowCoordinator {
  readonly observations: PeerObservation[] = [];
  readonly decisions: boolean[] = [];
  clears = 0;
  constructor(start: number, private readonly fail = false) { super(start); }
  override record(observation: PeerObservation, accepted: boolean, now: number): void {
    this.observations.push(observation);
    this.decisions.push(accepted);
    if (this.fail) throw new Error(SECRET_ERROR);
    super.record(observation, accepted, now);
  }
  override clear(now: number): void { this.clears++; super.clear(now); }
}
function providers() {
  const calls = { connect: 0, audio: 0, translate: 0, synthesize: 0 };
  const stt: SttProvider = {
    name: "local-stt", configured: true,
    async connect(_options, observer) {
      calls.connect++;
      observer.onStatus("READY");
      return {
        sendAudio() {
          calls.audio++;
          observer.onTranscript({
            text: "Hello world.", isFinal: true, speechFinal: true, confidence: 1,
            audioStartMs: 0, audioDurationMs: 20, recognitionLatencyMs: 0
          });
          return true;
        },
        async close() { observer.onStatus("CLOSED"); }
      };
    }
  };
  const translation: TranslationProvider = {
    name: "local-translation", configured: true,
    async translate(input) {
      calls.translate++;
      return {
        segmentId: input.segmentId, provider: this.name,
        translatedText: "Вітаю.", translationLatencyMs: 0,
        completedAt: new Date().toISOString()
      };
    },
    async close() {}
  };
  const tts: TtsProvider = {
    name: "local-tts", configured: true,
    async synthesize(input) {
      calls.synthesize++;
      return {
        segmentId: input.segmentId, provider: this.name, voice: input.voice,
        audioFormat: "pcm_s16le", sampleRateHz: 24000, channels: 1,
        audio: Buffer.alloc(960), audioDurationMs: 20, ttsLatencyMs: 0,
        completedAt: new Date().toISOString()
      };
    },
    async close() {}
  };
  return { calls, stt, translation, tts };
}
async function start(options?: PeerDiagnosticResearchOptions, limit = 60) {
  const p = providers();
  const server = createVoiceBridgeServer(
    { ...CONFIG, rateLimitRequestsPerMinute: limit }, undefined,
    p.stt, p.translation, p.tts, options
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: "http://127.0.0.1:" + (server.address() as AddressInfo).port, ...p };
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
async function api(url: string, path = "/missing", init: RequestInit = {}, token: string | null = TOKEN) {
  const headers = new Headers(init.headers);
  headers.set("x-request-id", "research-fixed-request");
  headers.set("x-correlation-id", "research-fixed-correlation");
  if (token !== null) headers.set("authorization", "Bearer " + token);
  return fetch(url + path, { ...init, headers });
}
async function snapshot(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (body?.timestamp) body.timestamp = "<volatile>";
  return {
    status: response.status, body,
    headers: Object.fromEntries([...response.headers].filter(([name]) =>
      !["date", "connection", "keep-alive"].includes(name)))
  };
}
const MODES = ["off", "on", "failure"] as const;
type Mode = typeof MODES[number];
function options(mode: Mode, capture: (coordinator: RecordingCoordinator) => void): PeerDiagnosticResearchOptions {
  return {
    enabled: mode !== "off",
    createCoordinator(start) {
      const coordinator = new RecordingCoordinator(start, mode === "failure");
      capture(coordinator);
      return coordinator;
    }
  };
}

test("real server default OFF and explicit OFF never create diagnostic state", async () => {
  const baseline = await start();
  const baselineCloseListeners = baseline.server.listenerCount("close");
  await close(baseline.server);
  for (const enabled of [undefined, false]) {
    let created = 0;
    const opts: PeerDiagnosticResearchOptions = {
      ...(enabled === undefined ? {} : { enabled }),
      createCoordinator() { created++; throw new Error(SECRET_ERROR); }
    };
    const running = await start(opts);
    try {
      assert.equal(running.server.listenerCount("close"), baselineCloseListeners);
      assert.equal((await api(running.url)).status, 404);
      assert.equal(created, 0);
    } finally { await close(running.server); }
    assert.equal(created, 0);
  }
});

test("real server OFF/ON/failure preserve full HTTP auth, bypass and 429 responses", async () => {
  const outcomes: unknown[] = [];
  for (const mode of MODES) {
    let coordinator: RecordingCoordinator | undefined;
    const running = await start(options(mode, c => { coordinator = c; }), 3);
    try {
      const responses = [];
      responses.push(await snapshot(await api(running.url, "/api/v1/health", {}, null)));
      responses.push(await snapshot(await api(running.url, "/missing", { method: "OPTIONS" }, null)));
      responses.push(await snapshot(await api(running.url, "/missing", {}, null)));
      responses.push(await snapshot(await api(running.url, "/missing", {}, "invalid-token")));
      responses.push(await snapshot(await api(running.url)));
      responses.push(await snapshot(await api(running.url)));
      responses.push(await snapshot(await api(running.url, "/api/v1/health", {}, null)));
      responses.push(await snapshot(await api(running.url, "/missing", { method: "OPTIONS" }, null)));
      responses.push(await snapshot(await api(running.url, "/missing", {}, null)));
      assert.deepEqual(responses.map(r => r.status), [200, 204, 401, 401, 404, 429, 200, 204, 429]);
      assert.equal(responses[5]?.headers["retry-after"], "60");
      assert.equal(responses[8]?.headers["retry-after"], "60");
      assert.equal(responses[2]?.body.error.code, "AUTHENTICATION_REQUIRED");
      assert.equal(responses[3]?.body.error.code, "AUTHENTICATION_FAILED");
      assert.equal(responses[5]?.body.error.code, "RATE_LIMITED");
      assert.ok(!JSON.stringify(responses).includes(SECRET_ERROR));
      assert.deepEqual(running.calls, { connect: 0, audio: 0, translate: 0, synthesize: 0 });
      if (coordinator) assert.deepEqual(coordinator.decisions, [true, true, true, false, false]);
      outcomes.push(responses);
    } finally { await close(running.server); }
    if (coordinator) assert.equal(coordinator.clears, 1);
  }
  assert.deepEqual(outcomes[1], outcomes[0]);
  assert.deepEqual(outcomes[2], outcomes[0]);
});

test("real server hostile forwarded headers keep one socket bucket and exact 60-request limit", async () => {
  const headers = [undefined, "", "203.0.113.9", "203.0.113.9, 192.0.2.4",
    "2001:db8::1", "malformed-forged", "x".repeat(1025)];
  for (const mode of MODES) {
    let coordinator: RecordingCoordinator | undefined;
    const running = await start(options(mode, c => { coordinator = c; }));
    try {
      for (let i = 0; i < 61; i++) {
        const header = headers[i % headers.length];
        const response = await api(running.url, "/missing", {
          headers: header === undefined ? { forwarded: "for=192.0.2." + i } :
            { "x-forwarded-for": header, forwarded: "for=192.0.2." + i }
        });
        assert.equal(response.status, i < 60 ? 404 : 429);
        assert.equal(response.headers.get("retry-after"), i < 60 ? null : "60");
        const body = await response.text();
        assert.ok(!body.includes(TOKEN));
        assert.ok(!body.includes("203.0.113.9"));
        assert.ok(!body.includes("127.0.0.1"));
        assert.ok(!body.includes(SECRET_ERROR));
      }
      if (coordinator) {
        assert.equal(coordinator.decisions.length, 61);
        assert.equal(coordinator.decisions.filter(Boolean).length, 60);
        assert.equal(new Set(coordinator.observations.map(o => o.peer_tag)).size, 1);
        assert.deepEqual(new Set(coordinator.observations.map(o => o.forwarded_shape)),
          new Set(["absent", "empty", "single_untrusted", "multiple_untrusted", "oversize"]));
      }
    } finally { await close(running.server); }
  }
});

test("HTTP parser rejects oversized headers identically before limiter or diagnostics", async () => {
  for (const mode of MODES) {
    let coordinator: RecordingCoordinator | undefined;
    const running = await start(options(mode, c => { coordinator = c; }), 1);
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(running.url + "/missing", {
          headers: { "x-forwarded-for": "x".repeat(20_000) }
        }, response => { response.resume(); response.once("end", () => resolve(response.statusCode!)); });
        request.on("error", reject);
        request.end();
      });
      assert.equal(status, 431);
      assert.equal(coordinator?.decisions.length ?? 0, 0);
      assert.equal((await api(running.url)).status, 404);
      assert.equal((await api(running.url)).status, 429);
    } finally { await close(running.server); }
  }
});

test("diagnostic initialization and cleanup failures stay isolated and silent", async t => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  t.mock.method(console, "warn", (...args: unknown[]) => { errors.push(args); });
  t.mock.method(console, "log", (...args: unknown[]) => { errors.push(args); });
  for (const stage of ["initialize", "record", "clear"]) {
    class CleanupFailure extends PeerWindowCoordinator {
      override record(observation: PeerObservation, accepted: boolean, now: number): void {
        if (stage === "record") throw new Error(SECRET_ERROR);
        super.record(observation, accepted, now);
      }
      override clear(now: number): void {
        if (stage === "clear") throw new Error(SECRET_ERROR);
        super.clear(now);
      }
    }
    const running = await start({
      enabled: true,
      createCoordinator(start) {
        if (stage === "initialize") throw new Error(SECRET_ERROR);
        return new CleanupFailure(start);
      }
    }, 1);
    try {
      assert.equal((await api(running.url)).status, 404);
      const denied = await snapshot(await api(running.url));
      assert.equal(denied.status, 429);
      assert.ok(!JSON.stringify(denied).includes(SECRET_ERROR));
    } finally { await close(running.server); }
  }
  assert.deepEqual(errors, []);
});

test("real server records exactly the single limiter decision with socket-only identity", async t => {
  const original = FixedWindowRateLimiter.prototype.allow;
  const keys: string[] = [];
  t.mock.method(FixedWindowRateLimiter.prototype, "allow", function(this: FixedWindowRateLimiter, key: string, now?: number) {
    keys.push(key);
    return original.call(this, key, now);
  });
  let coordinator: RecordingCoordinator | undefined;
  const running = await start(options("on", c => { coordinator = c; }), 2);
  try {
    await api(running.url, "/api/v1/health");
    await api(running.url, "/missing", { method: "OPTIONS" });
    for (let i = 0; i < 3; i++) {
      const response = await api(running.url, "/missing", { headers: { "x-forwarded-for": "203.0.113." + i } });
      assert.equal(response.status, i < 2 ? 404 : 429);
    }
    assert.deepEqual(keys, ["127.0.0.1", "127.0.0.1", "127.0.0.1"]);
    assert.deepEqual(coordinator?.decisions, [true, true, false]);
  } finally { await close(running.server); }
});

test("real server diagnostics retain only suppressed bounded aggregates and clear on close", async t => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  let coordinator: RecordingCoordinator | undefined;
  const running = await start(options("on", c => { coordinator = c; }), 3);
  try {
    for (let i = 0; i < 4; i++) await api(running.url);
    now += 60_000;
    assert.deepEqual(coordinator?.readSummaries(now), []);
    for (let i = 0; i < 5; i++) await api(running.url, "/missing", {
      headers: { "x-forwarded-for": "203.0.113.9", authorization: "Bearer " + TOKEN }
    });
    now += 60_000;
    const summaries = coordinator!.readSummaries(now);
    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.window_observations, 5);
    assert.equal(summaries[0]?.allowed, 3);
    assert.equal(summaries[0]?.rejected, 2);
    assert.equal(summaries[0]?.distinct_tag_buckets, 1);
    assert.equal(summaries[0]?.header_shape_counts.single_untrusted, 5);
    const serialized = JSON.stringify(summaries);
    for (const secret of ["127.0.0.1", "203.0.113.9", TOKEN, SECRET_ERROR,
      "peer_tag", "research-fixed-request", ...coordinator!.observations.map(o => o.peer_tag)]) {
      assert.ok(!serialized.includes(secret));
    }
  } finally { await close(running.server); }
  assert.equal(coordinator?.clears, 1);
  assert.deepEqual(coordinator?.readSummaries(now), []);
});

function socketEvent(socket: WebSocket, type: string): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("Timed out: " + type)); }, 5000);
    const onMessage = (data: WebSocket.RawData, binary: boolean) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.event_type === type) { cleanup(); resolve(event); }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    function cleanup() { clearTimeout(timer); socket.off("message", onMessage); socket.off("error", onError); }
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}
test("OFF/ON/failure preserve actual STT translation TTS execution using local mocks", async () => {
  const counts = [];
  for (const mode of MODES) {
    const running = await start(options(mode, () => {}));
    let socket: WebSocket | undefined;
    try {
      const createdResponse = await api(running.url, "/api/v1/sessions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_language: "en", target_language: "uk", runtime_mode: "YOUTUBE_MVP",
          input_type: "BROWSER_AUDIO", output_type: "BROWSER_PLAYBACK",
          provider_preferences: { recognition: null, translation: null, synthesis: null },
          voice: { voice_id: null, speaking_rate: null }
        })
      });
      assert.equal(createdResponse.status, 201);
      const created = await createdResponse.json();
      assert.equal((await api(running.url, "/api/v1/sessions/" + created.session_id + "/start", { method: "POST" })).status, 200);
      const ticketResponse = await api(running.url, "/api/v1/sessions/" + created.session_id + "/stream-ticket", { method: "POST" });
      assert.equal(ticketResponse.status, 201);
      const ticket = await ticketResponse.json();
      assert.deepEqual(running.calls, { connect: 0, audio: 0, translate: 0, synthesize: 0 });
      socket = new WebSocket(running.url.replace("http:", "ws:") + ticket.stream_path, ticket.protocols);
      await socketEvent(socket, "STREAM_READY");
      const started = socketEvent(socket, "STREAM_STARTED");
      socket.send(JSON.stringify({
        event_type: "STREAM_START", sequence: 1, occurred_at: new Date().toISOString(),
        data: { format: "pcm_s16le", sample_rate_hz: 48000, channels: 1, frame_duration_ms: 20 }
      }));
      await started;
      const translated = socketEvent(socket, "TRANSLATION_FINAL");
      socket.send(Buffer.alloc(1920));
      assert.equal((await translated).data.translated_text, "Вітаю.");
      const completed = socketEvent(socket, "STREAM_COMPLETED");
      socket.send(JSON.stringify({
        event_type: "STREAM_STOP", sequence: 2, occurred_at: new Date().toISOString(), data: {}
      }));
      const result = await completed;
      assert.equal(result.data.final_transcripts, 1);
      assert.equal(result.data.final_translations, 1);
      assert.deepEqual(running.calls, { connect: 1, audio: 1, translate: 1, synthesize: 1 });
      counts.push({ ...running.calls });
    } finally {
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        const closed = new Promise<void>(resolve => socket!.once("close", () => resolve()));
        socket.terminate();
        await closed;
      }
      await close(running.server);
    }
  }
  assert.deepEqual(counts[1], counts[0]);
  assert.deepEqual(counts[2], counts[0]);
});

test("default coordinator opt-in adds no HTTP diagnostic endpoint", async () => {
  const running = await start({ enabled: true });
  try {
    for (let i = 0; i < 5; i++) {
      assert.equal((await api(running.url, "/api/v1/diagnostics")).status, 404);
    }
    assert.deepEqual(running.calls, { connect: 0, audio: 0, translate: 0, synthesize: 0 });
  } finally { await close(running.server); }
});

test("separate server lifetimes use independent ephemeral keys", async () => {
  const tags: string[] = [];
  for (let i = 0; i < 2; i++) {
    let coordinator: RecordingCoordinator | undefined;
    const running = await start(options("on", c => { coordinator = c; }));
    try {
      await api(running.url);
      const observation = coordinator!.observations[0]!;
      assert.match(observation.peer_tag, /^[a-f0-9]{24}$/);
      assert.deepEqual(Object.keys(observation).sort(),
        ["forwarded_present", "forwarded_shape", "peer_tag"]);
      tags.push(observation.peer_tag);
    } finally { await close(running.server); }
  }
  assert.notEqual(tags[0], tags[1]);
});
