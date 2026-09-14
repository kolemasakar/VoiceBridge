import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FacebookMediaRetrievalError,
  type FacebookMediaAsset,
  type FacebookMediaRetriever
} from "../src/facebook_media_retrieval.js";
import {
  AssemblyAiFacebookMediaStt,
  DefaultManagedFacebookPipeline,
  type ManagedFacebookPipeline,
  type ManagedFacebookSttResult
} from "../src/facebook_managed_pipeline.js";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  ManagedMediaService,
  managedFacebookFallbackRequestKey
} from "../src/managed_media_service.js";

const ACCESS_CODE = "OWNER_A97B_TEST_2026";
const FACEBOOK_URL = "https://www.facebook.com/reel/1114235920664408/";

function cobaltAsset(): FacebookMediaAsset {
  return {
    source_url: FACEBOOK_URL,
    media_url: "https://video.example.test/cobalt.mp4",
    duration_seconds: null,
    provider: "cobalt",
    provider_mode: "self_hosted",
    credits_charged: 0,
    credits_remaining: null,
    cached: false
  };
}

function sttResult(durationSeconds = 22.2): ManagedFacebookSttResult {
  return {
    provider: "assemblyai",
    provider_model: "universal-2",
    provider_data_deleted: true,
    detected_language: "uk",
    language_confidence: 0.97,
    duration_seconds: durationSeconds,
    transcript_text: "Тестовий транскрипт",
    segments: [{
      index: 0,
      start_ms: 0,
      end_ms: 1000,
      text: "Тестовий транскрипт",
      confidence: 0.95
    }]
  };
}

function service(pipeline: ManagedFacebookPipeline): ManagedMediaService {
  return new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { facebookPipeline: pipeline }
  );
}

test("managed Facebook free Cobalt retrieval completes without paid fallback", async () => {
  let freeCalls = 0;
  let paidCalls = 0;
  let sttCalls = 0;
  const pipeline: ManagedFacebookPipeline = {
    configured: true,
    async freeRetrieve() {
      freeCalls += 1;
      return cobaltAsset();
    },
    async paidRetrieve() {
      paidCalls += 1;
      throw new Error("paid fallback must not run");
    },
    async transcribe(_asset, _language, reserve) {
      sttCalls += 1;
      reserve(22.2);
      return sttResult();
    }
  };

  const app = service(pipeline);
  const job = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(job.status, "COMPLETED");
  assert.equal(job.retrieval_provider, "cobalt");
  assert.equal(job.retrieval_credits_charged, 0);
  assert.equal(job.stt_seconds_charged, 23);
  assert.equal(freeCalls, 1);
  assert.equal(paidCalls, 0);
  assert.equal(sttCalls, 1);
});

test("Cobalt failure becomes terminal unavailable and never calls paid retriever", async () => {
  let freeCalls = 0;
  let paidCalls = 0;
  const freeRetriever: FacebookMediaRetriever = {
    provider: "cobalt",
    async retrieve(): Promise<never> {
      freeCalls += 1;
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_FAILED",
        "Cobalt failed",
        422,
        false,
        "cobalt",
        null,
        null,
        "4xx"
      );
    }
  };
  const paidRetriever: FacebookMediaRetriever = {
    provider: "scrapecreators",
    async retrieve(): Promise<never> {
      paidCalls += 1;
      throw new Error("reserve paid retriever must not run");
    }
  };
  const pipeline = new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    new AssemblyAiFacebookMediaStt("mock-only-key")
  );
  const app = service(pipeline);

  const failed = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "auto",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(failed.status, "FAILED");
  assert.equal(failed.error?.code, "FACEBOOK_RETRIEVAL_UNAVAILABLE");
  assert.match(failed.error?.message ?? "", /Paid fallback is disabled/i);
  assert.equal(failed.credits_charged, 0);
  assert.equal(freeCalls, 1);
  assert.equal(paidCalls, 0);

  await assert.rejects(
    app.facebookFallbackPreflight(failed.job_id, ACCESS_CODE),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "FACEBOOK_RETRIEVAL_CONSENT_NOT_APPLICABLE"
      );
      return true;
    }
  );
  assert.equal(paidCalls, 0);
});

test("terminal unavailable Facebook job is reused without replaying Cobalt or paid provider", async () => {
  let freeCalls = 0;
  let paidCalls = 0;
  const freeRetriever: FacebookMediaRetriever = {
    provider: "cobalt",
    async retrieve(): Promise<never> {
      freeCalls += 1;
      throw new FacebookMediaRetrievalError(
        "FACEBOOK_COBALT_NO_DIRECT_MEDIA",
        "no direct media",
        422,
        false,
        "cobalt",
        null,
        null,
        "2xx"
      );
    }
  };
  const paidRetriever: FacebookMediaRetriever = {
    provider: "scrapecreators",
    async retrieve(): Promise<never> {
      paidCalls += 1;
      throw new Error("paid provider must stay unused");
    }
  };
  const app = service(new DefaultManagedFacebookPipeline(
    freeRetriever,
    paidRetriever,
    new AssemblyAiFacebookMediaStt("mock-only-key")
  ));

  const first = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "uk",
    beta_access_code: ACCESS_CODE
  });
  const second = await app.startFacebookFallback({
    url: FACEBOOK_URL,
    language_hint: "uk",
    beta_access_code: ACCESS_CODE
  });

  assert.equal(first.status, "FAILED");
  assert.equal(first.error?.code, "FACEBOOK_RETRIEVAL_UNAVAILABLE");
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.reused, true);
  assert.equal(freeCalls, 1);
  assert.equal(paidCalls, 0);
});

test("Facebook fallback request key remains stable per source, language, owner access", () => {
  const first = managedFacebookFallbackRequestKey(FACEBOOK_URL, "auto", ACCESS_CODE);
  const second = managedFacebookFallbackRequestKey(FACEBOOK_URL, "auto", ACCESS_CODE);
  const otherOwner = managedFacebookFallbackRequestKey(
    FACEBOOK_URL,
    "auto",
    "OWNER_A97B_TEST_OTHER_2026"
  );
  assert.equal(first, second);
  assert.notEqual(first, otherOwner);
});
