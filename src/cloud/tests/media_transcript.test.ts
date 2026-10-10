import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MediaTranscriptError,
  chunkTranscriptWords,
  normalizeMediaUrl,
  parseMediaTranscriptInput
} from "../src/media_transcript.js";

test("media URL normalization accepts public HTTPS YouTube URLs", () => {
  assert.equal(
    normalizeMediaUrl("https://www.youtube.com/watch?v=abc123#fragment"),
    "https://www.youtube.com/watch?v=abc123"
  );
  assert.equal(
    normalizeMediaUrl("https://youtu.be/abc123"),
    "https://youtu.be/abc123"
  );
});

test("media URL normalization rejects non-YouTube and non-HTTPS URLs", () => {
  assert.throws(
    () => normalizeMediaUrl("https://example.com/video"),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_URL_UNSUPPORTED"
  );
  assert.throws(
    () => normalizeMediaUrl("http://youtube.com/watch?v=abc123"),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_URL_UNSUPPORTED"
  );
});

test("media input defaults to automatic language detection", () => {
  assert.deepEqual(
    parseMediaTranscriptInput({
      url: "https://www.youtube.com/watch?v=abc123"
    }),
    {
      url: "https://www.youtube.com/watch?v=abc123",
      language_hint: "auto"
    }
  );
});

test("media input accepts Ukrainian, Russian, and English hints only", () => {
  for (const language of ["uk", "ru", "en"] as const) {
    const parsed = parseMediaTranscriptInput({
      url: "https://youtu.be/abc123",
      language_hint: language
    });
    assert.equal(parsed?.language_hint, language);
  }

  assert.equal(
    parseMediaTranscriptInput({
      url: "https://youtu.be/abc123",
      language_hint: "de"
    }),
    null
  );
});

test("word chunking preserves timestamps, text order, and confidence", () => {
  const segments = chunkTranscriptWords(
    [
      { text: "One", start: 100, end: 300, confidence: 0.9 },
      { text: "two", start: 320, end: 500, confidence: 0.8 },
      { text: "three", start: 520, end: 750, confidence: 1.0 }
    ],
    ""
  );

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.start_ms, 100);
  assert.equal(segments[0]?.end_ms, 750);
  assert.equal(segments[0]?.text, "One two three");
  assert.ok(Math.abs((segments[0]?.confidence || 0) - 0.9) < 0.000001);
});

test("fallback text is bounded into multiple segments", () => {
  const longText = "x".repeat(4000);
  const segments = chunkTranscriptWords([], longText);
  assert.equal(segments.length, 3);
  assert.equal(segments[0]?.start_ms, null);
  assert.equal(segments[0]?.confidence, null);
  assert.equal(
    segments.map((segment) => segment.text).join("").length,
    longText.length
  );
});
