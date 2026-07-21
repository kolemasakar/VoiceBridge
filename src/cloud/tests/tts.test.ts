import assert from "node:assert/strict";
import { test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import WebSocket, { type RawData } from "ws";
import type { AppConfig } from "../src/config.js";
import { loadConfig } from "../src/config.js";
import { createVoiceBridgeServer } from "../src/server.js";
import type {
  SttConnection,
  SttObserver,
  SttProvider,
  SttStreamOptions
} from "../src/stt_provider.js";
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult
} from "../src/translation_provider.js";
import type {
  TtsProvider,
  TtsRequest,
  TtsResult
} from "../src/tts_provider.js";
import {
  GeminiTtsProvider,
  TtsProviderError
} from "../src/tts_provider.js";

const TOKEN = "voicebridge-test-token-123456789";
const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: TOKEN,
  assemblyAiApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  geminiTtsModel: "gemini-2.5-flash-preview-tts",
  geminiTtsVoice: "Iapetus",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

class OneSegmentSttConnection implements SttConnection {
  private sent = false;

  constructor(private readonly observer: SttObserver) {}

  sendAudio(_frame: Buffer): boolean {
    if (!this.sent) {
      this.sent = true;
      this.observer.onTranscript({
        text: "Hello world.",
        isFinal: true,
        speechFinal: true,
        confidence: 0.98,
        audioStartMs: 0,
        audioDurationMs: 20,
        recognitionLatencyMs: 70
      });
    }
    return true;
  }

  async close(): Promise<void> {
    this.observer.onStatus("CLOSED");
  }
}

class OneSegmentSttProvider implements SttProvider {
  readonly name = "fake-stt";
  readonly configured = true;

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("READY");
    return new OneSegmentSttConnection(observer);
  }
}

class FakeTranslationProvider implements TranslationProvider {
  readonly name = "fake-translation";
  readonly configured = true;

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    return {
      segmentId: request.segmentId,
      provider: this.name,
      translatedText: "Pryvit, svite.",
      translationLatencyMs: 30,
      completedAt: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeTtsProvider implements TtsProvider {
  readonly name = "fake-tts";
  readonly configured = true;
  readonly requests: TtsRequest[] = [];

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    this.requests.push(request);
    const audio = Buffer.alloc(24576);
    return {
      segmentId: request.segmentId,
      provider: this.name,
      voice: request.voice,
      audioFormat: "pcm_s16le",
      sampleRateHz: 24000,
      channels: 1,
      audio,
      audioDurationMs: 512,
      ttsLatencyMs: 45,
      completedAt: new Date().toISOString()
    };
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

class FailingTtsProvider implements TtsProvider {
  readonly name = "failing-tts";
  readonly configured = true;

  async synthesize(_request: TtsRequest): Promise<TtsResult> {
    throw new TtsProviderError(
      "TTS_PROVIDER_REJECTED",
      "TTS provider rejected the request."
    );
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

async function startServer(
  ttsProvider: TtsProvider
): Promise<{ server: Server; baseUrl: string }> {
  const server = createVoiceBridgeServer(
    CONFIG,
    undefined,
    new OneSegmentSttProvider(),
    new FakeTranslationProvider(),
    ttsProvider
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
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
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${TOKEN}`);
  return fetch(baseUrl + path, { ...init, headers });
}

function sessionBody() {
  return {
    source_language: "en",
    target_language: "uk",
    runtime_mode: "YOUTUBE_MVP",
    input_type: "BROWSER_AUDIO",
    output_type: "BROWSER_PLAYBACK",
    provider_preferences: {
      recognition: "assemblyai",
      translation: "gemini",
      synthesis: "gemini"
    },
    voice: {
      voice_id: "Iapetus",
      speaking_rate: null
    }
  };
}

function nextEvents(
  socket: WebSocket,
  expected: string,
  count = 1,
  timeoutMs = 5000
): Promise<Array<Record<string, any>>> {
  return new Promise((resolve, reject) => {
    const events: Array<Record<string, any>> = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expected}.`));
    }, timeoutMs);
    const onMessage = (data: RawData, isBinary: boolean) => {
      if (isBinary) return;
      const event = JSON.parse(data.toString()) as Record<string, any>;
      if (event.event_type !== expected) return;
      events.push(event);
      if (events.length === count) {
        cleanup();
        resolve(events);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

async function createAndOpenStream(
  baseUrl: string
): Promise<WebSocket> {
  const createdResponse = await api(baseUrl, "/api/v1/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sessionBody())
  });
  const created = await createdResponse.json();
  await api(baseUrl, `/api/v1/sessions/${created.session_id}/start`, {
    method: "POST"
  });
  const ticketResponse = await api(
    baseUrl,
    `/api/v1/sessions/${created.session_id}/stream-ticket`,
    { method: "POST" }
  );
  const ticket = await ticketResponse.json();
  const socket = new WebSocket(
    baseUrl.replace(/^http/, "ws") + ticket.stream_path,
    ticket.protocols
  );
  const readyPromise = nextEvents(socket, "STREAM_READY");
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  const [ready] = await readyPromise;
  assert.equal(ready.data.tts_provider, "fake-tts");
  assert.equal(ready.data.tts_configured, true);

  const startedPromise = nextEvents(socket, "STREAM_STARTED");
  socket.send(JSON.stringify({
    event_type: "STREAM_START",
    data: {
      format: "pcm_s16le",
      sample_rate_hz: 48000,
      channels: 1,
      frame_duration_ms: 20
    }
  }));
  await startedPromise;
  return socket;
}

function ttsRequest(): TtsRequest {
  const controller = new AbortController();
  return {
    segmentId: "segment-1",
    language: "uk",
    text: "Pryvit, svite.",
    voice: "Iapetus",
    requestedAt: new Date().toISOString(),
    signal: controller.signal
  };
}

test("configuration exposes Gemini TTS defaults", () => {
  const config = loadConfig({ TEST_ACCESS_TOKEN: TOKEN });
  assert.equal(config.geminiTtsModel, "gemini-2.5-flash-preview-tts");
  assert.equal(config.geminiTtsVoice, "Iapetus");
  assert.throws(
    () => loadConfig({
      TEST_ACCESS_TOKEN: TOKEN,
      GEMINI_TTS_VOICE: "invalid voice"
    }),
    /GEMINI_TTS_VOICE/
  );
});

test("Gemini TTS adapter requests audio and validates PCM", async () => {
  let requestBody: Record<string, any> | null = null;
  const pcm = Buffer.alloc(48000);
  const provider = new GeminiTtsProvider(
    "test-key",
    "test-tts-model",
    "Iapetus",
    "https://provider.test/v1beta/models",
    async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, any>;
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                mimeType: "audio/L16;codec=pcm;rate=24000",
                data: pcm.toString("base64")
              }
            }]
          }
        }]
      }), { status: 200 });
    },
    1000
  );

  const result = await provider.synthesize(ttsRequest());
  assert.equal(result.segmentId, "segment-1");
  assert.equal(result.audioFormat, "pcm_s16le");
  assert.equal(result.sampleRateHz, 24000);
  assert.equal(result.channels, 1);
  assert.equal(result.audio.byteLength, 48000);
  assert.equal(result.audioDurationMs, 1000);
  assert.equal(requestBody?.generationConfig?.responseModalities?.[0], "AUDIO");
  assert.equal(
    requestBody?.generationConfig?.speechConfig?.voiceConfig
      ?.prebuiltVoiceConfig?.voiceName,
    "Iapetus"
  );
});

test("ordered translation produces bounded TTS audio events", async () => {
  const tts = new FakeTtsProvider();
  const running = await startServer(tts);
  try {
    const socket = await createAndOpenStream(running.baseUrl);
    const translationPromise = nextEvents(socket, "TRANSLATION_FINAL");
    const startPromise = nextEvents(socket, "TTS_AUDIO_START");
    const chunksPromise = nextEvents(socket, "TTS_AUDIO_CHUNK", 2);
    const endPromise = nextEvents(socket, "TTS_AUDIO_END");

    socket.send(Buffer.alloc(1920));
    const [translation] = await translationPromise;
    const [audioStart] = await startPromise;
    const chunks = await chunksPromise;
    const [audioEnd] = await endPromise;

    assert.equal(audioStart.data.segment_id, translation.data.segment_id);
    assert.equal(audioStart.data.chunk_count, 2);
    assert.equal(chunks[0].data.chunk_index, 0);
    assert.equal(chunks[1].data.chunk_index, 1);
    assert.equal(audioEnd.data.segment_id, translation.data.segment_id);
    assert.equal(tts.requests[0]?.text, "Pryvit, svite.");

    const completedPromise = nextEvents(socket, "STREAM_COMPLETED");
    socket.send(JSON.stringify({ event_type: "STREAM_STOP", data: {} }));
    const [completed] = await completedPromise;
    assert.equal(completed.data.final_translations, 1);
    assert.equal(completed.data.final_tts_segments, 1);
    assert.equal(completed.data.tts_errors, 0);
  } finally {
    await closeServer(running.server);
  }
});

test("TTS failure does not terminate STT or translation", async () => {
  const running = await startServer(new FailingTtsProvider());
  try {
    const socket = await createAndOpenStream(running.baseUrl);
    const translationPromise = nextEvents(socket, "TRANSLATION_FINAL");
    const errorPromise = nextEvents(socket, "TTS_ERROR");
    socket.send(Buffer.alloc(1920));
    const [translation] = await translationPromise;
    const [error] = await errorPromise;
    assert.equal(error.data.segment_id, translation.data.segment_id);
    assert.equal(error.data.code, "TTS_PROVIDER_REJECTED");
    assert.equal(socket.readyState, WebSocket.OPEN);

    const completedPromise = nextEvents(socket, "STREAM_COMPLETED");
    socket.send(JSON.stringify({ event_type: "STREAM_STOP", data: {} }));
    const [completed] = await completedPromise;
    assert.equal(completed.data.final_translations, 1);
    assert.equal(completed.data.final_tts_segments, 0);
    assert.equal(completed.data.tts_errors, 1);
  } finally {
    await closeServer(running.server);
  }
});
