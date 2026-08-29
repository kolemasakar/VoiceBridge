import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedMediaAccessDigest,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedMediaSttReservation
} from "../src/managed_media_service.js";

const ACCESS_CODE = "durable-fail-closed-owner-2026";

class MemoryFixtureStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  protected readonly records = new Map<string, ManagedMediaStoredRecord>();

  async ready(): Promise<void> {}
  async purgeExpired(): Promise<void> {}

  async findByRequestKey(requestKey: string): Promise<ManagedMediaStoredRecord | null> {
    for (const record of this.records.values()) {
      if (record.requestKey === requestKey) return structuredClone(record);
    }
    return null;
  }

  async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    const existing = await this.findByRequestKey(record.requestKey);
    if (existing) return { created: false, record: existing };
    this.records.set(record.job.job_id, structuredClone(record));
    return { created: true, record: structuredClone(record) };
  }

  async put(record: ManagedMediaStoredRecord): Promise<void> {
    this.records.set(record.job.job_id, structuredClone(record));
  }

  async get(jobId: string): Promise<ManagedMediaStoredRecord | null> {
    const record = this.records.get(jobId);
    return record ? structuredClone(record) : null;
  }
}

class ReadyFailureStore extends MemoryFixtureStore {
  reserveCalls = 0;

  override async ready(): Promise<void> {
    throw new Error("simulated durable store outage");
  }

  override async reserve(record: ManagedMediaStoredRecord): Promise<ManagedMediaStoreReservation> {
    this.reserveCalls += 1;
    return super.reserve(record);
  }
}

class QuotaFailureStore extends MemoryFixtureStore {
  quotaCalls = 0;

  async reserveSttSeconds(
    _jobId: string,
    _dayUtc: string,
    _requestedSeconds: number,
    _dailyLimitSeconds: number
  ): Promise<ManagedMediaSttReservation> {
    this.quotaCalls += 1;
    throw new Error("simulated durable quota ledger outage");
  }
}

function attachmentPipeline(counter: { providerStarts: number }): ManagedAttachmentPipeline {
  return {
    configured: true,
    async transcribe(_file, _languageHint, reserveSttSeconds) {
      await reserveSttSeconds(30);
      counter.providerStarts += 1;
      return {
        provider: "assemblyai",
        provider_model: "universal-2",
        provider_data_deleted: true,
        detected_language: "en",
        language_confidence: 1,
        duration_seconds: 30,
        transcript_text: "provider must not be reached in fail-closed tests",
        segments: [
          {
            index: 0,
            start_ms: 0,
            end_ms: 1000,
            text: "provider must not be reached",
            confidence: null
          }
        ]
      };
    }
  };
}

function attachmentInput() {
  return {
    openaiFileIdRefs: [{
      id: "file-durable-fail-closed",
      name: "durable-fail-closed.mp3",
      mime_type: "audio/mpeg",
      download_link: "https://example.oaiusercontent.com/file-durable-fail-closed"
    }] as [{
      id: string;
      name: string;
      mime_type: string;
      download_link: string;
    }],
    language_hint: "auto" as const,
    beta_access_code: ACCESS_CODE
  };
}

test("managed durable-store initialization outage rejects before job reservation or provider work", async () => {
  const store = new ReadyFailureStore();
  const counter = { providerStarts: 0 };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachmentPipeline(counter) }
  );

  await assert.rejects(
    () => service.startAttachment(attachmentInput()),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, "MANAGED_DURABLE_STORE_UNAVAILABLE");
      assert.equal((error as { httpStatus?: number }).httpStatus, 503);
      return true;
    }
  );
  assert.equal(store.reserveCalls, 0);
  assert.equal(counter.providerStarts, 0);
});

test("managed durable quota-ledger outage fails job before AssemblyAI provider start", async () => {
  const store = new QuotaFailureStore();
  const counter = { providerStarts: 0 };
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachmentPipeline(counter) }
  );

  const failed = await service.startAttachment(attachmentInput());
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error?.code, "MANAGED_DURABLE_STORE_UNAVAILABLE");
  assert.equal(failed.error?.retryable, true);
  assert.equal(failed.retrieval_provider, "openai_attachment");
  assert.equal(failed.retrieval_credits_charged, 0);
  assert.equal(failed.stt_seconds_charged, 0);
  assert.equal(failed.credit_charge_uncertain, false);
  assert.equal(store.quotaCalls, 1);
  assert.equal(counter.providerStarts, 0);
});

test("all managed AssemblyAI routes share the fail-closed durable STT reservation callback", async () => {
  const source = await readFile(new URL("../src/managed_media_service.ts", import.meta.url), "utf8");
  const reserveCallback = "(seconds) => this.reserveSttQuota";
  assert.ok(source.split(reserveCallback).length - 1 >= 3);
  assert.match(source, /MANAGED_DURABLE_STORE_UNAVAILABLE/);
  assert.match(source, /managed media durable quota ledger is temporarily unavailable/i);
});

test("legacy KRCC path reserves durable quota before constructing AssemblyAI transcriber", async () => {
  const ingestSource = await readFile(new URL("../src/media_client_ingest.ts", import.meta.url), "utf8");
  const httpSource = await readFile(new URL("../src/media_client_http.ts", import.meta.url), "utf8");

  const reservationIndex = ingestSource.indexOf("await this.options.reserveSttSeconds");
  const transcriberIndex = ingestSource.indexOf("new AssemblyAiAsyncTranscriber", reservationIndex);
  assert.ok(reservationIndex >= 0);
  assert.ok(transcriberIndex > reservationIndex);

  assert.match(httpSource, /MEDIA_CLIENT_DURABLE_QUOTA_UNAVAILABLE/);
  assert.match(httpSource, /MEDIA_DURABLE_STORE_UNAVAILABLE/);
  assert.match(httpSource, /reserveSttSeconds:\s*persistentStore\.enabled/);
  assert.match(httpSource, /durable_quota_ledger:\s*persistentStore\.enabled/);
});

test("durable quota records remain access-code scoped only through job ownership, not quota keys", async () => {
  const digest = managedMediaAccessDigest(ACCESS_CODE);
  assert.equal(digest.length, 64);
  const source = await readFile(new URL("../src/managed_media_persistence.ts", import.meta.url), "utf8");
  assert.match(source, /krc_media_stt_charges/);
  assert.match(source, /job_id/);
  assert.match(source, /day_utc/);
  assert.doesNotMatch(source, /access_code_digest[^\n]*krc_media_stt_charges/);
});
