import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  type FacebookMediaAsset
} from "./facebook_media_retrieval.js";
import {
  AssemblyAiFacebookMediaStt,
  type ManagedFacebookSttResult
} from "./facebook_managed_pipeline.js";
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
  type ManagedMediaStoreReservation,
  type ManagedMediaSttReservation
} from "./managed_media_service.js";
import { managedMediaPlatform, normalizeManagedMediaUrl } from "./managed_media_url.js";
import {
  MediaTranscriptError,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";
import { MANAGED_ATTACHMENT_MAX_BYTES } from "./attachment_managed_pipeline.js";

const ROOT = "/api/v1/media/managed";
const PREFLIGHT = `${ROOT}/preflight`;
const LOOKUP = `${ROOT}/lookup`;
const TRANSCRIPTIONS = `${ROOT}/transcriptions`;
const JOB_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)$/;
const SEGMENTS_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/segments$/;
const PUBLIC_COBALT_PROVIDER_MODE = "cobalt_retrieval_stt" as const;

type PublicCobaltPlatform = "youtube" | "instagram";

export interface CobaltPublicMediaAsset {
  source_url: string;
  media_url: string;
  duration_seconds: number | null;
  provider: "cobalt";
  provider_mode: "self_hosted";
  credits_charged: 0;
  credits_remaining: null;
  cached: false;
}

export interface PublicCobaltRetriever {
  readonly configured: boolean;
  retrieve(sourceUrl: string): Promise<CobaltPublicMediaAsset>;
}

export interface PublicCobaltStt {
  readonly configured: boolean;
  transcribe(
    asset: CobaltPublicMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ): Promise<ManagedFacebookSttResult>;
}

type PublicCobaltJobView = Omit<
  ManagedMediaJobView,
  "provider" | "provider_mode" | "retrieval_provider"
> & {
  provider: "assemblyai";
  provider_mode: typeof PUBLIC_COBALT_PROVIDER_MODE;
  retrieval_provider: "cobalt";
};

type PublicCobaltStoredRecord = Omit<ManagedMediaStoredRecord, "job"> & {
  job: PublicCobaltJobView;
};

function asStoredRecord(record: PublicCobaltStoredRecord): ManagedMediaStoredRecord {
  return record as unknown as ManagedMediaStoredRecord;
}

function asCobaltRecord(
  record: ManagedMediaStoredRecord | null
): PublicCobaltStoredRecord | null {
  if (!record) return null;
  const mode = (record.job as unknown as { provider_mode?: string }).provider_mode;
  if (mode !== PUBLIC_COBALT_PROVIDER_MODE) return null;
  return record as unknown as PublicCobaltStoredRecord;
}

function cloneStoreRecord(record: ManagedMediaStoredRecord): ManagedMediaStoredRecord {
  return structuredClone(record);
}

class PublicCobaltMemoryStore implements ManagedMediaJobStore {
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

function safeEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("KRC_MEDIA_COBALT_ENDPOINT must be a valid URL.");
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("KRC_MEDIA_COBALT_ENDPOINT must use HTTPS outside local tests.");
  }
  return value.replace(/\/+$/, "");
}

function safeMediaUrl(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(value, `${baseUrl}/`);
  } catch {
    return null;
  }
  const localHttp = parsed.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) return null;
  return parsed.toString();
}

function cobaltPlatform(sourceUrl: string): PublicCobaltPlatform {
  const normalized = normalizeManagedMediaUrl(sourceUrl);
  const platform = managedMediaPlatform(normalized);
  if (platform !== "youtube" && platform !== "instagram") {
    throw new MediaTranscriptError(
      "COBALT_PUBLIC_MEDIA_URL_REQUIRED",
      "The public Cobalt route accepts only supported public YouTube or Instagram video URLs.",
      422,
      false
    );
  }
  return platform;
}

export class CobaltPublicMediaRetriever implements PublicCobaltRetriever {
  readonly configured = true;
  private readonly endpoint: string;

  constructor(
    endpoint: string,
    private readonly apiKey: string | null = null,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.endpoint = safeEndpoint(endpoint);
  }

  async retrieve(sourceUrl: string): Promise<CobaltPublicMediaAsset> {
    const source = normalizeManagedMediaUrl(sourceUrl);
    const platform = cobaltPlatform(source);
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"
    };
    if (this.apiKey) headers.authorization = `Api-Key ${this.apiKey}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.endpoint}/`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: source,
          downloadMode: "audio",
          audioFormat: "mp3",
          disableMetadata: true
        })
      });
    } catch {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_UNREACHABLE",
        `The self-hosted Cobalt ${platform} retrieval service could not be reached.`,
        502,
        true
      );
    }

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        throw new MediaTranscriptError(
          "COBALT_PUBLIC_MEDIA_INVALID_RESPONSE",
          "The self-hosted Cobalt retrieval service returned invalid JSON.",
          502,
          false
        );
      }
    }

    if (!response.ok) {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_FAILED",
        `The self-hosted Cobalt ${platform} retrieval request failed closed.`,
        response.status >= 500 ? 502 : 422,
        response.status >= 500
      );
    }

    const status = typeof payload.status === "string"
      ? payload.status.toLowerCase()
      : "";
    if (status === "picker") {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_MULTI_ASSET_UNSUPPORTED",
        "Multi-asset Instagram posts are not enabled in the initial public Cobalt route.",
        422,
        false
      );
    }
    if (status === "local-processing") {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_LOCAL_PROCESSING_UNSUPPORTED",
        "The Cobalt response requires local client-side processing and is not usable by the zero-client public route.",
        422,
        false
      );
    }
    if (status !== "redirect" && status !== "tunnel") {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_NO_AUDIO",
        "The self-hosted Cobalt route returned no directly usable audio asset.",
        422,
        false
      );
    }

    const mediaUrl = safeMediaUrl(payload.url, this.endpoint);
    if (!mediaUrl) {
      throw new MediaTranscriptError(
        "COBALT_PUBLIC_MEDIA_NO_AUDIO",
        "The self-hosted Cobalt route returned no safe audio URL.",
        422,
        false
      );
    }

    return {
      source_url: source,
      media_url: mediaUrl,
      duration_seconds: null,
      provider: "cobalt",
      provider_mode: "self_hosted",
      credits_charged: 0,
      credits_remaining: null,
      cached: false
    };
  }
}

class AssemblyAiCobaltPublicStt implements PublicCobaltStt {
  private readonly inner: AssemblyAiFacebookMediaStt;
  readonly configured: boolean;

  constructor(apiKey: string | null) {
    this.inner = new AssemblyAiFacebookMediaStt(apiKey);
    this.configured = this.inner.configured;
  }

  async transcribe(
    asset: CobaltPublicMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ): Promise<ManagedFacebookSttResult> {
    return this.inner.transcribe(
      asset as FacebookMediaAsset,
      languageHint,
      reserveSttSeconds
    );
  }
}

function publicCobaltRequestKey(
  sourceUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `cobalt-public-retrieval-stt|${sourceUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}

export interface PublicCobaltMediaEngineOptions {
  store?: ManagedMediaJobStore;
  retriever?: PublicCobaltRetriever;
  stt?: PublicCobaltStt;
  jobTtlSeconds?: number;
}

export class PublicCobaltMediaEngine {
  readonly configured: boolean;
  readonly durableStore: boolean;
  readonly storeKind: "memory" | "postgres";
  private readonly store: ManagedMediaJobStore;
  private readonly retriever: PublicCobaltRetriever | null;
  private readonly stt: PublicCobaltStt;
  private readonly jobTtlSeconds: number;
  private readonly inFlight = new Set<string>();
  private storeReady: Promise<void> | null = null;

  constructor(
    private readonly betaGate: MediaBetaGate,
    cobaltEndpoint: string | null,
    cobaltApiKey: string | null,
    assemblyAiApiKey: string | null,
    options: PublicCobaltMediaEngineOptions = {}
  ) {
    const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
    this.store = options.store ?? (
      databaseUrl
        ? new ManagedMediaPersistentStore(databaseUrl)
        : new PublicCobaltMemoryStore()
    );
    this.retriever = options.retriever ?? (
      cobaltEndpoint ? new CobaltPublicMediaRetriever(cobaltEndpoint, cobaltApiKey) : null
    );
    this.stt = options.stt ?? new AssemblyAiCobaltPublicStt(assemblyAiApiKey);
    this.jobTtlSeconds = options.jobTtlSeconds ?? 3600;
    this.configured = betaGate.configured && Boolean(this.retriever) && this.stt.configured;
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
    if (!this.configured || !this.retriever) {
      throw new MediaTranscriptError(
        "PUBLIC_COBALT_MEDIA_NOT_CONFIGURED",
        "The public Cobalt retrieval and STT route is not configured.",
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

  private async reserveSttQuota(jobId: string, requestedSeconds: number): Promise<void> {
    if (!Number.isFinite(requestedSeconds) || requestedSeconds <= 0) {
      throw new MediaTranscriptError(
        "MEDIA_STT_DURATION_INVALID",
        "The media duration is invalid for STT quota reservation.",
        422,
        false
      );
    }
    const now = new Date();
    const usage = this.betaGate.usage(now);
    if (this.store.reserveSttSeconds) {
      let reservation: ManagedMediaSttReservation;
      try {
        reservation = await this.store.reserveSttSeconds(
          jobId,
          usage.day_utc,
          requestedSeconds,
          usage.daily_limit_seconds
        );
      } catch {
        throw new MediaTranscriptError(
          "MANAGED_DURABLE_STORE_UNAVAILABLE",
          "The managed media durable quota ledger is temporarily unavailable.",
          503,
          true
        );
      }
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          "MEDIA_BETA_STT_QUOTA_EXHAUSTED",
          "The MEDIA daily STT quota is exhausted.",
          429,
          false
        );
      }
      this.betaGate.restoreUsage(usage.day_utc, reservation.used_seconds);
      return;
    }
    const reservation = this.betaGate.reserveSttSeconds(requestedSeconds, now);
    if (!reservation.allowed) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_STT_QUOTA_EXHAUSTED",
        "The MEDIA daily STT quota is exhausted.",
        429,
        false
      );
    }
  }

  private publicJob(job: PublicCobaltJobView, reused: boolean): PublicCobaltJobView {
    return {
      ...structuredClone(job),
      reused
    };
  }

  async preflight(input: ManagedMediaPreflightInput) {
    this.authorize(input.beta_access_code);
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    const platform = cobaltPlatform(sourceUrl);
    return {
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "cobalt",
      mode: "retrieval_stt",
      platform,
      retrieval_credits_available: null,
      estimated_retrieval_credits: 0,
      retrieval_credits_after_estimate: null,
      stt_provider: "assemblyai",
      can_continue: true,
      consent_required: false,
      automatic_paid_fallback: false
    } as const;
  }

  async lookup(input: ManagedMediaPreflightInput): Promise<PublicCobaltJobView | null> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    cobaltPlatform(sourceUrl);
    const requestKey = publicCobaltRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    const record = asCobaltRecord(await this.store.findByRequestKey(requestKey));
    if (!record) return null;
    return this.publicJob(record.job, true);
  }

  async start(input: ManagedMediaPreflightInput): Promise<PublicCobaltJobView> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    cobaltPlatform(sourceUrl);
    const requestKey = publicCobaltRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );

    const existing = asCobaltRecord(await this.store.findByRequestKey(requestKey));
    if (existing) {
      if (existing.job.status === "PROCESSING" && !this.inFlight.has(requestKey)) {
        const updatedAt = new Date().toISOString();
        const interrupted: PublicCobaltStoredRecord = {
          ...existing,
          job: {
            ...existing.job,
            status: "FAILED",
            updated_at: updatedAt,
            credit_charge_uncertain: false,
            error: {
              code: "PUBLIC_COBALT_RESULT_UNCERTAIN_RETRY_BLOCKED",
              message: "A prior Cobalt/STT request was interrupted. Automatic replay is blocked.",
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
      provider: "assemblyai",
      provider_mode: PUBLIC_COBALT_PROVIDER_MODE,
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
      retrieval_provider: "cobalt",
      retrieval_credits_charged: 0,
      stt_seconds_charged: 0,
      provider_data_deleted: null,
      language_confidence: null,
      error: null
    } satisfies PublicCobaltJobView;

    const record: PublicCobaltStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiry(now)
    };
    const reservation = await this.store.reserve(asStoredRecord(record));
    if (!reservation.created) {
      const reserved = asCobaltRecord(reservation.record);
      if (reserved) return this.publicJob(reserved.job, true);
    }

    this.inFlight.add(requestKey);
    try {
      const asset = await this.retriever!.retrieve(sourceUrl);
      const stt = await this.stt.transcribe(
        asset,
        input.language_hint,
        (seconds) => this.reserveSttQuota(job.job_id, seconds)
      );
      const updatedAt = new Date().toISOString();
      const completed: PublicCobaltStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "COMPLETED",
          updated_at: updatedAt,
          detected_language: stt.detected_language,
          available_languages: stt.detected_language ? [stt.detected_language] : [],
          segment_count: stt.segments.length,
          transcript_characters: stt.transcript_text.length,
          media_duration_seconds: stt.duration_seconds,
          stt_seconds_charged: Math.ceil(stt.duration_seconds),
          provider_data_deleted: stt.provider_data_deleted,
          language_confidence: stt.language_confidence,
          error: null
        },
        segments: stt.segments.map((segment) => ({ ...segment })),
        expiresAt: this.expiry(updatedAt)
      };
      await this.store.put(asStoredRecord(completed));
      return this.publicJob(completed.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "PUBLIC_COBALT_MEDIA_FAILED",
          "The public Cobalt retrieval/STT route failed closed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: PublicCobaltStoredRecord = {
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
      this.inFlight.delete(requestKey);
    }
  }

  async get(jobId: string): Promise<PublicCobaltJobView | null> {
    await this.ensureStore();
    const record = asCobaltRecord(await this.store.get(jobId));
    return record ? this.publicJob(record.job, false) : null;
  }

  async page(
    jobId: string,
    cursor: number,
    limit: number
  ): Promise<{
    job_id: string;
    status: PublicCobaltJobView["status"];
    cursor: number;
    next_cursor: number | null;
    segments: MediaTranscriptSegment[];
  } | null> {
    await this.ensureStore();
    const record = asCobaltRecord(await this.store.get(jobId));
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

function setHeaders(
  response: ServerResponse,
  context: RequestContext,
  origin: string
): void {
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
  sendJson(
    response,
    error.httpStatus,
    {
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
    },
    context,
    origin
  );
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new MediaTranscriptError(
        "REQUEST_BODY_TOO_LARGE",
        "The managed media request body is too large.",
        413,
        false
      );
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

function withServerAccessCode(value: unknown, accessCodes: string[] | undefined): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const code = accessCodes?.[0];
  if (!code) return value;
  return { ...(value as Record<string, unknown>), beta_access_code: code };
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

function routePlatformError(platform: string): never {
  if (platform === "facebook") {
    throw new MediaTranscriptError(
      "FACEBOOK_FREE_RETRIEVAL_REQUIRED",
      "Active Facebook intake uses the free Cobalt Facebook route.",
      400,
      false
    );
  }
  if (platform === "telegram") {
    throw new MediaTranscriptError(
      "TELEGRAM_PUBLIC_RETRIEVAL_REQUIRED",
      "Active Telegram intake uses the public Telegram retrieval route.",
      400,
      false
    );
  }
  throw new MediaTranscriptError(
    "COBALT_PUBLIC_MEDIA_URL_REQUIRED",
    "The public Cobalt route accepts only supported YouTube or Instagram video URLs.",
    422,
    false
  );
}

export function createPublicCobaltMediaHttpHandler(
  config: AppConfig,
  engine = new PublicCobaltMediaEngine(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.cobaltEndpoint ?? null,
    config.cobaltApiKey ?? null,
    config.assemblyAiApiKey,
    { jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600 }
  )
) {
  const capability = {
    mode: "zero_client_managed_beta",
    provider: "cobalt_retrieval+assemblyai_stt",
    configured: Boolean(config.mediaActionToken && engine.configured),
    platforms: ["youtube", "instagram", "facebook", "telegram"],
    supadata_public_active: false,
    native_transcript_credits: 0,
    credit_preflight_required: false,
    explicit_user_consent_required: false,
    automatic_ai_fallback: false,
    youtube_retrieval_provider: "cobalt",
    youtube_retrieval_configured: Boolean(config.cobaltEndpoint),
    youtube_retrieval_credits: 0,
    youtube_stt_provider: "assemblyai",
    youtube_stt_configured: Boolean(config.assemblyAiApiKey),
    instagram_retrieval_provider: "cobalt",
    instagram_retrieval_configured: Boolean(config.cobaltEndpoint),
    instagram_retrieval_credits: 0,
    instagram_stt_provider: "assemblyai",
    instagram_stt_configured: Boolean(config.assemblyAiApiKey),
    instagram_multi_asset_posts: false,
    facebook_free_retrieval_provider: "cobalt",
    facebook_free_retrieval_configured: Boolean(config.cobaltEndpoint),
    facebook_paid_retrieval_configured: false,
    facebook_automatic_paid_retrieval: false,
    facebook_stt_provider: "assemblyai",
    facebook_stt_configured: Boolean(config.assemblyAiApiKey),
    telegram_public_retrieval: true,
    telegram_retrieval_provider: "telegram_public_web",
    telegram_retrieval_credits: 0,
    telegram_stt_provider: "assemblyai",
    telegram_stt_configured: Boolean(config.assemblyAiApiKey),
    local_attachment_transport: true,
    local_attachment_transcription: Boolean(config.assemblyAiApiKey),
    local_attachment_provider: "assemblyai",
    local_attachment_retrieval_provider: "openai_attachment",
    local_attachment_max_bytes: MANAGED_ATTACHMENT_MAX_BYTES,
    local_attachment_max_duration_seconds: config.mediaMaxDurationSeconds ?? 3600,
    user_beta_access_code_required: false,
    owner_access_injected_server_side: true,
    durable_store: engine.storeKind,
    restart_resilient_jobs: engine.durableStore,
    duplicate_start_reuses_job: true,
    paid_retrieval_fallback: false,
    paid_stt_fallback: false
  } as const;

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    const path = requestUrl.pathname;
    const ownsPath = path === ROOT || path === PREFLIGHT || path === LOOKUP ||
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
      if (method === "GET" && path === ROOT) {
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...capability },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      if (method === "POST" && [PREFLIGHT, LOOKUP, TRANSCRIPTIONS].includes(path)) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The public Cobalt media request is not valid.",
            400,
            false
          );
        }
        const platform = managedMediaPlatform(input.url);
        if (platform !== "youtube" && platform !== "instagram") {
          routePlatformError(platform);
        }

        if (path === PREFLIGHT) {
          const quote = await engine.preflight(input);
          sendJson(response, 200, { request_id: context.requestId, ...quote }, context, config.corsAllowedOrigin);
          return true;
        }
        if (path === LOOKUP) {
          const job = await engine.lookup(input);
          if (!job) {
            throw new MediaTranscriptError(
              "MEDIA_TRANSCRIPT_NOT_FOUND",
              "The managed media job was not found.",
              404,
              false
            );
          }
          sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
          return true;
        }
        const job = await engine.start(input);
        sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
        return true;
      }

      const segmentsMatch = SEGMENTS_PATH.exec(path);
      if (method === "GET" && segmentsMatch?.[1]) {
        const { cursor, limit } = pagination(requestUrl);
        const page = await engine.page(segmentsMatch[1], cursor, limit);
        if (!page) return false;
        sendJson(response, 200, { request_id: context.requestId, ...page }, context, config.corsAllowedOrigin);
        return true;
      }

      const jobMatch = JOB_PATH.exec(path);
      if (method === "GET" && jobMatch?.[1]) {
        const job = await engine.get(jobMatch[1]);
        if (!job) return false;
        sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
        return true;
      }

      return false;
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "PUBLIC_COBALT_MEDIA_REQUEST_FAILED",
          "The public Cobalt media request failed.",
          500,
          true
        );
      sendError(response, normalized, context, config.corsAllowedOrigin);
      return true;
    }
  };

  return { handle, capability, engine };
}
