import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  parseManagedMediaAiInput,
  parseManagedMediaNativeInput,
  parseManagedMediaPreflightInput,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "abcdefghijkl";

function provider(
  transcriptStatus: "completed" | "unavailable" = "completed"
): ManagedNativeTranscriptProvider {
  return {
    async quoteNative() {
      return {
        provider: "supadata",
        mode: "native",
        plan: "Free",
        max_credits: 100,
        used_credits: 10,
        remaining_credits: 90,
        estimated_credits: 1,
        remaining_after_estimate: 89,
        consent_required: true,
        can_continue: true
      };
    },
    async getNativeTranscript() {
      if (transcriptStatus === "unavailable") {
        return { status: "unavailable", billable_credits: 1 };
      }
      return {
        status: "completed",
        language: "uk",
        available_languages: ["uk"],
        segments: [
          {
            index: 0,
            start_ms: 0,
            end_ms: 1200,
            text: "Test segment",
            confidence: null
          }
        ],
        transcript_text: "Test segment",
        billable_credits: 1
      };
    }
  };
}

function aiProvider() {
  let aiCalls = 0;
  const value: ManagedNativeTranscriptProvider = {
    async quoteNative() {
      return {
        provider: "supadata",
        mode: "native",
        plan: "Free",
        max_credits: 100,
        used_credits: 3,
        remaining_credits: 97,
        estimated_credits: 1,
        remaining_after_estimate: 96,
        consent_required: true,
        can_continue: true
      };
    },
    async getNativeTranscript() {
      return { status: "unavailable", billable_credits: 1 };
    },
    async quoteGenerateInstagramReel() {
      return {
        provider: "supadata",
        mode: "generate",
        plan: "Free",
        max_credits: 100,
        used_credits: 4,
        remaining_credits: 96,
        estimated_credits: 40,
        maximum_credits: 40,
        credits_per_minute: 2,
        maximum_duration_minutes: 20,
        remaining_after_estimate: 56,
        conservative_maximum: true,
        consent_required: true,
        can_continue: true
      };
    },
    async getGeneratedTranscript() {
      aiCalls += 1;
      return {
        status: "completed",
        language: "en",
        available_languages: ["en"],
        segments: [
          {
            index: 0,
            start_ms: 0,
            end_ms: 18000,
            text: "AI generated segment",
            confidence: null
          }
        ],
        transcript_text: "AI generated segment",
        billable_credits: 2
      };
    }
  };
  return { value, aiCalls: () => aiCalls };
}

test("managed preflight returns user-facing one-credit consent contract", async () => {
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider()
  );
  const input = parseManagedMediaPreflightInput({
    url: "https://youtu.be/abc123",
    beta_access_code: ACCESS_CODE
  });
  assert.ok(input);
  const quote = await service.preflight(input);
  assert.equal(quote.credits_available, 90);
  assert.equal(quote.estimated_credits, 1);
  assert.equal(quote.credits_after_estimate, 89);
  assert.equal(quote.consent_required, true);
  assert.deepEqual(quote.consent_options, { approve: 1, reject: 2 });
});

test("managed native start requires explicit one-credit consent", () => {
  assert.equal(
    parseManagedMediaNativeInput({
      url: "https://youtu.be/abc123",
      beta_access_code: ACCESS_CODE
    }),
    null
  );
  assert.equal(
    parseManagedMediaNativeInput({
      url: "https://youtu.be/abc123",
      beta_access_code: ACCESS_CODE,
      credit_consent: {
        provider: "supadata",
        mode: "native",
        max_credits: 2
      }
    }),
    null
  );
  assert.ok(
    parseManagedMediaNativeInput({
      url: "https://youtu.be/abc123",
      beta_access_code: ACCESS_CODE,
      credit_consent: {
        provider: "supadata",
        mode: "native",
        max_credits: 1
      }
    })
  );
});

test("native transcript completes after consent and charges only reported credit", async () => {
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider("completed")
  );
  const input = parseManagedMediaNativeInput({
    url: "https://youtu.be/abc123",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(input);
  const job = await service.startNative(input);
  assert.equal(job.status, "COMPLETED");
  assert.equal(job.credits_charged, 1);
  assert.equal(job.credits_remaining_estimate, 89);
  assert.equal(job.credit_charge_uncertain, false);
  assert.equal(job.reused, false);
  assert.equal(job.segment_count, 1);
  assert.equal(job.ai_fallback_requires_new_consent, true);

  const page = await service.page(job.job_id, 0, 20);
  assert.ok(page);
  assert.equal(page.segments.length, 1);
});

test("native transcript unavailable stops before AI and requires second consent", async () => {
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider("unavailable")
  );
  const input = parseManagedMediaNativeInput({
    url: "https://youtu.be/no-captions",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(input);
  const job = await service.startNative(input);
  assert.equal(job.status, "AWAITING_AI_CONSENT");
  assert.equal(job.credits_charged, 1);
  assert.equal(job.credit_charge_uncertain, false);
  assert.equal(job.ai_fallback_requires_new_consent, true);
  assert.equal(job.segment_count, 0);
});

test("AI consent parser accepts bounded dynamic Supadata generate caps", () => {
  for (const maxCredits of [2, 6, 40]) {
    assert.ok(
      parseManagedMediaAiInput({
        beta_access_code: ACCESS_CODE,
        credit_consent: {
          provider: "supadata",
          mode: "generate",
          max_credits: maxCredits
        }
      })
    );
  }

  for (const maxCredits of [1, 2.5, 10001]) {
    assert.equal(
      parseManagedMediaAiInput({
        beta_access_code: ACCESS_CODE,
        credit_consent: {
          provider: "supadata",
          mode: "generate",
          max_credits: maxCredits
        }
      }),
      null
    );
  }

  assert.equal(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "other", mode: "generate", max_credits: 6 }
    }),
    null
  );
  assert.equal(
    parseManagedMediaAiInput({
      beta_access_code: ACCESS_CODE,
      credit_consent: { provider: "supadata", mode: "native", max_credits: 6 }
    }),
    null
  );
});

test("Instagram Reel AI fallback requires preflight then completes on second consent", async () => {
  const fake = aiProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    fake.value
  );
  const nativeInput = parseManagedMediaNativeInput({
    url: "https://www.instagram.com/reel/ABC123/?igsh=tracking",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(nativeInput);
  const nativeJob = await service.startNative(nativeInput);
  assert.equal(nativeJob.status, "AWAITING_AI_CONSENT");
  assert.equal(nativeJob.source_url, "https://www.instagram.com/reel/ABC123/");
  assert.equal(fake.aiCalls(), 0);

  const quote = await service.aiPreflight(nativeJob.job_id, ACCESS_CODE);
  assert.equal(quote.mode, "generate");
  assert.equal(quote.credits_available, 96);
  assert.equal(quote.estimated_credits, 40);
  assert.equal(quote.maximum_credits, 40);
  assert.equal(quote.credits_after_estimate, 56);
  assert.equal(quote.credits_per_minute, 2);
  assert.equal(quote.maximum_duration_minutes, 20);
  assert.equal(fake.aiCalls(), 0);

  const aiInput = parseManagedMediaAiInput({
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "generate",
      max_credits: 40
    }
  });
  assert.ok(aiInput);
  const completed = await service.startAi(nativeJob.job_id, aiInput);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.provider_mode, "generate");
  assert.equal(completed.credits_charged, 3);
  assert.equal(completed.credits_remaining_estimate, 94);
  assert.equal(completed.ai_fallback_requires_new_consent, false);
  assert.equal(completed.segment_count, 1);
  assert.equal(fake.aiCalls(), 1);

  const duplicate = await service.startAi(nativeJob.job_id, aiInput);
  assert.equal(duplicate.status, "COMPLETED");
  assert.equal(duplicate.reused, true);
  assert.equal(fake.aiCalls(), 1);
});

test("AI preflight refuses non-Reel source even after native unavailable", async () => {
  const fake = aiProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    fake.value
  );
  const nativeInput = parseManagedMediaNativeInput({
    url: "https://www.instagram.com/p/ABC123/",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(nativeInput);
  const nativeJob = await service.startNative(nativeInput);
  await assert.rejects(
    () => service.aiPreflight(nativeJob.job_id, ACCESS_CODE),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "MEDIA_AI_SOURCE_NOT_SUPPORTED");
      return true;
    }
  );
  assert.equal(fake.aiCalls(), 0);
});

class RecordingStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  record: ManagedMediaStoredRecord | null = null;

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}
  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    return this.record?.requestKey === requestKey ? structuredClone(this.record) : null;
  }
  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    if (this.record) return { created: false, record: structuredClone(this.record) };
    this.record = structuredClone(record);
    return { created: true, record: structuredClone(record) };
  }
  async put(record: ManagedMediaStoredRecord): Promise<void> {
    this.record = structuredClone(record);
  }
  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    return this.record?.job.job_id === jobId ? structuredClone(this.record) : null;
  }
}

test("paid native-unavailable jobs retain at least a 24-hour recovery window", async () => {
  const store = new RecordingStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider("unavailable"),
    { store, jobTtlSeconds: 300 }
  );
  const input = parseManagedMediaNativeInput({
    url: "https://youtu.be/recovery-window",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(input);
  const job = await service.startNative(input);
  assert.equal(job.status, "AWAITING_AI_CONSENT");
  assert.equal(job.credits_charged, 1);
  assert.ok(store.record);
  const retentionSeconds = (
    Date.parse(store.record.expiresAt) - Date.parse(store.record.job.updated_at)
  ) / 1000;
  assert.ok(retentionSeconds >= 86400);
});

test("FAILED job supports one explicit fresh native retry key while preserving idempotency", async () => {
  let nativeCalls = 0;
  const baseProvider = provider("completed");
  const fake: ManagedNativeTranscriptProvider = {
    ...baseProvider,
    async getNativeTranscript() {
      nativeCalls += 1;
      if (nativeCalls === 1) throw new Error("simulated provider failure");
      return {
        status: "completed",
        language: "uk",
        available_languages: ["uk"],
        segments: [{
          index: 0,
          start_ms: 0,
          end_ms: 1000,
          text: "Fresh retry segment",
          confidence: null
        }],
        transcript_text: "Fresh retry segment",
        billable_credits: 1
      };
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    fake
  );
  const firstInput = parseManagedMediaNativeInput({
    url: "https://www.facebook.com/reel/1114235920664408",
    beta_access_code: ACCESS_CODE,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(firstInput);
  const failed = await service.startNative(firstInput);
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.reused, false);
  assert.equal(nativeCalls, 1);

  const retryInput = parseManagedMediaNativeInput({
    url: "https://www.facebook.com/reel/1114235920664408",
    beta_access_code: ACCESS_CODE,
    retry_failed_job_id: failed.job_id,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(retryInput);
  const fresh = await service.startNative(retryInput);
  assert.equal(fresh.status, "COMPLETED");
  assert.notEqual(fresh.job_id, failed.job_id);
  assert.equal(fresh.reused, false);
  assert.equal(nativeCalls, 2);

  const duplicate = await service.startNative(retryInput);
  assert.equal(duplicate.job_id, fresh.job_id);
  assert.equal(duplicate.reused, true);
  assert.equal(nativeCalls, 2);
});

test("fresh native retry rejects malformed or non-FAILED retry targets", async () => {
  assert.equal(
    parseManagedMediaNativeInput({
      url: "https://youtu.be/retry-parser",
      beta_access_code: ACCESS_CODE,
      retry_failed_job_id: "not-a-managed-job",
      credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
    }),
    null
  );

  let nativeCalls = 0;
  const completedProvider = provider("completed");
  const fake: ManagedNativeTranscriptProvider = {
    ...completedProvider,
    async getNativeTranscript(url, languageHint) {
      nativeCalls += 1;
      return completedProvider.getNativeTranscript(url, languageHint);
    }
  };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    fake
  );
  const firstInput = parseManagedMediaNativeInput({
    url: "https://youtu.be/retry-completed",
    beta_access_code: ACCESS_CODE,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(firstInput);
  const completed = await service.startNative(firstInput);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(nativeCalls, 1);

  const retryInput = parseManagedMediaNativeInput({
    url: "https://youtu.be/retry-completed",
    beta_access_code: ACCESS_CODE,
    retry_failed_job_id: completed.job_id,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(retryInput);
  await assert.rejects(
    () => service.startNative(retryInput),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "MEDIA_FAILED_RETRY_NOT_APPLICABLE"
      );
      return true;
    }
  );
  assert.equal(nativeCalls, 1);
});
