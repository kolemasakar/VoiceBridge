export interface CobaltStartupDiagnosticResult {
  attempted: boolean;
  http_status: number | null;
  json_valid: boolean;
  provider_status: string | null;
  provider_error_code: string | null;
}

function safeScalar(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(trimmed)) return null;
  return trimmed;
}

export async function runCobaltStartupDiagnostic(
  endpoint: string | null,
  apiKey: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<CobaltStartupDiagnosticResult> {
  if (!endpoint || !apiKey) {
    return {
      attempted: false,
      http_status: null,
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
        url: "https://www.instagram.com/reel/DEAyVa4SF3E/",
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
      http_status: response.status,
      json_valid: payload !== null,
      provider_status: safeScalar(payload?.status),
      provider_error_code: errorCode
    };
  } catch {
    return {
      attempted: true,
      http_status: null,
      json_valid: false,
      provider_status: null,
      provider_error_code: "NETWORK_ERROR"
    };
  }
}
