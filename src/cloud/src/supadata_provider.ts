import {
  MediaTranscriptError,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const DEFAULT_SUPADATA_BASE_URL = "https://api.supadata.ai/v1";
const NATIVE_TRANSCRIPT_CREDITS = 1;
export const METADATA_CREDITS = 1;
export const GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE = 2;
export const INSTAGRAM_REEL_MAX_DURATION_MINUTES = 20;
export const INSTAGRAM_REEL_GENERATE_MAX_CREDITS =
  GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE * INSTAGRAM_REEL_MAX_DURATION_MINUTES;
const DEFAULT_AI_JOB_POLL_INTERVAL_MS = 2000;
const DEFAULT_AI_JOB_POLL_ATTEMPTS = 60;

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

export interface SupadataMetadataCreditQuote {
  provider: "supadata";
  mode: "metadata";
  plan: string;
  max_credits: number;
  used_credits: number;
  remaining_credits: number;
  estimated_credits: 1;
  remaining_after_estimate: number;
  consent_required: true;
  can_continue: boolean;
}

export interface SupadataMetadataDurationResult {
  duration_seconds: number;
  billable_credits: number;
}

export interface SupadataGenerateCreditQuote {
  provider: "supadata";
  mode: "generate";
  plan: string;
  max_credits: number;
  used_credits: number;
  remaining_credits: number;
  estimated_credits: number;
  maximum_credits: number;
  credits_per_minute: number;
  maximum_duration_minutes: number;
  remaining_after_estimate: number;
  conservative_maximum: true;
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

export interface SupadataGeneratedTranscriptResult {
  status: "completed";
  language: string;
  available_languages: string[];
  segments: MediaTranscriptSegment[];
  transcript_text: string;
  billable_credits: number;
}

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
  status?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
  result?: unknown;
}

interface SupadataAccountResponse {
  organizationId?: unknown;
  plan?: unknown;
  maxCredits?: unknown;
  usedCredits?: unknown;
}

interface SupadataMetadataResponse {
  platform?: unknown;
  type?: unknown;
  media?: unknown;
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

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function objectKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function nestedResultDepth(payload: SupadataTranscriptResponse): number {
  let depth = 0;
  let current: unknown = payload.result;
  while (current && typeof current === "object" && !Array.isArray(current) && depth < 8) {
    depth += 1;
    current = (current as SupadataTranscriptResponse).result;
  }
  if (Array.isArray(current)) depth += 1;
  return depth;
}

function unwrapTranscriptPayload(
  payload: SupadataTranscriptResponse
): SupadataTranscriptResponse {
  let merged: SupadataTranscriptResponse = { ...payload };
  let nested: unknown = payload.result;
  let depth = 0;
  while (nested && typeof nested === "object" && !Array.isArray(nested) && depth < 4) {
    const nestedPayload = nested as SupadataTranscriptResponse;
    merged = { ...merged, ...nestedPayload };
    nested = nestedPayload.result;
    depth += 1;
  }
  if (Array.isArray(nested) && !Array.isArray(merged.content)) {
    merged = { ...merged, content: nested };
  } else if (Array.isArray(payload.result) && !Array.isArray(merged.content)) {
    merged = { ...merged, content: payload.result };
  }
  return merged;
}

function inferTranscriptLanguage(
  payload: SupadataTranscriptResponse,
  content: unknown
): string | null {
  const explicit = nonEmptyString(payload.lang);
  if (explicit) return explicit;
  if (!Array.isArray(content)) return null;
  const languages = new Set<string>();
  for (const value of content) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const language = nonEmptyString((value as SupadataTranscriptChunk).lang);
    if (language) languages.add(language);
  }
  return languages.size === 1 ? [...languages][0] ?? null : null;
}

function safeTranscriptPayloadShape(payload: SupadataTranscriptResponse): Record<string, unknown> {
  const unwrapped = unwrapTranscriptPayload(payload);
  const content = unwrapped.content;
  const firstItem = Array.isArray(content) && content.length > 0 ? content[0] : null;
  const firstItemKeys = objectKeys(firstItem);
  const firstItemTypes = firstItem && typeof firstItem === "object" && !Array.isArray(firstItem)
    ? Object.fromEntries(firstItemKeys.map((key) => [
        key,
        valueType((firstItem as Record<string, unknown>)[key])
      ]))
    : {};
  const firstResult = payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)
    ? payload.result as SupadataTranscriptResponse
    : null;
  return {
    top_level_keys: objectKeys(payload),
    status: nonEmptyString(payload.status),
    result_type: valueType(payload.result),
    result_keys: objectKeys(payload.result),
    nested_result_type: valueType(firstResult?.result),
    nested_result_depth: nestedResultDepth(payload),
    content_type: valueType(content),
    content_length: Array.isArray(content) ? content.length : null,
    content_item_keys: firstItemKeys,
    content_item_types: firstItemTypes,
    lang_type: valueType(unwrapped.lang),
    available_langs_type: valueType(unwrapped.availableLangs)
  };
}

function emitSafeTranscriptShape(
  payload: SupadataTranscriptResponse,
  context: { phase: string; http_status?: number } | null
): void {
  console.warn(
    "KRC_SUPADATA_TRANSCRIPT_SHAPE",
    JSON.stringify({
      phase: context?.phase ?? "unknown",
      http_status: context?.http_status ?? null,
      ...safeTranscriptPayloadShape(payload)
    })
  );
}

function parseTranscriptResult(
  payload: SupadataTranscriptResponse,
  billableCredits: number,
  context: { phase: string; http_status?: number } | null = null
): SupadataGeneratedTranscriptResult {
  const rawPayload = payload;
  payload = unwrapTranscriptPayload(payload);
  const language = inferTranscriptLanguage(payload, payload.content);
  const segments = parseSegments(payload.content);
  const explicitAvailableLanguages = Array.isArray(payload.availableLangs)
    ? payload.availableLangs.flatMap((value) => {
        const languageValue = nonEmptyString(value);
        return languageValue ? [languageValue] : [];
      })
    : [];
  const availableLanguages = explicitAvailableLanguages.length > 0
    ? explicitAvailableLanguages
    : language ? [language] : [];
  if (Array.isArray(payload.content) && payload.content.length === 0) {
    emitSafeTranscriptShape(rawPayload, context);
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_TRANSCRIPT_EMPTY",
      "The managed transcript provider returned an empty transcript.",
      422,
      false
    );
  }
  if (!language || segments.length === 0) {
    emitSafeTranscriptShape(rawPayload, context);
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_TRANSCRIPT_INVALID",
      "The managed transcript provider returned an invalid transcript payload.",
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
    billable_credits: billableCredits
  };
}

function isInstagramUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

function isFacebookUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "facebook.com" ||
      host.endsWith(".facebook.com") ||
      host === "fb.watch";
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
  return /private|friends[- ]only|login|log in|sign in|authentication|authorization|not publicly accessible|requires membership/.test(message);
}

function inferredCreditsFromSegments(segments: MediaTranscriptSegment[]): number {
  const durationMs = segments.reduce(
    (maximum, segment) => Math.max(maximum, segment.end_ms ?? 0),
    0
  );
  return Math.max(
    GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE,
    Math.ceil(durationMs / 60000) * GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class SupadataProvider {
  private readonly baseUrl: string;
  private readonly aiJobPollIntervalMs: number;
  private readonly aiJobPollAttempts: number;

  constructor(
    private readonly apiKey: string,
    baseUrl = process.env.KRC_MEDIA_SUPADATA_BASE_URL || DEFAULT_SUPADATA_BASE_URL,
    aiJobPollIntervalMs = Number(
      process.env.KRC_MEDIA_SUPADATA_AI_POLL_MS || DEFAULT_AI_JOB_POLL_INTERVAL_MS
    ),
    aiJobPollAttempts = Number(
      process.env.KRC_MEDIA_SUPADATA_AI_POLL_ATTEMPTS || DEFAULT_AI_JOB_POLL_ATTEMPTS
    )
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.aiJobPollIntervalMs = Number.isFinite(aiJobPollIntervalMs)
      ? Math.max(0, Math.floor(aiJobPollIntervalMs))
      : DEFAULT_AI_JOB_POLL_INTERVAL_MS;
    this.aiJobPollAttempts = Number.isFinite(aiJobPollAttempts)
      ? Math.max(1, Math.floor(aiJobPollAttempts))
      : DEFAULT_AI_JOB_POLL_ATTEMPTS;
  }

  private async request(path: string): Promise<{
    response: Response;
    payload: SupadataTranscriptResponse & SupadataAccountResponse & SupadataMetadataResponse;
  }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": this.apiKey
      }
    });
    const text = await response.text();
    let payload: SupadataTranscriptResponse & SupadataAccountResponse & SupadataMetadataResponse = {};
    if (text) {
      try {
        payload = JSON.parse(text) as SupadataTranscriptResponse & SupadataAccountResponse & SupadataMetadataResponse;
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

  async quoteMetadata(): Promise<SupadataMetadataCreditQuote> {
    const account = await this.getAccount();
    return {
      provider: "supadata",
      mode: "metadata",
      plan: account.plan,
      max_credits: account.max_credits,
      used_credits: account.used_credits,
      remaining_credits: account.remaining_credits,
      estimated_credits: 1,
      remaining_after_estimate: Math.max(0, account.remaining_credits - METADATA_CREDITS),
      consent_required: true,
      can_continue: account.remaining_credits >= METADATA_CREDITS
    };
  }

  async getMetadataDuration(url: string): Promise<SupadataMetadataDurationResult> {
    const query = new URLSearchParams({ url });
    const { response, payload } = await this.request(`/metadata?${query}`);
    const billableCredits = parseBillableCredits(response.headers) || METADATA_CREDITS;
    if (!response.ok) {
      if (isFacebookUrl(url) && looksAuthOrPrivateFailure(response, payload)) {
        throw new MediaTranscriptError(
          "UNSUPPORTED_PRIVATE_OR_AUTH_REQUIRED",
          "The Facebook media is not publicly accessible or requires authentication.",
          422,
          false
        );
      }
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_METADATA_ERROR",
        nonEmptyString(payload.details) || nonEmptyString(payload.message) ||
          "The managed provider could not read media metadata.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500 || response.status === 429
      );
    }
    if (payload.platform !== "facebook") {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_METADATA_INVALID",
        "The managed provider returned metadata for an unexpected platform.",
        502,
        false
      );
    }
    const media = payload.media && typeof payload.media === "object"
      ? payload.media as Record<string, unknown>
      : null;
    const duration = media ? finiteNonNegative(media.duration) : null;
    if (duration === null || duration <= 0) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_METADATA_DURATION_UNAVAILABLE",
        "The Facebook metadata did not contain a usable video duration.",
        422,
        false
      );
    }
    return { duration_seconds: duration, billable_credits: billableCredits };
  }

  async quoteGenerateForDuration(durationSeconds: number): Promise<SupadataGenerateCreditQuote> {
    const account = await this.getAccount();
    const maximumDurationMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const maximumCredits = maximumDurationMinutes * GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE;
    return {
      provider: "supadata",
      mode: "generate",
      plan: account.plan,
      max_credits: account.max_credits,
      used_credits: account.used_credits,
      remaining_credits: account.remaining_credits,
      estimated_credits: maximumCredits,
      maximum_credits: maximumCredits,
      credits_per_minute: GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE,
      maximum_duration_minutes: maximumDurationMinutes,
      remaining_after_estimate: Math.max(0, account.remaining_credits - maximumCredits),
      conservative_maximum: true,
      consent_required: true,
      can_continue: account.remaining_credits >= maximumCredits
    };
  }

  async quoteGenerateInstagramReel(): Promise<SupadataGenerateCreditQuote> {
    const account = await this.getAccount();
    return {
      provider: "supadata",
      mode: "generate",
      plan: account.plan,
      max_credits: account.max_credits,
      used_credits: account.used_credits,
      remaining_credits: account.remaining_credits,
      estimated_credits: INSTAGRAM_REEL_GENERATE_MAX_CREDITS,
      maximum_credits: INSTAGRAM_REEL_GENERATE_MAX_CREDITS,
      credits_per_minute: GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE,
      maximum_duration_minutes: INSTAGRAM_REEL_MAX_DURATION_MINUTES,
      remaining_after_estimate: Math.max(
        0,
        account.remaining_credits - INSTAGRAM_REEL_GENERATE_MAX_CREDITS
      ),
      conservative_maximum: true,
      consent_required: true,
      can_continue: account.remaining_credits >= INSTAGRAM_REEL_GENERATE_MAX_CREDITS
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
      if (
        (isInstagramUrl(url) || isFacebookUrl(url)) &&
        looksAuthOrPrivateFailure(response, payload)
      ) {
        const platform = isFacebookUrl(url) ? "Facebook" : "Instagram";
        throw new MediaTranscriptError(
          "UNSUPPORTED_PRIVATE_OR_AUTH_REQUIRED",
          `The ${platform} media is not publicly accessible or requires authentication.`,
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

    const result = parseTranscriptResult(
      payload,
      billableCredits || NATIVE_TRANSCRIPT_CREDITS,
      { phase: "native", http_status: response.status }
    );
    return result;
  }

  async getGeneratedTranscript(
    url: string,
    approvedMaxCredits = INSTAGRAM_REEL_GENERATE_MAX_CREDITS
  ): Promise<SupadataGeneratedTranscriptResult> {
    const accountBefore = await this.getAccount();
    const query = new URLSearchParams({
      url,
      mode: "generate",
      text: "false"
    });
    const initial = await this.request(`/transcript?${query}`);
    let billedFromHeader = parseBillableCredits(initial.response.headers);

    if (!initial.response.ok && initial.response.status !== 202) {
      if (isInstagramUrl(url) && looksAuthOrPrivateFailure(initial.response, initial.payload)) {
        throw new MediaTranscriptError(
          "UNSUPPORTED_PRIVATE_OR_AUTH_REQUIRED",
          "The Instagram media is not publicly accessible or requires authentication.",
          422,
          false
        );
      }
      const retryable = initial.response.status >= 500 || initial.response.status === 429;
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_AI_TRANSCRIPT_ERROR",
        nonEmptyString(initial.payload.details) ||
          nonEmptyString(initial.payload.message) ||
          "The managed AI transcript provider rejected the request.",
        initial.response.status === 429
          ? 429
          : initial.response.status >= 500 ? 502 : 422,
        retryable
      );
    }

    let payload = unwrapTranscriptPayload(initial.payload);
    let finalHttpStatus = initial.response.status;
    if (initial.response.status === 202 || nonEmptyString(payload.jobId)) {
      const jobId = nonEmptyString(payload.jobId);
      if (!jobId) {
        throw new MediaTranscriptError(
          "MANAGED_PROVIDER_AI_JOB_INVALID",
          "The managed AI transcript provider returned an invalid job response.",
          502,
          true
        );
      }
      let completed = false;
      for (let attempt = 0; attempt < this.aiJobPollAttempts; attempt += 1) {
        if (this.aiJobPollIntervalMs > 0) {
          await delay(this.aiJobPollIntervalMs);
        }
        const polled = await this.request(`/transcript/${encodeURIComponent(jobId)}`);
        if (!polled.response.ok) {
          throw new MediaTranscriptError(
            "MANAGED_PROVIDER_AI_JOB_ERROR",
            nonEmptyString(polled.payload.details) ||
              nonEmptyString(polled.payload.message) ||
              "The managed AI transcript job could not be read.",
            polled.response.status >= 500 ? 502 : 422,
            polled.response.status >= 500 || polled.response.status === 429
          );
        }
        const polledPayload = unwrapTranscriptPayload(polled.payload);
        const status = nonEmptyString(polledPayload.status)?.toLowerCase() ?? null;
        if (status === "queued" || status === "active") continue;
        if (status === "failed") {
          throw new MediaTranscriptError(
            "MANAGED_PROVIDER_AI_JOB_FAILED",
            nonEmptyString(polled.payload.details) ||
              nonEmptyString(polled.payload.message) ||
              "The managed AI transcript job failed.",
            422,
            false
          );
        }
        if (status === "completed") {
          payload = polledPayload;
          finalHttpStatus = polled.response.status;
          billedFromHeader = billedFromHeader || parseBillableCredits(polled.response.headers);
          completed = true;
          break;
        }
        emitSafeTranscriptShape(polled.payload, {
          phase: "generate-poll-status",
          http_status: polled.response.status
        });
        throw new MediaTranscriptError(
          "MANAGED_PROVIDER_AI_JOB_INVALID",
          "The managed AI transcript provider returned an unknown job status.",
          502,
          true
        );
      }
      if (!completed) {
        throw new MediaTranscriptError(
          "MANAGED_PROVIDER_AI_JOB_TIMEOUT",
          "The managed AI transcript job did not complete within the bounded polling window.",
          504,
          false
        );
      }
    }

    const preliminary = parseTranscriptResult(
      payload,
      billedFromHeader,
      { phase: "generate-final", http_status: finalHttpStatus }
    );
    const accountAfter = await this.getAccount();
    const balanceDelta = Math.max(
      0,
      accountBefore.remaining_credits - accountAfter.remaining_credits
    );
    const billableCredits = billedFromHeader ||
      balanceDelta ||
      inferredCreditsFromSegments(preliminary.segments);
    if (billableCredits > approvedMaxCredits) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_AI_CREDIT_CAP_BREACH",
        "The provider reported AI transcript usage above the user-approved maximum.",
        502,
        false
      );
    }
    return {
      ...preliminary,
      billable_credits: billableCredits
    };
  }
}