import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ManagedMediaService,
  parseManagedMediaPreflightInput,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";
import {
  managedMediaPlatform,
  normalizeManagedMediaUrl
} from "../src/managed_media_url.js";
import { MediaBetaGate } from "../src/media_beta.js";

const ACCESS_CODE = "abcdefghijkl";

class FacebookFallbackProvider implements ManagedNativeTranscriptProvider {
  nativeCalls = 0;
  metadataCalls = 0;
  aiCalls = 0;
  async quoteNative() {
    return { provider: "supadata" as const, mode: "native" as const, plan: "Free", max_credits: 100, used_credits: 9, remaining_credits: 91, estimated_credits: 1 as const, remaining_after_estimate: 90, consent_required: true as const, can_continue: true };
  }
  async getNativeTranscript() {
    this.nativeCalls += 1;
    return { status: "unavailable" as const, billable_credits: 1 };
  }
  async quoteMetadata() {
    return { provider: "supadata" as const, mode: "metadata" as const, plan: "Free", max_credits: 100, used_credits: 10, remaining_credits: 90, estimated_credits: 1 as const, remaining_after_estimate: 89, consent_required: true as const, can_continue: true };
  }
  async getMetadataDuration() {
    this.metadataCalls += 1;
    return { duration_seconds: 143, billable_credits: 1 };
  }
  async quoteGenerateForDuration(durationSeconds: number) {
    assert.equal(durationSeconds, 143);
    return { provider: "supadata" as const, mode: "generate" as const, plan: "Free", max_credits: 100, used_credits: 11, remaining_credits: 89, estimated_credits: 6, maximum_credits: 6, credits_per_minute: 2, maximum_duration_minutes: 3, remaining_after_estimate: 83, conservative_maximum: true as const, consent_required: true as const, can_continue: true };
  }
  async getGeneratedTranscript(_url: string, approvedMaxCredits?: number) {
    this.aiCalls += 1;
    assert.equal(approvedMaxCredits, 6);
    return { status: "completed" as const, language: "en", available_languages: ["en"], segments: [{ index: 0, start_ms: 0, end_ms: 143000, text: "Facebook AI transcript", confidence: null }], transcript_text: "Facebook AI transcript", billable_credits: 6 };
  }
}

test("managed Facebook URL forms canonicalize for stable request identity", () => {
  assert.equal(normalizeManagedMediaUrl("https://m.facebook.com/reel/1234567890/?mibextid=test#fragment"), "https://www.facebook.com/reel/1234567890/");
  assert.equal(normalizeManagedMediaUrl("https://www.facebook.com/watch/?v=1234567890&utm_source=test"), "https://www.facebook.com/watch/?v=1234567890");
  assert.equal(normalizeManagedMediaUrl("https://web.facebook.com/example.page/videos/987654321/?ref=sharing"), "https://www.facebook.com/example.page/videos/987654321/");
  assert.equal(normalizeManagedMediaUrl("https://www.facebook.com/share/r/1BMf76tsxW/?mibextid=wwXIfr"), "https://www.facebook.com/share/r/1BMf76tsxW/");
  assert.equal(normalizeManagedMediaUrl("https://fb.watch/AbCdEfGhIj/?mibextid=abc"), "https://fb.watch/AbCdEfGhIj/");
  assert.equal(managedMediaPlatform("https://www.facebook.com/reel/1234567890/"), "facebook");
});

test("managed Facebook adapter rejects login, groups, profiles and non-HTTPS", () => {
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/login/"));
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/groups/private-group/videos/123/"));
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/example.profile/"));
  assert.throws(() => normalizeManagedMediaUrl("http://facebook.com/reel/1234567890/"));
});

test("managed request parser accepts Facebook Reel", () => {
  const input = parseManagedMediaPreflightInput({ url: "https://m.facebook.com/reel/1234567890/?mibextid=test", beta_access_code: ACCESS_CODE, language_hint: "auto" });
  assert.ok(input);
  assert.equal(input.url, "https://www.facebook.com/reel/1234567890/");
});

test("Facebook AI fallback requires separately consented metadata duration and exact dynamic AI cap", async () => {
  const provider = new FacebookFallbackProvider();
  const service = new ManagedMediaService(new MediaBetaGate([ACCESS_CODE]), null, provider);
  const native = await service.startNative({ url: "https://www.facebook.com/reel/1234567890/", language_hint: "auto", beta_access_code: ACCESS_CODE, credit_consent: { provider: "supadata", mode: "native", max_credits: 1 } });
  assert.equal(native.status, "AWAITING_AI_CONSENT");
  assert.equal(native.credits_charged, 1);
  assert.equal(provider.nativeCalls, 1);

  const metadataQuote = await service.facebookMetadataPreflight(native.job_id, ACCESS_CODE);
  assert.equal(metadataQuote.estimated_credits, 1);
  assert.equal(provider.metadataCalls, 0);

  const metadata = await service.startFacebookMetadata(native.job_id, { beta_access_code: ACCESS_CODE, credit_consent: { provider: "supadata", mode: "metadata", max_credits: 1 } });
  assert.equal(metadata.status, "AWAITING_AI_CONSENT");
  assert.equal(metadata.media_duration_seconds, 143);
  assert.equal(metadata.ai_credit_ceiling, 6);
  assert.equal(metadata.metadata_credits_charged, 1);
  assert.equal(metadata.credits_charged, 2);
  assert.equal(provider.metadataCalls, 1);

  const metadataDuplicate = await service.startFacebookMetadata(native.job_id, { beta_access_code: ACCESS_CODE, credit_consent: { provider: "supadata", mode: "metadata", max_credits: 1 } });
  assert.equal(metadataDuplicate.reused, true);
  assert.equal(provider.metadataCalls, 1);

  const aiQuote = await service.aiPreflight(native.job_id, ACCESS_CODE);
  assert.equal(aiQuote.estimate_basis, "facebook_metadata_duration");
  assert.equal(aiQuote.media_duration_seconds, 143);
  assert.equal(aiQuote.maximum_credits, 6);

  const completed = await service.startAi(native.job_id, { beta_access_code: ACCESS_CODE, credit_consent: { provider: "supadata", mode: "generate", max_credits: 6 } });
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.credits_charged, 8);
  assert.equal(completed.segment_count, 1);
  assert.equal(provider.aiCalls, 1);

  const duplicate = await service.startAi(native.job_id, { beta_access_code: ACCESS_CODE, credit_consent: { provider: "supadata", mode: "generate", max_credits: 6 } });
  assert.equal(duplicate.reused, true);
  assert.equal(provider.aiCalls, 1);
});
