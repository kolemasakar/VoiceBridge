import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { selectManagedMediaPsqlRow } from "../src/managed_media_persistence.js";

test("managed durable reservation returns inserted or conflicting row atomically", async () => {
  const source = await readFile(
    new URL("../../src/managed_media_persistence.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /ON CONFLICT \(request_key\) DO UPDATE SET/);
  assert.match(source, /request_key = EXCLUDED\.request_key/);
  assert.match(source, /RETURNING job_id, request_key, access_code_digest, status/);
  assert.match(source, /created: parsed\.job\.job_id === record\.job\.job_id/);
  assert.doesNotMatch(source, /WITH inserted AS/);
});

test("managed durable parser ignores psql command tags after RETURNING", () => {
  const returnedRow = [
    "KRCM_123",
    "a".repeat(64),
    "b".repeat(64),
    "PROCESSING",
    "7b7d",
    "5b5d",
    "1787274000"
  ].join("\t");

  assert.equal(
    selectManagedMediaPsqlRow(
      ["DELETE 0", returnedRow, "INSERT 0 1", ""].join("\n")
    ),
    returnedRow
  );
  assert.equal(selectManagedMediaPsqlRow("DELETE 0\nINSERT 0 1\n"), null);
});
