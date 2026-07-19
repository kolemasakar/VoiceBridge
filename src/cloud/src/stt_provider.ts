import WebSocket, { type RawData } from "ws";

const ASSEMBLYAI_ENDPOINT = "wss://streaming.assemblyai.com/v3/ws";
const CONNECT_TIMEOUT_MS = 10000;
const CLOSE_TIMEOUT_MS = 3000;
const TARGET_AUDIO_CHUNK_MS = 100;
const MINIMUM_AUDIO_CHUNK_MS = 50;
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
  readonly name = "assemblyai";
  readonly configured = false;

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("NOT_CONFIGURED");
    return new DisabledSttConnection();
  }
}

interface AssemblyAiWord {
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
}

interface AssemblyAiMessage {
  type?: unknown;
  transcript?: unknown;
  end_of_turn?: unknown;
  turn_is_formatted?: unknown;
  words?: AssemblyAiWord[];
  error?: unknown;
  message?: unknown;
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

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function parseTranscript(
  result: AssemblyAiMessage,
  openedAt: number
): SttTranscript | null {
  if (result.type !== "Turn") {
    return null;
  }

  const text = typeof result.transcript === "string"
    ? result.transcript.trim().slice(-8000)
    : "";

  if (!text) {
    return null;
  }

  const words = Array.isArray(result.words) ? result.words : [];
  const starts = words
    .map((word) => finiteNumber(word.start))
    .filter((value): value is number => value !== null);
  const ends = words
    .map((word) => finiteNumber(word.end))
    .filter((value): value is number => value !== null);
  const confidences = words
    .map((word) => finiteNumber(word.confidence))
    .filter((value): value is number => value !== null && value >= 0);

  const audioStartMs = starts.length > 0 ? Math.min(...starts) : 0;
  const audioEndMs = ends.length > 0 ? Math.max(...ends) : audioStartMs;
  const confidence = confidences.length > 0
    ? confidences.reduce((total, value) => total + value, 0) /
      confidences.length
    : null;
  const isFinal =
    result.end_of_turn === true && result.turn_is_formatted === true;

  return {
    text,
    isFinal,
    speechFinal: isFinal,
    confidence,
    audioStartMs: Math.round(audioStartMs),
    audioDurationMs: Math.max(0, Math.round(audioEndMs - audioStartMs)),
    recognitionLatencyMs: Math.max(
      0,
      Date.now() - openedAt - Math.round(audioEndMs)
    )
  };
}

class AssemblyAiSttConnection implements SttConnection {
  private readonly targetChunkBytes: number;
  private readonly minimumChunkBytes: number;
  private pendingFrames: Buffer[] = [];
  private pendingBytes = 0;

  constructor(
    private readonly socket: WebSocket,
    sampleRateHz: number,
    channels: number
  ) {
    const bytesPerMillisecond = sampleRateHz * channels * 2 / 1000;
    this.targetChunkBytes = Math.ceil(
      bytesPerMillisecond * TARGET_AUDIO_CHUNK_MS
    );
    this.minimumChunkBytes = Math.ceil(
      bytesPerMillisecond * MINIMUM_AUDIO_CHUNK_MS
    );
  }

  sendAudio(frame: Buffer): boolean {
    if (
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_PROVIDER_BUFFERED_BYTES
    ) {
      return false;
    }

    this.pendingFrames.push(frame);
    this.pendingBytes += frame.byteLength;

    if (this.pendingBytes < this.targetChunkBytes) {
      return true;
    }

    return this.flushPendingAudio();
  }

  private flushPendingAudio(): boolean {
    if (
      this.pendingBytes === 0 ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_PROVIDER_BUFFERED_BYTES
    ) {
      return this.pendingBytes === 0;
    }

    const audio = Buffer.concat(this.pendingFrames, this.pendingBytes);
    this.pendingFrames = [];
    this.pendingBytes = 0;
    this.socket.send(audio);
    return true;
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return;
    }

    const closed = new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
    });

    if (this.socket.readyState === WebSocket.OPEN) {
      if (this.pendingBytes >= this.minimumChunkBytes) {
        this.flushPendingAudio();
      }
      this.pendingFrames = [];
      this.pendingBytes = 0;
      this.socket.send(JSON.stringify({ type: "Terminate" }));
    }

    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        setTimeout(resolve, CLOSE_TIMEOUT_MS);
      })
    ]);

    if (Number(this.socket.readyState) !== WebSocket.CLOSED) {
      this.socket.terminate();
    }
  }
}

export class AssemblyAiSttProvider implements SttProvider {
  readonly name = "assemblyai";
  readonly configured = true;

  constructor(
    private readonly apiKey: string,
    private readonly endpoint = ASSEMBLYAI_ENDPOINT
  ) {}

  connect(
    options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    const url = new URL(this.endpoint);
    url.searchParams.set("sample_rate", String(options.sampleRateHz));
    url.searchParams.set("speech_model", "universal-streaming-english");
    url.searchParams.set("format_turns", "true");

    return new Promise((resolve, reject) => {
      let openedAt = Date.now();
      const socket = new WebSocket(url, {
        headers: { Authorization: this.apiKey },
        perMessageDeflate: false,
        maxPayload: MAX_PROVIDER_MESSAGE_BYTES
      });
      const connection = new AssemblyAiSttConnection(
        socket,
        options.sampleRateHz,
        options.channels
      );
      let settled = false;
      let ready = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.terminate();
        reject(new Error("STT provider connection timed out."));
      }, CONNECT_TIMEOUT_MS);

      socket.on("open", () => {
        openedAt = Date.now();
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          return;
        }

        let result: AssemblyAiMessage;
        try {
          result = JSON.parse(rawDataText(data)) as AssemblyAiMessage;
        } catch {
          observer.onError(
            "STT_INVALID_RESPONSE",
            "The STT provider returned invalid JSON."
          );
          return;
        }

        if (result.type === "Begin" && !settled) {
          settled = true;
          ready = true;
          clearTimeout(timeout);
          observer.onStatus("READY");
          resolve(connection);
          return;
        }

        if (result.type === "Error") {
          const providerMessage = typeof result.error === "string"
            ? result.error
            : typeof result.message === "string"
              ? result.message
              : "The STT provider reported an error.";
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error("STT provider rejected the session."));
            return;
          }
          observer.onError("STT_PROVIDER_ERROR", providerMessage.slice(0, 500));
          return;
        }

        const transcript = parseTranscript(result, openedAt);
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
        if (!ready) {
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
    ? new AssemblyAiSttProvider(apiKey)
    : new DisabledSttProvider();
}
