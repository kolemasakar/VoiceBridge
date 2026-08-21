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
import { MediaTranscriptError } from "../src/media_transcript.js";

const ACCESS_CODE = "abcdefghijkl";

const unavailableProvider: ManagedNativeTranscriptProvider = {
  async quoteNative() {
    return {
      provider: "supadata",
      mode: "native",
      plan: "Free",
      max_credits: 100,
      used_credits: 7,
      remaining_credits: 93,
      estimated_credits: 1,
      remaining_after_estimate: 92,
      consent_required: true,
      can_continue: true
    };
  },
  async getNativeTranscript() {
    return {
      status: "unavailable",
      billable_credits: 1
    };
  },
  async quoteGenerateInstagramReel() {
    return {
      provider: "supadata",
      mode: "generate",
      plan: "Free",
      max_credits: 100,
      used_credits: 8,
      remaining_credits: 92,
      estimated_credits: 40,
      maximum_credits: 40,
      credits_per_minute: 2,
      maximum_duration_minutes: 20,
      remaining_after_estimate: 52,
      conservative_maximum: true,
      consent_required: true,
      can_continue: true
    };
  },
  async getGeneratedTranscript() {
    throw new Error("Facebook AI fallback must not be called");
  }
};

test("managed Facebook direct URL forms canonicalize for stable request identity", () => {
  assert.equal(
    normalizeManagedMediaUrl("https://m.facebook.com/reel/1234567890/?mibextid=test#fragment"),
    "https://www.facebook.com/reel/1234567890/"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://www.facebook.com/watch/?v=1234567890&utm_source=test"),
    "https://www.facebook.com/watch/?v=1234567890"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://web.facebook.com/example.page/videos/987654321/?ref=sharing"),
    "https://www.facebook.com/example.page/videos/987654321/"
  );
  assert.equal(
    managedMediaPlatform("https://www.facebook.com/reel/1234567890/"),
    "facebook"
  );
});

test("managed Facebook app share and fb.watch links are accepted", () => {
  assert.equal(
    normalizeManagedMediaUrl("https://www.facebook.com/share/r/1BMf76tsxW/?mibextid=wwXIfr"),
    "https://www.facebook.com/share/r/1BMf76tsxW/"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://facebook.com/share/v/1AbCdEfGhIj/?mibextid=abc"),
    "https://www.facebook.com/share/v/1AbCdEfGhIj/"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://m.facebook.com/share/p/xyz789/?mibextid=abc"),
    "https://www.facebook.com/share/p/xyz789/"
  );
  assert.equal(
    normalizeManagedMediaUrl("https://fb.watch/AbCdEfGhIj/?mibextid=abc"),
    "https://fb.watch/AbCdEfGhIj/"
  );
  assert.equal(managedMediaPlatform("https://fb.watch/AbCdEfGhIj/"), "facebook");
});

test("managed Facebook adapter rejects login, groups, profiles and non-HTTPS", () => {
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/login/"));
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/groups/private-group/videos/123/"));
  assert.throws(() => normalizeManagedMediaUrl("https://facebook.com/example.profile/"));
  assert.throws(() => normalizeManagedMediaUrl("http://facebook.com/reel/1234567890/"));
});

test("managed request parser accepts Facebook Reel with owner code injection contract", () => {
  const input = parseManagedMediaPreflightInput({
    url: "https://m.facebook.com/reel/1234567890/?mibextid=test",
    beta_access_code: ACCESS_CODE,
    language_hint: "auto"
  });
  assert.ok(input);
  assert.equal(input.url, "https://www.facebook.com/reel/1234567890/");
});

test("Facebook native-unavailable stop does not enable Instagram-only AI fallback", async () => {
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    unavailableProvider
  );
  const job = await service.startNative({
    url: "https://www.facebook.com/reel/1234567890/",
    language_hint: "auto",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.equal(job.status, "AWAITING_AI_CONSENT");
  await assert.rejects(
    () => service.aiPreflight(job.job_id, ACCESS_CODE),
    (error: unknown) => {
      assert.ok(error instanceof MediaTranscriptError);
      assert.equal(error.code, "MEDIA_AI_SOURCE_NOT_SUPPORTED");
      assert.equal(error.httpStatus, 422);
      return true;
    }
  );
});
