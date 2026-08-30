import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  type ManagedMediaJobStore,
  type ManagedMediaStoredRecord,
  type ManagedMediaStoreReservation
} from "../src/managed_media_service.js";

const ACCESS_CODE = "privacy-cleanup-owner-2026";
const SIGNED_URL = "https://files.example.oaiusercontent.com/private/object?sig=TOP-SECRET-SIGNATURE";
const TRANSCRIPT_MARKER = "sensitive canonical transcript marker";

class CaptureStore implements ManagedMediaJobStore {
  readonly durable = true;
  readonly kind = "postgres" as const;
  private readonly records = new Map<string, ManagedMediaStoredRecord>();

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

function attachmentPipeline(): ManagedAttachmentPipeline {
  return {
    configured: true,
    async transcribe(_file, _languageHint, reserveSttSeconds) {
      await reserveSttSeconds(7);
      return {
        provider: "assemblyai",
        provider_model: "universal-2",
        provider_data_deleted: false,
        detected_language: "en",
        language_confidence: 0.99,
        duration_seconds: 7,
        transcript_text: TRANSCRIPT_MARKER,
        segments: [
          {
            index: 0,
            start_ms: 0,
            end_ms: 7000,
            text: TRANSCRIPT_MARKER,
            confidence: 0.98
          }
        ]
      };
    }
  };
}

test("attachment signed URL and raw owner admission are never persisted or exposed in public job view", async () => {
  const store = new CaptureStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachmentPipeline() }
  );

  const job = await service.startAttachment({
    openaiFileIdRefs: [{
      id: "file-private-cleanup",
      name: "private-cleanup.mp3",
      mime_type: "audio/mpeg",
      download_link: SIGNED_URL
    }],
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(job.status, "COMPLETED");
  assert.equal(job.source_url, "attachment://local-media");
  assert.equal(job.provider_data_deleted, false);

  const publicJson = JSON.stringify(job);
  assert.doesNotMatch(publicJson, /TOP-SECRET-SIGNATURE/);
  assert.equal(publicJson.includes(SIGNED_URL), false);
  assert.equal(publicJson.includes(ACCESS_CODE), false);
  assert.equal(publicJson.includes("requestKey"), false);
  assert.equal(publicJson.includes("accessCodeDigest"), false);
  assert.equal(publicJson.includes(TRANSCRIPT_MARKER), false);

  const stored = await store.get(job.job_id);
  assert.ok(stored);
  const storedJson = JSON.stringify(stored);
  assert.equal(storedJson.includes(SIGNED_URL), false);
  assert.equal(storedJson.includes("TOP-SECRET-SIGNATURE"), false);
  assert.equal(storedJson.includes(ACCESS_CODE), false);
  assert.equal(stored?.job.source_url, "attachment://local-media");
  assert.equal(stored?.job.provider_data_deleted, false);
  assert.equal(stored?.segments[0]?.text, TRANSCRIPT_MARKER);
});

test("provider cleanup failure remains explicit instead of being silently reported as deleted", async () => {
  const store = new CaptureStore();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 60),
    null,
    null as never,
    { store, attachmentPipeline: attachmentPipeline() }
  );

  const job = await service.startAttachment({
    openaiFileIdRefs: [{
      id: "file-cleanup-state",
      name: "cleanup-state.wav",
      mime_type: "audio/wav",
      download_link: "https://eu.oaiusercontent.com/opaque-cleanup-state"
    }],
    language_hint: "en",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(job.provider_data_deleted, false);
  const stored = await store.get(job.job_id);
  assert.equal(stored?.job.provider_data_deleted, false);
});

test("AssemblyAI media paths retain provider-delete and local-temp cleanup guards", async () => {
  const [attachment, facebook, telegram, client] = await Promise.all([
    readFile("src/attachment_managed_pipeline.ts", "utf8"),
    readFile("src/facebook_managed_pipeline.ts", "utf8"),
    readFile("src/telegram_managed_pipeline.ts", "utf8"),
    readFile("src/media_client_ingest.ts", "utf8")
  ]);

  assert.match(attachment, /finally\s*\{[\s\S]*transcriber\.delete\(transcriptId\)[\s\S]*rm\(directory/);
  assert.match(facebook, /finally\s*\{[\s\S]*transcriber\.delete\(transcriptId\)[\s\S]*rm\(downloaded\.directory/);
  assert.match(telegram, /finally\s*\{[\s\S]*transcriber\.delete\(transcriptId\)/);
  assert.match(client, /finally\s*\{[\s\S]*transcriber\.delete\(providerTranscriptId\)[\s\S]*rm\(directory/);
});

test("durable schema does not persist attachment download links or raw beta access codes", async () => {
  const persistence = await readFile("src/managed_media_persistence.ts", "utf8");
  assert.doesNotMatch(persistence, /download_link/);
  assert.doesNotMatch(persistence, /beta_access_code/);
  assert.match(persistence, /access_code_digest/);
  assert.match(persistence, /request_key/);
});
