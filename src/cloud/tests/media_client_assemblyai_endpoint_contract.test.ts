import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("client-assisted STT supports isolated AssemblyAI endpoint override", async () => {
  const source = await readFile(
    new URL("../../src/media_client_ingest.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /KRC_MEDIA_ASSEMBLYAI_BASE_URL/);
  assert.match(source, /https:\/\/api\.assemblyai\.com/);
  assert.match(source, /fetch\(`\$\{ASSEMBLYAI_BASE_URL\}\$\{path\}`/);
});
