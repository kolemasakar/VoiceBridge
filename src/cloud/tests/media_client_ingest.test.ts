import assert from "node:assert/strict";
import test from "node:test";
import { MediaBetaGate } from "../src/media_beta.js";
import {
  MediaClientIngestService,
  mediaClientSourceMatches
} from "../src/media_client_ingest.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const CODE_A = "owner-beta-code-0001";
const CODE_B = "tester-beta-code-0002";

function service(maxConcurrentJobs = 2): MediaClientIngestService {
  return new MediaClientIngestService({
    assemblyAiApiKey: "test-key-not-used-by-start",
    betaGate: new MediaBetaGate([CODE_A, CODE_B], 7200),
    maxDurationSeconds: 3600,
    jobTtlSeconds: 3600,
    maxConcurrentJobs
  });
}

test("client source matching accepts equivalent YouTube video URLs", () => {
  assert.equal(
    mediaClientSourceMatches(
      "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
      "https://youtu.be/DZLzmQ2kwaA?t=5"
    ),
    true
  );
  assert.equal(
    mediaClientSourceMatches(
      "https://www.youtube.com/shorts/DZLzmQ2kwaA",
      "https://www.youtube.com/watch?v=DZLzmQ2kwaA&feature=share"
    ),
    true
  );
  assert.equal(
    mediaClientSourceMatches(
      "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
      "https://www.youtube.com/watch?v=OTHER12345"
    ),
    false
  );
});

test("client-assisted start waits for browser upload and reuses same tester request", () => {
  const ingest = service();
  const input = {
    url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
    language_hint: "auto" as const,
    beta_access_code: CODE_A
  };
  const first = ingest.start(input);
  const second = ingest.start(input);

  assert.equal(first.reused, false);
  assert.equal(first.job.status, "AWAITING_CLIENT");
  assert.equal(first.job.client_upload_required, true);
  assert.equal(first.job.ingress_mode, "client_assisted");
  assert.equal(first.job.job_id.startsWith("KRCC_"), true);
  assert.equal(second.reused, true);
  assert.equal(second.job.job_id, first.job.job_id);
});

test("different beta testers do not share a client-assisted request", () => {
  const ingest = service();
  const first = ingest.start({
    url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
    language_hint: "uk",
    beta_access_code: CODE_A
  });
  const second = ingest.start({
    url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
    language_hint: "uk",
    beta_access_code: CODE_B
  });

  assert.notEqual(second.job.job_id, first.job.job_id);
});

test("invalid beta access code is rejected", () => {
  const ingest = service();
  assert.throws(
    () => ingest.start({
      url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
      language_hint: "en",
      beta_access_code: "invalid-code-0000"
    }),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_BETA_ACCESS_DENIED"
  );
});

test("browser upload must match the job YouTube source", () => {
  const ingest = service();
  const started = ingest.start({
    url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
    language_hint: "ru",
    beta_access_code: CODE_A
  });

  assert.throws(
    () => ingest.acceptAudio(
      started.job.job_id,
      CODE_A,
      "https://www.youtube.com/watch?v=OTHER12345",
      "audio/webm",
      Buffer.from("not-media")
    ),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_CLIENT_SOURCE_MISMATCH"
  );
});

test("browser upload rejects empty audio before background STT starts", () => {
  const ingest = service();
  const started = ingest.start({
    url: "https://www.youtube.com/watch?v=DZLzmQ2kwaA",
    language_hint: "auto",
    beta_access_code: CODE_A
  });

  assert.throws(
    () => ingest.acceptAudio(
      started.job.job_id,
      CODE_A,
      "https://youtu.be/DZLzmQ2kwaA",
      "audio/webm",
      Buffer.alloc(0)
    ),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_CLIENT_AUDIO_SIZE_INVALID"
  );
});
