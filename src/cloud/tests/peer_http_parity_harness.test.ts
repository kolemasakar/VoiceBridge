import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createPeerDiagnosticParityHarness } from "../src/peer_http_parity_harness.js";

async function exercise(enabled: boolean, failing = false) {
  const h = createPeerDiagnosticParityHarness(enabled, 2, failing ? () => {
    throw new Error("synthetic diagnostic failure: secret should not escape");
  } : undefined);
  h.server.listen(0, "127.0.0.1");
  await once(h.server, "listening");
  const address = h.server.address();
  if (!address || typeof address === "string") throw new Error("no test address");
  const root = "http://127.0.0.1:" + address.port;
  try {
    const results = [];
    for (const [method, path, headers] of [
      ["GET", "/api/v1/health", {}],
      ["OPTIONS", "/test", {}],
      ["GET", "/test", { "x-forwarded-for": "198.51.100.1" }],
      ["GET", "/test", { "x-forwarded-for": "203.0.113.99, 198.51.100.1" }],
      ["GET", "/test", { "x-forwarded-for": "192.0.2.3" }],
      ["GET", "/test", {}]
    ] as const) {
      const res = await fetch(root + path, { method, headers });
      results.push([res.status, res.headers.get("retry-after"), await res.text()]);
    }
    return { results, errors: h.diagnosticSummaries() };
  } finally {
    h.server.closeAllConnections();
    await new Promise<void>((resolve, reject) => h.server.close(e => e ? reject(e) : resolve()));
  }
}
test("HTTP parity: enabled vs disabled preserves status and Retry-After", async () => {
  const off = await exercise(false);
  const on = await exercise(true);
  assert.deepEqual(on.results, off.results);
  assert.deepEqual(on.results.map(x => x[0]), [200, 204, 200, 200, 429, 429]);
  assert.equal(on.errors, 0);
});
test("HTTP parity: diagnostic exception cannot affect limiter decisions", async () => {
  const off = await exercise(false);
  const failed = await exercise(true, true);
  assert.deepEqual(failed.results, off.results);
  assert.equal(failed.errors, 4);
  assert.ok(!JSON.stringify(failed.results).includes("secret should not escape"));
});
