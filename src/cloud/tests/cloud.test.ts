import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import type { AppConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import { createVoiceBridgeServer } from "../src/server.js";
import type {
  SttConnection,
  SttObserver,
  SttProvider,
  SttStreamOptions
} from "../src/stt_provider.js";
import { AssemblyAiSttProvider } from "../src/stt_provider.js";

const TOKEN = "voicebridge-test-token-123456789";
const config: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: TOKEN,
  assemblyAiApiKey: null,
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

let server: Server;
let baseUrl: string;

class FakeSttConnection implements SttConnection {
  private frames = 0;

  constructor(private readonly observer: SttObserver) {}

  sendAudio(_frame: Buffer): boolean {
    this.frames += 1;
    if (this.frames === 1) {
      this.observer.onTranscript({
        text: "Hello",
        isFinal: false,
        speechFinal: false,
        confidence: 0.91,
        audioStartMs: 0,
        audioDurationMs: 20,
        recognitionLatencyMs: 80
      });
    }
    if (this.frames === 10) {
      this.observer.onTranscript({
        text: "Hello world.",
        isFinal: true,
        speechFinal: true,
        confidence: 0.97,
        audioStartMs: 0,
        audioDurationMs: 200,
        recognitionLatencyMs: 120
      });
    }
    return true;
  }

  async close(): Promise<void> {
    this.observer.onStatus("CLOSED");
  }
}

class FakeSttProvider implements SttProvider {
  readonly name = "fake-stt";
  readonly configured = true;

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("READY");
    return new FakeSttConnection(observer);
  }
}

before(async () => {
  server = createVoiceBridgeServer(
    config,
    undefined,
    new FakeSttProvider()
  );
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

function nextSocketEvent(
  socket: WebSocket,
  expectedType: string
): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}.`));
    }, 3000);

    const onMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        return;
      }
      const event = JSON.parse(data.toString()) as Record<string, any>;
      if (event.event_type === expectedType) {
        cleanup();
        resolve(event);
      }
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function socketOpened(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function socketClosed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
  });
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
  assert.equal(body.version, "0.3.1");
  assert.deepEqual(body.capabilities.stt, {
    provider: "fake-stt",
    configured: true
  });
  assert.equal(body.request_id, "test-health");
  assert.equal(body.correlation_id, "test-correlation");
});

test("configuration requires a sufficiently long token", () => {
  assert.throws(
    () => loadConfig({ TEST_ACCESS_TOKEN: "short" }),
    /at least 16 characters/
  );
});

test("AssemblyAI credential is optional before live STT setup", () => {
  const loaded = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(loaded.assemblyAiApiKey, null);
});

test("AssemblyAI adapter aggregates audio and maps transcript turns", async () => {
  const providerServer = new WebSocketServer({
    host: "127.0.0.1",
    port: 0
  });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("listening", resolve);
    providerServer.once("error", reject);
  });

  const providerAddress = providerServer.address() as AddressInfo;
  const binaryPackets: Buffer[] = [];
  let authorization = "";
  let requestPath = "";
  let terminated = false;

  providerServer.on("connection", (socket, request) => {
    authorization = String(request.headers.authorization || "");
    requestPath = request.url || "";
    socket.send(JSON.stringify({
      type: "Begin",
      id: "assembly-test-session"
    }));

    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        binaryPackets.push(Buffer.from(data as Buffer));
        socket.send(JSON.stringify({
          type: "Turn",
          transcript: "Hello",
          end_of_turn: false,
          turn_is_formatted: false,
          words: [{ start: 0, end: 80, confidence: 0.9 }]
        }));
        socket.send(JSON.stringify({
          type: "Turn",
          transcript: "hello world",
          end_of_turn: true,
          turn_is_formatted: false,
          words: [
            { start: 0, end: 80, confidence: 0.9 },
            { start: 80, end: 100, confidence: 1 }
          ]
        }));
        socket.send(JSON.stringify({
          type: "Turn",
          transcript: "Hello world.",
          end_of_turn: true,
          turn_is_formatted: true,
          words: [
            { start: 0, end: 80, confidence: 0.9 },
            { start: 80, end: 100, confidence: 1 }
          ]
        }));
        return;
      }

      const message = JSON.parse(data.toString()) as { type?: string };
      if (message.type === "Terminate") {
        terminated = true;
        socket.send(JSON.stringify({
          type: "Termination",
          audio_duration_seconds: 0.1,
          session_duration_seconds: 0.1
        }));
        socket.close(1000);
      }
    });
  });

  const statuses: string[] = [];
  const transcripts: Array<{ text: string; isFinal: boolean }> = [];
  let resolveFinal: (() => void) | null = null;
  const finalReceived = new Promise<void>((resolve) => {
    resolveFinal = resolve;
  });
  const provider = new AssemblyAiSttProvider(
    "assembly-test-key",
    `ws://127.0.0.1:${providerAddress.port}/v3/ws`
  );
  const connection = await provider.connect(
    { sampleRateHz: 48000, channels: 1, language: "en-US" },
    {
      onStatus: (status) => statuses.push(status),
      onTranscript: (transcript) => {
        transcripts.push({
          text: transcript.text,
          isFinal: transcript.isFinal
        });
        if (transcript.isFinal) {
          resolveFinal?.();
        }
      },
      onError: (_code, message) => assert.fail(message)
    }
  );

  for (let frame = 0; frame < 5; frame += 1) {
    assert.equal(connection.sendAudio(Buffer.alloc(1920)), true);
  }
  await Promise.race([
    finalReceived,
    new Promise<void>((_resolve, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for final turn.")), 3000);
    })
  ]);
  await connection.close();
  await new Promise<void>((resolve, reject) => {
    providerServer.close((error) => error ? reject(error) : resolve());
  });

  const requestUrl = new URL(requestPath, "http://provider.local");
  assert.equal(authorization, "assembly-test-key");
  assert.equal(requestUrl.searchParams.get("sample_rate"), "48000");
  assert.equal(
    requestUrl.searchParams.get("speech_model"),
    "universal-streaming-english"
  );
  assert.equal(requestUrl.searchParams.get("format_turns"), "true");
  assert.equal(binaryPackets.length, 1);
  assert.equal(binaryPackets[0]?.byteLength, 9600);
  assert.deepEqual(transcripts, [
    { text: "Hello", isFinal: false },
    { text: "hello world", isFinal: false },
    { text: "Hello world.", isFinal: true }
  ]);
  assert.equal(terminated, true);
  assert.deepEqual(statuses, ["READY", "CLOSED"]);
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

test("stream ticket requires an active session", async () => {
  const createResponse = await api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  const created = await createResponse.json();

  const ticketResponse = await api(
    `/api/v1/sessions/${created.session_id}/stream-ticket`,
    { method: "POST" }
  );
  assert.equal(ticketResponse.status, 409);
  const body = await ticketResponse.json();
  assert.equal(body.error.code, "INVALID_SESSION_STATE");
});

test("authenticated WebSocket stream accepts bounded binary audio", async () => {
  const createResponse = await api("/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  const created = await createResponse.json();
  await api(`/api/v1/sessions/${created.session_id}/start`, {
    method: "POST"
  });

  const ticketResponse = await api(
    `/api/v1/sessions/${created.session_id}/stream-ticket`,
    { method: "POST" }
  );
  assert.equal(ticketResponse.status, 201);
  const ticket = await ticketResponse.json();
  assert.deepEqual(ticket.protocols.slice(0, 1), ["voicebridge.v1"]);
  assert.doesNotMatch(ticket.stream_path, /ticket/i);

  const socketUrl = baseUrl.replace(/^http/, "ws") + ticket.stream_path;
  const socket = new WebSocket(socketUrl, ticket.protocols);
  const readyPromise = nextSocketEvent(socket, "STREAM_READY");
  await socketOpened(socket);
  const ready = await readyPromise;
  assert.equal(ready.data.max_binary_frame_bytes, 32768);
  assert.equal(ready.data.max_unacked_frames, 50);

  const startedPromise = nextSocketEvent(socket, "STREAM_STARTED");
  socket.send(JSON.stringify({
    event_type: "STREAM_START",
    sequence: 1,
    occurred_at: new Date().toISOString(),
    data: {
      format: "pcm_s16le",
      sample_rate_hz: 48000,
      channels: 1,
      frame_duration_ms: 20
    }
  }));
  await startedPromise;

  const ackPromise = nextSocketEvent(socket, "AUDIO_ACK");
  const partialPromise = nextSocketEvent(socket, "TRANSCRIPT_PARTIAL");
  const finalPromise = nextSocketEvent(socket, "TRANSCRIPT_FINAL");
  for (let index = 0; index < 10; index += 1) {
    socket.send(Buffer.alloc(1920));
  }
  const ack = await ackPromise;
  const partial = await partialPromise;
  const final = await finalPromise;
  assert.equal(ack.data.frames_received, 10);
  assert.equal(ack.data.bytes_received, 19200);
  assert.equal(partial.data.text, "Hello");
  assert.equal(partial.data.is_final, false);
  assert.equal(final.data.text, "Hello world.");
  assert.equal(final.data.is_final, true);
  assert.ok(partial.sequence < final.sequence);
  assert.equal(final.data.recognition_latency_ms, 120);

  const completedPromise = nextSocketEvent(socket, "STREAM_COMPLETED");
  socket.send(JSON.stringify({
    event_type: "STREAM_STOP",
    sequence: 2,
    occurred_at: new Date().toISOString(),
    data: {}
  }));
  const completed = await completedPromise;
  assert.equal(completed.data.frames_received, 10);
  assert.equal(completed.data.partial_transcripts, 1);
  assert.equal(completed.data.final_transcripts, 1);
  assert.equal(completed.data.average_recognition_latency_ms, 100);
  await socketClosed(socket);

  await new Promise<void>((resolve, reject) => {
    const reused = new WebSocket(socketUrl, ticket.protocols);
    const timer = setTimeout(() => {
      reused.terminate();
      reject(new Error("Reused stream ticket was not rejected."));
    }, 3000);
    reused.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      assert.equal(response.statusCode, 401);
      response.resume();
      resolve();
    });
    reused.once("error", () => undefined);
  });

  const stopResponse = await api(
    `/api/v1/sessions/${created.session_id}/stop`,
    { method: "POST" }
  );
  assert.equal(stopResponse.status, 200);
});
