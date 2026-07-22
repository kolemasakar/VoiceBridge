const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const AZURE_TRANSLATOR_API_BASE = "https://api.cognitive.microsofttranslator.com";
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

export interface TranslationProviderOptions {
  provider?: string;
  fallbackProvider?: string;
  geminiApiKey?: string | null;
  geminiModel?: string;
  azureTranslatorKey?: string | null;
  azureTranslatorRegion?: string;
  azureTranslatorEndpoint?: string;
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
  readonly configured = false;

  constructor(readonly name = "gemini") {}

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

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

abstract class BaseTranslationProvider implements TranslationProvider {
  abstract readonly name: string;
  readonly configured = true;
  private closed = false;
  private readonly activeControllers = new Set<AbortController>();

  protected async executeRequest(
    request: TranslationRequest,
    operation: (signal: AbortSignal) => Promise<TranslationResult>,
    timeoutMs: number
  ): Promise<TranslationResult> {
    if (this.closed) {
      throw new TranslationProviderError(
        "TRANSLATION_PROVIDER_FAILED",
        "Translation provider is closed."
      );
    }

    const controller = new AbortController();
    this.activeControllers.add(controller);
    let timedOut = false;
    const abortFromSession = () => controller.abort();
    request.signal.addEventListener("abort", abortFromSession, { once: true });
    if (request.signal.aborted) controller.abort();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      if (error instanceof TranslationProviderError) throw error;
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

  abstract translate(request: TranslationRequest): Promise<TranslationResult>;

  async close(): Promise<void> {
    this.closed = true;
    for (const controller of this.activeControllers) controller.abort();
    this.activeControllers.clear();
  }
}

function sourceText(request: TranslationRequest): string {
  const text = request.sourceText.trim().slice(0, MAX_SOURCE_CHARACTERS);
  if (!text) {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "The source segment is empty."
    );
  }
  return text;
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(120000, Math.round(seconds * 1000));
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? null
    : Math.min(120000, Math.max(0, timestamp - Date.now()));
}

function providerHttpError(
  response: Response,
  providerName: string
): TranslationProviderError {
  if (response.status === 429) {
    return new TranslationProviderError(
      "TRANSLATION_RATE_LIMITED",
      `${providerName} quota or rate limit was reached.`,
      true,
      retryAfterMilliseconds(response)
    );
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    return new TranslationProviderError(
      "TRANSLATION_PROVIDER_FAILED",
      `${providerName} is temporarily unavailable with HTTP ${response.status}.`,
      true,
      retryAfterMilliseconds(response)
    );
  }
  return new TranslationProviderError(
    "TRANSLATION_PROVIDER_REJECTED",
    `${providerName} rejected the request with HTTP ${response.status}.`
  );
}

function limitedContext(context: string[]): string[] {
  const selected = context
    .slice(-MAX_CONTEXT_SEGMENTS)
    .map((value) => value.trim())
    .filter(Boolean);
  const result: string[] = [];
  let remaining = MAX_CONTEXT_CHARACTERS;
  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const value = selected[index];
    if (!value || remaining <= 0) continue;
    const clipped = value.slice(-remaining);
    result.unshift(clipped);
    remaining -= clipped.length;
  }
  return result;
}

function promptFor(request: TranslationRequest): string {
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
    sourceText(request)
  ].join("\n");
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: unknown }>;
    };
  }>;
}

function parsedGeminiTranslation(body: GeminiResponse): string {
  const value = body.candidates?.[0]?.content?.parts
    ?.map((part) => typeof part.text === "string" ? part.text : "")
    .join("")
    .trim() || "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Translation provider returned malformed structured output."
    );
  }
  const translation = parsed && typeof parsed === "object"
    ? (parsed as Record<string, unknown>).translation
    : null;
  if (typeof translation !== "string" || !translation.trim()) {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Translation provider returned an empty translation."
    );
  }
  return translation.trim().slice(0, MAX_TRANSLATION_CHARACTERS);
}

export class GeminiTranslationProvider extends BaseTranslationProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly endpoint = GEMINI_API_BASE,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    super();
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const startedAt = Date.now();
    const endpoint =
      `${this.endpoint}/${encodeURIComponent(this.model)}:generateContent`;
    return this.executeRequest(request, async (signal) => {
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
              properties: { translation: { type: "string" } },
              required: ["translation"],
              additionalProperties: false
            }
          }
        }),
        signal
      });
      if (!response.ok) throw providerHttpError(response, "Gemini translation");
      let body: GeminiResponse;
      try {
        body = await response.json() as GeminiResponse;
      } catch {
        throw new TranslationProviderError(
          "TRANSLATION_INVALID_RESPONSE",
          "Translation provider returned invalid JSON."
        );
      }
      return {
        segmentId: request.segmentId,
        provider: this.name,
        translatedText: parsedGeminiTranslation(body),
        translationLatencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString()
      };
    }, this.timeoutMs);
  }
}

interface AzureTranslationResponse {
  translations?: Array<{ text?: unknown; to?: unknown }>;
}

function azureTranslationText(body: unknown): string {
  const response = Array.isArray(body)
    ? body[0] as AzureTranslationResponse | undefined
    : undefined;
  const translation = response?.translations?.find(
    (item) => item?.to === "uk" && typeof item.text === "string"
  )?.text ?? response?.translations?.[0]?.text;
  if (typeof translation !== "string" || !translation.trim()) {
    throw new TranslationProviderError(
      "TRANSLATION_INVALID_RESPONSE",
      "Azure Translator returned an empty translation."
    );
  }
  return translation.trim().slice(0, MAX_TRANSLATION_CHARACTERS);
}

function azureEndpoint(base: string): string {
  return base.replace(/\/+$/, "") +
    "/translate?api-version=3.0&from=en&to=uk&textType=plain";
}

export class AzureTranslationProvider extends BaseTranslationProvider {
  readonly name = "azure";
  private readonly endpoint: string;

  constructor(
    private readonly apiKey: string,
    private readonly region: string,
    endpoint = AZURE_TRANSLATOR_API_BASE,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {
    super();
    this.endpoint = azureEndpoint(endpoint);
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const text = sourceText(request);
    const startedAt = Date.now();
    return this.executeRequest(request, async (signal) => {
      const headers = new Headers({
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": this.apiKey
      });
      if (this.region) {
        headers.set("Ocp-Apim-Subscription-Region", this.region);
      }
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify([{ Text: text }]),
        signal
      });
      if (!response.ok) throw providerHttpError(response, "Azure Translator");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new TranslationProviderError(
          "TRANSLATION_INVALID_RESPONSE",
          "Azure Translator returned invalid JSON."
        );
      }
      return {
        segmentId: request.segmentId,
        provider: this.name,
        translatedText: azureTranslationText(body),
        translationLatencyMs: Math.max(0, Date.now() - startedAt),
        completedAt: new Date().toISOString()
      };
    }, this.timeoutMs);
  }
}

export class FallbackTranslationProvider implements TranslationProvider {
  readonly name: string;
  readonly configured: boolean;

  constructor(
    private readonly primary: TranslationProvider,
    private readonly fallback: TranslationProvider
  ) {
    this.name = `${primary.name}+${fallback.name}`;
    this.configured = primary.configured || fallback.configured;
  }

  async translate(request: TranslationRequest): Promise<TranslationResult> {
    if (!this.primary.configured) {
      const result = await this.fallback.translate(request);
      return { ...result, provider: `${result.provider}-fallback` };
    }
    try {
      return await this.primary.translate(request);
    } catch (error) {
      if (request.signal.aborted || !this.fallback.configured) throw error;
      const result = await this.fallback.translate(request);
      return { ...result, provider: `${result.provider}-fallback` };
    }
  }

  async close(): Promise<void> {
    await Promise.all([this.primary.close(), this.fallback.close()]);
  }
}

export function createTranslationProvider(
  options: TranslationProviderOptions
): TranslationProvider {
  const provider = (options.provider || "azure").toLowerCase();
  const fallbackProvider = (options.fallbackProvider || "gemini").toLowerCase();
  const azure = options.azureTranslatorKey
    ? new AzureTranslationProvider(
      options.azureTranslatorKey,
      options.azureTranslatorRegion || "eastus",
      options.azureTranslatorEndpoint || AZURE_TRANSLATOR_API_BASE
    )
    : new DisabledTranslationProvider("azure");
  const gemini = options.geminiApiKey
    ? new GeminiTranslationProvider(
      options.geminiApiKey,
      options.geminiModel || "gemini-3.1-flash-lite"
    )
    : new DisabledTranslationProvider("gemini");
  if (provider === "azure") {
    return fallbackProvider === "gemini"
      ? new FallbackTranslationProvider(azure, gemini)
      : azure;
  }
  return gemini;
}
