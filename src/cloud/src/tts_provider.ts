const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TEXT_CHARACTERS = 4000;
const SAMPLE_RATE_HZ = 24000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const MAX_AUDIO_BYTES = 8388608;
const AZURE_OUTPUT_FORMAT = "raw-24khz-16bit-mono-pcm";

export type TtsErrorCode =
  | "TTS_NOT_CONFIGURED"
  | "TTS_TIMEOUT"
  | "TTS_RATE_LIMITED"
  | "TTS_INVALID_RESPONSE"
  | "TTS_PROVIDER_REJECTED"
  | "TTS_PROVIDER_FAILED";

export interface TtsRequest {
  segmentId: string;
  language: "uk";
  text: string;
  voice: string;
  requestedAt: string;
  signal: AbortSignal;
}

export interface TtsResult {
  segmentId: string;
  provider: string;
  voice: string;
  audioFormat: "pcm_s16le";
  sampleRateHz: number;
  channels: number;
  audio: Buffer;
  audioDurationMs: number;
  ttsLatencyMs: number;
  completedAt: string;
}

export interface TtsProvider {
  readonly name: string;
  readonly configured: boolean;
  synthesize(request: TtsRequest): Promise<TtsResult>;
  close(): Promise<void>;
}

export interface TtsProviderOptions {
  provider?: string;
  geminiApiKey?: string | null;
  geminiModel?: string;
  geminiVoice?: string;
  azureSpeechKey?: string | null;
  azureSpeechRegion?: string;
  azureVoice?: string;
}

export class TtsProviderError extends Error {
  constructor(
    public readonly code: TtsErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = "TtsProviderError";
  }
}

export class DisabledTtsProvider implements TtsProvider {
  readonly configured = false;

  constructor(readonly name = "gemini") {}

  async synthesize(_request: TtsRequest): Promise<TtsResult> {
    throw new TtsProviderError(
      "TTS_NOT_CONFIGURED",
      "TTS provider is not configured."
    );
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

interface GeminiInlineData {
  data?: unknown;
  mimeType?: unknown;
}

interface GeminiPart {
  inlineData?: GeminiInlineData;
  inline_data?: GeminiInlineData;
  text?: unknown;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function validatedText(value: string): string {
  const text = value.trim().slice(0, MAX_TEXT_CHARACTERS);
  if (!text) {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "The TTS source segment is empty."
    );
  }
  return text;
}

function validatedAudio(audio: Buffer): Buffer {
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "TTS provider returned an invalid audio size."
    );
  }
  if (audio.byteLength % BYTES_PER_SAMPLE !== 0) {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "TTS provider returned unaligned PCM audio."
    );
  }
  return audio;
}

function synthesisPrompt(text: string): string {
  return [
    "Generate natural Ukrainian speech for the exact transcript below.",
    "Speak clearly at a conversational pace.",
    "Keep the supplied paragraph order and use short natural pauses between paragraphs.",
    "Do not translate, explain, summarize, add words, or read these instructions.",
    "Transcript:",
    text
  ].join("\n");
}

function audioData(response: GeminiResponse): Buffer {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "TTS provider returned no audio parts."
    );
  }

  const inline = parts
    .map((part) => part.inlineData || part.inline_data)
    .find((value) => value && typeof value.data === "string");
  if (!inline || typeof inline.data !== "string") {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "TTS provider returned no audio data."
    );
  }

  return validatedAudio(Buffer.from(inline.data, "base64"));
}

function audioDurationMs(audio: Buffer): number {
  return Math.round(
    audio.byteLength /
      (SAMPLE_RATE_HZ * CHANNELS * BYTES_PER_SAMPLE) *
      1000
  );
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(180000, Math.round(seconds * 1000));
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.min(180000, Math.max(0, timestamp - Date.now()));
  }
  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function azureSsml(text: string, voice: string): string {
  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="uk-UA">',
    `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice>`,
    "</speak>"
  ].join("");
}

function azureEndpoint(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

abstract class BaseTtsProvider implements TtsProvider {
  abstract readonly name: string;
  readonly configured = true;
  protected closed = false;
  protected readonly activeControllers = new Set<AbortController>();

  abstract synthesize(request: TtsRequest): Promise<TtsResult>;

  protected async executeRequest(
    request: TtsRequest,
    operation: (signal: AbortSignal) => Promise<TtsResult>,
    timeoutMs: number
  ): Promise<TtsResult> {
    if (this.closed) {
      throw new TtsProviderError(
        "TTS_PROVIDER_FAILED",
        "TTS provider is closed."
      );
    }

    const controller = new AbortController();
    this.activeControllers.add(controller);
    let timedOut = false;
    const abortFromSession = () => controller.abort();
    request.signal.addEventListener("abort", abortFromSession, { once: true });
    if (request.signal.aborted) {
      controller.abort();
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      if (error instanceof TtsProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TtsProviderError(
          timedOut ? "TTS_TIMEOUT" : "TTS_PROVIDER_FAILED",
          timedOut
            ? "TTS provider request timed out."
            : "TTS provider request was cancelled.",
          timedOut
        );
      }
      throw new TtsProviderError(
        "TTS_PROVIDER_FAILED",
        "TTS provider request failed.",
        true
      );
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", abortFromSession);
      this.activeControllers.delete(controller);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.activeControllers) {
      controller.abort();
    }
    this.activeControllers.clear();
  }
}

export class GeminiTtsProvider extends BaseTtsProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultVoice: string,
    private readonly endpoint = GEMINI_API_BASE,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    super();
  }

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const text = validatedText(request.text);
    const voice = request.voice || this.defaultVoice;
    const startedAt = Date.now();
    const endpoint = `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent`;

    return this.executeRequest(request, async (signal) => {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: synthesisPrompt(text) }]
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voice }
              }
            }
          }
        }),
        signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new TtsProviderError(
            "TTS_RATE_LIMITED",
            "TTS provider quota or rate limit was reached.",
            true,
            retryAfterMilliseconds(response)
          );
        }
        if ([500, 502, 503, 504].includes(response.status)) {
          throw new TtsProviderError(
            "TTS_PROVIDER_FAILED",
            `TTS provider is temporarily unavailable with HTTP ${response.status}.`,
            true,
            retryAfterMilliseconds(response)
          );
        }
        throw new TtsProviderError(
          "TTS_PROVIDER_REJECTED",
          `TTS provider rejected the request with HTTP ${response.status}.`
        );
      }

      let body: GeminiResponse;
      try {
        body = await response.json() as GeminiResponse;
      } catch {
        throw new TtsProviderError(
          "TTS_INVALID_RESPONSE",
          "TTS provider returned invalid JSON."
        );
      }

      const audio = audioData(body);
      return {
        segmentId: request.segmentId,
        provider: this.name,
        voice,
        audioFormat: "pcm_s16le",
        sampleRateHz: SAMPLE_RATE_HZ,
        channels: CHANNELS,
        audio,
        audioDurationMs: audioDurationMs(audio),
        ttsLatencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString()
      };
    }, this.timeoutMs);
  }
}

export class AzureTtsProvider extends BaseTtsProvider {
  readonly name = "azure";

  constructor(
    private readonly apiKey: string,
    private readonly region: string,
    private readonly defaultVoice: string,
    private readonly endpoint = azureEndpoint(region),
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    super();
  }

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const text = validatedText(request.text);
    const voice = request.voice || this.defaultVoice;
    const startedAt = Date.now();

    return this.executeRequest(request, async (signal) => {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": AZURE_OUTPUT_FORMAT,
          "User-Agent": "VoiceBridge"
        },
        body: azureSsml(text, voice),
        signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new TtsProviderError(
            "TTS_RATE_LIMITED",
            "Azure Speech quota or rate limit was reached.",
            true,
            retryAfterMilliseconds(response)
          );
        }
        if ([500, 502, 503, 504].includes(response.status)) {
          throw new TtsProviderError(
            "TTS_PROVIDER_FAILED",
            `Azure Speech is temporarily unavailable with HTTP ${response.status}.`,
            true,
            retryAfterMilliseconds(response)
          );
        }
        throw new TtsProviderError(
          "TTS_PROVIDER_REJECTED",
          `Azure Speech rejected the request with HTTP ${response.status}.`
        );
      }

      let audio: Buffer;
      try {
        audio = validatedAudio(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        if (error instanceof TtsProviderError) {
          throw error;
        }
        throw new TtsProviderError(
          "TTS_INVALID_RESPONSE",
          "Azure Speech returned invalid PCM audio."
        );
      }

      return {
        segmentId: request.segmentId,
        provider: this.name,
        voice,
        audioFormat: "pcm_s16le",
        sampleRateHz: SAMPLE_RATE_HZ,
        channels: CHANNELS,
        audio,
        audioDurationMs: audioDurationMs(audio),
        ttsLatencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString()
      };
    }, this.timeoutMs);
  }
}

export function createTtsProvider(options: TtsProviderOptions): TtsProvider {
  const provider = (options.provider || "gemini").toLowerCase();
  if (provider === "azure") {
    return options.azureSpeechKey
      ? new AzureTtsProvider(
        options.azureSpeechKey,
        options.azureSpeechRegion || "eastus",
        options.azureVoice || "uk-UA-OstapNeural"
      )
      : new DisabledTtsProvider("azure");
  }

  return options.geminiApiKey
    ? new GeminiTtsProvider(
      options.geminiApiKey,
      options.geminiModel || "gemini-2.5-flash-preview-tts",
      options.geminiVoice || "Iapetus"
    )
    : new DisabledTtsProvider("gemini");
}
