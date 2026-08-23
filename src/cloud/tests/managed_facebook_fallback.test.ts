import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FacebookMediaRetrievalError,
  type FacebookMediaAsset,
  type FacebookRetrievalCreditConsent
} from "../src/facebook_media_retrieval.js";
import type {
  ManagedFacebookPipeline,
  ManagedFacebookSttResult
} from "../src/facebook_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedFacebookFallbackRequestKey,
  parseManagedMediaFacebookFallbackConsentInput,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation
} from "../src/managed_media_service.js";

const ACCESS_CODE = "OWNER_A97B_TEST_2026";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";
const CONSENT: FacebookRetrievalCreditConsent = {
  provider: "scrapecreators",
  mode: "facebook_post",
  max_credits: 1
};

function clone(record: ManagedMediaStoredRecord): ManagedMediaStoredRecord {
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

class DurableTestStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  private readonly byJob = new Map<string, ManagedMediaStoredRecord>();
  private readonly byKey = new Map<string, string>();

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}

  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    const jobId = this.byKey.get(requestKey);
    if (!jobId) return null;
    const record = this.byJob.get(jobId);
    return record ? clone(record) : null;
  }

  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    const stored = clone(record);
    this.byJob.set(record.job.job_id, stored);
    this.byKey.set(record.requestKey, record.job.job_id);
    return { created: true, record: clone(stored) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    const stored = clone(record);
    this.byJob.set(record.job.job_id, stored);
    this.byKey.set(record.requestKey, record.job.job_id);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    const record = this.byJob.get(jobId);
    return record ? clone(record) : null;
  }
}

function cobaltAsset(): FacebookMediaAsset {
  return {
    source_url: FACEBOOK_URL,
    media_url: "https://video.example.test/cobalt.mp4",
    duration_seconds: null,
    provider: "cobalt",
    provider_mode: "self_hosted",
    credits_charged: 0,
    credits_remaining: null,
    cached: false
  };
}

function paidAsset(): FacebookMediaAsset {
  return {
    source_url: FACEBOOK_URL,
    media_url: "https://video.example.test/paid.mp4",
    duration_seconds: 22,
    provider: "scrapecreators",
    provider_mode: "facebook_post",
    credits_charged: 1,
    credits_remaining: 77,
    cached: false
  };
}

function sttResult(durationSeconds = 22.2): ManagedFacebookSttResult {
  return {
    provider: "assemblyai",
    provider_model: "universal-2",
    provider_data_deleted: true,
    detected_language: "uk",
    language_confidence: 0.97,
    duration_seconds: durationSeconds,
    transcript_text: "Тестовий транскрипт",
    segments: [{
      index: 0,
      start_ms: 0,
      end_ms: 1000,
      text: "Тестовий транскрипт",
      confidence: 0.95
    }]
  };
}

function service(
  pipeline: ManagedFacebookPipeline,
  store?: ManagedMediaJobStore,
  dailySeconds = 7200
): ManagedMediaService {
  return new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], dailySeconds),
    null,
    undefined,
    {
      facebookPipeline: pipeline,
      ...(store ? { store } : {})
    }
  );
}

test("managed Facebook free retrieval completes durable KRCM segments without paid fallback", async () => {
  let freeCalls = 0;
  let paidCalls = 0;
  let sttCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      freeCalls += 1;
      return cobaltAsset();
    },
    async paidRetrieve() {
      paidCalls += 1;
      throw new Error("paid fallback must not run");
    },
    async transcribe(_asset, _language, reserve) {
      sttCalls += 1;
      reserve(22.2);
      return sttResult();
    }
  };
  const app = service(pipeline);
  assert.equal(app.configured, true);

  const job = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(job.status, "COMPLETED");
  assert.equal(job.provider, "assemblyai");
  assert.equal(job.provider_mode, "facebook_retrieval_stt");
  assert.equal(job.retrieval_provider, "cobalt");
  assert.equal(job.retrieval_credits_charged, 0);
  assert.equal(job.credits_charged, 0);
  assert.equal(job.stt_seconds_charged, 23);
  assert.equal(job.provider_data_deleted, true);
  assert.equal(freeCalls, 1);
  assert.equal(paidCalls, 0);
  assert.equal(sttCalls, 1);

  const page = await app.page(job.job_id, 0, 20);
  assert.ok(page);
  assert.equal(page.status, "COMPLETED");
  assert.equal(page.segments.length, 1);
  assert.equal(page.segments[0]?.text, "Тестовий транскрипт");

  const duplicate = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(duplicate.job_id, job.job_id);
  assert.equal(duplicate.reused, true);
  assert.equal(freeCalls, 1);
  assert.equal(sttCalls, 1);
});

test("free retrieval failure persists consent state and local one-credit preflight", async () => {
  let paidCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      return null;
    },
    async paidRetrieve() {
      paidCalls += 1;
      return paidAsset();
    },
    async transcribe() {
      throw new Error("STT must not run before paid consent");
    }
  };
  const app = service(pipeline);
  const waiting = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "uk",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(waiting.status, "AWAITING_RETRIEVAL_CONSENT");
  assert.equal(waiting.credits_charged, 0);
  assert.equal(waiting.credit_charge_uncertain, false);
  assert.equal(paidCalls, 0);

  const quote = await app.facebookFallbackPreflight(waiting.job_id, ACCESS_CODE);
  assert.equal(quote.provider, "scrapecreators");
  assert.equal(quote.estimated_credits, 1);
  assert.equal(quote.maximum_credits, 1);
  assert.equal(quote.provider_balance_lookup_performed, false);
  assert.equal(paidCalls, 0);

  assert.equal(parseManagedMediaFacebookFallbackConsentInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "scrapecreators",
      mode: "facebook_post",
      max_credits: 2
    }
  }), null);
});

test("durable waiting job survives service restart and paid continuation runs exactly once", async () => {
  const store = new DurableTestStore();
  let freeCalls = 0;
  let paidCalls = 0;
  let sttCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      freeCalls += 1;
      return null;
    },
    async paidRetrieve(_url, consent) {
      paidCalls += 1;
      assert.deepEqual(consent, CONSENT);
      return paidAsset();
    },
    async transcribe(_asset, _language, reserve) {
      sttCalls += 1;
      reserve(22);
      return sttResult(22);
    }
  };

  const first = service(pipeline, store);
  const waiting = await first.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(waiting.status, "AWAITING_RETRIEVAL_CONSENT");
  assert.equal(first.durableStore, true);

  const second = service(pipeline, store);
  const quote = await second.facebookFallbackPreflight(waiting.job_id, ACCESS_CODE);
  assert.equal(quote.maximum_credits, 1);
  const input = parseManagedMediaFacebookFallbackConsentInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: CONSENT
  });
  assert.ok(input);
  const completed = await second.continueFacebookFallback(waiting.job_id, input);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.retrieval_provider, "scrapecreators");
  assert.equal(completed.credits_charged, 1);
  assert.equal(completed.retrieval_credits_charged, 1);
  assert.equal(completed.credits_remaining_estimate, 77);
  assert.equal(completed.credit_charge_uncertain, false);
  assert.equal(completed.stt_seconds_charged, 22);
  assert.equal(freeCalls, 1);
  assert.equal(paidCalls, 1);
  assert.equal(sttCalls, 1);

  const repeated = await second.continueFacebookFallback(waiting.job_id, input);
  assert.equal(repeated.job_id, completed.job_id);
  assert.equal(repeated.reused, true);
  assert.equal(paidCalls, 1);
  assert.equal(sttCalls, 1);

  const duplicateStart = await second.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(duplicateStart.job_id, completed.job_id);
  assert.equal(duplicateStart.reused, true);
  assert.equal(freeCalls, 1);
});

test("paid retrieval failure with known charge is reconciled and never replayed", async () => {
  let paidCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      return null;
    },
    async paidRetrieve() {
      paidCalls += 1;
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_FAILED",
        "provider failed",
        502,
        false,
        "scrapecreators",
        1,
        77
      );
    },
    async transcribe() {
      throw new Error("STT must not run after retrieval failure");
    }
  };
  const app = service(pipeline);
  const waiting = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  const input = parseManagedMediaFacebookFallbackConsentInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: CONSENT
  });
  assert.ok(input);
  const failed = await app.continueFacebookFallback(waiting.job_id, input);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.credits_charged, 1);
  assert.equal(failed.retrieval_credits_charged, 1);
  assert.equal(failed.credits_remaining_estimate, 77);
  assert.equal(failed.credit_charge_uncertain, false);
  assert.equal(paidCalls, 1);

  await assert.rejects(
    () => app.continueFacebookFallback(waiting.job_id, input),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
      );
      return true;
    }
  );
  assert.equal(paidCalls, 1);
});

test("unknown paid charge stays uncertain and is never automatically replayed", async () => {
  let paidCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      return null;
    },
    async paidRetrieve() {
      paidCalls += 1;
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_SCRAPECREATORS_UNREACHABLE",
        "network outcome unknown",
        502,
        false,
        "scrapecreators",
        null,
        null
      );
    },
    async transcribe() {
      throw new Error("STT must not run");
    }
  };
  const app = service(pipeline);
  const waiting = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  const input = parseManagedMediaFacebookFallbackConsentInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: CONSENT
  });
  assert.ok(input);
  const failed = await app.continueFacebookFallback(waiting.job_id, input);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.credit_charge_uncertain, true);
  assert.equal(failed.credits_charged, 0);
  assert.equal(paidCalls, 1);

  const duplicateStart = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  assert.equal(duplicateStart.job_id, failed.job_id);
  assert.equal(duplicateStart.reused, true);
  assert.equal(paidCalls, 1);
});

test("STT quota is reserved before STT side effect and preserves paid retrieval charge", async () => {
  let paidCalls = 0;
  let sttAfterReserve = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      return null;
    },
    async paidRetrieve() {
      paidCalls += 1;
      return paidAsset();
    },
    async transcribe(_asset, _language, reserve) {
      reserve(61);
      sttAfterReserve += 1;
      return sttResult(61);
    }
  };
  const app = service(pipeline, undefined, 60);
  const waiting = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });
  const input = parseManagedMediaFacebookFallbackConsentInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: CONSENT
  });
  assert.ok(input);
  const failed = await app.continueFacebookFallback(waiting.job_id, input);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error?.code, "MEDIA_BETA_STT_QUOTA_EXHAUSTED");
  assert.equal(failed.credits_charged, 1);
  assert.equal(failed.retrieval_credits_charged, 1);
  assert.equal(failed.credits_remaining_estimate, 77);
  assert.equal(failed.credit_charge_uncertain, false);
  assert.equal(paidCalls, 1);
  assert.equal(sttAfterReserve, 0);
});

test("Facebook fallback request key is stable, owner-isolated, and separate from URL spelling", () => {
  const normalized = "https://www.facebook.com/reel/1114235920664408/";
  const first = managedFacebookFallbackRequestKey(normalized, "auto", ACCESS_CODE);
  const second = managedFacebookFallbackRequestKey(normalized, "auto", ACCESS_CODE);
  const otherOwner = managedFacebookFallbackRequestKey(
    normalized,
    "auto",
    "OWNER_A97B_OTHER_2026"
  );
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.notEqual(first, otherOwner);
});
