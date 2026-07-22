export type TranslationProviderName = "gemini" | "azure";
export type TranslationFallbackProviderName = "gemini" | "none";
export type TtsProviderName = "gemini" | "azure";

export interface AppConfig {
  host: string;
  port: number;
  testAccessToken: string;
  assemblyAiApiKey: string | null;
  geminiApiKey: string | null;
  geminiTranslationModel: string;
  translationProvider?: TranslationProviderName;
  translationFallbackProvider?: TranslationFallbackProviderName;
  azureTranslatorKey?: string | null;
  azureTranslatorRegion?: string;
  azureTranslatorEndpoint?: string;
  ttsProvider?: TtsProviderName;
  geminiTtsModel?: string;
  geminiTtsVoice?: string;
  azureSpeechKey?: string | null;
  azureSpeechRegion?: string;
  azureTtsVoice?: string;
  corsAllowedOrigin: string;
  maxRequestBodyBytes: number;
  rateLimitRequestsPerMinute: number;
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`
    );
  }
  return parsed;
}

function parseIdentifier(
  value: string | undefined,
  fallback: string,
  name: string
): string {
  const identifier = value || fallback;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(identifier)) {
    throw new Error(
      `${name} must contain only letters, numbers, dots, underscores, or hyphens.`
    );
  }
  return identifier;
}

function parseProvider<T extends string>(
  value: string | undefined,
  fallback: T,
  allowed: readonly T[],
  name: string
): T {
  const provider = (value || fallback).trim().toLowerCase() as T;
  if (!allowed.includes(provider)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}.`);
  }
  return provider;
}

function parseHttpsEndpoint(
  value: string | undefined,
  fallback: string,
  name: string
): string {
  const raw = value || fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
  const localHttp = parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error(`${name} must use HTTPS.`);
  }
  return raw.replace(/\/+$/, "");
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const testAccessToken = environment.TEST_ACCESS_TOKEN;
  if (!testAccessToken || testAccessToken.length < 16) {
    throw new Error(
      "TEST_ACCESS_TOKEN must contain at least 16 characters."
    );
  }

  return {
    host: environment.HOST || "0.0.0.0",
    port: parseInteger(environment.PORT, 8080, "PORT", 1, 65535),
    testAccessToken,
    assemblyAiApiKey: environment.ASSEMBLYAI_API_KEY || null,
    geminiApiKey: environment.GEMINI_API_KEY || null,
    geminiTranslationModel: parseIdentifier(
      environment.GEMINI_TRANSLATION_MODEL,
      "gemini-3.1-flash-lite",
      "GEMINI_TRANSLATION_MODEL"
    ),
    translationProvider: parseProvider(
      environment.TRANSLATION_PROVIDER,
      "azure",
      ["azure", "gemini"] as const,
      "TRANSLATION_PROVIDER"
    ),
    translationFallbackProvider: parseProvider(
      environment.TRANSLATION_FALLBACK_PROVIDER,
      "gemini",
      ["gemini", "none"] as const,
      "TRANSLATION_FALLBACK_PROVIDER"
    ),
    azureTranslatorKey: environment.AZURE_TRANSLATOR_KEY || null,
    azureTranslatorRegion: parseIdentifier(
      environment.AZURE_TRANSLATOR_REGION,
      "eastus",
      "AZURE_TRANSLATOR_REGION"
    ).toLowerCase(),
    azureTranslatorEndpoint: parseHttpsEndpoint(
      environment.AZURE_TRANSLATOR_ENDPOINT,
      "https://api.cognitive.microsofttranslator.com",
      "AZURE_TRANSLATOR_ENDPOINT"
    ),
    ttsProvider: parseProvider(
      environment.TTS_PROVIDER,
      "gemini",
      ["azure", "gemini"] as const,
      "TTS_PROVIDER"
    ),
    geminiTtsModel: parseIdentifier(
      environment.GEMINI_TTS_MODEL,
      "gemini-2.5-flash-preview-tts",
      "GEMINI_TTS_MODEL"
    ),
    geminiTtsVoice: parseIdentifier(
      environment.GEMINI_TTS_VOICE,
      "Iapetus",
      "GEMINI_TTS_VOICE"
    ),
    azureSpeechKey: environment.AZURE_SPEECH_KEY || null,
    azureSpeechRegion: parseIdentifier(
      environment.AZURE_SPEECH_REGION,
      "eastus",
      "AZURE_SPEECH_REGION"
    ).toLowerCase(),
    azureTtsVoice: parseIdentifier(
      environment.AZURE_TTS_VOICE,
      "uk-UA-OstapNeural",
      "AZURE_TTS_VOICE"
    ),
    corsAllowedOrigin: environment.CORS_ALLOWED_ORIGIN || "*",
    maxRequestBodyBytes: parseInteger(
      environment.MAX_REQUEST_BODY_BYTES,
      32768,
      "MAX_REQUEST_BODY_BYTES",
      1024,
      1048576
    ),
    rateLimitRequestsPerMinute: parseInteger(
      environment.RATE_LIMIT_REQUESTS_PER_MINUTE,
      120,
      "RATE_LIMIT_REQUESTS_PER_MINUTE",
      1,
      100000
    )
  };
}
