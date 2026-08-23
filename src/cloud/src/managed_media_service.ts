import { createHash, randomUUID } from "node:crypto";
import { MediaBetaGate } from "./media_beta.js";
import {
  isManagedInstagramReelUrl,
  managedMediaPlatform,
  normalizeManagedMediaUrl
} from "./managed_media_url.js";
import {
  MediaTranscriptError,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";
import {
  INSTAGRAM_REEL_GENERATE_MAX_CREDITS,
  SupadataProvider,
  type SupadataGenerateCreditQuote,
  type SupadataGeneratedTranscriptResult,
  type SupadataMetadataCreditQuote,
  type SupadataMetadataDurationResult,
  type SupadataNativeCreditQuote,
  type SupadataNativeTranscriptResult
} from "./supadata_provider.js";

export interface ManagedMediaPreflightInput {
  url: string;
  language_hint: MediaLanguageHint;
  beta_access_code: string;
}

export interface ManagedMediaNativeInput extends ManagedMediaPreflightInput {
  retry_failed_job_id?: string;
  credit_consent: {
    provider: "supadata";
    mode: "native";
    max_credits: number;
  };
}

export interface ManagedMediaAiInput {
  beta_access_code: string;
  credit_consent: {
    provider: "supadata";
    mode: "generate";
    max_credits: number;
  };
}

export interface ManagedMediaFacebookMetadataInput {
  beta_access_code: string;
  credit_consent: {
    provider: "supadata";
    mode: "metadata";
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

export interface ManagedMediaFacebookMetadataPreflight {
  job_id: string;
  source_url: string;
  provider: "supadata";
  mode: "metadata";
  purpose: "facebook_ai_duration";
  plan: string;
  credits_available: number;
  estimated_credits: 1;
  credits_after_estimate: number;
  can_continue: boolean;
  consent_required: true;
  consent_options: { approve: 1; reject: 2 };
}

export interface ManagedMediaAiCreditPreflight {
  job_id: string;
  source_url: string;
  provider: "supadata";
  mode: "generate";
  plan: string;
  credits_available: number;
  estimated_credits: number;
  maximum_credits: number;
  credits_per_minute: number;
  maximum_duration_minutes: number;
  credits_after_estimate: number;
  conservative_maximum: true;
  estimate_basis: "instagram_reel_ceiling" | "facebook_metadata_duration";
  media_duration_seconds: number | null;
  can_continue: boolean;
  consent_required: true;
  consent_options: {
    approve: 1;
    reject: 2;
  };
}

const PAID_JOB_MIN_RETENTION_SECONDS = 86400;
const MANAGED_MEDIA_JOB_ID = /^KRCM_[A-Za-z0-9-]+$/;

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
  provider_mode: "native" | "generate";
  detected_language: string | null;
  available_languages: string[];
  credits_charged: number;
  credits_remaining_estimate: number;
  credit_charge_uncertain: boolean;
  reused: boolean;
  segment_count: number;
  transcript_characters: number;
  ai_fallback_requires_new_consent: boolean;
  media_duration_seconds?: number | null;
  ai_credit_ceiling?: number | null;
  metadata_credits_charged?: number;
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
  quoteGenerateInstagramReel?(): Promise<SupadataGenerateCreditQuote>;
  quoteMetadata?(): Promise<SupadataMetadataCreditQuote>;
  getMetadataDuration?(url: string): Promise<SupadataMetadataDurationResult>;
  quoteGenerateForDuration?(durationSeconds: number): Promise<SupadataGenerateCreditQuote>;
  getGeneratedTranscript?(
    url: string,
    approvedMaxCredits?: number
  ): Promise<SupadataGeneratedTranscriptResult>;
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

function managedMediaRetryRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string,
  failedJobId: string
): string {
  return createHash("sha256")
    .update(
      `supadata|native-retry|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}|${failedJobId}`,
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

function validAccessCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}

function parseCommonInput(value: unknown): ManagedMediaPreflightInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) return null;
  if (!validAccessCode(input.beta_access_code)) return null;
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
    record.max_credits !== 1
  ) {
    return null;
  }
  const retryFailedJobId = (value as Record<string, unknown>).retry_failed_job_id;
  if (
    retryFailedJobId !== undefined &&
    (typeof retryFailedJobId !== "string" || !MANAGED_MEDIA_JOB_ID.test(retryFailedJobId))
  ) {
    return null;
  }
  return {
    ...common,
    ...(retryFailedJobId ? { retry_failed_job_id: retryFailedJobId } : {}),
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  };
}

export function parseManagedMediaFacebookMetadataInput(
  value: unknown
): ManagedMediaFacebookMetadataInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!validAccessCode(input.beta_access_code)) return null;
  const consent = input.credit_consent;
  if (!consent || typeof consent !== "object") return null;
  const record = consent as Record<string, unknown>;
  if (
    record.provider !== "supadata" ||
    record.mode !== "metadata" ||
    record.max_credits !== 1
  ) return null;
  return {
    beta_access_code: input.beta_access_code,
    credit_consent: { provider: "supadata", mode: "metadata", max_credits: 1 }
  };
}

export function parseManagedMediaAiInput(value: unknown): ManagedMediaAiInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!validAccessCode(input.beta_access_code)) return null;
  const consent = input.credit_consent;
  if (!consent || typeof consent !== "object") return null;
  const record = consent as Record<string, unknown>;
  if (
    record.provider !== "supadata" ||
    record.mode !== "generate" ||
    typeof record.max_credits !== "number" ||
    !Number.isInteger(record.max_credits) ||
    record.max_credits < 2 ||
    record.max_credits > 10000
  ) return null;
  return {
    beta_access_code: input.beta_access_code,
    credit_consent: {
      provider: "supadata",
      mode: "generate",
      max_credits: record.max_credits
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

  private authorizeAiProvider(): void {
    if (!this.transcriptProvider?.getGeneratedTranscript) {
      throw new MediaTranscriptError(
        "MANAGED_AI_PROVIDER_NOT_CONFIGURED",
        "The managed AI transcript provider is not configured.",
        503,
        false
      );
    }
  }

  private authorizeFacebookMetadataProvider(): void {
    if (
      !this.transcriptProvider?.quoteMetadata ||
      !this.transcriptProvider.getMetadataDuration ||
      !this.transcriptProvider.quoteGenerateForDuration
    ) {
      throw new MediaTranscriptError(
        "MANAGED_METADATA_PROVIDER_NOT_CONFIGURED",
        "The managed Facebook duration provider is not configured.",
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

  private expiryFrom(updatedAt: string, job?: ManagedMediaJobView): string {
    const paidOrUncertain = Boolean(
      job && (
        job.credit_charge_uncertain ||
        job.credits_charged > 0 ||
        (job.metadata_credits_charged ?? 0) > 0
      )
    );
    const retentionSeconds = paidOrUncertain
      ? Math.max(this.jobTtlSeconds, PAID_JOB_MIN_RETENTION_SECONDS)
      : this.jobTtlSeconds;
    return new Date(
      Date.parse(updatedAt) + retentionSeconds * 1000
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
    interrupted.expiresAt = this.expiryFrom(updatedAt, interrupted.job);
    interrupted.expiresAt = this.expiryFrom(updatedAt, interrupted.job);
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

  private async authorizedRecord(
    jobId: string,
    accessCode: string
  ): Promise<ManagedMediaStoredRecord> {
    this.authorize(accessCode);
    await this.ensureStore();
    const record = await this.store.get(jobId);
    if (!record) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_FOUND",
        "The managed media job was not found.",
        404,
        false
      );
    }
    if (record.accessCodeDigest !== managedMediaAccessDigest(accessCode)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The closed media beta access code does not authorize this job.",
        403,
        false
      );
    }
    return record;
  }

  private async reconcileAiFailureCharge(
    record: ManagedMediaStoredRecord,
    quote: SupadataGenerateCreditQuote
  ): Promise<{ billableCredits: number; remainingCredits: number; certain: boolean }> {
    try {
      const platform = managedMediaPlatform(record.job.source_url);
      let afterQuote: SupadataGenerateCreditQuote | null = null;
      if (isManagedInstagramReelUrl(record.job.source_url)) {
        if (!this.transcriptProvider?.quoteGenerateInstagramReel) {
          return { billableCredits: 0, remainingCredits: quote.remaining_credits, certain: false };
        }
        afterQuote = await this.transcriptProvider.quoteGenerateInstagramReel();
      } else if (
        platform === "facebook" &&
        (record.job.media_duration_seconds ?? null) !== null &&
        this.transcriptProvider?.quoteGenerateForDuration
      ) {
        afterQuote = await this.transcriptProvider.quoteGenerateForDuration(
          record.job.media_duration_seconds!
        );
      }
      if (!afterQuote) {
        return { billableCredits: 0, remainingCredits: quote.remaining_credits, certain: false };
      }
      return {
        billableCredits: Math.max(0, quote.remaining_credits - afterQuote.remaining_credits),
        remainingCredits: afterQuote.remaining_credits,
        certain: true
      };
    } catch {
      return { billableCredits: 0, remainingCredits: quote.remaining_credits, certain: false };
    }
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

  async lookup(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaJobView | null> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    const requestKey = managedMediaRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    const record = await this.store.findByRequestKey(requestKey);
    if (!record) return null;
    if (record.accessCodeDigest !== managedMediaAccessDigest(input.beta_access_code)) {
      return null;
    }
    return this.publicJob(record.job, true);
  }

  async facebookMetadataPreflight(
    jobId: string,
    accessCode: string
  ): Promise<ManagedMediaFacebookMetadataPreflight> {
    const record = await this.authorizedRecord(jobId, accessCode);
    this.authorizeFacebookMetadataProvider();
    if (record.job.status !== "AWAITING_AI_CONSENT") {
      throw new MediaTranscriptError(
        "MEDIA_AI_CONSENT_NOT_APPLICABLE",
        "Facebook AI duration preflight is allowed only after native transcript unavailability.",
        409,
        false
      );
    }
    if (managedMediaPlatform(record.job.source_url) !== "facebook") {
      throw new MediaTranscriptError(
        "MEDIA_AI_SOURCE_NOT_SUPPORTED",
        "Facebook duration preflight applies only to public Facebook media.",
        422,
        false
      );
    }
    if ((record.job.media_duration_seconds ?? null) !== null) {
      throw new MediaTranscriptError(
        "MEDIA_AI_ESTIMATE_ALREADY_AVAILABLE",
        "Facebook media duration has already been obtained for this job.",
        409,
        false
      );
    }
    const quote = await this.transcriptProvider!.quoteMetadata!();
    return {
      job_id: record.job.job_id,
      source_url: record.job.source_url,
      provider: "supadata",
      mode: "metadata",
      purpose: "facebook_ai_duration",
      plan: quote.plan,
      credits_available: quote.remaining_credits,
      estimated_credits: 1,
      credits_after_estimate: quote.remaining_after_estimate,
      can_continue: quote.can_continue,
      consent_required: true,
      consent_options: { approve: 1, reject: 2 }
    };
  }

  async startFacebookMetadata(
    jobId: string,
    input: ManagedMediaFacebookMetadataInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeFacebookMetadataProvider();
    if ((record.job.media_duration_seconds ?? null) !== null) {
      return this.publicJob(record.job, true);
    }
    if (
      record.job.status !== "AWAITING_AI_CONSENT" ||
      managedMediaPlatform(record.job.source_url) !== "facebook"
    ) {
      throw new MediaTranscriptError(
        "MEDIA_AI_ESTIMATE_NOT_APPLICABLE",
        "Facebook duration lookup is allowed only for a Facebook job awaiting AI consent.",
        409,
        false
      );
    }
    const quote = await this.transcriptProvider!.quoteMetadata!();
    if (!quote.can_continue) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_CREDITS_EXHAUSTED",
        "No provider credit is available for the approved Facebook metadata request.",
        429,
        false
      );
    }
    const startedAt = new Date().toISOString();
    const processing: ManagedMediaStoredRecord = {
      ...record,
      job: {
        ...record.job,
        status: "PROCESSING",
        updated_at: startedAt,
        credit_charge_uncertain: true,
        error: null
      },
      expiresAt: this.expiryFrom(startedAt)
    };
    processing.expiresAt = this.expiryFrom(processing.job.updated_at, processing.job);
    processing.expiresAt = this.expiryFrom(processing.job.updated_at, processing.job);
    await this.store.put(processing);
    this.inFlight.add(record.requestKey);
    try {
      const metadata = await this.transcriptProvider!.getMetadataDuration!(
        record.job.source_url
      );
      const aiQuote = await this.transcriptProvider!.quoteGenerateForDuration!(
        metadata.duration_seconds
      );
      const updatedAt = new Date().toISOString();
      const updated: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
          status: "AWAITING_AI_CONSENT",
          updated_at: updatedAt,
          credits_charged: record.job.credits_charged + metadata.billable_credits,
          credits_remaining_estimate: Math.max(
            0,
            quote.remaining_credits - metadata.billable_credits
          ),
          credit_charge_uncertain: false,
          media_duration_seconds: metadata.duration_seconds,
          ai_credit_ceiling: aiQuote.maximum_credits,
          metadata_credits_charged:
            (record.job.metadata_credits_charged ?? 0) + metadata.billable_credits,
          error: null
        },
        expiresAt: this.expiryFrom(updatedAt)
      };
      updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
    updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
    await this.store.put(updated);
      return this.publicJob(updated.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MANAGED_PROVIDER_METADATA_FAILED",
          "Managed Facebook metadata processing failed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
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
      failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(record.requestKey);
    }
  }

  async aiPreflight(
    jobId: string,
    accessCode: string
  ): Promise<ManagedMediaAiCreditPreflight> {
    const record = await this.authorizedRecord(jobId, accessCode);
    this.authorizeAiProvider();
    if (record.job.status !== "AWAITING_AI_CONSENT") {
      throw new MediaTranscriptError(
        "MEDIA_AI_CONSENT_NOT_APPLICABLE",
        "AI transcript preflight is allowed only after the native path stops awaiting separate AI consent.",
        409,
        false
      );
    }
    const platform = managedMediaPlatform(record.job.source_url);
    let quote: SupadataGenerateCreditQuote;
    let estimateBasis: ManagedMediaAiCreditPreflight["estimate_basis"];
    let mediaDurationSeconds: number | null = null;
    if (isManagedInstagramReelUrl(record.job.source_url)) {
      if (!this.transcriptProvider!.quoteGenerateInstagramReel) {
        throw new MediaTranscriptError(
          "MANAGED_AI_PROVIDER_NOT_CONFIGURED",
          "Instagram AI quoting is not configured.",
          503,
          false
        );
      }
      quote = await this.transcriptProvider!.quoteGenerateInstagramReel();
      estimateBasis = "instagram_reel_ceiling";
    } else if (platform === "facebook") {
      if (
        (record.job.media_duration_seconds ?? null) === null ||
        (record.job.ai_credit_ceiling ?? null) === null
      ) {
        throw new MediaTranscriptError(
          "MEDIA_AI_ESTIMATE_REQUIRED",
          "Facebook AI requires a consent-gated metadata duration lookup first.",
          409,
          false
        );
      }
      if (!this.transcriptProvider!.quoteGenerateForDuration) {
        throw new MediaTranscriptError(
          "MANAGED_AI_PROVIDER_NOT_CONFIGURED",
          "Facebook AI quoting is not configured.",
          503,
          false
        );
      }
      quote = await this.transcriptProvider!.quoteGenerateForDuration(
        record.job.media_duration_seconds!
      );
      mediaDurationSeconds = record.job.media_duration_seconds!;
      estimateBasis = "facebook_metadata_duration";
    } else {
      throw new MediaTranscriptError(
        "MEDIA_AI_SOURCE_NOT_SUPPORTED",
        "AI fallback is not enabled for this media source.",
        422,
        false
      );
    }
    return {
      job_id: record.job.job_id,
      source_url: record.job.source_url,
      provider: "supadata",
      mode: "generate",
      plan: quote.plan,
      credits_available: quote.remaining_credits,
      estimated_credits: quote.estimated_credits,
      maximum_credits: quote.maximum_credits,
      credits_per_minute: quote.credits_per_minute,
      maximum_duration_minutes: quote.maximum_duration_minutes,
      credits_after_estimate: quote.remaining_after_estimate,
      conservative_maximum: true,
      estimate_basis: estimateBasis,
      media_duration_seconds: mediaDurationSeconds,
      can_continue: quote.can_continue,
      consent_required: true,
      consent_options: { approve: 1, reject: 2 }
    };
  }

  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {
    this.authorize(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    const baseRequestKey = managedMediaRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    let requestKey = baseRequestKey;
    if (input.retry_failed_job_id) {
      const retryTarget = await this.authorizedRecord(
        input.retry_failed_job_id,
        input.beta_access_code
      );
      if (
        retryTarget.job.status !== "FAILED" ||
        retryTarget.job.source_url !== sourceUrl ||
        retryTarget.job.language_hint !== input.language_hint
      ) {
        throw new MediaTranscriptError(
          "MEDIA_FAILED_RETRY_NOT_APPLICABLE",
          "A fresh native retry requires the exact failed job for the same source and language.",
          409,
          false
        );
      }
      requestKey = managedMediaRetryRequestKey(
        sourceUrl,
        input.language_hint,
        input.beta_access_code,
        retryTarget.job.job_id
      );
    }
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
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      error: null
    };
    const record: ManagedMediaStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiryFrom(now)
    };
    record.expiresAt = this.expiryFrom(job.updated_at, job);
    record.expiresAt = this.expiryFrom(job.updated_at, job);
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
      updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
    updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
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
      failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

  async startAi(
    jobId: string,
    input: ManagedMediaAiInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeAiProvider();

    if (record.job.provider_mode === "generate") {
      return this.publicJob(record.job, true);
    }
    if (record.job.status !== "AWAITING_AI_CONSENT") {
      throw new MediaTranscriptError(
        "MEDIA_AI_CONSENT_NOT_APPLICABLE",
        "AI transcript processing is allowed only after a native transcript-unavailable stop.",
        409,
        false
      );
    }

    const platform = managedMediaPlatform(record.job.source_url);
    let quote: SupadataGenerateCreditQuote;
    if (isManagedInstagramReelUrl(record.job.source_url)) {
      if (!this.transcriptProvider!.quoteGenerateInstagramReel) {
        throw new MediaTranscriptError(
          "MANAGED_AI_PROVIDER_NOT_CONFIGURED",
          "Instagram AI quoting is not configured.",
          503,
          false
        );
      }
      quote = await this.transcriptProvider!.quoteGenerateInstagramReel();
    } else if (platform === "facebook") {
      if ((record.job.media_duration_seconds ?? null) === null) {
        throw new MediaTranscriptError(
          "MEDIA_AI_ESTIMATE_REQUIRED",
          "Facebook AI requires an approved metadata duration lookup before generation.",
          409,
          false
        );
      }
      if (!this.transcriptProvider!.quoteGenerateForDuration) {
        throw new MediaTranscriptError(
          "MANAGED_AI_PROVIDER_NOT_CONFIGURED",
          "Facebook AI quoting is not configured.",
          503,
          false
        );
      }
      quote = await this.transcriptProvider!.quoteGenerateForDuration(
        record.job.media_duration_seconds!
      );
    } else {
      throw new MediaTranscriptError(
        "MEDIA_AI_SOURCE_NOT_SUPPORTED",
        "AI fallback is not enabled for this media source.",
        422,
        false
      );
    }
    if (!quote.can_continue) {
      throw new MediaTranscriptError(
        "MANAGED_PROVIDER_CREDITS_EXHAUSTED",
        "The managed provider balance is below the approved AI credit ceiling.",
        429,
        false
      );
    }
    if (input.credit_consent.max_credits !== quote.maximum_credits) {
      throw new MediaTranscriptError(
        "MEDIA_AI_CREDIT_CONSENT_REQUIRED",
        "A separate explicit AI credit consent matching the current maximum is required.",
        409,
        false
      );
    }

    const startedAt = new Date().toISOString();
    const processing: ManagedMediaStoredRecord = {
      ...record,
      job: {
        ...record.job,
        status: "PROCESSING",
        updated_at: startedAt,
        provider_mode: "generate",
        credit_charge_uncertain: true,
        ai_fallback_requires_new_consent: false,
        error: null
      },
      expiresAt: this.expiryFrom(startedAt)
    };
    processing.expiresAt = this.expiryFrom(processing.job.updated_at, processing.job);
    processing.expiresAt = this.expiryFrom(processing.job.updated_at, processing.job);
    await this.store.put(processing);
    this.inFlight.add(record.requestKey);
    try {
      const result = await this.transcriptProvider!.getGeneratedTranscript!(
        record.job.source_url,
        quote.maximum_credits
      );
      const updatedAt = new Date().toISOString();
      const updated: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
          status: "COMPLETED",
          updated_at: updatedAt,
          detected_language: result.language,
          available_languages: [...result.available_languages],
          credits_charged: record.job.credits_charged + result.billable_credits,
          credits_remaining_estimate: Math.max(
            0,
            quote.remaining_credits - result.billable_credits
          ),
          credit_charge_uncertain: false,
          segment_count: result.segments.length,
          transcript_characters: result.transcript_text.length,
          error: null
        },
        segments: result.segments.map((segment) => ({ ...segment })),
        expiresAt: this.expiryFrom(updatedAt)
      };
      updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
    updated.expiresAt = this.expiryFrom(updated.job.updated_at, updated.job);
    await this.store.put(updated);
      return this.publicJob(updated.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MANAGED_PROVIDER_AI_TRANSCRIPT_FAILED",
          "Managed AI transcript processing failed.",
          500,
          false
        );
      const reconciliation = await this.reconcileAiFailureCharge(record, quote);
      const capBreached = reconciliation.billableCredits > input.credit_consent.max_credits;
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
          status: "FAILED",
          updated_at: updatedAt,
          credits_charged: record.job.credits_charged + reconciliation.billableCredits,
          credits_remaining_estimate: reconciliation.remainingCredits,
          credit_charge_uncertain: !reconciliation.certain,
          error: {
            code: capBreached ? "MANAGED_PROVIDER_AI_CREDIT_CAP_BREACH" : normalized.code,
            message: capBreached
              ? "The provider balance moved by more credits than the user-approved AI maximum."
              : normalized.message,
            retryable: false
          }
        },
        expiresAt: this.expiryFrom(updatedAt)
      };
      failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    failed.expiresAt = this.expiryFrom(failed.job.updated_at, failed.job);
    await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(record.requestKey);
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
