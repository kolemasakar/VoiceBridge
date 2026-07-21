const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_SOURCE_CHARACTERS = 2000;
const MAX_CONTEXT_CHARACTERS = 3000;
const MAX_CONTEXT_SEGMENTS = 4;
const MAX_TRANSLATION_CHARACTERS = 4000;

export type TranslationErrorCode =
  | "TRANSLATION_NOT_CONFIGURED"
  | "TRANSLATION_TIMEOUT"
  | "TRANSLATION_RATE_LIMITED"
  | "TRANSLATION_INVALID_RESPONSE"
  | "TRANSLATION_PROVIDER_REJECTED"
  | "TRANSLATION_PROVIDER_FAILED";

export interface TranslationRequest {
  segmentId: string;
  sourceLanguage: "en";
  targetLanguage: "uk";
  sourceText: string;
  context: string[];
  requestedAt: string;
  signal: AbortSignal;
}

export interface TranslationResult {
  segmentId: string;
  provider: string;
  translatedText: string;
  translationLatencyMs: number;
  completedAt: string;
}

export interface TranslationProvider {
  readonly name: string;
  readonly configured: boolean;
  translate(request: TranslationRequest): Promise<TranslationResult>;
  close(): Promise<void>;
}

export class TranslationProviderError extends Error {
  constructor(
    public readonly code: TranslationErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly retryAfterMs: number | null = null
  ) {
    super(message);
    this.name = "TranslationProviderError";
  }
}

export class DisabledTranslationProvider implements TranslationProvider {
  readonly name = "gemini";
  readonly configured = false;

  async translate(_request: TranslationRequest): Promise<TranslationResult> {
    throw new TranslationProviderError(
      "TRANSLATION_NOT_CONFIGURED",
      "Translation provider is not configured."
    );
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

interface GeminiPart {
  text?: unknown;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function limitedContext(context: string[]): string[] {
  const selected = context
    .slice(-MAX_CONTEXT_SEGMENTS)
    .map((value) => value.trim())
    .filter(Boolean);
  const result: string[] = [];
  let remaining = MAX_CONTEXT_CHARACTERS;

  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const value = selected[index];
    if (!value || remaining <= 0) {
      continue;
    }
    const clipped = value.slice(-remaining);
    result.unshift(clipped);
    remaining -= clipped.length;
  }

  return result;
}

function promptFor(request: TranslationRequest): string {
  const sourceText = request.sourceText.trim().slice(0, MAX_SOURCE_CHARACTERS);
  if (!sourceText) {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "The source segment is empty."
    );
  }

  const context = limitedContext(request.context);
  const contextText = context.length > 0
    ? context.map((text, index) => `${index + 1}. ${text}`).join("\n")
    : "None";

  return [
    "Translate the final English speech segment into natural Ukrainian suitable for speech synthesis.",
    "Preserve meaning, names, numbers, tone, and conversational intent.",
    "Use the prior English context only to resolve ambiguity.",
    "Return only a JSON object with one string field named translation.",
    "Do not add explanations, Markdown, commentary, or the English source text.",
    "",
    "Prior final English context:",
    contextText,
    "",
    "Final English segment:",
    sourceText
  ].join("\n");
}

function responseText(body: GeminiResponse): string {
  const parts = body.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim();
}

function parsedTranslation(value: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Translation provider returned malformed structured output."
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Translation provider returned an invalid structured result."
    );
  }

  const translation = (parsed as Record<string, unknown>).translation;
  if (typeof translation !== "string" || !translation.trim()) {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Translation provider returned an empty translation."
    );
  }

  return translation.trim().slice(0, MAX_TRANSLATION_CHARACTERS);
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(120000, Math.round(seconds * 1000));
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    return Math.min(120000, Math.max(0, timestamp - Date.now()));
  }
  return null;
}

export class GeminiTranslationProvider implements TranslationProvider {
  readonly name = "gemini";
  readonly configured = true;
  private closed = false;
  private readonly activeControllers = new Set<AbortController>();

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly endpoint = GEMINI_API_BASE,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (this.closed) {
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_FAILED",
        "Translation provider is closed."
      );
    }

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
            role: "user",
            parts: [{ text: promptFor(request) }]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              properties: {
                translation: { type: "string" }
              },
              required: ["translation"],
              additionalProperties: false
            }
          }
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new TranslationProviderError(
            "TRANSLATION_RATE_LIMITED",
            "Translation provider quota or rate limit was reached.",
            true,
            retryAfterMilliseconds(response)
          );
        }
        if ([500, 502, 503, 504].includes(response.status)) {
          throw new TranslationProviderError(
            "TRANSLATION_PROVIDER_FAILED",
            `Translation provider is temporarily unavailable with HTTP ${response.status}.`,
            true,
            retryAfterMilliseconds(response)
          );
        }
        throw new TranslationProviderError(
          "TRANSLATION_PROVIDER_REJECTED",
          `Translation provider rejected the request with HTTP ${response.status}.`
        );
      }

      let body: GeminiResponse;
      try {
        body = await response.json() as GeminiResponse;
      } catch {
        throw new TranslationProviderError(
          "TRANSLATION_INVALID_RESPONSE",
          "Translation provider returned invalid JSON."
        );
      }

      const translatedText = parsedTranslation(responseText(body));
      return {
        segmentId: request.segmentId,
        provider: this.name,
        translatedText,
        translationLatencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof TranslationProviderError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new TranslationProviderError(
          timedOut ? "TRANSLATION_TIMEOUT" : "TRANSLATION_PROVIDER_FAILED",
          timedOut
            ? "Translation provider request timed out."
            : "Translation provider request was cancelled.",
          timedOut
        );
      }
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_FAILED",
        "Translation provider request failed.",
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

export function createTranslationProvider(
  apiKey: string | null,
  model: string
): TranslationProvider {
  return apiKey
    ? new GeminiTranslationProvider(apiKey, model)
    : new DisabledTranslationProvider();
}
