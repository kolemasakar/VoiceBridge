import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { MediaTranscriptError } from "../src/media_transcript.js";
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

test("Facebook private/not-public provider response maps to explicit public-only error", async () => {
  await withMockServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({
      error: "not-found",
      message: "Not Found",
      details: "Post not found or is private"
    }));
  }, async (baseUrl) => {
    const provider = new SupadataProvider("test-key", baseUrl);
    await assert.rejects(
      () => provider.getNativeTranscript(
        "https://www.facebook.com/reel/1234567890/",
        "auto"
      ),
      (error: unknown) => {
        assert.ok(error instanceof MediaTranscriptError);
        assert.equal(error.code, "UNSUPPORTED_PRIVATE_OR_AUTH_REQUIRED");
        assert.equal(error.httpStatus, 422);
        assert.equal(error.retryable, false);
        assert.match(error.message, /Facebook/);
        return true;
      }
    );
  });
});
