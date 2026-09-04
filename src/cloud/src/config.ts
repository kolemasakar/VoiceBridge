import { parseMediaBetaCodes } from "./media_beta.js";
import {
  derivePublicMediaAdmissionCode,
  PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS,
  PUBLIC_MEDIA_MAX_DAILY_STT_SECONDS,
  PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE
} from "./public_media_admission.js";

export type SttProviderName = "assemblyai" | "gemini";
export type KrcMediaSttProviderName = "assemblyai";
export type TranslationProviderName = "gemini" | "azure";
export type TranslationFallbackProviderName = "gemini" | "none";
export type TtsProviderName = "gemini" | "azure";

export interface AppConfig {
  host: string;
  port: number;
  testAccessToken: string;
  mediaActionToken?: string | null;
  mediaBetaCodes?: string[];
  mediaDailySttSeconds?: number;
  mediaPublicMode?: boolean;
  mediaFreeTierOnly?: boolean;
  mediaAssemblyAiFreeTrialOnly?: boolean;
  assemblyAiApiKey: string | null;
  sttProvider?: SttProviderName;
  geminiSttModel?: string;
  krcMediaSttProvider?: KrcMediaSttProviderName;
  krcMediaTranscribeModel?: string;
  supadataApiKey?: string | null;
  cobaltEndpoint?: string | null;
  cobaltApiKey?: string | null;
  scrapeCreatorsApiKey?: string | null;
  scrapeCreatorsEndpoint?: string;
  scrapeCreatorsCacheMaxAge?: string;
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
  mediaMaxDurationSeconds?: number;
  mediaJobTtlSeconds?: number;
  mediaMaxConcurrentJobs?: number;
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
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean,
  name: string
): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function parseIdentifier(
  value: string | undefined,
  fallback: string,
  name: string
): string {
  const identifier = value || fallback;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(identifier)) {
    throw new Error(`${name} must contain only letters, numbers, dots, underscores, or hyphens.`);
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

function parseOptionalHttpsEndpoint(
  value: string | undefined,
  name: string
): string | null {
  if (!value || !value.trim()) return null;
  return parseHttpsEndpoint(value.trim(), value.trim(), name);
}

function parseCacheMaxAge(value: string | undefined): string {
  const normalized = (value || "30d").trim().toLowerCase();
  if (!/^\d{1,4}[smhdw]$/.test(normalized)) {
    throw new Error(
      "SCRAPECREATORS_CACHE_MAX_AGE must be an integer followed by s, m, h, d, or w."
    );
  }
  return normalized;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env
): AppConfig {
  const testAccessToken = environment.TEST_ACCESS_TOKEN;
  if (!testAccessToken || testAccessToken.length < 16) {
    throw new Error("TEST_ACCESS_TOKEN must contain at least 16 characters.");
  }

  const mediaActionToken = environment.KRC_MEDIA_ACTION_TOKEN || null;
  if (mediaActionToken !== null && mediaActionToken.length < 24) {
    throw new Error(
      "KRC_MEDIA_ACTION_TOKEN must contain at least 24 characters when configured."
    );
  }

  const mediaPublicMode = parseBoolean(
    environment.KRC_MEDIA_PUBLIC_MODE,
    false,
    "KRC_MEDIA_PUBLIC_MODE"
  );
  const mediaFreeTierOnly = parseBoolean(
    environment.KRC_MEDIA_FREE_TIER_ONLY,
    false,
    "KRC_MEDIA_FREE_TIER_ONLY"
  );
  const mediaAssemblyAiFreeTrialOnly = parseBoolean(
    environment.KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY,
    false,
    "KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY"
  );

  if (mediaPublicMode) {
    if (!mediaActionToken) {
      throw new Error("KRC_MEDIA_PUBLIC_MODE requires KRC_MEDIA_ACTION_TOKEN.");
    }
    if (!mediaFreeTierOnly) {
      throw new Error("KRC_MEDIA_PUBLIC_MODE requires KRC_MEDIA_FREE_TIER_ONLY=true.");
    }
    if (!mediaAssemblyAiFreeTrialOnly) {
      throw new Error(
        "KRC_MEDIA_PUBLIC_MODE requires KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY=true."
      );
    }
    if (!environment.ASSEMBLYAI_API_KEY) {
      throw new Error(
        "KRC_MEDIA_PUBLIC_MODE requires ASSEMBLYAI_API_KEY for YouTube, Instagram, Facebook and Telegram STT."
      );
    }
    if (!environment.KRC_MEDIA_COBALT_ENDPOINT) {
      throw new Error(
        "KRC_MEDIA_PUBLIC_MODE requires KRC_MEDIA_COBALT_ENDPOINT for YouTube, Instagram and Facebook free retrieval."
      );
    }
    if (environment.SCRAPECREATORS_API_KEY) {
      throw new Error(
        "KRC_MEDIA_PUBLIC_MODE free-tier policy forbids SCRAPECREATORS_API_KEY and automatic paid retrieval."
      );
    }
  }

  const configuredRateLimit = parseInteger(
    environment.RATE_LIMIT_REQUESTS_PER_MINUTE,
    120,
    "RATE_LIMIT_REQUESTS_PER_MINUTE",
    1,
    100000
  );
  const configuredDailySttSeconds = parseInteger(
    environment.MEDIA_DAILY_STT_SECONDS,
    7200,
    "MEDIA_DAILY_STT_SECONDS",
    60,
    86400
  );
  const configuredConcurrentJobs = parseInteger(
    environment.MEDIA_MAX_CONCURRENT_JOBS,
    1,
    "MEDIA_MAX_CONCURRENT_JOBS",
    1,
    20
  );
  const betaCodes = mediaPublicMode && mediaActionToken
    ? [derivePublicMediaAdmissionCode(mediaActionToken)]
    : parseMediaBetaCodes(environment.KRC_MEDIA_BETA_CODES);

  return {
    host: environment.HOST || "0.0.0.0",
    port: parseInteger(environment.PORT, 8080, "PORT", 1, 65535),
    testAccessToken,
    mediaActionToken,
    mediaBetaCodes: betaCodes,
    mediaPublicMode,
    mediaFreeTierOnly,
    mediaAssemblyAiFreeTrialOnly,
    mediaDailySttSeconds: mediaPublicMode
      ? Math.min(configuredDailySttSeconds, PUBLIC_MEDIA_MAX_DAILY_STT_SECONDS)
      : configuredDailySttSeconds,
    assemblyAiApiKey: environment.ASSEMBLYAI_API_KEY || null,
    sttProvider: parseProvider(
      environment.STT_PROVIDER,
      "gemini",
      ["assemblyai", "gemini"] as const,
      "STT_PROVIDER"
    ),
    geminiSttModel: parseIdentifier(
      environment.GEMINI_STT_MODEL,
      "gemini-3.5-transcribe-live",
      "GEMINI_STT_MODEL"
    ),
    krcMediaSttProvider: parseProvider(
      environment.KRC_MEDIA_STT_PROVIDER,
      "assemblyai",
      ["assemblyai"] as const,
      "KRC_MEDIA_STT_PROVIDER"
    ),
    krcMediaTranscribeModel: parseIdentifier(
      environment.KRC_MEDIA_TRANSCRIBE_MODEL,
      "gemini-3.5-transcribe",
      "KRC_MEDIA_TRANSCRIBE_MODEL"
    ),
    supadataApiKey: environment.SUPADATA_API_KEY || null,
    cobaltEndpoint: parseOptionalHttpsEndpoint(
      environment.KRC_MEDIA_COBALT_ENDPOINT,
      "KRC_MEDIA_COBALT_ENDPOINT"
    ),
    cobaltApiKey: environment.KRC_MEDIA_COBALT_API_KEY || null,
    scrapeCreatorsApiKey: environment.SCRAPECREATORS_API_KEY || null,
    scrapeCreatorsEndpoint: parseHttpsEndpoint(
      environment.SCRAPECREATORS_ENDPOINT,
      "https://api.scrapecreators.com",
      "SCRAPECREATORS_ENDPOINT"
    ),
    scrapeCreatorsCacheMaxAge: parseCacheMaxAge(
      environment.SCRAPECREATORS_CACHE_MAX_AGE
    ),
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
      "azure",
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
    rateLimitRequestsPerMinute: mediaPublicMode
      ? Math.min(configuredRateLimit, PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE)
      : configuredRateLimit,
    mediaMaxDurationSeconds: parseInteger(
      environment.MEDIA_MAX_DURATION_SECONDS,
      3600,
      "MEDIA_MAX_DURATION_SECONDS",
      60,
      21600
    ),
    mediaJobTtlSeconds: parseInteger(
      environment.MEDIA_JOB_TTL_SECONDS,
      3600,
      "MEDIA_JOB_TTL_SECONDS",
      300,
      86400
    ),
    mediaMaxConcurrentJobs: mediaPublicMode
      ? Math.min(configuredConcurrentJobs, PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS)
      : configuredConcurrentJobs
  };
}
