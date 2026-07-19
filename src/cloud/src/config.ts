export interface AppConfig {
  host: string;
  port: number;
  testAccessToken: string;
  deepgramApiKey: string | null;
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
    deepgramApiKey: environment.DEEPGRAM_API_KEY || null,
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
