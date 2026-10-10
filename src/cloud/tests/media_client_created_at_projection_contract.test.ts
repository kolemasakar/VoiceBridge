import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("live durable job projections preserve external created_at", async () => {
  const source = await readFile(
    join(process.cwd(), "src", "media_client_http.ts"),
    "utf8"
  );
  const matches = source.match(/created_at: record\.job\.created_at/g) ?? [];
  assert.ok(matches.length >= 3);
});
