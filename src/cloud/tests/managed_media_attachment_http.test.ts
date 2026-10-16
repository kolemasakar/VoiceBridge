import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import type { OpenAiConversationFileRef } from "../src/managed_attachment_probe.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import { ManagedMediaService } from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";

const ACTION_TOKEN = "managed-action-token-attachment-123456";
const ACCESS_CODE = "abcdefghijkl";
const REF: OpenAiConversationFileRef = {
  name: "sample.mp4",
  id: "file_runtime_attachment_test",
  mime_type: "video/mp4",
  download_link: "https://sdmntprcacentral.oaiusercontent.com/opaque/path?sig=test"
};

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-attachment-123456",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaDailySttSeconds: 7200,
  mediaMaxDurationSeconds: 3600,
  assemblyAiApiKey: null,
  supadataApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

class FakeAttachmentPipeline implements ManagedAttachmentPipeline {
  readonly configured = true;
  calls = 0;
  async transcribe(
    _file: OpenAiConversationFileRef,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void
  ) {
    this.calls += 1;
    reserveSttSeconds(7.2);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "en",
      language_confidence: 0.98,
      duration_seconds: 7.2,
      transcript_text: "Local attachment transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: 7200,
        text: "Local attachment transcript",
        confidence: 0.97
      }]
    };
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${ACTION_TOKEN}`,
    "content-type": "application/json"
  };
}

test("A9.10 managed attachment HTTP route creates durable-compatible KRCM result and reuses duplicate", async () => {
  const pipeline = new FakeAttachmentPipeline();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { attachmentPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer((request, response) => { void handler.handle(request, response); });
  const base = await listen(server);
  try {
    const capabilityResponse = await fetch(`${base}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as Record<string, unknown>;
    assert.equal(capability.local_attachment_transport, true);
    assert.equal(capability.local_attachment_retrieval_provider, "openai_attachment");

    const body = JSON.stringify({ openaiFileIdRefs: [REF], language_hint: "auto" });
    const startResponse = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body
    });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json() as Record<string, unknown>;
    assert.equal(started.status, "COMPLETED");
    assert.equal(started.source_url, "attachment://local-media");
    assert.equal(started.provider_mode, "attachment_upload_stt");
    assert.equal(started.retrieval_provider, "openai_attachment");
    assert.equal(started.retrieval_credits_charged, 0);
    assert.equal(started.stt_seconds_charged, 8);
    assert.equal(started.provider_data_deleted, true);
    const jobId = String(started.job_id);

    const segmentsResponse = await fetch(
      `${base}/api/v1/media/managed/transcriptions/${jobId}/segments?cursor=0&limit=20`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}` } }
    );
    assert.equal(segmentsResponse.status, 200);
    const page = await segmentsResponse.json() as { segments?: Array<{ text?: string }> };
    assert.equal(page.segments?.[0]?.text, "Local attachment transcript");

    const duplicate = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body
    });
    assert.equal(duplicate.status, 200);
    const reused = await duplicate.json() as Record<string, unknown>;
    assert.equal(reused.job_id, jobId);
    assert.equal(reused.reused, true);
    assert.equal(pipeline.calls, 1);

    const invalid = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ openaiFileIdRefs: ["literal-placeholder"], language_hint: "auto" })
    });
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});
