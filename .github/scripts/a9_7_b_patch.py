from pathlib import Path

p = Path("src/cloud/src/managed_media_service.ts")
s = p.read_text(encoding="utf-8")


def once(old: str, new: str) -> None:
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f"anchor count {count}: {old[:100]!r}")
    s = s.replace(old, new, 1)


once(
    'import {\n  MediaTranscriptError,\n  type MediaLanguageHint,\n  type MediaTranscriptSegment\n} from "./media_transcript.js";\n',
    'import {\n  MediaTranscriptError,\n  type MediaLanguageHint,\n  type MediaTranscriptSegment\n} from "./media_transcript.js";\n'
    'import {\n  FacebookMediaRetrievalError,\n  facebookRetrievalCreditPreflight,\n'
    '  parseFacebookRetrievalCreditConsent,\n  type FacebookMediaAsset,\n'
    '  type FacebookRetrievalCreditConsent,\n  type FacebookRetrievalCreditPreflight\n'
    '} from "./facebook_media_retrieval.js";\n'
    'import type { ManagedFacebookPipeline } from "./facebook_managed_pipeline.js";\n',
)

once(
    'export interface ManagedMediaFacebookMetadataInput {\n  beta_access_code: string;\n'
    '  credit_consent: {\n    provider: "supadata";\n    mode: "metadata";\n'
    '    max_credits: number;\n  };\n}\n',
    'export interface ManagedMediaFacebookMetadataInput {\n  beta_access_code: string;\n'
    '  credit_consent: {\n    provider: "supadata";\n    mode: "metadata";\n'
    '    max_credits: number;\n  };\n}\n\n'
    'export interface ManagedMediaFacebookFallbackConsentInput {\n'
    '  beta_access_code: string;\n  credit_consent: FacebookRetrievalCreditConsent;\n}\n\n'
    'export interface ManagedMediaFacebookFallbackPreflight\n'
    '  extends FacebookRetrievalCreditPreflight {\n  job_id: string;\n}\n',
)

once(
    'export type ManagedMediaStatus =\n  | "PROCESSING"\n  | "COMPLETED"\n'
    '  | "AWAITING_AI_CONSENT"\n  | "FAILED";\n',
    'export type ManagedMediaStatus =\n  | "PROCESSING"\n  | "COMPLETED"\n'
    '  | "AWAITING_AI_CONSENT"\n  | "AWAITING_RETRIEVAL_CONSENT"\n  | "FAILED";\n',
)

once(
    '  provider: "supadata";\n  provider_mode: "native" | "generate";\n'
    '  detected_language: string | null;\n',
    '  provider: "supadata" | "assemblyai";\n'
    '  provider_mode: "native" | "generate" | "facebook_retrieval_stt";\n'
    '  detected_language: string | null;\n',
)

once(
    '  metadata_credits_charged?: number;\n  error: null | {\n',
    '  metadata_credits_charged?: number;\n'
    '  retrieval_provider?: "cobalt" | "scrapecreators" | null;\n'
    '  retrieval_credits_charged?: number;\n  stt_seconds_charged?: number;\n'
    '  provider_data_deleted?: boolean | null;\n  language_confidence?: number | null;\n'
    '  error: null | {\n',
)

once(
    'export interface ManagedMediaServiceOptions {\n  store?: ManagedMediaJobStore;\n'
    '  jobTtlSeconds?: number;\n}\n',
    'export interface ManagedMediaServiceOptions {\n  store?: ManagedMediaJobStore;\n'
    '  jobTtlSeconds?: number;\n  facebookPipeline?: ManagedFacebookPipeline;\n}\n',
)

retry_anchor = '''function managedMediaRetryRequestKey(
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
'''
once(
    retry_anchor,
    retry_anchor + '''
export function managedFacebookFallbackRequestKey(
  normalizedUrl: string,
  languageHint: MediaLanguageHint,
  accessCode: string
): string {
  return createHash("sha256")
    .update(
      `facebook-retrieval-stt|${normalizedUrl}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,
      "utf8"
    )
    .digest("hex");
}
''',
)

once(
    'export function parseManagedMediaAiInput(value: unknown): ManagedMediaAiInput | null {\n',
    '''export function parseManagedMediaFacebookFallbackConsentInput(
  value: unknown
): ManagedMediaFacebookFallbackConsentInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (!validAccessCode(input.beta_access_code)) return null;
  const consent = parseFacebookRetrievalCreditConsent(input.credit_consent);
  if (!consent) return null;
  return { beta_access_code: input.beta_access_code, credit_consent: consent };
}

export function parseManagedMediaAiInput(value: unknown): ManagedMediaAiInput | null {
''',
)

once(
    '  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;\n'
    '  private readonly store: ManagedMediaJobStore;\n',
    '  private readonly transcriptProvider: ManagedNativeTranscriptProvider | null;\n'
    '  private readonly facebookPipeline: ManagedFacebookPipeline | null;\n'
    '  private readonly store: ManagedMediaJobStore;\n',
)

once(
    '    this.transcriptProvider = provider ||\n'
    '      (supadataApiKey ? new SupadataProvider(supadataApiKey) : null);\n'
    '    this.store = options.store || new ManagedMediaMemoryStore();\n',
    '    this.transcriptProvider = provider ||\n'
    '      (supadataApiKey ? new SupadataProvider(supadataApiKey) : null);\n'
    '    this.facebookPipeline = options.facebookPipeline ?? null;\n'
    '    this.store = options.store || new ManagedMediaMemoryStore();\n',
)

once(
    '    this.configured = betaGate.configured && this.transcriptProvider !== null;\n'
    '  }\n\n  private authorize(accessCode: string): void {\n'
    '    if (!this.betaGate.authorize(accessCode)) {\n      throw new MediaTranscriptError(\n'
    '        "MEDIA_BETA_ACCESS_DENIED",\n        "The closed media beta access code is invalid.",\n'
    '        403,\n        false\n      );\n    }\n    if (!this.transcriptProvider) {\n',
    '    this.configured = betaGate.configured && Boolean(\n'
    '      this.transcriptProvider !== null || this.facebookPipeline?.configured\n    );\n'
    '  }\n\n  private authorizeAccess(accessCode: string): void {\n'
    '    if (!this.betaGate.authorize(accessCode)) {\n      throw new MediaTranscriptError(\n'
    '        "MEDIA_BETA_ACCESS_DENIED",\n        "The closed media beta access code is invalid.",\n'
    '        403,\n        false\n      );\n    }\n  }\n\n'
    '  private authorize(accessCode: string): void {\n    this.authorizeAccess(accessCode);\n'
    '    if (!this.transcriptProvider) {\n',
)

once(
    '  private authorizeAiProvider(): void {\n',
    '''  private authorizeFacebookPipeline(accessCode: string): void {
    this.authorizeAccess(accessCode);
    if (!this.facebookPipeline?.configured) {
      throw new MediaTranscriptError(
        "FACEBOOK_MANAGED_PIPELINE_NOT_CONFIGURED",
        "The managed Facebook retrieval and STT fallback is not configured.",
        503,
        false
      );
    }
  }

  private authorizeAiProvider(): void {
''',
)

once(
    '  private async authorizedRecord(\n    jobId: string,\n    accessCode: string\n'
    '  ): Promise<ManagedMediaStoredRecord> {\n    this.authorize(accessCode);\n',
    '  private async authorizedRecord(\n    jobId: string,\n    accessCode: string\n'
    '  ): Promise<ManagedMediaStoredRecord> {\n    this.authorizeAccess(accessCode);\n',
)

methods = r'''
  async startFacebookFallback(
    input: ManagedMediaPreflightInput
  ): Promise<ManagedMediaJobView> {
    this.authorizeFacebookPipeline(input.beta_access_code);
    await this.ensureStore();
    const sourceUrl = normalizeManagedMediaUrl(input.url);
    if (managedMediaPlatform(sourceUrl) !== "facebook") {
      throw new MediaTranscriptError(
        "MEDIA_AI_SOURCE_NOT_SUPPORTED",
        "The managed Facebook fallback accepts only public Facebook media.",
        422,
        false
      );
    }
    const requestKey = managedFacebookFallbackRequestKey(
      sourceUrl,
      input.language_hint,
      input.beta_access_code
    );
    const existing = await this.reusableRecord(requestKey);
    if (existing) return this.publicJob(existing.job, true);

    const now = new Date().toISOString();
    const job: ManagedMediaJobView = {
      job_id: `KRCM_${randomUUID()}`,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: input.language_hint,
      provider: "assemblyai",
      provider_mode: "facebook_retrieval_stt",
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
      retrieval_provider: null,
      retrieval_credits_charged: 0,
      stt_seconds_charged: 0,
      provider_data_deleted: null,
      language_confidence: null,
      error: null
    };
    const record: ManagedMediaStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiryFrom(now, job)
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
      const asset = await this.facebookPipeline!.freeRetrieve(sourceUrl);
      if (!asset) {
        const updatedAt = new Date().toISOString();
        const waiting: ManagedMediaStoredRecord = {
          ...record,
          job: {
            ...job,
            status: "AWAITING_RETRIEVAL_CONSENT",
            updated_at: updatedAt,
            credit_charge_uncertain: false,
            error: null
          },
          expiresAt: this.expiryFrom(updatedAt, job)
        };
        await this.store.put(waiting);
        return this.publicJob(waiting.job, false);
      }
      return await this.completeFacebookFallback(record, asset, input.language_hint);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "FACEBOOK_MANAGED_PIPELINE_FAILED",
          "Managed Facebook fallback processing failed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "FAILED",
          updated_at: updatedAt,
          credit_charge_uncertain: false,
          error: { code: normalized.code, message: normalized.message, retryable: false }
        },
        expiresAt: this.expiryFrom(updatedAt, job)
      };
      await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

  async facebookFallbackPreflight(
    jobId: string,
    accessCode: string
  ): Promise<ManagedMediaFacebookFallbackPreflight> {
    const record = await this.authorizedRecord(jobId, accessCode);
    this.authorizeFacebookPipeline(accessCode);
    if (
      record.job.provider_mode !== "facebook_retrieval_stt" ||
      record.job.status !== "AWAITING_RETRIEVAL_CONSENT"
    ) {
      throw new MediaTranscriptError(
        "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE",
        "Paid Facebook retrieval consent applies only after the free retrieval attempt stops.",
        409,
        false
      );
    }
    return { job_id: record.job.job_id, ...facebookRetrievalCreditPreflight(record.job.source_url) };
  }

  async continueFacebookFallback(
    jobId: string,
    input: ManagedMediaFacebookFallbackConsentInput
  ): Promise<ManagedMediaJobView> {
    const record = await this.authorizedRecord(jobId, input.beta_access_code);
    this.authorizeFacebookPipeline(input.beta_access_code);
    if (record.job.provider_mode === "facebook_retrieval_stt" && record.job.status === "COMPLETED") {
      return this.publicJob(record.job, true);
    }
    if (
      record.job.provider_mode !== "facebook_retrieval_stt" ||
      record.job.status !== "AWAITING_RETRIEVAL_CONSENT"
    ) {
      throw new MediaTranscriptError(
        "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE",
        "The Facebook paid fallback can start only from the retrieval-consent state.",
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
        credit_charge_uncertain: true,
        error: null
      },
      expiresAt: this.expiryFrom(startedAt, record.job)
    };
    await this.store.put(processing);
    this.inFlight.add(record.requestKey);
    let asset: FacebookMediaAsset | null = null;
    try {
      asset = await this.facebookPipeline!.paidRetrieve(record.job.source_url, input.credit_consent);
      const retrievedAt = new Date().toISOString();
      const retrieved: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
          updated_at: retrievedAt,
          credits_charged: record.job.credits_charged + asset.credits_charged,
          credits_remaining_estimate: asset.credits_remaining ?? record.job.credits_remaining_estimate,
          credit_charge_uncertain: false,
          retrieval_provider: asset.provider,
          retrieval_credits_charged: (record.job.retrieval_credits_charged ?? 0) + asset.credits_charged,
          media_duration_seconds: asset.duration_seconds,
          error: null
        },
        expiresAt: this.expiryFrom(retrievedAt, processing.job)
      };
      await this.store.put(retrieved);
      return await this.completeFacebookFallback(retrieved, asset, record.job.language_hint);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "FACEBOOK_MANAGED_PIPELINE_FAILED",
          "Managed Facebook fallback processing failed.",
          500,
          false
        );
      const retrievalError = error instanceof FacebookMediaRetrievalError ? error : null;
      const knownCharge = asset ? asset.credits_charged : retrievalError?.creditsCharged ?? null;
      const knownRemaining = asset ? asset.credits_remaining : retrievalError?.creditsRemaining ?? null;
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...processing,
        job: {
          ...processing.job,
          status: "FAILED",
          updated_at: updatedAt,
          credits_charged: record.job.credits_charged + (knownCharge ?? 0),
          credits_remaining_estimate: knownRemaining ?? record.job.credits_remaining_estimate,
          credit_charge_uncertain: retrievalError ? knownCharge === null : false,
          retrieval_provider: asset?.provider ?? retrievalError?.provider ?? null,
          retrieval_credits_charged: (record.job.retrieval_credits_charged ?? 0) + (knownCharge ?? 0),
          media_duration_seconds: asset?.duration_seconds ?? null,
          error: { code: normalized.code, message: normalized.message, retryable: false }
        },
        expiresAt: this.expiryFrom(updatedAt, processing.job)
      };
      failed.expiresAt = this.expiryFrom(updatedAt, failed.job);
      await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(record.requestKey);
    }
  }

  private async completeFacebookFallback(
    record: ManagedMediaStoredRecord,
    asset: FacebookMediaAsset,
    languageHint: MediaLanguageHint
  ): Promise<ManagedMediaJobView> {
    const stt = await this.facebookPipeline!.transcribe(asset, languageHint, (seconds) => {
      const reservation = this.betaGate.reserveSttSeconds(seconds);
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          "MEDIA_BETA_STT_QUOTA_EXHAUSTED",
          "The closed MEDIA BETA daily STT quota is exhausted.",
          429,
          false
        );
      }
    });
    const updatedAt = new Date().toISOString();
    const updated: ManagedMediaStoredRecord = {
      ...record,
      job: {
        ...record.job,
        status: "COMPLETED",
        updated_at: updatedAt,
        provider: "assemblyai",
        provider_mode: "facebook_retrieval_stt",
        detected_language: stt.detected_language,
        available_languages: stt.detected_language ? [stt.detected_language] : [],
        credits_charged: Math.max(record.job.credits_charged, asset.credits_charged),
        credits_remaining_estimate: asset.credits_remaining ?? record.job.credits_remaining_estimate,
        credit_charge_uncertain: false,
        segment_count: stt.segments.length,
        transcript_characters: stt.transcript_text.length,
        media_duration_seconds: stt.duration_seconds,
        retrieval_provider: asset.provider,
        retrieval_credits_charged: Math.max(record.job.retrieval_credits_charged ?? 0, asset.credits_charged),
        stt_seconds_charged: Math.ceil(stt.duration_seconds),
        provider_data_deleted: stt.provider_data_deleted,
        language_confidence: stt.language_confidence,
        error: null
      },
      segments: stt.segments.map((segment) => ({ ...segment })),
      expiresAt: this.expiryFrom(updatedAt, record.job)
    };
    updated.expiresAt = this.expiryFrom(updatedAt, updated.job);
    await this.store.put(updated);
    return this.publicJob(updated.job, false);
  }

'''
once(
    '  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {\n',
    methods + '  async startNative(input: ManagedMediaNativeInput): Promise<ManagedMediaJobView> {\n',
)

p.write_text(s, encoding="utf-8")
