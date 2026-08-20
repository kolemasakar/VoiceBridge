import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  parseManagedMediaNativeInput,
  parseManagedMediaPreflightInput,
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
            text: "Тестовий сегмент",
            confidence: null
          }
        ],
        transcript_text: "Тестовий сегмент",
        billable_credits: 1
      };
    }
  };
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
  assert.equal(job.segment_count, 1);
  assert.equal(job.ai_fallback_requires_new_consent, true);

  const page = service.page(job.job_id, 0, 20);
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
  assert.equal(job.ai_fallback_requires_new_consent, true);
  assert.equal(job.segment_count, 0);
});
