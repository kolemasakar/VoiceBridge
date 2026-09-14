import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../src/config.js";
import { FreeTierSupadataProvider } from "../src/free_tier_supadata_provider.js";
import { managedMediaPlatform } from "../src/managed_media_url.js";
import {
  derivePublicMediaAdmissionCode,
  PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS,
  PUBLIC_MEDIA_MAX_DAILY_STT_SECONDS,
  PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE,
  PublicMediaAdmissionController,
  SUPADATA_FREE_MONTHLY_CREDITS
} from "../src/public_media_admission.js";
import {
  SupadataProvider,
  type SupadataAccountInfo,
  type SupadataNativeCreditQuote
} from "../src/supadata_provider.js";

const ACTION_TOKEN = "public-action-token-2026-0123456789";

function publicEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    TEST_ACCESS_TOKEN: "test-access-token-0123456789",
    KRC_MEDIA_ACTION_TOKEN: ACTION_TOKEN,
    KRC_MEDIA_PUBLIC_MODE: "true",
    KRC_MEDIA_FREE_TIER_ONLY: "true",
    KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY: "true",
    ASSEMBLYAI_API_KEY: "assemblyai-free-trial-key",
    SUPADATA_API_KEY: "supadata-free-key",
    KRC_MEDIA_COBALT_ENDPOINT: "https://cobalt.example.test",
    KRC_MEDIA_BETA_CODES: "legacy-owner-code-should-not-be-public",
    RATE_LIMIT_REQUESTS_PER_MINUTE: "999",
    MEDIA_MAX_CONCURRENT_JOBS: "20",
    MEDIA_DAILY_STT_SECONDS: "86400",
    ...overrides
  };
}

function request(url: string, token = ACTION_TOKEN): IncomingMessage {
  return {
    url,
    method: "GET",
    headers: { authorization: `Bearer ${token}` }
  } as IncomingMessage;
}

function responseFixture(): {
  response: ServerResponse;
  state: { ended: boolean; body: string; headers: Record<string, string> };
} {
  const state = { ended: false, body: "", headers: {} as Record<string, string> };
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string | number) {
      state.headers[name.toLowerCase()] = String(value);
    },
    end(body?: string) {
      state.ended = true;
      state.body = body || "";
    }
  } as unknown as ServerResponse;
  return { response, state };
}

test("public MEDIA config is server-authenticated, free-tier-only and globally clamped", () => {
  const config = loadConfig(publicEnvironment());
  assert.equal(config.mediaPublicMode, true);
  assert.equal(config.mediaFreeTierOnly, true);
  assert.equal(config.mediaAssemblyAiFreeTrialOnly, true);
  assert.deepEqual(config.mediaBetaCodes, [derivePublicMediaAdmissionCode(ACTION_TOKEN)]);
  assert.notEqual(config.mediaBetaCodes?.[0], "legacy-owner-code-should-not-be-public");
  assert.equal(config.rateLimitRequestsPerMinute, PUBLIC_MEDIA_MAX_REQUESTS_PER_MINUTE);
  assert.equal(config.mediaMaxConcurrentJobs, PUBLIC_MEDIA_MAX_CONCURRENT_REQUESTS);
  assert.equal(config.mediaDailySttSeconds, PUBLIC_MEDIA_MAX_DAILY_STT_SECONDS);
});

test("public MEDIA refuses paid retrieval and missing free-tier attestations", () => {
  assert.throws(
    () => loadConfig(publicEnvironment({ SCRAPECREATORS_API_KEY: "paid-key" })),
    /forbids SCRAPECREATORS_API_KEY/
  );
  assert.throws(
    () => loadConfig(publicEnvironment({ KRC_MEDIA_FREE_TIER_ONLY: "false" })),
    /requires KRC_MEDIA_FREE_TIER_ONLY=true/
  );
  assert.throws(
    () => loadConfig(publicEnvironment({ KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY: "false" })),
    /requires KRC_MEDIA_ASSEMBLYAI_FREE_TRIAL_ONLY=true/
  );
});

test("public MEDIA platform boundary covers YouTube Telegram Instagram and Facebook video URLs", () => {
  assert.equal(managedMediaPlatform("https://youtu.be/abc123"), "youtube");
  assert.equal(managedMediaPlatform("https://t.me/publicchannel/123"), "telegram");
  assert.equal(managedMediaPlatform("https://www.instagram.com/reel/ABC123/"), "instagram");
  assert.equal(managedMediaPlatform("https://www.facebook.com/reel/123456789/"), "facebook");
});

test("public MEDIA admission enforces shared free-tier rate/concurrency without touching Core routes", () => {
  const config = loadConfig(publicEnvironment({ RATE_LIMIT_REQUESTS_PER_MINUTE: "60" }));
  let now = 1_000_000;
  const controller = new PublicMediaAdmissionController(config, () => now);

  const firstResponse = responseFixture();
  const first = controller.admit(request("/api/v1/media/managed"), firstResponse.response);
  assert.equal(first.handled, false);
  assert.equal(firstResponse.state.ended, false);

  now += 1000;
  const concurrentResponse = responseFixture();
  const concurrent = controller.admit(
    request("/api/v1/media/managed/preflight"),
    concurrentResponse.response
  );
  assert.equal(concurrent.handled, true);
  assert.equal((concurrentResponse.response as unknown as { statusCode: number }).statusCode, 429);
  assert.match(concurrentResponse.state.body, /MEDIA_PUBLIC_CONCURRENCY_LIMIT/);

  first.release();
  now += 1000;
  const secondResponse = responseFixture();
  const second = controller.admit(
    request("/api/v1/media/managed/preflight"),
    secondResponse.response
  );
  assert.equal(second.handled, false);
  second.release();

  const tooFastResponse = responseFixture();
  const tooFast = controller.admit(
    request("/api/v1/media/managed/preflight"),
    tooFastResponse.response
  );
  assert.equal(tooFast.handled, true);
  assert.match(tooFastResponse.state.body, /MEDIA_PUBLIC_FREE_TIER_RATE_LIMIT/);

  const coreResponse = responseFixture();
  const core = controller.admit(request("/api/v1/health"), coreResponse.response);
  assert.equal(core.handled, false);
  assert.equal(coreResponse.state.ended, false);
});

class FixtureSupadata extends SupadataProvider {
  account: SupadataAccountInfo = {
    organization_id: "org",
    plan: "free",
    max_credits: SUPADATA_FREE_MONTHLY_CREDITS,
    used_credits: 0,
    remaining_credits: SUPADATA_FREE_MONTHLY_CREDITS
  };
  nativeCalls = 0;

  constructor() {
    super("fixture-key", "http://localhost:9");
  }

  override async getAccount(): Promise<SupadataAccountInfo> {
    return { ...this.account };
  }

  override async quoteNative(): Promise<SupadataNativeCreditQuote> {
    const remaining = this.account.remaining_credits;
    return {
      provider: "supadata",
      mode: "native",
      plan: this.account.plan,
      max_credits: this.account.max_credits,
      used_credits: this.account.used_credits,
      remaining_credits: remaining,
      estimated_credits: 1,
      remaining_after_estimate: Math.max(0, remaining - 1),
      consent_required: true,
      can_continue: remaining >= 1
    };
  }

  override async getNativeTranscript() {
    this.nativeCalls += 1;
    return { status: "unavailable" as const, billable_credits: 1 };
  }
}

test("Supadata public wrapper refuses paid plans before a credit-consuming request", async () => {
  const fixture = new FixtureSupadata();
  const provider = new FreeTierSupadataProvider(fixture);

  const freeQuote = await provider.quoteNative();
  assert.equal(freeQuote.plan, "free");

  fixture.account = {
    ...fixture.account,
    plan: "basic",
    max_credits: 300,
    remaining_credits: 300
  };

  await assert.rejects(
    () => provider.getNativeTranscript("https://youtu.be/abc", "auto"),
    (error: unknown) =>
      (error as { code?: string }).code === "MANAGED_PROVIDER_FREE_TIER_REQUIRED"
  );
  assert.equal(fixture.nativeCalls, 0);
});
