import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagedFacebookPipeline } from "../src/facebook_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import type { MediaTranscriptSegment } from "../src/media_transcript.js";
import {
  ManagedMediaService,
  managedMediaAccessDigest,
  parseManagedMediaNativeInput,
  type ManagedMediaAiInput,
  type ManagedMediaFacebookFallbackConsentInput,
  type ManagedMediaJobStore,
  type ManagedMediaJobView,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "state-continuation-owner-2026";

class FixtureStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  private readonly records = new Map<string, ManagedMediaStoredRecord>();

  add(record: ManagedMediaStoredRecord): void {
    this.records.set(record.job.job_id, structuredClone(record));
  }

  async ready(): Promise<void> {}

  async purgeExpired(): Promise<void> {
    const now = Date.now();
    for (const [jobId, record] of this.records.entries()) {
      if (Date.parse(record.expiresAt) <= now) this.records.delete(jobId);
    }
  }

  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    for (const record of this.records.values()) {
      if (record.requestKey === requestKey) return structuredClone(record);
    }
    return null;
  }

  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    this.add(record);
    return { created: true, record: structuredClone(record) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    this.add(record);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    await this.purgeExpired();
    const record = this.records.get(jobId);
    return record ? structuredClone(record) : null;
  }
}

class CountingProvider implements ManagedNativeTranscriptProvider {
  nativeCalls = 0;
  aiQuoteCalls = 0;
  aiCalls = 0;

  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "test",
      max_credits: 100,
      used_credits: 0,
      remaining_credits: 100,
      estimated_credits: 1 as const,
      remaining_after_estimate: 99,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getNativeTranscript() {
    this.nativeCalls += 1;
    return {
      status: "completed" as const,
      language: "en",
      available_languages: ["en"],
      segments: [{ index: 0, start_ms: 0, end_ms: 1000, text: "native", confidence: null }],
      transcript_text: "native",
      billable_credits: 1
    };
  }

  async quoteGenerateInstagramReel() {
    this.aiQuoteCalls += 1;
    return {
      provider: "supadata" as const,
      mode: "generate" as const,
      plan: "test",
      max_credits: 100,
      used_credits: 0,
      remaining_credits: 100,
      estimated_credits: 40,
      maximum_credits: 40,
      credits_per_minute: 2,
      maximum_duration_minutes: 20,
      remaining_after_estimate: 60,
      conservative_maximum: true as const,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getGeneratedTranscript() {
    this.aiCalls += 1;
    return {
      status: "completed" as const,
      language: "en",
      available_languages: ["en"],
      segments: [{ index: 0, start_ms: 0, end_ms: 1000, text: "ai", confidence: null }],
      transcript_text: "ai",
      billable_credits: 2
    };
  }
}

function facebookPipeline(counter: { paid: number; stt: number }): ManagedFacebookPipeline {
  return {
    configured: true,
    freeRetrieve: async () => null,
    paidRetrieve: async () => {
      counter.paid += 1;
      throw new Error("paid retrieval must remain unreachable");
    },
    transcribe: async () => {
      counter.stt += 1;
      throw new Error("Facebook STT must remain unreachable");
    }
  } as unknown as ManagedFacebookPipeline;
}

function fixtureRecord(
  jobId: string,
  status: ManagedMediaJobView["status"],
  sourceUrl: string,
  providerMode: ManagedMediaJobView["provider_mode"],
  segments: MediaTranscriptSegment[] = [],
  expiresAt = new Date(Date.now() + 60_000).toISOString()
): ManagedMediaStoredRecord {
  const now = new Date().toISOString();
  return {
    job: {
      job_id: jobId,
      status,
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: "auto",
      provider: providerMode === "native" || providerMode === "generate" ? "supadata" : "assemblyai",
      provider_mode: providerMode,
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 100,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: segments.length,
      transcript_characters: segments.reduce((sum, segment) => sum + segment.text.length, 0),
      ai_fallback_requires_new_consent: status === "AWAITING_AI_CONSENT",
      error: status === "FAILED"
        ? { code: "TEST_FAILED", message: "test failure", retryable: true }
        : null
    },
    requestKey: `request-${jobId}`,
    accessCodeDigest: managedMediaAccessDigest(ACCESS_CODE),
    segments: structuredClone(segments),
    expiresAt
  };
}

function code(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

test("state reads fail stale ids closed, reconcile orphan PROCESSING, and expose segments only for COMPLETED", async () => {
  const store = new FixtureStore();
  const provider = new CountingProvider();
  const service = new ManagedMediaService(new MediaBetaGate([ACCESS_CODE]), null, provider, { store });

  assert.equal(await service.get("KRCM_missing"), null);
  assert.equal(await service.page("KRCM_missing", 0, 20), null);

  const expired = fixtureRecord(
    "KRCM_expired",
    "COMPLETED",
    "https://youtu.be/expired",
    "native",
    [{ index: 0, start_ms: 0, end_ms: 1000, text: "expired", confidence: null }],
    new Date(Date.now() - 1000).toISOString()
  );
  store.add(expired);
  assert.equal(await service.get(expired.job.job_id), null);
  assert.equal(await service.page(expired.job.job_id, 0, 20), null);

  const processing = fixtureRecord(
    "KRCM_processing",
    "PROCESSING",
    "https://youtu.be/processing",
    "native"
  );
  store.add(processing);
  assert.equal((await service.get(processing.job.job_id))?.status, "FAILED");
  const processingPage = await service.page(processing.job.job_id, 0, 20);
  assert.equal(processingPage?.status, "FAILED");
  assert.deepEqual(processingPage?.segments, []);

  const completed = fixtureRecord(
    "KRCM_completed",
    "COMPLETED",
    "https://youtu.be/completed",
    "native",
    [{ index: 0, start_ms: 0, end_ms: 1000, text: "persisted", confidence: null }]
  );
  store.add(completed);
  const completedPage = await service.page(completed.job.job_id, 0, 20);
  assert.equal(completedPage?.status, "COMPLETED");
  assert.equal(completedPage?.segments[0]?.text, "persisted");

  const failed = fixtureRecord(
    "KRCM_failed",
    "FAILED",
    "https://youtu.be/failed",
    "native",
    [{ index: 0, start_ms: 0, end_ms: 1000, text: "must-not-leak", confidence: null }]
  );
  store.add(failed);
  const failedPage = await service.page(failed.job.job_id, 0, 20);
  assert.equal(failedPage?.status, "FAILED");
  assert.deepEqual(failedPage?.segments, []);

  assert.equal(provider.nativeCalls, 0);
  assert.equal(provider.aiQuoteCalls, 0);
  assert.equal(provider.aiCalls, 0);
});

test("AI continuation rejects foreign platform and wrong state before generated provider work", async () => {
  const store = new FixtureStore();
  const provider = new CountingProvider();
  const service = new ManagedMediaService(new MediaBetaGate([ACCESS_CODE]), null, provider, { store });
  const aiInput: ManagedMediaAiInput = {
    beta_access_code: ACCESS_CODE,
    credit_consent: { provider: "supadata", mode: "generate", max_credits: 40 }
  };

  const foreign = fixtureRecord(
    "KRCM_foreign_ai",
    "AWAITING_AI_CONSENT",
    "https://t.me/example/123",
    "native"
  );
  store.add(foreign);
  await assert.rejects(
    () => service.aiPreflight(foreign.job.job_id, ACCESS_CODE),
    (error: unknown) => code(error) === "MEDIA_AI_SOURCE_NOT_SUPPORTED"
  );
  await assert.rejects(
    () => service.startAi(foreign.job.job_id, aiInput),
    (error: unknown) => code(error) === "MEDIA_AI_SOURCE_NOT_SUPPORTED"
  );

  const wrongState = fixtureRecord(
    "KRCM_completed_ai",
    "COMPLETED",
    "https://www.instagram.com/reel/ABC123/",
    "native"
  );
  store.add(wrongState);
  await assert.rejects(
    () => service.aiPreflight(wrongState.job.job_id, ACCESS_CODE),
    (error: unknown) => code(error) === "MEDIA_AI_CONSENT_NOT_APPLICABLE"
  );
  await assert.rejects(
    () => service.startAi(wrongState.job.job_id, aiInput),
    (error: unknown) => code(error) === "MEDIA_AI_CONSENT_NOT_APPLICABLE"
  );

  assert.equal(provider.aiQuoteCalls, 0);
  assert.equal(provider.aiCalls, 0);
});

test("Facebook retrieval continuation rejects foreign-platform records and wrong states before paid retrieval", async () => {
  const store = new FixtureStore();
  const provider = new CountingProvider();
  const calls = { paid: 0, stt: 0 };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider,
    { store, facebookPipeline: facebookPipeline(calls) }
  );
  const consent: ManagedMediaFacebookFallbackConsentInput = {
    beta_access_code: ACCESS_CODE,
    credit_consent: { provider: "scrapecreators", mode: "facebook_post", max_credits: 1 }
  };

  const foreign = fixtureRecord(
    "KRCM_foreign_retrieval",
    "AWAITING_RETRIEVAL_CONSENT",
    "https://www.instagram.com/reel/FOREIGN/",
    "facebook_retrieval_stt"
  );
  store.add(foreign);
  await assert.rejects(
    () => service.facebookFallbackPreflight(foreign.job.job_id, ACCESS_CODE),
    (error: unknown) => code(error) === "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
  );
  await assert.rejects(
    () => service.continueFacebookFallback(foreign.job.job_id, consent),
    (error: unknown) => code(error) === "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
  );

  const failed = fixtureRecord(
    "KRCM_failed_retrieval",
    "FAILED",
    "https://www.facebook.com/reel/1234567890123456",
    "facebook_retrieval_stt"
  );
  store.add(failed);
  await assert.rejects(
    () => service.facebookFallbackPreflight(failed.job.job_id, ACCESS_CODE),
    (error: unknown) => code(error) === "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
  );
  await assert.rejects(
    () => service.continueFacebookFallback(failed.job.job_id, consent),
    (error: unknown) => code(error) === "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
  );

  const completed = fixtureRecord(
    "KRCM_completed_retrieval",
    "COMPLETED",
    "https://www.facebook.com/reel/2234567890123456",
    "facebook_retrieval_stt"
  );
  store.add(completed);
  const replay = await service.continueFacebookFallback(completed.job.job_id, consent);
  assert.equal(replay.status, "COMPLETED");
  assert.equal(replay.reused, true);

  assert.equal(calls.paid, 0);
  assert.equal(calls.stt, 0);
});

test("fresh native retry cannot use a FAILED record from a foreign provider mode", async () => {
  const store = new FixtureStore();
  const provider = new CountingProvider();
  const service = new ManagedMediaService(new MediaBetaGate([ACCESS_CODE]), null, provider, { store });
  const target = fixtureRecord(
    "KRCM_foreign-retry",
    "FAILED",
    "https://youtu.be/retry-guard",
    "telegram_public_retrieval_stt"
  );
  store.add(target);
  const input = parseManagedMediaNativeInput({
    url: target.job.source_url,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE,
    retry_failed_job_id: target.job.job_id,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(input);
  await assert.rejects(
    () => service.startNative(input),
    (error: unknown) => code(error) === "MEDIA_FAILED_RETRY_NOT_APPLICABLE"
  );
  assert.equal(provider.nativeCalls, 0);
});
