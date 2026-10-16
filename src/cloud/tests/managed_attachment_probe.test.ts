import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import {
  MANAGED_ATTACHMENT_PROBE_MAX_BYTES,
  parseManagedAttachmentProbeInput,
  probeManagedAttachmentTransport,
  type ManagedAttachmentProbeInput,
  type ManagedAttachmentProbeRunner
} from "../src/managed_attachment_probe.js";
import { createManagedAttachmentProbeHttpHandler } from "../src/managed_attachment_probe_http.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const ACTION_TOKEN = "managed-action-token-1234567890";
const ACCESS_CODE = "abcdefghijkl";

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-123456789",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaDailySttSeconds: 7200,
  assemblyAiApiKey: null,
  supadataApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

function runtimeBody(
  overrides: Partial<ManagedAttachmentProbeInput["file"]> = {}
): Record<string, unknown> {
  return {
    openaiFileIdRefs: [{
      name: "owner-test.mp3",
      id: "file-A9_10_owner_test",
      mime_type: "audio/mpeg",
      download_link: "https://files.oaiusercontent.com/file-A9_10_owner_test?sig=redacted",
      ...overrides
    }]
  };
}

function parsedInput(): ManagedAttachmentProbeInput {
  const parsed = parseManagedAttachmentProbeInput(runtimeBody());
  assert.ok(parsed);
  return parsed;
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

test("attachment probe parser requires the runtime object form, exactly one file", () => {
  assert.equal(parseManagedAttachmentProbeInput({ openaiFileIdRefs: [] }), null);
  assert.equal(parseManagedAttachmentProbeInput({ openaiFileIdRefs: ["file-local"] }), null);
  assert.equal(
    parseManagedAttachmentProbeInput({
      openaiFileIdRefs: [runtimeBody().openaiFileIdRefs, runtimeBody().openaiFileIdRefs]
    }),
    null
  );
  assert.ok(parseManagedAttachmentProbeInput(runtimeBody()));
});

test("attachment probe accepts only OpenAI oaiusercontent subdomains and never follows redirects", async () => {
  const arbitrary = parsedInput();
  arbitrary.file.download_link = "https://attacker.example/file-A9_10_owner_test?sig=secret";
  let fetchCalls = 0;
  const neverFetch = (async () => {
    fetchCalls += 1;
    throw new Error("must not fetch");
  }) as typeof fetch;

  await assert.rejects(
    () => probeManagedAttachmentTransport(arbitrary, neverFetch),
    (error: unknown) => {
      if (!(error instanceof MediaTranscriptError)) return false;
      assert.equal(error.code, "ATTACHMENT_DOWNLOAD_URL_REJECTED");
      assert.match(error.message, /observed_host=attacker\.example/);
      assert.match(error.message, /host_ok=false/);
      assert.doesNotMatch(error.message, /A9_10_owner_test/);
      assert.doesNotMatch(error.message, /secret/);
      return true;
    }
  );
  assert.equal(fetchCalls, 0);

  const lookalike = parsedInput();
  lookalike.file.download_link = "https://evil-oaiusercontent.com/download/opaque?sig=secret";
  await assert.rejects(
    () => probeManagedAttachmentTransport(lookalike, neverFetch),
    (error: unknown) => error instanceof MediaTranscriptError &&
      error.code === "ATTACHMENT_DOWNLOAD_URL_REJECTED"
  );
  assert.equal(fetchCalls, 0);

  const redirectFetch = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(init?.redirect, "manual");
    return new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/redirected" }
    });
  }) as typeof fetch;

  await assert.rejects(
    () => probeManagedAttachmentTransport(parsedInput(), redirectFetch),
    (error: unknown) => error instanceof MediaTranscriptError &&
      error.code === "ATTACHMENT_DOWNLOAD_REDIRECT_BLOCKED"
  );
});

test("attachment probe accepts regional OpenAI CDN host and opaque path with bounded Range GET", async () => {
  const regional = parsedInput();
  regional.file.download_link = "https://sdmntprcacentral.oaiusercontent.com/download/opaque/runtime-shape?sig=redacted";
  const fakeFetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "sdmntprcacentral.oaiusercontent.com");
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "manual");
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("range"),
      `bytes=0-${MANAGED_ATTACHMENT_PROBE_MAX_BYTES - 1}`
    );
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 206,
      headers: {
        "content-type": "audio/mpeg",
        "content-range": "bytes 0-3/4"
      }
    });
  }) as typeof fetch;

  const result = await probeManagedAttachmentTransport(regional, fakeFetch);
  assert.deepEqual(result, {
    transport_available: true,
    file_class: "audio",
    declared_mime_type: "audio/mpeg",
    response_mime_type: "audio/mpeg",
    mime_consistent: true,
    probe_bytes_received: 4,
    probe_byte_limit: MANAGED_ATTACHMENT_PROBE_MAX_BYTES,
    range_requested: true,
    range_supported: true,
    response_truncated_at_probe_limit: false
  });
  assert.equal("id" in result, false);
  assert.equal("download_link" in result, false);
  assert.equal("name" in result, false);
});

test("attachment probe rejects a downloaded MIME class mismatch", async () => {
  const fakeFetch = (async () => new Response(new Uint8Array([1]), {
    status: 206,
    headers: { "content-type": "video/mp4" }
  })) as typeof fetch;

  await assert.rejects(
    () => probeManagedAttachmentTransport(parsedInput(), fakeFetch),
    (error: unknown) => error instanceof MediaTranscriptError &&
      error.code === "ATTACHMENT_MIME_MISMATCH"
  );
});

test("attachment probe HTTP endpoint requires bearer auth and always reports zero provider charge", async () => {
  let probeCalls = 0;
  const probe: ManagedAttachmentProbeRunner = async (input) => {
    probeCalls += 1;
    assert.equal(input.file.id, "file-A9_10_owner_test");
    return {
      transport_available: true,
      file_class: "audio",
      declared_mime_type: "audio/mpeg",
      response_mime_type: "audio/mpeg",
      mime_consistent: true,
      probe_bytes_received: 4,
      probe_byte_limit: MANAGED_ATTACHMENT_PROBE_MAX_BYTES,
      range_requested: true,
      range_supported: true,
      response_truncated_at_probe_limit: false
    };
  };
  const handler = createManagedAttachmentProbeHttpHandler(CONFIG, probe);
  const server = createServer(async (request, response) => {
    if (await handler.handle(request, response)) return;
    response.statusCode = 404;
    response.end();
  });
  const baseUrl = await listen(server);

  try {
    const denied = await fetch(`${baseUrl}/api/v1/media/managed/attachment-probe`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: JSON.stringify(runtimeBody())
    });
    assert.equal(denied.status, 401);
    assert.equal(probeCalls, 0);

    const invalidShape = await fetch(`${baseUrl}/api/v1/media/managed/attachment-probe`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json",
        connection: "close"
      },
      body: JSON.stringify({ openaiFileIdRefs: ["file-local"] })
    });
    assert.equal(invalidShape.status, 400);
    assert.equal(probeCalls, 0);

    const accepted = await fetch(`${baseUrl}/api/v1/media/managed/attachment-probe`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ACTION_TOKEN}`,
        "content-type": "application/json",
        connection: "close"
      },
      body: JSON.stringify(runtimeBody())
    });
    assert.equal(accepted.status, 200);
    const body = await accepted.json() as Record<string, unknown>;
    assert.equal(body.transport_available, true);
    assert.equal(body.retrieval_credits_charged, 0);
    assert.equal(body.stt_seconds_charged, 0);
    assert.equal("file_id" in body, false);
    assert.equal("download_link" in body, false);
    assert.equal(probeCalls, 1);
  } finally {
    await close(server);
  }
});
