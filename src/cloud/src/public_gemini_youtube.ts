import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createRequestContext, type RequestContext } from "./identifiers.js";
import { MediaBetaGate } from "./media_beta.js";
import { ManagedMediaPersistentStore } from "./managed_media_persistence.js";
import {
  managedMediaAccessDigest,
  parseManagedMediaPreflightInput,
  type ManagedMediaJobStore,
  type ManagedMediaJobView,
  type ManagedMediaPreflightInput,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation
} from "./managed_media_service.js";
import { managedMediaPlatform, normalizeManagedMediaUrl } from "./managed_media_url.js";
import {
  MediaTranscriptError,
  chunkTranscriptWords,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const ROOT = "/api/v1/media/youtube-gemini";
const CAPABILITY = "/api/v1/media/public-capabilities";
const PREFLIGHT = `${ROOT}/preflight`;
const LOOKUP = `${ROOT}/lookup`;
const TRANSCRIPTIONS = `${ROOT}/transcriptions`;
const JOB_PATH = /^\/api\/v1\/media\/youtube-gemini\/transcriptions\/(KRCM_[A-Za-z0-9-]+)$/;
const SEGMENTS_PATH = /^\/api\/v1\/media\/youtube-gemini\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/segments$/;
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.7-flash";
const PROVIDER_MODE = "youtube_gemini_direct" as const;
const RETRIEVAL_PROVIDER = "gemini_youtube_url" as const;

export interface GeminiFreeConsent {
  provider: "google_gemini";
  tier: "free";
  data_use_acknowledged: true;
}

export interface GeminiYoutubeDirectResult {
  provider: "gemini";
  provider_model: string;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
  detected_language: null;
  language_confidence: null;
  provider_data_deleted: null;
}

export interface PublicGeminiYoutubeProvider {
  readonly configured: boolean;
  readonly model: string;
  transcribe(
    sourceUrl: string,
    languageHint: MediaLanguageHint
  ): Promise<GeminiYoutubeDirectResult>;
}

type GeminiYoutubeJobView = Omit<
  ManagedMediaJobView,
  "provider" | "provider_mode" | "retrieval_provider"
> & {
  provider: "gemini";
  provider_mode: typeof PROVIDER_MODE;
  retrieval_provider: typeof RETRIEVAL_PROVIDER;
  provider_model: string;
  gemini_free_data_use_acknowledged: true;
};

type GeminiYoutubeStoredRecord = Omit<ManagedMediaStoredRecord, "job"> & {
  job: GeminiYoutubeJobView;
};

function asStoredRecord(record: GeminiYoutubeStoredRecord): ManagedMediaStoredRecord {
  return record as unknown as ManagedMediaStoredRecord;
}

function asGeminiRecord(
  record: ManagedMediaStoredRecord | null
): GeminiYoutubeStoredRecord | null {
  if (!record) return null;
  const mode = (record.job as unknown as { provider_mode?: string }).provider_mode;
  if (mode !== PROVIDER_MODE) return null;
  return record as unknown as GeminiYoutubeStoredRecord;
}

function cloneStoreRecord(record: ManagedMediaStoredRecord): ManagedMediaStoredRecord {
  return structuredClone(record);
}

class PublicGeminiYoutubeMemoryStore implements ManagedMediaJobStore {
  readonly durable = false;
  readonly kind = "memory" as const;
  private readonly records = new Map<string, ManagedMediaStoredRecord>();
  private readonly byRequestKey = new Map<string, string>();

  async ready(): Promise<void> {}

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    for (const [jobId, record] of this.records.entries()) {
      if (Date.parse(record.expiresAt) > now) continue;
      this.records.delete(jobId);
      if (this.byRequestKey.get(record.requestKey) === jobId) {
        this.byRequestKey.delete(record.requestKey);
      }
    }
  }

  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    const jobId = this.byRequestKey.get(requestKey);
    if (!jobId) return null;
    const record = this.records.get(jobId);
    return record ? cloneStoreRecord(record) : null;
  }

  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    await this.purgeExpired();
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    const cloned = cloneStoreRecord(record);
    this.records.set(record.job.job_id, cloned);
    this.byRequestKey.set(record.requestKey, record.job.job_id);
    return { created: true, record: cloneStoreRecord(cloned) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    const cloned = cloneStoreRecord(record);
    this.records.set(record.job.job_id, cloned);
    this.byRequestKey.set(record.requestKey, record.job.job_id);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    const record = this.records.get(jobId);
    return record ? cloneStoreRecord(record) : null;
  }
}

function youtubeUrl(value: string): string {
  const normalized = normalizeManagedMediaUrl(value);
  if (managedMediaPlatform(normalized) !== "youtube") {
    throw new MediaTranscriptError(
      "GEMINI_YOUTUBE_URL_REQUIRED",
      "The Gemini direct-video route accepts only supported public YouTube URLs.",
      422,
      false
    );
  }
  return normalized;
}

function interactionText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const blocks: string[] = [];
  for (const stepValue of steps) {
    if (!stepValue || typeof stepValue !== "object") continue;
    const step = stepValue as Record<string, unknown>;
    if (!Array.isArray(step.content)) continue;
    for (const contentValue of step.content) {
      if (!contentValue || typeof contentValue !== "object") continue;
      const content = contentValue as Record<string, unknown>;
      if (content.type !== "text" || typeof content.text !== "string") continue;
      const text = content.text.trim();
      if (text) blocks.push(text);
    }
  }
  return blocks.join("\n").trim();
}

function languageInstruction(languageHint: MediaLanguageHint): string {
  if (languageHint === "auto") {
    return "Detect the spoken language automatically and preserve the original language. Do not translate.";
  }
  const names: Record<Exclude<MediaLanguageHint, "auto">, string> = {
    uk: "Ukrainian",
    ru: "Russian",
    en: "English"
  };
  return `The expected spoken language is ${names[languageHint]}. Preserve the original language and do not translate.`;
}

export class GeminiYoutubeDirectProvider implements PublicGeminiYoutubeProvider {
  readonly configured: boolean;
  readonly model: string;

  constructor(
    private readonly apiKey: string | null,
    freeTierOnly: boolean,
    model = DEFAULT_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly interactionsUrl = GEMINI_INTERACTIONS_URL
  ) {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(model)) {
      throw new Error("KRC_MEDIA_YOUTUBE_GEMINI_MODEL contains invalid characters.");
    }
    this.model = model;
    this.configured = Boolean(apiKey && freeTierOnly);
  }

  async transcribe(
    sourceUrl: string,
    languageHint: MediaLanguageHint
  ): Promise<GeminiYoutubeDirectResult> {
    if (!this.configured || !this.apiKey) {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_NOT_CONFIGURED",
        "Gemini Free direct YouTube processing is not configured.",
        503,
        false
      );
    }
    const source = youtubeUrl(sourceUrl);
    const prompt = [
      "Transcribe all intelligible spoken audio from this public YouTube video.",
      "Return transcript text only: no summary, no commentary, no markdown heading and no invented content.",
      languageInstruction(languageHint)
    ].join(" ");

    let response: Response;
    try {
      response = await this.fetchImpl(this.interactionsUrl, {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            { type: "text", text: prompt },
            { type: "video", uri: source }
          ]
        })
      });
    } catch {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_UNREACHABLE",
        "Gemini Free direct YouTube processing could not be reached.",
        502,
        true
      );
    }

    let payload: Record<string, unknown>;
    try {
      const raw = await response.text();
      const parsed = raw ? JSON.parse(raw) as unknown : {};
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("invalid response object");
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_INVALID_RESPONSE",
        "Gemini returned an invalid response for the YouTube video.",
        502,
        true
      );
    }

    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_FAILED",
        "Gemini Free direct YouTube processing failed closed.",
        retryable ? 502 : 422,
        retryable
      );
    }

    const transcriptText = interactionText(payload);
    if (!transcriptText) {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_TRANSCRIPT_EMPTY",
        "Gemini returned no usable spoken transcript for the YouTube video.",
        422,
        false
      );
    }

    return {
      provider: "gemini",
      provider_model: this.model,
      transcript_text: transcriptText,
      segments: chunkTranscriptWords([], transcriptText),
      detected_language: null,
      language_confidence: null,
      provider_data_deleted: null
    };
  }
}

export function parseGeminiFreeConsent(value: unknown): GeminiFreeConsent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const root = value as Record<string, unknown>;
  const consentValue = root.gemini_free_consent;
  if (!consentValue || typeof consentValue !== "object" || Array.isArray(consentValue)) {
    return null;
  }
  const consent = consentValue as Record<string, unknown>;
  if (
    consent.provider !== "google_gemini" ||
    consent.tier !== "free" ||
    consent.data_use_acknowledged !== true
  ) {
    return null;
  }
  return {
    provider: "google_gemini",
    tier: "free",
    data_use_acknowledged: true
  };
}

function requestKey(
  sourceUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string,
  model: string
): string {
  return createHash("sha256")
    .update(
      `gemini-youtube-direct-v1|${model}|${sourceUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}

export interface PublicGeminiYoutubeEngineOptions {
  store?: ManagedMediaJobStore;
  provider?: PublicGeminiYoutubeProvider;
  jobTtlSeconds?: number;
}

export class PublicGeminiYoutubeEngine {
  readonly configured: boolean;
  readonly durableStore: boolean;
  readonly storeKind: "memory" | "postgres";
  readonly model: string;
  private readonly store: ManagedMediaJobStore;
  private readonly provider: PublicGeminiYoutubeProvider;
  private readonly jobTtlSeconds: number;
  private readonly inFlight = new Set<string>();
  private storeReady: Promise<void> | null = null;

  constructor(
    private readonly betaGate: MediaBetaGate,
    geminiApiKey: string | null,
    freeTierOnly: boolean,
    model = DEFAULT_MODEL,
    options: PublicGeminiYoutubeEngineOptions = {}
  ) {
    const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
    this.store = options.store ?? (
      databaseUrl
        ? new ManagedMediaPersistentStore(databaseUrl)
        : new PublicGeminiYoutubeMemoryStore()
    );
    this.provider = options.provider ?? new GeminiYoutubeDirectProvider(
      geminiApiKey,
      freeTierOnly,
      model
    );
    this.model = this.provider.model;
    this.jobTtlSeconds = options.jobTtlSeconds ?? 3600;
    this.configured = betaGate.configured && this.provider.configured;
    this.durableStore = this.store.durable;
    this.storeKind = this.store.kind;
  }

  private authorize(accessCode: string): void {
    if (!this.betaGate.authorize(accessCode)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The media admission principal is invalid.",
        403,
        false
      );
    }
    if (!this.configured) {
      throw new MediaTranscriptError(
        "GEMINI_YOUTUBE_NOT_CONFIGURED",
        "Gemini Free direct YouTube processing is not configured.",
        503,
        false
      );
    }
  }

  private async ensureStore(): Promise<void> {
    if (!this.storeReady) {
      this.storeReady = (async () => {
        await this.store.ready();
        await this.store.purgeExpired();
      })().catch((error) => {
        this.storeReady = null;
        throw error;
      });
    }
    try {
      await this.storeReady;
    } catch {
      throw new MediaTranscriptError(
        "MANAGED_DURABLE_STORE_UNAVAILABLE",
        "The managed media durable store is temporarily unavailable.",
        503,
        true
      );
    }
  }

  private expiry(updatedAt: string): string {
    return new Date(Date.parse(updatedAt) + this.jobTtlSeconds * 1000).toISOString();
  }

  private publicJob(job: GeminiYoutubeJobView, reused: boolean): GeminiYoutubeJobView {
    return { ...structuredClone(job), reused };
  }

  async preflight(input: ManagedMediaPreflightInput) {
    this.authorize(input.beta_access_code);
    const sourceUrl = youtubeUrl(input.url);
    return {
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "gemini",
      provider_model: this.model,
      mode: "youtube_direct",
      platform: "youtube",
      retrieval_provider: RETRIEVAL_PROVIDER,
      estimated_retrieval_credits: 0,
      stt_seconds_estimate: 0,
      can_continue: true,
      consent_required: true,
      consent_provider: "google_gemini",
      consent_tier: "free",
      data_use_notice: "Gemini Developer API Free Tier content may be used by Google to improve Google products.",
      automatic_paid_fallback: false
    } as const;
  }

  async lookup(input: ManagedMediaPreflightInput): Promise<GeminiYoutubeJobView | null> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = youtubeUrl(input.url);
    const key = requestKey(sourceUrl, input.language_hint, input.beta_access_code, this.model);
    const record = asGeminiRecord(await this.store.findByRequestKey(key));
    return record ? this.publicJob(record.job, true) : null;
  }

  async start(
    input: ManagedMediaPreflightInput,
    consent: GeminiFreeConsent | null
  ): Promise<GeminiYoutubeJobView> {
    this.authorize(input.beta_access_code);
    if (!consent) {
      throw new MediaTranscriptError(
        "GEMINI_FREE_CONSENT_REQUIRED",
        "Explicit consent to Gemini Developer API Free Tier data-use terms is required before sending a YouTube URL to Google.",
        409,
        false
      );
    }
    await this.ensureStore();
    const sourceUrl = youtubeUrl(input.url);
    const key = requestKey(sourceUrl, input.language_hint, input.beta_access_code, this.model);
    const existing = asGeminiRecord(await this.store.findByRequestKey(key));
    if (existing) {
      if (existing.job.status === "PROCESSING" && !this.inFlight.has(key)) {
        const updatedAt = new Date().toISOString();
        const interrupted: GeminiYoutubeStoredRecord = {
          ...existing,
          job: {
            ...existing.job,
            status: "FAILED",
            updated_at: updatedAt,
            error: {
              code: "GEMINI_YOUTUBE_RESULT_UNCERTAIN_RETRY_BLOCKED",
              message: "A prior Gemini YouTube request was interrupted. Automatic replay is blocked.",
              retryable: false
            }
          },
          expiresAt: this.expiry(updatedAt)
        };
        await this.store.put(asStoredRecord(interrupted));
        return this.publicJob(interrupted.job, true);
      }
      return this.publicJob(existing.job, true);
    }

    const now = new Date().toISOString();
    const job = {
      job_id: `KRCM_${randomUUID()}`,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "gemini",
      provider_mode: PROVIDER_MODE,
      provider_model: this.model,
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 0,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: false,
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      retrieval_provider: RETRIEVAL_PROVIDER,
      retrieval_credits_charged: 0,
      stt_seconds_charged: 0,
      provider_data_deleted: null,
      language_confidence: null,
      gemini_free_data_use_acknowledged: true,
      error: null
    } satisfies GeminiYoutubeJobView;

    const record: GeminiYoutubeStoredRecord = {
      job,
      requestKey: key,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiry(now)
    };
    const reservation = await this.store.reserve(asStoredRecord(record));
    if (!reservation.created) {
      const reserved = asGeminiRecord(reservation.record);
      if (reserved) return this.publicJob(reserved.job, true);
    }

    this.inFlight.add(key);
    try {
      const result = await this.provider.transcribe(sourceUrl, input.language_hint);
      const updatedAt = new Date().toISOString();
      const completed: GeminiYoutubeStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "COMPLETED",
          updated_at: updatedAt,
          segment_count: result.segments.length,
          transcript_characters: result.transcript_text.length,
          provider_model: result.provider_model,
          provider_data_deleted: result.provider_data_deleted,
          error: null
        },
        segments: result.segments.map((segment) => ({ ...segment })),
        expiresAt: this.expiry(updatedAt)
      };
      await this.store.put(asStoredRecord(completed));
      return this.publicJob(completed.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "GEMINI_YOUTUBE_FAILED",
          "Gemini Free direct YouTube processing failed closed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: GeminiYoutubeStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "FAILED",
          updated_at: updatedAt,
          free_retrieval_error_code: normalized.code,
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: false
          }
        },
        expiresAt: this.expiry(updatedAt)
      };
      await this.store.put(asStoredRecord(failed));
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(key);
    }
  }

  async get(jobId: string): Promise<GeminiYoutubeJobView | null> {
    await this.ensureStore();
    const record = asGeminiRecord(await this.store.get(jobId));
    return record ? this.publicJob(record.job, false) : null;
  }

  async page(
    jobId: string,
    cursor: number,
    limit: number
  ): Promise<{
    job_id: string;
    status: GeminiYoutubeJobView["status"];
    cursor: number;
    next_cursor: number | null;
    segments: MediaTranscriptSegment[];
  } | null> {
    await this.ensureStore();
    const record = asGeminiRecord(await this.store.get(jobId));
    if (!record) return null;
    const start = Math.min(cursor, record.segments.length);
    const end = Math.min(start + limit, record.segments.length);
    return {
      job_id: record.job.job_id,
      status: record.job.status,
      cursor: start,
      next_cursor: end < record.segments.length ? end : null,
      segments: record.segments.slice(start, end).map((segment) => ({ ...segment }))
    };
  }
}

function withServerAccessCode(value: unknown, accessCodes: string[] | undefined): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const code = accessCodes?.[0];
  if (!code) return value;
  return { ...(value as Record<string, unknown>), beta_access_code: code };
}

async function readJsonBody(request: IncomingMessage, maximumBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new MediaTranscriptError("REQUEST_BODY_TOO_LARGE", "The managed media request body is too large.", 413, false);
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new MediaTranscriptError("INVALID_REQUEST", "The request body is empty.", 400, false);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MediaTranscriptError("INVALID_REQUEST", "The request body is not valid JSON.", 400, false);
  }
}

function pagination(requestUrl: URL): { cursor: number; limit: number } {
  const cursor = Number(requestUrl.searchParams.get("cursor") || "0");
  const limit = Number(requestUrl.searchParams.get("limit") || "20");
  if (
    !Number.isInteger(cursor) || cursor < 0 || cursor > 100000 ||
    !Number.isInteger(limit) || limit < 1 || limit > 50
  ) {
    throw new MediaTranscriptError(
      "INVALID_PAGINATION",
      "cursor must be a non-negative integer and limit must be 1..50.",
      400,
      false
    );
  }
  return { cursor, limit };
}

function setHeaders(response: ServerResponse, context: RequestContext, origin: string): void {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("x-request-id", context.requestId);
  response.setHeader("x-correlation-id", context.correlationId);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  context: RequestContext,
  origin: string
): void {
  setHeaders(response, context, origin);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  error: MediaTranscriptError,
  context: RequestContext,
  origin: string
): void {
  sendJson(response, error.httpStatus, {
    error: {
      code: error.code,
      message: error.message,
      category: "MEDIA",
      retryable: error.retryable,
      request_id: context.requestId,
      session_id: null,
      correlation_id: context.correlationId,
      details: []
    }
  }, context, origin);
}

function publicGeminiFreeTierOnly(): boolean {
  return process.env.KRC_MEDIA_GEMINI_FREE_TIER_ONLY?.trim().toLowerCase() === "true";
}

function publicGeminiModel(): string {
  return process.env.KRC_MEDIA_YOUTUBE_GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function createPublicGeminiYoutubeHttpHandler(
  config: AppConfig,
  engine = new PublicGeminiYoutubeEngine(
    new MediaBetaGate(config.mediaBetaCodes ?? [], config.mediaDailySttSeconds ?? 7200),
    config.geminiApiKey,
    publicGeminiFreeTierOnly(),
    publicGeminiModel(),
    { jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600 }
  )
) {
  const capability = {
    mode: "zero_client_managed_beta",
    provider: "gemini_youtube_direct+cobalt_retrieval+assemblyai_stt",
    configured: Boolean(
      config.mediaActionToken &&
      engine.configured &&
      config.cobaltEndpoint &&
      config.cobaltApiKey &&
      config.assemblyAiApiKey
    ),
    platforms: ["youtube", "instagram", "facebook", "telegram"],
    supadata_public_active: false,
    automatic_paid_fallback: false,
    paid_retrieval_fallback: false,
    paid_stt_fallback: false,
    youtube_retrieval_provider: RETRIEVAL_PROVIDER,
    youtube_retrieval_configured: engine.configured,
    youtube_retrieval_credits: 0,
    youtube_stt_provider: "gemini",
    youtube_stt_configured: engine.configured,
    youtube_gemini_model: engine.model,
    youtube_gemini_free_tier_only: publicGeminiFreeTierOnly(),
    youtube_gemini_consent_required: true,
    youtube_gemini_data_use_notice: "Gemini Developer API Free Tier content may be used by Google to improve Google products.",
    instagram_retrieval_provider: "cobalt",
    instagram_retrieval_configured: Boolean(config.cobaltEndpoint && config.cobaltApiKey),
    instagram_retrieval_credits: 0,
    instagram_stt_provider: "assemblyai",
    instagram_stt_configured: Boolean(config.assemblyAiApiKey),
    facebook_free_retrieval_provider: "cobalt",
    facebook_free_retrieval_configured: Boolean(config.cobaltEndpoint && config.cobaltApiKey),
    facebook_stt_provider: "assemblyai",
    facebook_stt_configured: Boolean(config.assemblyAiApiKey),
    telegram_retrieval_provider: "telegram_public_web",
    telegram_retrieval_credits: 0,
    telegram_stt_provider: "assemblyai",
    telegram_stt_configured: Boolean(config.assemblyAiApiKey),
    user_beta_access_code_required: false,
    owner_access_injected_server_side: true,
    durable_store: engine.storeKind,
    restart_resilient_jobs: engine.durableStore,
    duplicate_start_reuses_job: true
  } as const;

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    const path = requestUrl.pathname;
    const ownsPath = path === CAPABILITY || path === PREFLIGHT || path === LOOKUP ||
      path === TRANSCRIPTIONS || JOB_PATH.test(path) || SEGMENTS_PATH.test(path);
    if (!ownsPath) return false;

    const context = createRequestContext(request);
    try {
      if (!config.mediaActionToken) {
        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
          "Managed media transcription is not configured.",
          503,
          true
        );
      }
      const authentication = authenticate(request, config.mediaActionToken);
      if (!authentication.ok) {
        throw new MediaTranscriptError(
          authentication.code,
          authentication.code === "AUTHENTICATION_REQUIRED"
            ? "A bearer token is required."
            : "The bearer token is invalid or revoked.",
          401,
          false
        );
      }

      const method = request.method || "GET";
      if (method === "GET" && path === CAPABILITY) {
        sendJson(response, 200, { request_id: context.requestId, ...capability }, context, config.corsAllowedOrigin);
        return true;
      }

      if (method === "POST" && [PREFLIGHT, LOOKUP, TRANSCRIPTIONS].includes(path)) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError("INVALID_REQUEST", "The Gemini YouTube request is not valid.", 400, false);
        }
        youtubeUrl(input.url);

        if (path === PREFLIGHT) {
          const quote = await engine.preflight(input);
          sendJson(response, 200, { request_id: context.requestId, ...quote }, context, config.corsAllowedOrigin);
          return true;
        }
        if (path === LOOKUP) {
          const job = await engine.lookup(input);
          if (!job) {
            throw new MediaTranscriptError("MEDIA_TRANSCRIPT_NOT_FOUND", "The managed media job was not found.", 404, false);
          }
          sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
          return true;
        }
        const job = await engine.start(input, parseGeminiFreeConsent(body));
        sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
        return true;
      }

      const segmentsMatch = SEGMENTS_PATH.exec(path);
      if (method === "GET" && segmentsMatch?.[1]) {
        const { cursor, limit } = pagination(requestUrl);
        const page = await engine.page(segmentsMatch[1], cursor, limit);
        if (!page) {
          throw new MediaTranscriptError("MEDIA_TRANSCRIPT_NOT_FOUND", "The managed media job was not found.", 404, false);
        }
        sendJson(response, 200, { request_id: context.requestId, ...page }, context, config.corsAllowedOrigin);
        return true;
      }

      const jobMatch = JOB_PATH.exec(path);
      if (method === "GET" && jobMatch?.[1]) {
        const job = await engine.get(jobMatch[1]);
        if (!job) {
          throw new MediaTranscriptError("MEDIA_TRANSCRIPT_NOT_FOUND", "The managed media job was not found.", 404, false);
        }
        sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
        return true;
      }

      return false;
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "GEMINI_YOUTUBE_REQUEST_FAILED",
          "The Gemini YouTube request failed.",
          500,
          true
        );
      sendError(response, normalized, context, config.corsAllowedOrigin);
      return true;
    }
  };

  return { handle, capability, engine };
}
