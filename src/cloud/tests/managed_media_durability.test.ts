import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedMediaAccessDigest,
  managedMediaRequestKey,
  parseManagedMediaNativeInput,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "abcdefghijkl";
const URL = "https://youtu.be/durable123";

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

class SharedStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  readonly byJob = new Map<string, ManagedMediaStoredRecord>();
  readonly byRequest = new Map<string, string>();

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}

  async reserve(
    record: ManagedMediaStoredRecord
  ): Promise<ManagedMediaStoreReservation> {
    const existingId = this.byRequest.get(record.requestKey);
    if (existingId) {
      const existing = this.byJob.get(existingId);
      if (!existing) throw new Error("Shared test store is inconsistent.");
      return { created: false, record: clone(existing) };
    }
    const stored = clone(record);
    this.byJob.set(stored.job.job_id, stored);
    this.byRequest.set(stored.requestKey, stored.job.job_id);
    return { created: true, record: clone(stored) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    const stored = clone(record);
    this.byJob.set(stored.job.job_id, stored);
    this.byRequest.set(stored.requestKey, stored.job.job_id);
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    const record = this.byJob.get(jobId);
    return record ? clone(record) : null;
  }
}

class CountingProvider implements ManagedNativeTranscriptProvider {
  transcriptCalls = 0;
  release: (() => void) | null = null;
  started: Promise<void>;
  private markStarted: (() => void) | null = null;

  constructor(private readonly block = false) {
    this.started = new Promise<void>((resolve) => {
      this.markStarted = resolve;
    });
  }

  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 1,
      remaining_credits: 99,
      estimated_credits: 1 as const,
      remaining_after_estimate: 98,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getNativeTranscript() {
    this.transcriptCalls += 1;
    this.markStarted?.();
    if (this.block) {
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
    return {
      status: "completed" as const,
      language: "ru",
      available_languages: ["ru"],
      segments: [
        {
          index: 0,
          start_ms: 100,
          end_ms: 900,
          text: "durable segment",
          confidence: null
        }
      ],
      transcript_text: "durable segment",
      billable_credits: 1
    };
  }
}

function input() {
  const parsed = parseManagedMediaNativeInput({
    url: URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.ok(parsed);
  return parsed;
}

test("completed managed job and segments survive service restart and duplicate start is reused", async () => {
  const store = new SharedStore();
  const provider = new CountingProvider();
  const first = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider,
    { store }
  );
  const completed = await first.startNative(input());
  assert.equal(completed.status, "COMPLETED");
  assert.equal(provider.transcriptCalls, 1);

  const restarted = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider,
    { store }
  );
  const recovered = await restarted.get(completed.job_id);
  assert.equal(recovered?.status, "COMPLETED");
  const page = await restarted.page(completed.job_id, 0, 20);
  assert.equal(page?.segments.length, 1);

  const duplicate = await restarted.startNative(input());
  assert.equal(duplicate.job_id, completed.job_id);
  assert.equal(duplicate.status, "COMPLETED");
  assert.equal(duplicate.reused, true);
  assert.equal(provider.transcriptCalls, 1);
});

test("concurrent duplicate start has a single provider winner", async () => {
  const store = new SharedStore();
  const provider = new CountingProvider(true);
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider,
    { store }
  );

  const winnerPromise = service.startNative(input());
  await provider.started;
  const duplicate = await service.startNative(input());
  assert.equal(duplicate.status, "PROCESSING");
  assert.equal(duplicate.reused, true);
  assert.equal(provider.transcriptCalls, 1);

  provider.release?.();
  const winner = await winnerPromise;
  assert.equal(winner.status, "COMPLETED");
  assert.equal(provider.transcriptCalls, 1);
});

test("persisted processing reservation is not replayed after restart", async () => {
  const store = new SharedStore();
  const provider = new CountingProvider();
  const sourceUrl = "https://www.youtube.com/watch?v=durable123";
  const now = new Date().toISOString();
  const record: ManagedMediaStoredRecord = {
    job: {
      job_id: "KRCM_restart-reservation",
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      language_hint: "auto",
      provider: "supadata",
      provider_mode: "native",
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 99,
      credit_charge_uncertain: true,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: true,
      error: null
    },
    requestKey: managedMediaRequestKey(sourceUrl, "auto", ACCESS_CODE),
    accessCodeDigest: managedMediaAccessDigest(ACCESS_CODE),
    segments: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString()
  };
  await store.reserve(record);

  const restarted = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider,
    { store }
  );
  const duplicate = await restarted.startNative(input());
  assert.equal(duplicate.job_id, record.job.job_id);
  assert.equal(duplicate.status, "PROCESSING");
  assert.equal(duplicate.reused, true);
  assert.equal(duplicate.credit_charge_uncertain, true);
  assert.equal(provider.transcriptCalls, 0);
});
