export interface CobaltStartupDiagnosticResult {
  attempted: boolean;
  endpoint_host: string | null;
  probe: "youtube_control";
  http_status: number | null;
  content_type: string | null;
  server: string | null;
  retry_after: string | null;
  ratelimit_limit: string | null;
  ratelimit_remaining: string | null;
  ratelimit_reset: string | null;
  json_valid: boolean;
  provider_status: string | null;
  provider_error_code: string | null;
}

function safeScalar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._\-/:;=+ ]{1,160}$/.test(trimmed)) return null;
  return trimmed;
}

function safeHeader(response: Response, name: string): string | null {
  return safeScalar(response.headers.get(name));
}

export async function runCobaltStartupDiagnostic(
  endpoint: string | null,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<CobaltStartupDiagnosticResult> {
  let endpointHost: string | null = null;
  if (endpoint) {
    try {
      endpointHost = new URL(endpoint).hostname;
    } catch {
      endpointHost = null;
    }
  }

  if (!endpoint || !apiKey) {
    return {
      attempted: false,
      endpoint_host: endpointHost,
      probe: "youtube_control",
      http_status: null,
      content_type: null,
      server: null,
      retry_after: null,
      ratelimit_limit: null,
      ratelimit_remaining: null,
      ratelimit_reset: null,
      json_valid: false,
      provider_status: null,
      provider_error_code: null
    };
  }

  try {
    const response = await fetchImpl(`${endpoint.replace(/\/+$/, "")}/`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Api-Key ${apiKey}`
      },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
        downloadMode: "audio",
        audioFormat: "mp3",
        disableMetadata: true
      })
    });

    const raw = await response.text();
    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }

    const error = payload?.error;
    const errorCode = error && typeof error === "object" && !Array.isArray(error)
      ? safeScalar((error as Record<string, unknown>).code)
      : null;

    return {
      attempted: true,
      endpoint_host: endpointHost,
      probe: "youtube_control",
      http_status: response.status,
      content_type: safeHeader(response, "content-type"),
      server: safeHeader(response, "server"),
      retry_after: safeHeader(response, "retry-after"),
      ratelimit_limit: safeHeader(response, "x-ratelimit-limit"),
      ratelimit_remaining: safeHeader(response, "x-ratelimit-remaining"),
      ratelimit_reset: safeHeader(response, "x-ratelimit-reset"),
      json_valid: payload !== null,
      provider_status: safeScalar(payload?.status),
      provider_error_code: errorCode
    };
  } catch {
    return {
      attempted: true,
      endpoint_host: endpointHost,
      probe: "youtube_control",
      http_status: null,
      content_type: null,
      server: null,
      retry_after: null,
      ratelimit_limit: null,
      ratelimit_remaining: null,
      ratelimit_reset: null,
      json_valid: false,
      provider_status: null,
      provider_error_code: "NETWORK_ERROR"
    };
  }
}
