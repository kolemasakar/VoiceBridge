import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("durable job upsert preserves the original created_at", async () => {
  const source = await readFile(
    new URL("../src/media_client_persistence.ts", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /payload\s*=\s*jsonb_set\([\s\S]*EXCLUDED\.payload,[\s\S]*'\{created_at\}',[\s\S]*krc_media_client_jobs\.payload->'created_at'/
  );
});
