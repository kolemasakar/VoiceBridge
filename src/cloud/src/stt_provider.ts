import WebSocket, { type RawData } from "ws";

const DEEPGRAM_ENDPOINT = "wss://api.deepgram.com/v1/listen";
const CONNECT_TIMEOUT_MS = 10000;
const CLOSE_TIMEOUT_MS = 3000;
const MAX_PROVIDER_BUFFERED_BYTES = 524288;
const MAX_PROVIDER_MESSAGE_BYTES = 1048576;

export interface SttStreamOptions {
  sampleRateHz: number;
  channels: 1;
  language: "en-US";
}

export interface SttTranscript {
  text: string;
  isFinal: boolean;
  speechFinal: boolean;
  confidence: number | null;
  audioStartMs: number;
  audioDurationMs: number;
  recognitionLatencyMs: number;
}

export interface SttObserver {
  onStatus(status: "READY" | "CLOSED" | "NOT_CONFIGURED"): void;
  onTranscript(transcript: SttTranscript): void;
  onError(code: string, message: string): void;
}

export interface SttConnection {
  sendAudio(frame: Buffer): boolean;
  close(): Promise<void>;
}

export interface SttProvider {
  readonly name: string;
  readonly configured: boolean;
  connect(
    options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection>;
}

class DisabledSttConnection implements SttConnection {
  sendAudio(_frame: Buffer): boolean {
    return true;
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export class DisabledSttProvider implements SttProvider {
  readonly name = "deepgram";
  readonly configured = false;

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("NOT_CONFIGURED");
    return new DisabledSttConnection();
  }
}

interface DeepgramAlternative {
  transcript?: unknown;
  confidence?: unknown;
}

interface DeepgramResult {
  type?: unknown;
  start?: unknown;
  duration?: unknown;
  is_final?: unknown;
  speech_final?: unknown;
  channel?: {
    alternatives?: DeepgramAlternative[];
  };
}

function rawDataText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function parseTranscript(
  result: DeepgramResult,
  connectedAt: number
): SttTranscript | null {
  if (result.type !== "Results") {
    return null;
  }

  const alternative = result.channel?.alternatives?.[0];
  const text = typeof alternative?.transcript === "string"
    ? alternative.transcript.trim().slice(-8000)
    : "";

  if (!text) {
    return null;
  }

  const audioStartMs = Math.round(finiteNumber(result.start, 0) * 1000);
  const audioDurationMs = Math.round(
    finiteNumber(result.duration, 0) * 1000
  );
  const audioEndMs = audioStartMs + audioDurationMs;
  const streamElapsedMs = Date.now() - connectedAt;
  const confidence = finiteNumber(alternative?.confidence, -1);

  return {
    text,
    isFinal: result.is_final === true,
    speechFinal: result.speech_final === true,
    confidence: confidence >= 0 ? confidence : null,
    audioStartMs,
    audioDurationMs,
    recognitionLatencyMs: Math.max(0, streamElapsedMs - audioEndMs)
  };
}

class DeepgramSttConnection implements SttConnection {
  constructor(private readonly socket: WebSocket) {}

  sendAudio(frame: Buffer): boolean {
    if (
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_PROVIDER_BUFFERED_BYTES
    ) {
      return false;
    }

    this.socket.send(frame);
    return true;
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return;
    }

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: "CloseStream" }));
    }

    await Promise.race([
      new Promise<void>((resolve) => {
        this.socket.once("close", () => resolve());
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, CLOSE_TIMEOUT_MS);
      })
    ]);

    if (Number(this.socket.readyState) !== WebSocket.CLOSED) {
      this.socket.terminate();
    }

  }
}

export class DeepgramSttProvider implements SttProvider {
  readonly name = "deepgram";
  readonly configured = true;

  constructor(private readonly apiKey: string) {}

  connect(
    options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    const url = new URL(DEEPGRAM_ENDPOINT);
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("language", options.language);
    url.searchParams.set("encoding", "linear16");
    url.searchParams.set("sample_rate", String(options.sampleRateHz));
    url.searchParams.set("channels", String(options.channels));
    url.searchParams.set("interim_results", "true");
    url.searchParams.set("smart_format", "true");
    url.searchParams.set("punctuate", "true");
    url.searchParams.set("endpointing", "300");
    url.searchParams.set("utterance_end_ms", "1000");
    url.searchParams.set("vad_events", "true");

    return new Promise((resolve, reject) => {
      const connectedAt = Date.now();
      const socket = new WebSocket(url, {
        headers: { authorization: `Token ${this.apiKey}` },
        perMessageDeflate: false,
        maxPayload: MAX_PROVIDER_MESSAGE_BYTES
      });
      let settled = false;
      let opened = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.terminate();
        reject(new Error("STT provider connection timed out."));
      }, CONNECT_TIMEOUT_MS);

      socket.on("open", () => {
        if (settled) {
          return;
        }
        settled = true;
        opened = true;
        clearTimeout(timeout);
        observer.onStatus("READY");
        resolve(new DeepgramSttConnection(socket));
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          return;
        }

        let result: DeepgramResult;
        try {
          result = JSON.parse(rawDataText(data)) as DeepgramResult;
        } catch {
          observer.onError(
            "STT_INVALID_RESPONSE",
            "The STT provider returned invalid JSON."
          );
          return;
        }

        const transcript = parseTranscript(result, connectedAt);
        if (transcript) {
          observer.onTranscript(transcript);
        }
      });

      socket.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error("Unable to connect to the STT provider."));
          return;
        }
        observer.onError(
          "STT_PROVIDER_ERROR",
          "The STT provider connection failed."
        );
      });

      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(
            `STT provider rejected the connection with HTTP ${response.statusCode}.`
          ));
        }
      });

      socket.on("close", () => {
        clearTimeout(timeout);
        if (!opened) {
          if (!settled) {
            settled = true;
            reject(new Error("STT provider closed before becoming ready."));
          }
          return;
        }
        observer.onStatus("CLOSED");
      });
    });
  }
}

export function createSttProvider(apiKey: string | null): SttProvider {
  return apiKey
    ? new DeepgramSttProvider(apiKey)
    : new DisabledSttProvider();
}
