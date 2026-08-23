import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import { MediaTranscriptError } from "../src/media_transcript.js";
import {
  ManagedMediaService,
  type ManagedNativeTranscriptProvider
} from "../src/managed_media_service.js";
import { SupadataProvider } from "../src/supadata_provider.js";

const ACCESS_CODE = "abcdefghijkl";

async function withMockServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("Supadata classifies HTTP 200 empty generated transcript separately", async () => {
  let accountReads = 0;
  await withMockServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/me") {
      accountReads += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        organizationId: "org-empty",
        plan: "Free",
        maxCredits: 100,
        usedCredits: 22
      }));
      return;
    }
    assert.equal(url.pathname, "/transcript");
    response.writeHead(200, {
      "content-type": "application/json",
      "x-billable-requests": "2"
    });
    response.end(JSON.stringify({
      lang: "uk",
      availableLangs: ["uk"],
      content: []
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl, 0, 2);
    await assert.rejects(
      provider.getGeneratedTranscript(
        "https://www.facebook.com/reel/5555555555/",
        2
      ),
      (error: unknown) => {
        assert.ok(error instanceof MediaTranscriptError);
        assert.equal(error.code, "MANAGED_PROVIDER_TRANSCRIPT_EMPTY");
        assert.equal(error.retryable, false);
        return true;
      }
    );
    assert.equal(accountReads, 1);
  });
});

class FacebookEmptyAiProvider implements ManagedNativeTranscriptProvider {
  aiCalls = 0;
  aiFailed = false;

  async quoteNative() {
    return {
      provider: "supadata" as const,
      mode: "native" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 19,
      remaining_credits: 81,
      estimated_credits: 1 as const,
      remaining_after_estimate: 80,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getNativeTranscript() {
    return { status: "unavailable" as const, billable_credits: 1 };
  }

  async quoteMetadata() {
    return {
      provider: "supadata" as const,
      mode: "metadata" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 20,
      remaining_credits: 80,
      estimated_credits: 1 as const,
      remaining_after_estimate: 79,
      consent_required: true as const,
      can_continue: true
    };
  }

  async getMetadataDuration() {
    return { duration_seconds: 22, billable_credits: 1 };
  }

  async quoteGenerateForDuration(durationSeconds: number) {
    assert.equal(durationSeconds, 22);
    const remaining = this.aiFailed ? 78 : 80;
    return {
      provider: "supadata" as const,
      mode: "generate" as const,
      plan: "Free",
      max_credits: 100,
      used_credits: 100 - remaining,
      remaining_credits: remaining,
      estimated_credits: 2,
      maximum_credits: 2,
      credits_per_minute: 2,
      maximum_duration_minutes: 1,
      remaining_after_estimate: Math.max(0, remaining - 2),
      conservative_maximum: true as const,
      consent_required: true as const,
      can_continue: remaining >= 2
    };
  }

  async getGeneratedTranscript(_url: string, approvedMaxCredits?: number) {
    this.aiCalls += 1;
    assert.equal(approvedMaxCredits, 2);
    this.aiFailed = true;
    throw new MediaTranscriptError(
      "MANAGED_PROVIDER_TRANSCRIPT_EMPTY",
      "The managed transcript provider returned an empty transcript.",
      422,
      false
    );
  }
}

test("Facebook AI failure reconciles provider charge and preserves empty-transcript classification", async () => {
  const provider = new FacebookEmptyAiProvider();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE]),
    null,
    provider
  );

  const native = await service.startNative({
    url: "https://www.facebook.com/reel/5555555555/",
    language_hint: "auto",
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "native",
      max_credits: 1
    }
  });
  assert.equal(native.status, "AWAITING_AI_CONSENT");
  assert.equal(native.credits_charged, 1);

  const metadata = await service.startFacebookMetadata(native.job_id, {
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "metadata",
      max_credits: 1
    }
  });
  assert.equal(metadata.media_duration_seconds, 22);
  assert.equal(metadata.ai_credit_ceiling, 2);
  assert.equal(metadata.credits_charged, 2);

  const failed = await service.startAi(native.job_id, {
    beta_access_code: ACCESS_CODE,
    credit_consent: {
      provider: "supadata",
      mode: "generate",
      max_credits: 2
    }
  });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.provider_mode, "generate");
  assert.equal(failed.credits_charged, 4);
  assert.equal(failed.credits_remaining_estimate, 78);
  assert.equal(failed.credit_charge_uncertain, false);
  assert.equal(failed.error?.code, "MANAGED_PROVIDER_TRANSCRIPT_EMPTY");
  assert.equal(failed.error?.retryable, false);
  assert.equal(provider.aiCalls, 1);
});
