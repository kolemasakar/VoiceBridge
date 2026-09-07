import assert from "node:assert/strict";
import { test } from "node:test";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import type { ManagedFacebookPipeline } from "../src/facebook_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedMediaAccessDigest,
  parseManagedMediaAiInput,
  parseManagedMediaFacebookFallbackConsentInput,
  parseManagedMediaFacebookMetadataInput,
  parseManagedMediaNativeInput,
  type ManagedMediaJobStore,
  type ManagedMediaJobView,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedMediaSttReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "consent-credit-owner-2026";

class FixtureStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  protected readonly records = new Map<string, ManagedMediaStoredRecord>();

  add(record: ManagedMediaStoredRecord): void {
    this.records.set(record.job.job_id, structuredClone(record));
  }

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}

  async findByRequestKey(key: string): Promise<ManagedMediaStoredRecord | null> {
    for (const record of this.records.values()) {
      if (record.requestKey === key) return structuredClone(record);
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
    const record = this.records.get(jobId);
    return record ? structuredClone(record) : null;
  }
}

class QuotaStore extends FixtureStore {
  quotaCalls = 0;

  constructor(private readonly reservation: ManagedMediaSttReservation) {
    super();
  }

  async reserveSttSeconds(): Promise<ManagedMediaSttReservation> {
    this.quotaCalls += 1;
    return { ...this.reservation };
  }
}

function fixtureRecord(
  id: string,
  sourceUrl: string,
  status: ManagedMediaJobView["status"],
  providerMode: ManagedMediaJobView["provider_mode"]
): ManagedMediaStoredRecord {
  const now = new Date().toISOString();
  return {
    job: {
      job_id: id,
      status,
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: "auto",
      provider: providerMode === "facebook_retrieval_stt" ? "assemblyai" : "supadata",
      provider_mode: providerMode,
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 100,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: status === "AWAITING_AI_CONSENT",
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      error: null
    },
    requestKey: managedMediaAccessDigest(`request-${id}`),
    accessCodeDigest: managedMediaAccessDigest(ACCESS_CODE),
    segments: [],
    expiresAt: new Date(Date.now() + 60_000).toISOString()
  };
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

test("consent parsers reject provider mode and credit-cap substitutions", () => {
  const nativeBase = {
    url: "https://youtu.be/consent",
    beta_access_code: ACCESS_CODE
  };
  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "native", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "native", max_credits: 0 },
    { provider: "supadata", mode: "native", max_credits: 2 },
    { provider: "supadata", mode: "native", max_credits: 1.5 }
  ]) {
    assert.equal(parseManagedMediaNativeInput({ ...nativeBase, credit_consent }), null);
  }

  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "metadata", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "metadata", max_credits: 2 }
  ]) {
    assert.equal(
      parseManagedMediaFacebookMetadataInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }

  for (const credit_consent of [
    undefined,
    { provider: "other", mode: "generate", max_credits: 40 },
    { provider: "supadata", mode: "native", max_credits: 40 },
    { provider: "supadata", mode: "generate", max_credits: 1 },
    { provider: "supadata", mode: "generate", max_credits: 2.5 },
    { provider: "supadata", mode: "generate", max_credits: 10001 }
  ]) {
    assert.equal(
      parseManagedMediaAiInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }

  for (const credit_consent of [
    undefined,
    { provider: "scrapecreators", mode: "facebook_post", max_credits: 2 },
    { provider: "other", mode: "facebook_post", max_credits: 1 }
  ]) {
    assert.equal(
      parseManagedMediaFacebookFallbackConsentInput({ beta_access_code: ACCESS_CODE, credit_consent }),
      null
    );
  }
});

test("service native consent guard stops forged typed input before quote or provider work", async () => {
  let quoteCalls = 0;
  let nativeCalls = 0;
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() {
      quoteCalls += 1;
      return {
        provider: "supadata",
        mode: "native",
        plan: "test",
        max_credits: 10,
        used_credits: 0,
        remaining_credits: 10,
        estimated_credits: 1,
        remaining_after_estimate: 9,
        consent_required: true,
        can_continue: true
      };
    },
    async getNativeTranscript() {
      nativeCalls += 1;
      return { status: "unavailable", billable_credits: 1 };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );
  await assert.rejects(
    () => service.startNative({
      url: "https://youtu.be/forged",
      language_hint: "auto",
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "native", max_credits: 2 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(quoteCalls, 0);
  assert.equal(nativeCalls, 0);
});

test("service metadata and AI consent guards stop forged input before provider work", async () => {
  const store = new FixtureStore();
  const counters = { metadataQuote: 0, metadataGet: 0, aiQuote: 0, aiGet: 0 };
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() { throw new Error("unused"); },
    async getNativeTranscript() { throw new Error("unused"); },
    async quoteMetadata() {
      counters.metadataQuote += 1;
      return {
        provider: "supadata", mode: "metadata", plan: "test",
        max_credits: 10, used_credits: 0, remaining_credits: 10,
        estimated_credits: 1, remaining_after_estimate: 9,
        consent_required: true, can_continue: true
      };
    },
    async getMetadataDuration() {
      counters.metadataGet += 1;
      return { duration_seconds: 60, billable_credits: 1 };
    },
    async quoteGenerateForDuration() {
      counters.aiQuote += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0, remaining_credits: 100,
        estimated_credits: 2, maximum_credits: 2, credits_per_minute: 2,
        maximum_duration_minutes: 20, remaining_after_estimate: 98,
        conservative_maximum: true, consent_required: true, can_continue: true
      };
    },
    async quoteGenerateInstagramReel() {
      counters.aiQuote += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0, remaining_credits: 100,
        estimated_credits: 40, maximum_credits: 40, credits_per_minute: 2,
        maximum_duration_minutes: 20, remaining_after_estimate: 60,
        conservative_maximum: true, consent_required: true, can_continue: true
      };
    },
    async getGeneratedTranscript() {
      counters.aiGet += 1;
      return {
        status: "completed", language: "en", available_languages: ["en"],
        segments: [], transcript_text: "x", billable_credits: 1
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]), null, provider, { store }
  );

  const metadataRecord = fixtureRecord(
    "KRCM_metadata-consent",
    "https://www.facebook.com/reel/1234567890123456",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(metadataRecord);
  await assert.rejects(
    () => service.startFacebookMetadata(metadataRecord.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "metadata", max_credits: 2 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_METADATA_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(counters.metadataQuote, 0);
  assert.equal(counters.metadataGet, 0);

  const aiRecord = fixtureRecord(
    "KRCM_ai-consent",
    "https://www.instagram.com/reel/AI123/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(aiRecord);
  await assert.rejects(
    () => service.startAi(aiRecord.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "other", mode: "generate", max_credits: 40 }
    } as never),
    (error: unknown) => errorCode(error) === "MEDIA_AI_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(counters.aiQuote, 0);
  assert.equal(counters.aiGet, 0);
});

test("stale AI maximum and exhausted balance stop before generated transcript work", async () => {
  const store = new FixtureStore();
  let quoteCalls = 0;
  let aiCalls = 0;
  let canContinue = true;
  const provider: ManagedNativeTranscriptProvider = {
    async quoteNative() { throw new Error("unused"); },
    async getNativeTranscript() { throw new Error("unused"); },
    async quoteGenerateInstagramReel() {
      quoteCalls += 1;
      return {
        provider: "supadata", mode: "generate", plan: "test",
        max_credits: 100, used_credits: 0,
        remaining_credits: canContinue ? 100 : 10,
        estimated_credits: 40, maximum_credits: 40, credits_per_minute: 2,
        maximum_duration_minutes: 20,
        remaining_after_estimate: canContinue ? 60 : 0,
        conservative_maximum: true, consent_required: true,
        can_continue: canContinue
      };
    },
    async getGeneratedTranscript() {
      aiCalls += 1;
      return {
        status: "completed", language: "en", available_languages: ["en"],
        segments: [], transcript_text: "x", billable_credits: 1
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]), null, provider, { store }
  );

  const stale = fixtureRecord(
    "KRCM_ai-stale",
    "https://www.instagram.com/reel/STALE1/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(stale);
  await assert.rejects(
    () => service.startAi(stale.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 39 }
    }),
    (error: unknown) => errorCode(error) === "MEDIA_AI_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(aiCalls, 0);
  assert.equal(quoteCalls, 1);

  canContinue = false;
  const exhausted = fixtureRecord(
    "KRCM_ai-exhausted",
    "https://www.instagram.com/reel/STALE2/",
    "AWAITING_AI_CONSENT",
    "native"
  );
  store.add(exhausted);
  await assert.rejects(
    () => service.startAi(exhausted.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "generate", max_credits: 40 }
    }),
    (error: unknown) => errorCode(error) === "MANAGED_PROVIDER_CREDITS_EXHAUSTED"
  );
  assert.equal(aiCalls, 0);
  assert.equal(quoteCalls, 2);
});

test("Facebook invalid typed consent is rejected before paid retrieval and mutation", async () => {
  const store = new FixtureStore();
  const calls = { paid: 0, stt: 0 };
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() { return null; },
    async paidRetrieve() {
      calls.paid += 1;
      throw new Error("must not run");
    },
    async transcribe() {
      calls.stt += 1;
      throw new Error("must not run");
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    null as never,
    { store, facebookPipeline: pipeline }
  );
  const waiting = fixtureRecord(
    "KRCM_fb-consent",
    "https://www.facebook.com/reel/1234567890123456",
    "AWAITING_RETRIEVAL_CONSENT",
    "facebook_retrieval_stt"
  );
  store.add(waiting);
  await assert.rejects(
    () => service.continueFacebookFallback(waiting.job.job_id, {
      beta_access_code: ACCESS_CODE,
      credit_consent: {
        provider: "scrapecreators", mode: "facebook_post", max_credits: 2
      }
    } as never),
    (error: unknown) => errorCode(error) === "FACEBOOK_RETRIEVAL_CREDIT_CONSENT_REQUIRED"
  );
  assert.equal(calls.paid, 0);
  assert.equal(calls.stt, 0);
  assert.equal(
    (await store.get(waiting.job.job_id))?.job.status,
    "AWAITING_RETRIEVAL_CONSENT"
  );
});

test("durable STT quota denial happens before attachment provider start", async () => {
  const store = new QuotaStore({
    allowed: false,
    used_seconds: 60,
    remaining_seconds: 0
  });
  let providerStarts = 0;
  const attachment: ManagedAttachmentPipeline = {
    configured: true,
    async transcribe(_file, _language, reserve) {
      await reserve(30);
      providerStarts += 1;
      return {
        provider: "assemblyai",
        provider_model: "universal-2",
        provider_data_deleted: true,
        detected_language: "en",
        language_confidence: 1,
        duration_seconds: 30,
        transcript_text: "x",
        segments: [
          { index: 0, start_ms: 0, end_ms: 1000, text: "x", confidence: null }
        ]
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachment }
  );
  const job = await service.startAttachment({
    openaiFileIdRefs: [{
      id: "file-quota",
      name: "quota.mp3",
      mime_type: "audio/mpeg",
      download_link: "https://example.oaiusercontent.com/file-quota"
    }],
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(job.status, "FAILED");
  assert.equal(job.error?.code, "MEDIA_BETA_STT_QUOTA_EXHAUSTED");
  assert.equal(store.quotaCalls, 1);
  assert.equal(providerStarts, 0);
});

test("invalid in-process quota durations fail closed without corrupting usage", () => {
  const gate = new MediaBetaGate([ACCESS_CODE], 60);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
    const result = gate.reserveSttSeconds(value);
    assert.equal(result.allowed, false);
    assert.equal(result.usage.used_seconds, 0);
    assert.equal(result.usage.remaining_seconds, 60);
  }
});
