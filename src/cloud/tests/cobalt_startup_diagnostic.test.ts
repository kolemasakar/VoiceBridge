import assert from "node:assert/strict";
import { test } from "node:test";
import { runCobaltStartupDiagnostic } from "../src/cobalt_startup_diagnostic.js";

test("Cobalt startup diagnostic sends Api-Key and returns only sanitized provider metadata", async () => {
  let seenAuthorization: string | null = null;
  let seenBody: Record<string, unknown> | null = null;

  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    seenAuthorization = headers.get("authorization");
    seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        status: "error",
        error: { code: "error.api.auth.key.invalid", context: { secret: "must-not-leak" } },
        url: "https://media.example.test/secret-tunnel"
      }),
      { status: 401, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;

  const result = await runCobaltStartupDiagnostic(
    "https://cobalt.example.test",
    "fixture-uuid-key",
    fetchImpl
  );

  assert.equal(seenAuthorization, "Api-Key fixture-uuid-key");
  assert.equal(seenBody?.downloadMode, "audio");
  assert.equal(seenBody?.audioFormat, "mp3");
  assert.equal(seenBody?.disableMetadata, true);
  assert.deepEqual(result, {
    attempted: true,
    http_status: 401,
    json_valid: true,
    provider_status: "error",
    provider_error_code: "error.api.auth.key.invalid"
  });
  assert.equal(Object.hasOwn(result, "url"), false);
});

test("Cobalt startup diagnostic is skipped without endpoint or key", async () => {
  const result = await runCobaltStartupDiagnostic(null, null);
  assert.deepEqual(result, {
    attempted: false,
    http_status: null,
    json_valid: false,
    provider_status: null,
    provider_error_code: null
  });
});
