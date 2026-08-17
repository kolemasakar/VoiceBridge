import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MediaBetaGate,
  parseMediaBetaCodes
} from "../src/media_beta.js";
import { parseMediaBetaTranscriptInput } from "../src/media_beta_service.js";

test("media beta code list parses and rejects weak or duplicate codes", () => {
  assert.deepEqual(
    parseMediaBetaCodes("abcdefghijkl,mnopqrstuvwx"),
    ["abcdefghijkl", "mnopqrstuvwx"]
  );
  assert.throws(() => parseMediaBetaCodes("short"));
  assert.throws(() => parseMediaBetaCodes("abcdefghijkl,abcdefghijkl"));
});

test("media beta authorization uses configured access codes", () => {
  const gate = new MediaBetaGate(["abcdefghijkl", "mnopqrstuvwx"], 7200);
  assert.equal(gate.configured, true);
  assert.equal(gate.authorize("abcdefghijkl"), true);
  assert.equal(gate.authorize("mnopqrstuvwx"), true);
  assert.equal(gate.authorize("zzzzzzzzzzzz"), false);
});

test("media beta daily STT quota reserves conservatively and resets by UTC day", () => {
  const gate = new MediaBetaGate(["abcdefghijkl"], 120);
  const dayOne = new Date("2026-08-17T10:00:00Z");
  const first = gate.reserveSttSeconds(60.1, dayOne);
  assert.equal(first.allowed, true);
  assert.equal(first.usage.used_seconds, 61);
  assert.equal(first.usage.remaining_seconds, 59);

  const blocked = gate.reserveSttSeconds(60, dayOne);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.usage.used_seconds, 61);

  const nextDay = gate.reserveSttSeconds(
    60,
    new Date("2026-08-18T00:00:01Z")
  );
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.usage.used_seconds, 60);
});

test("closed beta request requires access code and supported language", () => {
  const parsed = parseMediaBetaTranscriptInput({
    url: "https://youtu.be/abc123",
    beta_access_code: "abcdefghijkl"
  });
  assert.deepEqual(parsed, {
    url: "https://youtu.be/abc123",
    language_hint: "auto",
    beta_access_code: "abcdefghijkl"
  });

  assert.equal(
    parseMediaBetaTranscriptInput({
      url: "https://youtu.be/abc123",
      language_hint: "de",
      beta_access_code: "abcdefghijkl"
    }),
    null
  );
  assert.equal(
    parseMediaBetaTranscriptInput({
      url: "https://youtu.be/abc123"
    }),
    null
  );
});
