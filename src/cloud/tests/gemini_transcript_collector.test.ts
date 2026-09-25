import assert from "node:assert/strict";
import { test } from "node:test";
import { collectCompletedTranscript, type TranscriptPage, type TranscriptStatus } from "../src/gemini_transcript_collector.js";

const status: TranscriptStatus = {
  job_id: "KRCM_fixture", status: "COMPLETED", segment_count: 3,
  transcript_characters: "first second third".length
};
const segments = ["first ", "second ", "third"].map((text, index) => ({ index, text }));
const page = async (jobId: string, cursor: number, limit: number): Promise<TranscriptPage> => {
  const chunk = segments.slice(cursor, cursor + limit);
  const end = cursor + chunk.length;
  return {
    job_id: jobId, status: "COMPLETED", cursor,
    next_cursor: end < segments.length ? end : null,
    segments: chunk
  };
};

test("read-only collector exports all ordered pages with exact count and characters", async () => {
  let calls = 0;
  const result = await collectCompletedTranscript(status, async (...args) => {
    calls += 1;
    return page(...args);
  }, 1);
  assert.equal(calls, 3);
  assert.equal(result.text, "first second third");
  assert.equal(result.segment_count, 3);
  assert.equal(result.transcript_characters, status.transcript_characters);
});

test("collector fails closed on a missing page", async () => {
  await assert.rejects(
    () => collectCompletedTranscript(status, async (id, cursor, limit) =>
      cursor === 1 ? null : page(id, cursor, limit), 1),
    /TRANSCRIPT_PAGE_INVALID/
  );
});

test("collector fails closed on duplicate or out-of-order segment", async () => {
  await assert.rejects(
    () => collectCompletedTranscript(status, async (id, cursor, limit) => {
      const result = await page(id, cursor, limit);
      if (cursor === 1) result.segments[0] = { index: 0, text: "second " };
      return result;
    }, 1),
    /TRANSCRIPT_SEGMENT_OUT_OF_ORDER/
  );
});

test("collector fails closed on inconsistent metadata or truncated text", async () => {
  await assert.rejects(
    () => collectCompletedTranscript({ ...status, segment_count: 4 }, page, 1),
    /TRANSCRIPT_INCOMPLETE/
  );
  await assert.rejects(
    () => collectCompletedTranscript({ ...status, transcript_characters: 999 }, page, 1),
    /TRANSCRIPT_CHARACTER_COUNT_MISMATCH/
  );
});

test("collector never invokes provider work and refuses unfinished jobs", async () => {
  let pageCalls = 0;
  await assert.rejects(
    () => collectCompletedTranscript({ ...status, status: "PROCESSING" }, async () => {
      pageCalls += 1;
      return null;
    }),
    /TRANSCRIPT_NOT_COMPLETED/
  );
  assert.equal(pageCalls, 0);
});
