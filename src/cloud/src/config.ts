export type TtsProviderName = "gemini" | "azure";

export interface AppConfig {
  host: string;
  port: number;
  testAccessToken: string;
  assemblyAiApiKey: string | null;
  geminiApiKey: string | null;
  geminiTranslationModel: string;
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
  if (value === undefined || value === "") {
    return fallback;
  }

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

function parseTtsProvider(value: string | undefined): TtsProviderName {
  const provider = (value || "gemini").trim().toLowerCase();
  if (provider !== "gemini" && provider !== "azure") {
    throw new Error("TTS_PROVIDER must be either gemini or azure.");
  }
  return provider;
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
    ttsProvider: parseTtsProvider(environment.TTS_PROVIDER),
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
