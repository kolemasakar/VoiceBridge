import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compactCaptionSegments,
  parseYoutubeJson3
} from "../src/youtube_captions.js";

test("YouTube json3 captions preserve timestamps and text", () => {
  const segments = parseYoutubeJson3(JSON.stringify({
    events: [
      {
        tStartMs: 1000,
        dDurationMs: 1500,
        segs: [{ utf8: "Hello " }, { utf8: "world" }]
      },
      {
        tStartMs: 2600,
        dDurationMs: 1000,
        segs: [{ utf8: " again" }]
      }
    ]
  }));

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.start_ms, 1000);
  assert.equal(segments[0]?.end_ms, 3600);
  assert.equal(segments[0]?.text, "Hello world again");
  assert.equal(segments[0]?.confidence, null);
});

test("caption compaction splits long time windows", () => {
  const segments = compactCaptionSegments([
    {
      index: 0,
      start_ms: 0,
      end_ms: 30000,
      text: "First",
      confidence: null
    },
    {
      index: 1,
      start_ms: 61000,
      end_ms: 62000,
      text: "Second",
      confidence: null
    }
  ]);

  assert.equal(segments.length, 2);
  assert.equal(segments[0]?.text, "First");
  assert.equal(segments[1]?.text, "Second");
});

test("malformed YouTube json3 returns no transcript", () => {
  assert.deepEqual(parseYoutubeJson3("not-json"), []);
});
