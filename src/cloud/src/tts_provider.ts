const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_TEXT_CHARACTERS = 4000;
const SAMPLE_RATE_HZ = 24000;
const CHANNELS = 1;
const BYTES_PER_SAMPLE = 2;
const MAX_AUDIO_BYTES = 2097152;

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

export class TtsProviderError extends Error {
  constructor(
    public readonly code: TtsErrorCode,
    message: string
  ) {
    super(message);
    this.name = "TtsProviderError";
  }
}

export class DisabledTtsProvider implements TtsProvider {
  readonly name = "gemini";
  readonly configured = false;

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

function synthesisPrompt(text: string): string {
  return [
    "Generate natural Ukrainian speech for the exact transcript below.",
    "Speak clearly at a conversational pace.",
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

  let audio: Buffer;
  try {
    audio = Buffer.from(inline.data, "base64");
  } catch {
    throw new TtsProviderError(
      "TTS_INVALID_RESPONSE",
      "TTS provider returned malformed audio data."
    );
  }

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

function audioDurationMs(audio: Buffer): number {
  return Math.round(
    audio.byteLength /
      (SAMPLE_RATE_HZ * CHANNELS * BYTES_PER_SAMPLE) *
      1000
  );
}

export class GeminiTtsProvider implements TtsProvider {
  readonly name = "gemini";
  readonly configured = true;
  private closed = false;
  private readonly activeControllers = new Set<AbortController>();

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly defaultVoice: string,
    private readonly endpoint = GEMINI_API_BASE,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    if (this.closed) {
      throw new TtsProviderError(
        "TTS_PROVIDER_FAILED",
        "TTS provider is closed."
      );
    }

    const text = validatedText(request.text);
    const voice = request.voice || this.defaultVoice;
    const startedAt = Date.now();
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
    }, this.timeoutMs);
    const endpoint = `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: synthesisPrompt(text)
            }]
          }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice
                }
              }
            }
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new TtsProviderError(
            "TTS_RATE_LIMITED",
            "TTS provider quota or rate limit was reached."
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
    } catch (error) {
      if (error instanceof TtsProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TtsProviderError(
          timedOut ? "TTS_TIMEOUT" : "TTS_PROVIDER_FAILED",
          timedOut
            ? "TTS provider request timed out."
            : "TTS provider request was cancelled."
        );
      }
      throw new TtsProviderError(
        "TTS_PROVIDER_FAILED",
        "TTS provider request failed."
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

export function createTtsProvider(
  apiKey: string | null,
  model: string,
  voice: string
): TtsProvider {
  return apiKey
    ? new GeminiTtsProvider(apiKey, model, voice)
    : new DisabledTtsProvider();
}
