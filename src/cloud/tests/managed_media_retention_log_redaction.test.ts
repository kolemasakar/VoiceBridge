import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";

const ACCESS_CODE = "retention-redaction-owner-2026";

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

function freeAttachmentPipeline(): ManagedAttachmentPipeline {
  return {
    configured: true,
    async transcribe(_file, _languageHint, reserveSttSeconds) {
      await reserveSttSeconds(3);
      return {
        provider: "assemblyai",
        provider_model: "universal-2",
        provider_data_deleted: true,
        detected_language: "en",
        language_confidence: 0.99,
        duration_seconds: 3,
        transcript_text: "retention test transcript",
        segments: [{
          index: 0,
          start_ms: 0,
          end_ms: 3000,
          text: "retention test transcript",
          confidence: 0.98
        }]
      };
    }
  };
}

function uncertainProvider(): ManagedNativeTranscriptProvider {
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
      throw new Error("simulated provider interruption");
    }
  };
}

function retentionSeconds(record: ManagedMediaStoredRecord): number {
  return (
    Date.parse(record.expiresAt) - Date.parse(record.job.updated_at)
  ) / 1000;
}

test("zero-credit attachment uses configured short retention window", async () => {
  const store = new RecordingStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, jobTtlSeconds: 300, attachmentPipeline: freeAttachmentPipeline() }
  );

  const job = await service.startAttachment({
    openaiFileIdRefs: [{
      id: "file-retention-short",
      name: "retention-short.wav",
      mime_type: "audio/wav",
      download_link: "https://eu.oaiusercontent.com/opaque-retention-short"
    }],
    language_hint: "en",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(job.status, "COMPLETED");
  assert.equal(job.credits_charged, 0);
  assert.equal(job.credit_charge_uncertain, false);
  assert.ok(store.record);
  assert.equal(retentionSeconds(store.record), 300);
});

test("uncertain provider result retains at least 24 hours without automatic replay", async () => {
  const store = new RecordingStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    uncertainProvider(),
    { store, jobTtlSeconds: 300 }
  );

  const job = await service.startNative({
    url: "https://youtu.be/retention-uncertain",
    language_hint: "auto",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });

  assert.equal(job.status, "FAILED");
  assert.equal(job.credit_charge_uncertain, true);
  assert.equal(job.error?.retryable, false);
  assert.ok(store.record);
  assert.ok(retentionSeconds(store.record) >= 86400);
});

test("durable expiry purge deletes expired jobs and bounds quota-ledger retention", async () => {
  const persistence = await readFile("src/managed_media_persistence.ts", "utf8");
  assert.match(
    persistence,
    /DELETE FROM krc_managed_media_jobs WHERE expires_at <= now\(\);/
  );
  assert.match(
    persistence,
    /DELETE FROM krc_media_stt_charges WHERE day_utc < current_date - interval '2 days';/
  );
  assert.match(
    persistence,
    /WHERE request_key='\$\{requestKey\}' AND expires_at > now\(\)/
  );
  assert.match(
    persistence,
    /WHERE job_id='\$\{jobId\}' AND expires_at > now\(\)/
  );
});

test("managed media structured warning is metadata-only and excludes sensitive payload fields", async () => {
  const service = await readFile("src/managed_media_service.ts", "utf8");
  const warning = service.match(/console\.warn\(JSON\.stringify\(\{([\s\S]*?)\}\)\);/);
  assert.ok(warning);
  const body = warning[1] || "";

  for (const safeField of ["event", "job_id", "provider", "error_code", "http_status_class"]) {
    assert.match(body, new RegExp(`${safeField}:`));
  }
  for (const sensitiveField of [
    "source_url",
    "beta_access_code",
    "accessCodeDigest",
    "requestKey",
    "transcript_text",
    "segments",
    "media_url",
    "download_link",
    "Authorization"
  ]) {
    assert.equal(body.includes(sensitiveField), false, sensitiveField);
  }
});

test("durable store suppresses stderr payloads and exposes only generic persistence errors", async () => {
  const persistence = await readFile("src/managed_media_persistence.ts", "utf8");
  assert.match(persistence, /child\.stderr\.on\("data", \(\) => \{\}\);/);
  assert.doesNotMatch(persistence, /console\.(?:log|warn|error|info|debug)/);
  assert.match(persistence, /Managed media durable store command failed\./);
  assert.match(persistence, /Managed media durable store is unavailable\./);
  assert.doesNotMatch(persistence, /reject\(new Error\([^\n]*stderr/);
});

test("managed HTTP responses are no-store and do not add request-body logging", async () => {
  const http = await readFile("src/managed_media_http.ts", "utf8");
  assert.match(http, /response\.setHeader\("cache-control", "no-store"\);/);
  assert.doesNotMatch(http, /console\.(?:log|warn|error|info|debug)/);
  assert.match(http, /response\.end\(JSON\.stringify\(body\)\);/);
  assert.match(http, /"MANAGED_MEDIA_REQUEST_FAILED"/);
  assert.match(http, /"The managed media request failed\."/);
});
