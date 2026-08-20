import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { SupadataProvider } from "../src/supadata_provider.js";

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

test("Supadata quote exposes remaining credits before native spend", async () => {
  await withMockServer((request, response) => {
    assert.equal(request.url, "/me");
    assert.equal(request.headers["x-api-key"], "test-key");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      organizationId: "org-1",
      plan: "Free",
      maxCredits: 100,
      usedCredits: 17
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl);
    const quote = await provider.quoteNative();
    assert.deepEqual(quote, {
      provider: "supadata",
      mode: "native",
      plan: "Free",
      max_credits: 100,
      used_credits: 17,
      remaining_credits: 83,
      estimated_credits: 1,
      remaining_after_estimate: 82,
      consent_required: true,
      can_continue: true
    });
  });
});

test("Supadata native request is captions-only and preserves timestamps", async () => {
  await withMockServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    assert.equal(url.pathname, "/transcript");
    assert.equal(url.searchParams.get("mode"), "native");
    assert.equal(url.searchParams.get("text"), "false");
    assert.equal(url.searchParams.get("lang"), null);
    assert.equal(url.searchParams.get("url"), "https://youtu.be/example123");
    response.writeHead(200, {
      "content-type": "application/json",
      "x-billable-requests": "1"
    });
    response.end(JSON.stringify({
      lang: "uk",
      availableLangs: ["uk", "en"],
      content: [
        { text: "Перший сегмент", offset: 1000, duration: 2500, lang: "uk" },
        { text: "Другий сегмент", offset: 3500, duration: 1500, lang: "uk" }
      ]
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl);
    const result = await provider.getNativeTranscript(
      "https://youtu.be/example123",
      "auto"
    );
    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.equal(result.billable_credits, 1);
    assert.equal(result.language, "uk");
    assert.equal(result.segments.length, 2);
    assert.deepEqual(result.segments[0], {
      index: 0,
      start_ms: 1000,
      end_ms: 3500,
      text: "Перший сегмент",
      confidence: null
    });
  });
});

test("Supadata native transcript unavailable spends one credit and never generates AI", async () => {
  await withMockServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    assert.equal(url.searchParams.get("mode"), "native");
    response.writeHead(206, {
      "content-type": "application/json",
      "x-billable-requests": "1"
    });
    response.end(JSON.stringify({
      error: "transcript-unavailable",
      message: "Transcript Unavailable",
      details: "No transcript is available for this video"
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl);
    const result = await provider.getNativeTranscript(
      "https://youtu.be/no-captions",
      "en"
    );
    assert.deepEqual(result, {
      status: "unavailable",
      billable_credits: 1
    });
  });
});