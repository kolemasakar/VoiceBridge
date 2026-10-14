import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService, managedMediaAccessDigest, managedMediaRequestKey,
  parseManagedMediaNativeInput,
  type ManagedMediaStoredRecord, type ManagedMediaJobStore
} from "../src/managed_media_service.js";
import { normalizeMediaUrl } from "../src/media_transcript.js";

const access = "abcdefghijkl";
const source = normalizeMediaUrl("https://youtu.be/leasecheck123");
function request() {
  const input = parseManagedMediaNativeInput({
    url: source, language_hint: "auto", beta_access_code: access,
    credit_consent: { provider: "supadata", mode: "native", max_credits: 1 }
  });
  assert.ok(input);
  return input;
}
function processing(): ManagedMediaStoredRecord {
  const now = new Date().toISOString();
  return {
    job: {
      job_id: "KRCM_leasecheck", status: "PROCESSING",
      created_at: now, updated_at: now, source_url: source,
      language_hint: "auto", provider: "supadata", provider_mode: "native",
      detected_language: null, available_languages: [], credits_charged: 0,
      credits_remaining_estimate: 99, credit_charge_uncertain: true,
      reused: false, segment_count: 0, transcript_characters: 0,
      ai_fallback_requires_new_consent: true, error: null
    },
    requestKey: managedMediaRequestKey(source, "auto", access),
    accessCodeDigest: managedMediaAccessDigest(access),
    segments: [], expiresAt: new Date(Date.now() + 3600_000).toISOString()
  };
}
class LeaseStore implements ManagedMediaJobStore {
  readonly durable = true; readonly kind = "postgres" as const;
  state = processing(); active = true; reconciles = 0;
  async ready() {}
  async purgeExpired() {}
  async findByRequestKey(key: string) {
    return key === this.state.requestKey ? structuredClone(this.state) : null;
  }
  async reserve(record: ManagedMediaStoredRecord) {
    return {created: false, record: structuredClone(this.state)};
  }
  async put(record: ManagedMediaStoredRecord) {this.state = structuredClone(record);}
  async get(id: string) {
    return id === this.state.job.job_id ? structuredClone(this.state) : null;
  }
  async reconcileProcessing(_existing: ManagedMediaStoredRecord, failed: ManagedMediaStoredRecord) {
    this.reconciles++;
    if (!this.active) this.state = structuredClone(failed);
    return structuredClone(this.state);
  }
}
function makeService(store: LeaseStore) {
  let calls = 0;
  const provider = {
    async quoteNative() {
      calls++;
      throw new Error("No quote is permitted for a reused lease");
    },
    async getNativeTranscript() {
      calls++;
      throw new Error("No transcript is permitted for a reused lease");
    }
  };
  return { app: new ManagedMediaService(new MediaBetaGate([access]), null, provider, {store}),
    calls: () => calls };
}
test("active lease in another process is reused as PROCESSING without fake failure or provider work", async () => {
  const store = new LeaseStore();
  const {app,calls} = makeService(store);
  const result = await app.startNative(request());
  assert.equal(result.status, "PROCESSING");
  assert.equal(result.reused, true);
  assert.equal(store.state.job.status, "PROCESSING");
  assert.equal(store.reconciles, 1);
  assert.equal(calls(), 0);
});
test("expired lease is atomically reconciled as non-retryable FAILED with no replay", async () => {
  const store = new LeaseStore(); store.active = false;
  const {app,calls} = makeService(store);
  const result = await app.startNative(request());
  assert.equal(result.status, "FAILED");
  assert.equal(result.error?.code, "MANAGED_PROVIDER_RESULT_UNCERTAIN_RETRY_BLOCKED");
  assert.equal(result.error?.retryable, false);
  assert.equal(store.reconciles, 1);
  assert.equal(calls(), 0);
});