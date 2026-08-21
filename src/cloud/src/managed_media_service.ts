import { createHash, randomUUID } from "node:crypto";
import { MediaBetaGate } from "./media_beta.js";
import { normalizeManagedMediaUrl } from "./managed_media_url.js";
import {
  MediaTranscriptError,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";
import {
  SupadataProvider,
  type SupadataNativeCreditQuote,
  type SupadataNativeTranscriptResult
} from "./supadata_provider.js";

export interface ManagedMediaPreflightInput {
  url: string;
  language_hint: MediaLanguageHint;
  beta_access_code: string;
}

export interface ManagedMediaNativeInput extends ManagedMediaPreflightInput {
  credit_consent: {
    provider: "supadata";
    mode: "native";
    max_credits: number;
  };
}

export interface ManagedMediaCreditPreflight {
  source_url: string;
  language_hint: MediaLanguageHint;
  provider: "supadata";
  mode: "native";
  plan: string;
  credits_available: number;
  estimated_credits: 1;
  credits_after_estimate: number;
  can_continue: boolean;
  consent_required: true;
  consent_options: {
    approve: 1;
    reject: 2;
  };
}

export type ManagedMediaStatus =
  | "PROCESSING"
  | "COMPLETED"
  | "AWAITING_AI_CONSENT"
  | "FAILED";

export interface ManagedMediaJobView {
  job_id: string;
  status: ManagedMediaStatus;
  created_at: string;
  updated_at: string;
  source_url: string;
  language_hint: MediaLanguageHint;
  provider: "supadata";
  provider_mode: "native";
  detected_language: string | null;
  available_languages: string[];
  credits_charged: number;
  credits_remaining_estimate: number;
  credit_charge_uncertain: boolean;
  reused: boolean;
  segment_count: number;
  transcript_characters: number;
  ai_fallback_requires_new_consent: boolean;
  error: null | {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface ManagedMediaStoredRecord {
  job: ManagedMediaJobView;
  requestKey: string;
  accessCodeDigest: string;
  segments: MediaTranscriptSegment[];
  expiresAt: string;
}

export interface ManagedMediaStoreReservation {
  created: boolean;
  record: ManagedMediaStoredRecord;
}

export interface ManagedMediaJobStore {
  readonly durable: boolean;
  readonly kind: "memory" | "postgres";
  ready(): Promise<void>;
  purgeExpired(): Promise<void>;
  findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null>;
  reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation>;
  put(record: ManagedMediaStoredRecord): Promise<void>;
  get(jobId: string): Promise<ManagedMediaStoredRecord | null>;
}

export interface ManagedMediaPage {
  job_id: string;
  status: ManagedMediaStatus;
  cursor: number;
  next_cursor: number | null;
  segments: MediaTranscriptSegment[];
}

export interface ManagedNativeTranscriptProvider {
  quoteNative(): Promise<SupadataNativeCreditQuote>;
  getNativeTranscript(
    url: string,
    languageHint: MediaLanguageHint
  ): Promise<SupadataNativeTranscriptResult>;
}

export interface ManagedMediaServiceOptions {
  store?: ManagedMediaJobStore;
  jobTtlSeconds?: number;
}

function cloneRecord(record: ManagedMediaStoredRecord): ManagedMediaStoredRecord {
  return {
    job: {
      ...record.job,
      available_languages: [...record.job.available_languages],
      error: record.job.error ? { ...record.job.error } : null
    },
    requestKey: record.requestKey,
    accessCodeDigest: record.accessCodeDigest,
    segments: record.segments.map((segment) => ({ ...segment })),
    expiresAt: record.expiresAt
  };
}

class ManagedMediaMemoryStore implements ManagedMediaJobStore {
  readonly durable = false;
  readonly kind = "memory" as const;
  private readonly byJobId = new Map<string, ManagedMediaStoredRecord>();
  private readonly byRequestKey = new Map<string, string>();

  async ready(): Promise<void> {}

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    for (const [jobId, record] of this.byJobId.entries()) {
      if (Date.parse(record.expiresAt) > now) continue;
      this.byJobId.delete(jobId);
      if (this.byRequestKey.get(record.requestKey) === jobId) {
        this.byRequestKey.delete(record.requestKey);
      }
    }
  }

  async findByRequestKey(
    requestKey: string
  ): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    const jobId = this.byRequestKey.get(requestKey);
    if (!jobId) return null;
    const record = this.byJobId.get(jobId);
    return record ? cloneRecord(record) : null;
  }

  async reserve(
    record: ManagedMediaStoredRecord
  ): Promise<ManagedMediaStoreReservation> {
    await this.purgeExpired();
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    const cloned = cloneRecord(record);
    this.byJobId.set(record.job.job_id, cloned);
    this.byRequestKey.set(record.requestKey, record.job.job_id);
    return { created: true, record: cloneRecord(cloned) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    const cloned = cloneRecord(record);
    this.byJobId.set(record.job.job_id, cloned);
    this.byRequestKey.set(record.requestKey, record.job.job_id);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    const record = this.byJobId.get(jobId);
    return record ? cloneRecord(record) : null;
  }
}

export function managedMediaAccessDigest(accessCode: string): string {
  return createHash("sha256").update(accessCode, "utf8").digest("hex");
}

export function managedMediaRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `supadata|native|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}

function parseLanguageHint(value: unknown): MediaLanguageHint | null {
  const normalized = value === undefined ? "auto" : String(value);
  return ["auto", "uk", "ru", "en"].includes(normalized)
    ? normalized as MediaLanguageHint
    : null;
}

function parseCommonInput(value: unknown): ManagedMediaPreflightInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) return null;
  if (
    typeof input.beta_access_code !== "string" ||
    input.beta_access_code.length < 12 ||
    input.beta_access_code.length > 128
  ) {
    return null;
  }
  const languageHint = parseLanguageHint(input.language_hint);
  if (!languageHint) return null;
  try {
    return {
      url: normalizeManagedMediaUrl(input.url.trim()),
      language_hint: languageHint,
      beta_access_code: input.beta_access_code
    };
  } catch {
    return null;
  }
}

export function parseManagedMediaPreflightInput(
  value: unknown
): ManagedMediaPreflightInput | null {
  return parseCommonInput(value);
}

export function parseManagedMediaNativeInput(
  value: unknown
): ManagedMediaNativeInput | null {
  const common = parseCommonInput(value);
  if (!common || !value || typeof value !== "object") return null;
  const consent = (value as Record<string, unknown>).credit_consent;
  if (!consent || typeof consent !== "object") return null;
  const record = consent as Record<string, unknown>;
  if (
    record.provider !== "supadata" ||
    record.mode !== "native" ||
    typeof record.max_credits !== "number" ||
    !Number.isInteger(record.max_credits) ||
    record.max_credits < 1 ||
    record.max_credits > 1
  ) {
    return null;
  }
  return {
    ...common,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  };
}

export class ManagedMediaService {
  readonly configured: boolean;
  readonly provider = "supadata" as const;
  readonly nativeCreditCost = 1 as const;
  readonly requiresExplicitConsent = true as const;
  readonly automaticAiFallback = false as const;
  readonly durableStore: boolean;
  readonly storeKind: "memory" | "postgres";
  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;
  private readonly store: ManagedMediaJobStore;
  private readonly jobTtlSeconds: number;
  private readonly inFlight = new Set<string>();
  private storeReady: Promise<void> | null = null;

  constructor(
    private readonly betaGate: MediaBetaGate,
    supadataApiKey: string | null,
    provider?: ManagedNativeTranscriptProvider,
    options: ManagedMediaServiceOptions = {}
  ) {
    this.transcriptProvider = provider ||
      (supadataApiKey ? new SupadataProvider(supadataApiKey) : null);
    this.store = options.store || new ManagedMediaMemoryStore();
    this.jobTtlSeconds = options.jobTtlSeconds ?? 3600;
    this.durableStore = this.store.durable;
    this.storeKind = this.store.kind;
    this.configured = betaGate.configured && this.transcriptProvider !== null;
  }

  private authorize(accessCode: string): void {
    if (!this.betaGate.authorize(accessCode)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The closed media beta access code is invalid.",
        403,
        false
      );
    }
    if (!this.transcriptProvider) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_NOT_CONFIGURED",
        "The managed transcript provider is not configured.",
        503,
        true
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

  private expiryFrom(updatedAt: string): string {
    return new Date(
      Date.parse(updatedAt) + this.jobTtlSeconds * 1000
    ).toISOString();
  }

  private async interruptedRecord(
    record: ManagedMediaStoredRecord
  ): Promise<ManagedMediaStoredRecord> {
    const updatedAt = new Date().toISOString();
    const interrupted: ManagedMediaStoredRecord = {
      ...record,
      job: {
        ...record.job,
        status: "FAILED",
        updated_at: updatedAt,
        credit_charge_uncertain: true,
        error: {
          code: "MANAGED_PROVIDER_RESULT_UNCERTAIN_RETRY_BLOCKED",
          message: "The managed provider request was interrupted by a backend restart. Credit charge outcome is uncertain, so automatic replay is blocked to prevent duplicate credit spend.",
          retryable: false
        }
      },
      expiresAt: this.expiryFrom(updatedAt)
    };
    await this.store.put(interrupted);
    return interrupted;
  }

  private async reusableRecord(
    requestKey: string
  ): Promise<ManagedMediaStoredRecord | null> {
    const existing = await this.store.findByRequestKey(requestKey);
    if (!existing) return null;
    if (existing.job.status !== "PROCESSING") return existing;
    if (this.inFlight.has(requestKey)) return existing;
    return this.interruptedRecord(existing);
  }

  async preflight(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaCreditPreflight> {
    this.authorize(input.beta_access_code);
    const quote = await this.transcriptProvider!.quoteNative();
    return {
      source_url: normalizeManagedMediaUrl(input.url),
      language_hint: input.language_hint,
      provider: "supadata",
      mode: "native",
      plan: quote.plan,
      credits_available: quote.remaining_credits,
      estimated_credits: 1,
      credits_after_estimate: quote.remaining_after_estimate,
      can_continue: quote.can_continue,
      consent_required: true,
      consent_options: {
        approve: 1,
        reject: 2
      }
    };
  }

  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    const requestKey = managedMediaRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    const existing = await this.reusableRecord(requestKey);
    if (existing) return this.publicJob(existing.job, true);

    const quote = await this.transcriptProvider!.quoteNative();
    if (!quote.can_continue) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_CREDITS_EXHAUSTED",
        "The managed transcript provider has no credit available for the approved native request.",
        429,
        false
      );
    }
    if (input.credit_consent.max_credits < quote.estimated_credits) {
      throw new MediaTranscriptError(
        "MEDIA_CREDIT_CONSENT_REQUIRED",
        "Explicit credit consent is required before managed transcript processing.",
        409,
        false
      );
    }

    const now = new Date().toISOString();
    const job: ManagedMediaJobView = {
      job_id: `KRCM_${randomUUID()}`,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "supadata",
      provider_mode: "native",
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: quote.remaining_credits,
      credit_charge_uncertain: true,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: true,
      error: null
    };
    const record: ManagedMediaStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiryFrom(now)
    };
    const reservation = await this.store.reserve(record);
    if (!reservation.created) {
      const resolved = reservation.record.job.status === "PROCESSING" &&
        !this.inFlight.has(requestKey)
        ? await this.interruptedRecord(reservation.record)
        : reservation.record;
      return this.publicJob(resolved.job, true);
    }

    this.inFlight.add(requestKey);
    try {
      const result = await this.transcriptProvider!.getNativeTranscript(
        sourceUrl,
        input.language_hint
      );
      const updatedAt = new Date().toISOString();
      const updated: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: result.status === "unavailable"
            ? "AWAITING_AI_CONSENT"
            : "COMPLETED",
          updated_at: updatedAt,
          detected_language: result.status === "completed" ? result.language : null,
          available_languages: result.status === "completed"
            ? [...result.available_languages]
            : [],
          credits_charged: result.billable_credits,
          credits_remaining_estimate: Math.max(
            0,
            quote.remaining_credits - result.billable_credits
          ),
          credit_charge_uncertain: false,
          segment_count: result.status === "completed" ? result.segments.length : 0,
          transcript_characters: result.status === "completed"
            ? result.transcript_text.length
            : 0,
          error: null
        },
        segments: result.status === "completed"
          ? result.segments.map((segment) => ({ ...segment }))
          : [],
        expiresAt: this.expiryFrom(updatedAt)
      };
      await this.store.put(updated);
      return this.publicJob(updated.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MANAGED_PROVIDER_TRANSCRIPT_FAILED",
          "Managed transcript processing failed.",
          500,
          true
        );
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "FAILED",
          updated_at: updatedAt,
          credit_charge_uncertain: true,
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: false
          }
        },
        expiresAt: this.expiryFrom(updatedAt)
      };
      await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

  async get(jobId: string): Promise<ManagedMediaJobView | null> {
    await this.ensureStore();
    const record = await this.store.get(jobId);
    if (!record) return null;
    if (record.job.status === "PROCESSING" && !this.inFlight.has(record.requestKey)) {
      const interrupted = await this.interruptedRecord(record);
      return this.publicJob(interrupted.job, false);
    }
    return this.publicJob(record.job, false);
  }

  async page(
    jobId: string,
    cursor: number,
    limit: number
  ): Promise<ManagedMediaPage | null> {
    await this.ensureStore();
    let record = await this.store.get(jobId);
    if (!record) return null;
    if (record.job.status === "PROCESSING" && !this.inFlight.has(record.requestKey)) {
      record = await this.interruptedRecord(record);
    }
    const safeCursor = Math.max(0, Math.floor(cursor));
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const segments = record.job.status === "COMPLETED"
      ? record.segments.slice(safeCursor, safeCursor + safeLimit)
      : [];
    const next = safeCursor + segments.length;
    return {
      job_id: record.job.job_id,
      status: record.job.status,
      cursor: safeCursor,
      next_cursor: next < record.segments.length ? next : null,
      segments: segments.map((segment) => ({ ...segment }))
    };
  }

  private publicJob(job: ManagedMediaJobView, reused: boolean): ManagedMediaJobView {
    return {
      ...job,
      reused,
      available_languages: [...job.available_languages],
      error: job.error ? { ...job.error } : null
    };
  }
}
