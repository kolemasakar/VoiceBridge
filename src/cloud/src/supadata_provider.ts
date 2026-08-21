import {
  MediaTranscriptError,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const DEFAULT_SUPADATA_BASE_URL = "https://api.supadata.ai/v1";
const NATIVE_TRANSCRIPT_CREDITS = 1;

export interface SupadataAccountInfo {
  organization_id: string;
  plan: string;
  max_credits: number;
  used_credits: number;
  remaining_credits: number;
}

export interface SupadataNativeCreditQuote {
  provider: "supadata";
  mode: "native";
  plan: string;
  max_credits: number;
  used_credits: number;
  remaining_credits: number;
  estimated_credits: 1;
  remaining_after_estimate: number;
  consent_required: true;
  can_continue: boolean;
}

export type SupadataNativeTranscriptResult =
  | {
      status: "completed";
      language: string;
      available_languages: string[];
      segments: MediaTranscriptSegment[];
      transcript_text: string;
      billable_credits: number;
    }
  | {
      status: "unavailable";
      billable_credits: number;
    };

interface SupadataTranscriptChunk {
  text?: unknown;
  offset?: unknown;
  duration?: unknown;
  lang?: unknown;
}

interface SupadataTranscriptResponse {
  content?: unknown;
  lang?: unknown;
  availableLangs?: unknown;
  jobId?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
}

interface SupadataAccountResponse {
  organizationId?: unknown;
  plan?: unknown;
  maxCredits?: unknown;
  usedCredits?: unknown;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseBillableCredits(headers: Headers): number {
  const raw = headers.get("x-billable-requests");
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSegments(content: unknown): MediaTranscriptSegment[] {
  if (!Array.isArray(content)) return [];
  const segments: MediaTranscriptSegment[] = [];
  for (const value of content) {
    if (!value || typeof value !== "object") continue;
    const chunk = value as SupadataTranscriptChunk;
    const text = nonEmptyString(chunk.text);
    const offset = finiteNonNegative(chunk.offset);
    const duration = finiteNonNegative(chunk.duration);
    if (!text || offset === null || duration === null) continue;
    segments.push({
      index: segments.length,
      start_ms: Math.round(offset),
      end_ms: Math.round(offset + duration),
      text,
      confidence: null
    });
  }
  return segments;
}

function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

function looksAuthOrPrivateFailure(
  response: Response,
  payload: SupadataTranscriptResponse
): boolean {
  if ([401, 403].includes(response.status)) return true;
  const message = [
    nonEmptyString(payload.error),
    nonEmptyString(payload.message),
    nonEmptyString(payload.details)
  ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();
  return /private|login|log in|sign in|authentication|authorization|not publicly accessible/.test(message);
}

export class SupadataProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = process.env.KRC_MEDIA_SUPADATA_BASE_URL || DEFAULT_SUPADATA_BASE_URL
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request(path: string): Promise<{
    response: Response;
    payload: SupadataTranscriptResponse & SupadataAccountResponse;
  }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": this.apiKey
      }
    });
    const text = await response.text();
    let payload: SupadataTranscriptResponse & SupadataAccountResponse = {};
    if (text) {
      try {
        payload = JSON.parse(text) as SupadataTranscriptResponse & SupadataAccountResponse;
      } catch {
        throw new MediaTranscriptError(
          "MANAGED_PROVIDER_INVALID_RESPONSE",
          "The managed transcript provider returned invalid JSON.",
          502,
          true
        );
      }
    }
    return { response, payload };
  }

  async getAccount(): Promise<SupadataAccountInfo> {
    const { response, payload } = await this.request("/me");
    if (!response.ok) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_ACCOUNT_ERROR",
        "The managed transcript provider account could not be read.",
        response.status >= 500 ? 502 : 503,
        response.status >= 500
      );
    }
    const organizationId = nonEmptyString(payload.organizationId);
    const plan = nonEmptyString(payload.plan);
    const maxCredits = finiteNonNegative(payload.maxCredits);
    const usedCredits = finiteNonNegative(payload.usedCredits);
    if (
      !organizationId ||
      !plan ||
      maxCredits === null ||
      usedCredits === null
    ) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_ACCOUNT_INVALID",
        "The managed transcript provider returned incomplete account information.",
        502,
        true
      );
    }
    return {
      organization_id: organizationId,
      plan,
      max_credits: maxCredits,
      used_credits: usedCredits,
      remaining_credits: Math.max(0, maxCredits - usedCredits)
    };
  }

  async quoteNative(): Promise<SupadataNativeCreditQuote> {
    const account = await this.getAccount();
    return {
      provider: "supadata",
      mode: "native",
      plan: account.plan,
      max_credits: account.max_credits,
      used_credits: account.used_credits,
      remaining_credits: account.remaining_credits,
      estimated_credits: NATIVE_TRANSCRIPT_CREDITS,
      remaining_after_estimate: Math.max(
        0,
        account.remaining_credits - NATIVE_TRANSCRIPT_CREDITS
      ),
      consent_required: true,
      can_continue: account.remaining_credits >= NATIVE_TRANSCRIPT_CREDITS
    };
  }

  async getNativeTranscript(
    url: string,
    languageHint: MediaLanguageHint
  ): Promise<SupadataNativeTranscriptResult> {
    const query = new URLSearchParams({
      url,
      mode: "native",
      text: "false"
    });
    if (languageHint !== "auto") query.set("lang", languageHint);

    const { response, payload } = await this.request(`/transcript?${query}`);
    const billableCredits = parseBillableCredits(response.headers);

    if (response.status === 206) {
      return {
        status: "unavailable",
        billable_credits: billableCredits || NATIVE_TRANSCRIPT_CREDITS
      };
    }

    if (!response.ok) {
      if (isInstagramUrl(url) && looksAuthOrPrivateFailure(response, payload)) {
        throw new MediaTranscriptError(
          "UNSUPPORTED_PRIVATE_OR_AUTH_REQUIRED",
          "The Instagram media is not publicly accessible or requires authentication.",
          422,
          false
        );
      }
      const retryable = response.status >= 500 || response.status === 429;
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_TRANSCRIPT_ERROR",
        nonEmptyString(payload.details) ||
          nonEmptyString(payload.message) ||
          "The managed transcript provider rejected the request.",
        response.status === 429 ? 429 : response.status >= 500 ? 502 : 422,
        retryable
      );
    }

    if (nonEmptyString(payload.jobId)) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_UNEXPECTED_ASYNC_NATIVE",
        "The managed provider returned an unexpected asynchronous native transcript job.",
        502,
        true
      );
    }

    const language = nonEmptyString(payload.lang);
    const segments = parseSegments(payload.content);
    const availableLanguages = Array.isArray(payload.availableLangs)
      ? payload.availableLangs.flatMap((value) => {
          const languageValue = nonEmptyString(value);
          return languageValue ? [languageValue] : [];
        })
      : [];
    if (!language || segments.length === 0) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_TRANSCRIPT_INVALID",
        "The managed transcript provider returned an empty or invalid transcript.",
        502,
        true
      );
    }

    return {
      status: "completed",
      language,
      available_languages: availableLanguages,
      segments,
      transcript_text: segments.map((segment) => segment.text).join(" "),
      billable_credits: billableCredits || NATIVE_TRANSCRIPT_CREDITS
    };
  }
}
