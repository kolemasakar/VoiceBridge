import { randomUUID } from "node:crypto";
import { MediaBetaGate } from "./media_beta.js";
import {
  MediaTranscriptError,
  normalizeMediaUrl,
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
  segment_count: number;
  transcript_characters: number;
  ai_fallback_requires_new_consent: boolean;
  error: null | {
    code: string;
    message: string;
    retryable: boolean;
  };
}

interface ManagedMediaJob extends ManagedMediaJobView {
  segments: MediaTranscriptSegment[];
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
      url: normalizeMediaUrl(input.url.trim()),
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
  private readonly jobs = new Map<string, ManagedMediaJob>();
  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;

  constructor(
    private readonly betaGate: MediaBetaGate,
    supadataApiKey: string | null,
    provider?: ManagedNativeTranscriptProvider
  ) {
    this.transcriptProvider = provider ||
      (supadataApiKey ? new SupadataProvider(supadataApiKey) : null);
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

  async preflight(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaCreditPreflight> {
    this.authorize(input.beta_access_code);
    const quote = await this.transcriptProvider!.quoteNative();
    return {
      source_url: normalizeMediaUrl(input.url),
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
    const job: ManagedMediaJob = {
      job_id: `KRCM_${randomUUID()}`,
      status: "FAILED",
      created_at: now,
      updated_at: now,
      source_url: normalizeMediaUrl(input.url),
      language_hint: input.language_hint,
      provider: "supadata",
      provider_mode: "native",
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: quote.remaining_credits,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: true,
      error: null,
      segments: []
    };
    this.jobs.set(job.job_id, job);

    try {
      const result = await this.transcriptProvider!.getNativeTranscript(
        job.source_url,
        job.language_hint
      );
      job.credits_charged = result.billable_credits;
      job.credits_remaining_estimate = Math.max(
        0,
        quote.remaining_credits - result.billable_credits
      );
      if (result.status === "unavailable") {
        job.status = "AWAITING_AI_CONSENT";
        job.updated_at = new Date().toISOString();
        return this.publicJob(job);
      }

      job.status = "COMPLETED";
      job.detected_language = result.language;
      job.available_languages = [...result.available_languages];
      job.segments = result.segments.map((segment) => ({ ...segment }));
      job.segment_count = result.segments.length;
      job.transcript_characters = result.transcript_text.length;
      job.updated_at = new Date().toISOString();
      return this.publicJob(job);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MANAGED_PROVIDER_TRANSCRIPT_FAILED",
          "Managed transcript processing failed.",
          500,
          true
        );
      job.status = "FAILED";
      job.error = {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable
      };
      job.updated_at = new Date().toISOString();
      return this.publicJob(job);
    }
  }

  get(jobId: string): ManagedMediaJobView | null {
    const job = this.jobs.get(jobId);
    return job ? this.publicJob(job) : null;
  }

  page(jobId: string, cursor: number, limit: number): ManagedMediaPage | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const safeCursor = Math.max(0, Math.floor(cursor));
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const segments = job.status === "COMPLETED"
      ? job.segments.slice(safeCursor, safeCursor + safeLimit)
      : [];
    const next = safeCursor + segments.length;
    return {
      job_id: job.job_id,
      status: job.status,
      cursor: safeCursor,
      next_cursor: next < job.segments.length ? next : null,
      segments: segments.map((segment) => ({ ...segment }))
    };
  }

  private publicJob(job: ManagedMediaJob): ManagedMediaJobView {
    return {
      job_id: job.job_id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      source_url: job.source_url,
      language_hint: job.language_hint,
      provider: job.provider,
      provider_mode: job.provider_mode,
      detected_language: job.detected_language,
      available_languages: [...job.available_languages],
      credits_charged: job.credits_charged,
      credits_remaining_estimate: job.credits_remaining_estimate,
      segment_count: job.segment_count,
      transcript_characters: job.transcript_characters,
      ai_fallback_requires_new_consent: job.ai_fallback_requires_new_consent,
      error: job.error ? { ...job.error } : null
    };
  }
}
