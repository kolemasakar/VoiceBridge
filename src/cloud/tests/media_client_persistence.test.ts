import assert from "node:assert/strict";
import test from "node:test";
import {
  MediaClientPersistentStore,
  mediaClientAccessDigest,
  mediaClientAccessMatches,
  mediaClientRequestKey
} from "../src/media_client_persistence.js";

const CODE_A = "owner-beta-code-0001";
const CODE_B = "tester-beta-code-0002";

test("durable request keys are stable and isolated by tester code", () => {
  const url = "https://youtu.be/DZLzmQ2kwaA";
  const first = mediaClientRequestKey(url, "auto", CODE_A);
  const repeated = mediaClientRequestKey(url, "auto", CODE_A);
  const otherTester = mediaClientRequestKey(url, "auto", CODE_B);

  assert.equal(first, repeated);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, otherTester);
});

test("durable access digests use constant-size ownership checks", () => {
  const digest = mediaClientAccessDigest(CODE_A);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(mediaClientAccessMatches(digest, CODE_A), true);
  assert.equal(mediaClientAccessMatches(digest, CODE_B), false);
  assert.equal(mediaClientAccessMatches("not-a-digest", CODE_A), false);
});

test("durable store is a no-op when no database URL is configured", async () => {
  const store = new MediaClientPersistentStore(null);
  assert.equal(store.enabled, false);
  await store.ready();
  assert.equal(await store.get("KRCC_example"), null);
  assert.equal(await store.findByRequestKey("x".repeat(64)), null);
  assert.equal(await store.hasOtherActiveJob("x".repeat(64)), false);
  assert.equal(await store.sumSttCharges("2026-08-18"), 0);
  await store.purgeExpired();
});
