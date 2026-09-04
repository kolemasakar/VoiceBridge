import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MANAGED_ATTACHMENT_MAX_BYTES,
  downloadManagedAttachment
} from "../src/attachment_managed_pipeline.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const REF = {
  name: "sample.mp4",
  id: "file_runtime_test",
  mime_type: "video/mp4",
  download_link: "https://sdmntprcacentral.oaiusercontent.com/opaque/runtime/path?sig=redacted"
};

test("A9.10 full attachment downloader accepts regional OpenAI host and opaque path", async () => {
  const result = await downloadManagedAttachment(REF, async () => new Response(
    Buffer.from("0123456789"),
    { status: 200, headers: { "content-type": "video/mp4", "content-length": "10" } }
  ));
  assert.equal(result.fileClass, "video");
  assert.equal(result.extension, ".mp4");
  assert.equal(result.responseMime, "video/mp4");
  assert.equal(result.bytes.length, 10);
});

test("A9.10 full attachment downloader rejects lookalike hosts", async () => {
  await assert.rejects(
    () => downloadManagedAttachment({
      ...REF,
      download_link: "https://evil-oaiusercontent.com/file.mp4"
    }, async () => new Response(Buffer.from("x"), { status: 200, headers: { "content-type": "video/mp4" } })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_DOWNLOAD_URL_REJECTED"
  );
});

test("A9.10 full attachment downloader rejects declared oversize content before body read", async () => {
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(
      Buffer.from("x"),
      {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(MANAGED_ATTACHMENT_MAX_BYTES + 1)
        }
      }
    )),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_FILE_TOO_LARGE"
  );
});

test("A9.10 full attachment downloader rejects redirects and MIME mismatch", async () => {
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.com/file.mp4" }
    })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_DOWNLOAD_REDIRECT_BLOCKED"
  );
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(Buffer.from("x"), {
      status: 200,
      headers: { "content-type": "audio/mpeg" }
    })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_MIME_MISMATCH"
  );
});
