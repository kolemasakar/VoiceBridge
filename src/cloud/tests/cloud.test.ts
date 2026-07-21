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
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult
} from "../src/translation_provider.js";
import {
  GeminiTranslationProvider,
  TranslationProviderError
} from "../src/translation_provider.js";

const TOKEN = "voicebridge-test-token-123456789";
const BASE_CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: TOKEN,
  assemblyAiApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

interface RunningServer {
  server: Server;
  baseUrl: string;
}

interface RecordedTranslationRequest {
  segmentId: string;
  sourceText: string;
  context: string[];
}

class ScriptedSttConnection implements SttConnection {
  private frames = 0;

  constructor(
    private readonly observer: SttObserver,
    private readonly finalEveryFrame: boolean,
    private readonly longText: boolean
  ) {}

  sendAudio(_frame: Buffer): boolean {
    this.frames += 1;

    if (this.finalEveryFrame) {
      const suffix = this.longText ? " " + "x".repeat(900) : "";
      this.observer.onTranscript({
        text: `Segment ${this.frames}.${suffix}`,
        isFinal: true,
        speechFinal: true,
        confidence: 0.95,
        audioStartMs: (this.frames - 1) * 20,
        audioDurationMs: 20,
        recognitionLatencyMs: 50
      });
      return true;
    }

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

    if (this.frames === 2) {
      this.observer.onTranscript({
        text: "Hello world.",
        isFinal: true,
        speechFinal: true,
        confidence: 0.97,
        audioStartMs: 0,
        audioDurationMs: 40,
        recognitionLatencyMs: 120
      });
    }

    return true;
  }

  async close(): Promise<void> {
    this.observer.onStatus("CLOSED");
  }
}

class ScriptedSttProvider implements SttProvider {
  readonly name: string;
  readonly configured = true;

  constructor(
    name = "fake-stt",
    private readonly finalEveryFrame = false,
    private readonly longText = false
  ) {
    this.name = name;
  }

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("READY");
    return new ScriptedSttConnection(
      observer,
      this.finalEveryFrame,
      this.longText
    );
  }
}

class FakeTranslationProvider implements TranslationProvider {
  readonly name = "fake-translation";
  readonly configured = true;
  readonly requests: RecordedTranslationRequest[] = [];

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    this.requests.push({
      segmentId: request.segmentId,
      sourceText: request.sourceText,
      context: [...request.context]
    });

    if (request.signal.aborted) {
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_FAILED",
        "Translation request was cancelled."
      );
    }

    return {
      segmentId: request.segmentId,
      provider: this.name,
      translatedText: "Pereklad: " + request.sourceText.slice(0, 80),
      translationLatencyMs: 35,
      completedAt: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

class FailingTranslationProvider implements TranslationProvider {
  readonly name = "failing-translation";
  readonly configured = true;

  async translate(_request: TranslationRequest): Promise<TranslationResult> {
    throw new TranslationProviderError(
      "TRANSLATION_PROVIDER_REJECTED",
      "Translation provider rejected the request."
    );
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

class BlockingTranslationProvider implements TranslationProvider {
  readonly name = "blocking-translation";
  readonly configured = true;

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (request.signal.aborted) {
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_FAILED",
        "Translation request was cancelled."
      );
    }

    return new Promise<TranslationResult>((_resolve, reject) => {
      request.signal.addEventListener("abort", () => {
        reject(new TranslationProviderError(
          "TRANSLATION_PROVIDER_FAILED",
          "Translation request was cancelled."
        ));
      }, { once: true });
    });
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

let primary: RunningServer;
let primaryTranslation: FakeTranslationProvider;

before(async () => {
  primaryTranslation = new FakeTranslationProvider();
  primary = await startServer(
    new ScriptedSttProvider(),
    primaryTranslation
  );
});

after(async () => {
  await closeServer(primary.server);
});

async function startServer(
  sttProvider: SttProvider,
  translationProvider: TranslationProvider
): Promise<RunningServer> {
  const server = createVoiceBridgeServer(
    BASE_CONFIG,
    undefined,
    sttProvider,
    translationProvider
  );

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function api(
  baseUrl: string,
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
      recognition: "assemblyai",
      translation: "gemini",
      synthesis: null
    },
    voice: {
      voice_id: null,
      speaking_rate: null
    }
  };
}

function nextSocketEvents(
  socket: WebSocket,
  expectedType: string,
  count = 1
): Promise<Array<Record<string, any>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, any>> = [];
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}.`));
    }, 5000);

    const onMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) {
        return;
      }
      const event = JSON.parse(data.toString()) as Record<string, any>;
      if (event.event_type !== expectedType) {
        return;
      }
      events.push(event);
      if (events.length >= count) {
        cleanup();
        resolve(events);
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

async function nextSocketEvent(
  socket: WebSocket,
  expectedType: string
): Promise<Record<string, any>> {
  return (await nextSocketEvents(socket, expectedType, 1))[0]!;
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

async function createActiveSession(baseUrl: string): Promise<string> {
  const createdResponse = await api(baseUrl, "/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const startedResponse = await api(
    baseUrl,
    `/api/v1/sessions/${created.session_id}/start`,
    { method: "POST" }
  );
  assert.equal(startedResponse.status, 200);
  return created.session_id as string;
}

async function openStream(
  baseUrl: string,
  sessionId: string
): Promise<{ socket: WebSocket; ready: Record<string, any> }> {
  const ticketResponse = await api(
    baseUrl,
    `/api/v1/sessions/${sessionId}/stream-ticket`,
    { method: "POST" }
  );
  assert.equal(ticketResponse.status, 201);
  const ticket = await ticketResponse.json();

  const socketUrl = baseUrl.replace(/^http/, "ws") + ticket.stream_path;
  const socket = new WebSocket(socketUrl, ticket.protocols);
  const readyPromise = nextSocketEvent(socket, "STREAM_READY");
  await socketOpened(socket);
  const ready = await readyPromise;

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

  return { socket, ready };
}

async function stopStream(socket: WebSocket): Promise<Record<string, any>> {
  const completedPromise = nextSocketEvent(socket, "STREAM_COMPLETED");
  socket.send(JSON.stringify({
    event_type: "STREAM_STOP",
    sequence: 2,
    occurred_at: new Date().toISOString(),
    data: {}
  }));
  const completed = await completedPromise;
  await socketClosed(socket);
  return completed;
}

function translationRequest(
  overrides: Partial<TranslationRequest> = {}
): TranslationRequest {
  const controller = new AbortController();
  return {
    segmentId: "segment-1",
    sourceLanguage: "en",
    targetLanguage: "uk",
    sourceText: "Hello world.",
    context: ["Previous sentence."],
    requestedAt: new Date().toISOString(),
    signal: controller.signal,
    ...overrides
  };
}

test("health reports cloud 0.4.0 and translation capability", async () => {
  const response = await api(
    primary.baseUrl,
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
  const body = await response.json();
  assert.equal(body.version, "0.4.0");
  assert.deepEqual(body.capabilities.stt, {
    provider: "fake-stt",
    configured: true
  });
  assert.deepEqual(body.capabilities.translation, {
    provider: "fake-translation",
    configured: true,
    model: "gemini-3.1-flash-lite"
  });
  assert.equal(body.request_id, "test-health");
  assert.equal(body.correlation_id, "test-correlation");
});

test("configuration keeps Gemini optional with a validated model", () => {
  assert.throws(
    () => loadConfig({ TEST_ACCESS_TOKEN: "short" }),
    /at least 16 characters/
  );

  const loaded = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(loaded.assemblyAiApiKey, null);
  assert.equal(loaded.geminiApiKey, null);
  assert.equal(loaded.geminiTranslationModel, "gemini-3.1-flash-lite");

  assert.throws(
    () => loadConfig({
      TEST_ACCESS_TOKEN: TOKEN,
      GEMINI_TRANSLATION_MODEL: "invalid model"
    }),
    /GEMINI_TRANSLATION_MODEL/
  );
});

test("Gemini adapter sends structured output request", async () => {
  const requestedUrls: string[] = [];
  const requestedKeys: string[] = [];
  const requestedBodies: Array<Record<string, any>> = [];

  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    requestedUrls.push(String(input));
    requestedKeys.push(
      new Headers(init?.headers).get("x-goog-api-key") || ""
    );
    requestedBodies.push(
      JSON.parse(String(init?.body)) as Record<string, any>
    );

    return new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ translation: "Pryvit, svite." })
          }]
        }
      }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const provider = new GeminiTranslationProvider(
    "test-key",
    "test-model",
    "https://provider.test/v1beta/models",
    fetchImpl,
    1000
  );

  const result = await provider.translate(translationRequest());
  assert.equal(result.segmentId, "segment-1");
  assert.equal(result.provider, "gemini");
  assert.equal(result.translatedText, "Pryvit, svite.");
  assert.match(requestedUrls[0]!, /test-model:generateContent$/);
  assert.equal(requestedKeys[0], "test-key");

  const requestBody = requestedBodies[0]!;
  assert.equal(
    requestBody.generationConfig.responseMimeType,
    "application/json"
  );
  assert.equal(
    requestBody.generationConfig.responseJsonSchema.required[0],
    "translation"
  );

  await provider.close();
});

test("Gemini adapter maps malformed output, quota, and timeout", async () => {
  const malformed = new GeminiTranslationProvider(
    "test-key",
    "test-model",
    "https://provider.test/v1beta/models",
    async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "not-json" }] } }]
    }), { status: 200 }),
    1000
  );

  await assert.rejects(
    malformed.translate(translationRequest()),
    (error: unknown) =>
      error instanceof TranslationProviderError &&
      error.code === "TRANSLATION_INVALID_RESPONSE"
  );

  const rateLimited = new GeminiTranslationProvider(
    "test-key",
    "test-model",
    "https://provider.test/v1beta/models",
    async () => new Response("", { status: 429 }),
    1000
  );

  await assert.rejects(
    rateLimited.translate(translationRequest()),
    (error: unknown) =>
      error instanceof TranslationProviderError &&
      error.code === "TRANSLATION_RATE_LIMITED"
  );

  const timeoutProvider = new GeminiTranslationProvider(
    "test-key",
    "test-model",
    "https://provider.test/v1beta/models",
    async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
    10
  );

  await assert.rejects(
    timeoutProvider.translate(translationRequest()),
    (error: unknown) =>
      error instanceof TranslationProviderError &&
      error.code === "TRANSLATION_TIMEOUT"
  );
});

test("AssemblyAI adapter still aggregates audio and finalizes turns", async () => {
  const providerServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("listening", resolve);
    providerServer.once("error", reject);
  });

  const address = providerServer.address() as AddressInfo;
  const binaryPackets: Buffer[] = [];

  providerServer.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "Begin", id: "test-session" }));
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        binaryPackets.push(Buffer.from(data as Buffer));
        socket.send(JSON.stringify({
          type: "Turn",
          transcript: "Hello world.",
          end_of_turn: true,
          turn_is_formatted: true,
          words: [{ start: 0, end: 100, confidence: 0.95 }]
        }));
        return;
      }

      const message = JSON.parse(data.toString()) as { type?: string };
      if (message.type === "Terminate") {
        socket.close(1000);
      }
    });
  });

  const provider = new AssemblyAiSttProvider(
    "assembly-test-key",
    `ws://127.0.0.1:${address.port}/v3/ws`
  );

  let finalText = "";
  let resolveFinal: (() => void) | undefined;
  const finalReceived = new Promise<void>((resolve) => {
    resolveFinal = resolve;
  });

  const connection = await provider.connect(
    { sampleRateHz: 48000, channels: 1, language: "en-US" },
    {
      onStatus: () => undefined,
      onTranscript: (transcript) => {
        if (transcript.isFinal) {
          finalText = transcript.text;
          resolveFinal?.();
        }
      },
      onError: (_code, message) => assert.fail(message)
    }
  );

  for (let frame = 0; frame < 5; frame += 1) {
    assert.equal(connection.sendAudio(Buffer.alloc(1920)), true);
  }

  await finalReceived;
  await connection.close();
  await new Promise<void>((resolve, reject) => {
    providerServer.close((error) => error ? reject(error) : resolve());
  });

  assert.equal(binaryPackets.length, 1);
  assert.equal(binaryPackets[0]?.byteLength, 9600);
  assert.equal(finalText, "Hello world.");
});

test("authentication and session lifecycle remain stable", async () => {
  const missing = await api(
    primary.baseUrl,
    "/api/v1/sessions",
    { method: "POST" },
    null
  );
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).error.code, "AUTHENTICATION_REQUIRED");

  const invalid = await api(
    primary.baseUrl,
    "/api/v1/sessions",
    { method: "POST" },
    "invalid-token-value"
  );
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).error.code, "AUTHENTICATION_FAILED");

  const createResponse = await api(primary.baseUrl, "/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSessionRequest())
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.state, "CREATED");

  const started = await api(
    primary.baseUrl,
    `/api/v1/sessions/${created.session_id}/start`,
    { method: "POST" }
  );
  assert.equal((await started.json()).state, "ACTIVE");

  const repeatedStart = await api(
    primary.baseUrl,
    `/api/v1/sessions/${created.session_id}/start`,
    { method: "POST" }
  );
  assert.equal((await repeatedStart.json()).state, "ACTIVE");

  const stopped = await api(
    primary.baseUrl,
    `/api/v1/sessions/${created.session_id}/stop`,
    { method: "POST" }
  );
  assert.equal((await stopped.json()).state, "COMPLETED");
});

test("final STT identity is preserved through ordered translation", async () => {
  const sessionId = await createActiveSession(primary.baseUrl);
  const { socket, ready } = await openStream(primary.baseUrl, sessionId);
  assert.equal(ready.data.translation_provider, "fake-translation");
  assert.equal(ready.data.translation_configured, true);

  const partialPromise = nextSocketEvent(socket, "TRANSCRIPT_PARTIAL");
  const finalPromise = nextSocketEvent(socket, "TRANSCRIPT_FINAL");
  const translationPromise = nextSocketEvent(socket, "TRANSLATION_FINAL");

  socket.send(Buffer.alloc(1920));
  socket.send(Buffer.alloc(1920));

  const partial = await partialPromise;
  const final = await finalPromise;
  const translation = await translationPromise;

  assert.equal(partial.data.text, "Hello");
  assert.equal(final.data.text, "Hello world.");
  assert.match(final.data.segment_id, /^[0-9a-f-]{36}$/);
  assert.equal(translation.data.segment_id, final.data.segment_id);
  assert.equal(translation.data.provider, "fake-translation");
  assert.equal(translation.data.translation_latency_ms, 35);

  const completed = await stopStream(socket);
  assert.equal(completed.data.final_transcripts, 1);
  assert.equal(completed.data.final_translations, 1);
  assert.equal(completed.data.translation_errors, 0);
});

test("translation failure does not stop STT or streaming", async () => {
  const running = await startServer(
    new ScriptedSttProvider(),
    new FailingTranslationProvider()
  );

  try {
    const sessionId = await createActiveSession(running.baseUrl);
    const { socket } = await openStream(running.baseUrl, sessionId);
    const finalPromise = nextSocketEvent(socket, "TRANSCRIPT_FINAL");
    const errorPromise = nextSocketEvent(socket, "TRANSLATION_ERROR");

    socket.send(Buffer.alloc(1920));
    socket.send(Buffer.alloc(1920));

    const final = await finalPromise;
    const error = await errorPromise;
    assert.equal(final.data.text, "Hello world.");
    assert.equal(error.data.segment_id, final.data.segment_id);
    assert.equal(error.data.code, "TRANSLATION_PROVIDER_REJECTED");
    assert.equal(socket.readyState, WebSocket.OPEN);

    const completed = await stopStream(socket);
    assert.equal(completed.data.final_transcripts, 1);
    assert.equal(completed.data.final_translations, 0);
    assert.equal(completed.data.translation_errors, 1);
  } finally {
    await closeServer(running.server);
  }
});

test("translation queue preserves order and bounds context", async () => {
  const translator = new FakeTranslationProvider();
  const running = await startServer(
    new ScriptedSttProvider("sequence-stt", true, true),
    translator
  );

  try {
    const sessionId = await createActiveSession(running.baseUrl);
    const { socket } = await openStream(running.baseUrl, sessionId);
    const transcriptsPromise = nextSocketEvents(
      socket,
      "TRANSCRIPT_FINAL",
      6
    );
    const translationsPromise = nextSocketEvents(
      socket,
      "TRANSLATION_FINAL",
      6
    );

    for (let index = 0; index < 6; index += 1) {
      socket.send(Buffer.alloc(1920));
    }

    const transcripts = await transcriptsPromise;
    const translations = await translationsPromise;
    assert.deepEqual(
      translations.map((event) => event.data.segment_id),
      transcripts.map((event) => event.data.segment_id)
    );
    assert.equal(translator.requests.length, 6);

    const lastContext = translator.requests[5]?.context || [];
    assert.ok(lastContext.length <= 4);
    assert.ok(lastContext.join("").length <= 3000);

    await stopStream(socket);
  } finally {
    await closeServer(running.server);
  }
});

test("translation queue rejects work above twenty pending segments", async () => {
  const running = await startServer(
    new ScriptedSttProvider("queue-stt", true),
    new BlockingTranslationProvider()
  );

  try {
    const sessionId = await createActiveSession(running.baseUrl);
    const { socket } = await openStream(running.baseUrl, sessionId);
    const overflowPromise = nextSocketEvent(socket, "TRANSLATION_ERROR");

    for (let index = 0; index < 21; index += 1) {
      socket.send(Buffer.alloc(1920));
    }

    const overflow = await overflowPromise;
    assert.equal(overflow.data.code, "TRANSLATION_QUEUE_FULL");
    assert.equal(socket.readyState, WebSocket.OPEN);

    const completed = await stopStream(socket);
    assert.equal(completed.data.final_transcripts, 21);
    assert.equal(completed.data.translation_errors, 1);
  } finally {
    await closeServer(running.server);
  }
});
