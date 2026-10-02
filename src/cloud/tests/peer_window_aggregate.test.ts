import assert from "node:assert/strict";
import { test } from "node:test";
import { BoundedPeerWindow } from "../src/peer_window_aggregate.js";
import { observePeer } from "../src/peer_observation.js";

const KEY = Buffer.alloc(32, 0x61);
const peer = (ip: string, header?: string) => observePeer(ip, header, KEY);

test("suppress fewer than five observations", () => {
  const w = new BoundedPeerWindow(0);
  for (let i = 0; i < 4; i++) w.record(peer("192.0.2.1"), true, i);
  assert.equal(w.finish(), null);
});
test("five observations produce aggregate counts without tags or peer", () => {
  const w = new BoundedPeerWindow(0);
  for (let i = 0; i < 3; i++) w.record(peer("192.0.2.1"), true, i);
  for (let i = 3; i < 5; i++) w.record(peer("192.0.2.2", "203.0.113.1"), false, i);
  const result = w.finish();
  assert.ok(result);
  assert.equal(result.window_observations, 5);
  assert.equal(result.allowed, 3);
  assert.equal(result.rejected, 2);
  assert.equal(result.distinct_tag_buckets, 2);
  assert.equal(result.header_shape_counts.single_untrusted, 2);
  assert.ok(!JSON.stringify(result).includes("192.0.2."));
  assert.ok(!JSON.stringify(result).includes(peer("192.0.2.1").peer_tag));
});
test("128 distinct tag cap and anonymous overflow", () => {
  const w = new BoundedPeerWindow(0);
  for (let i = 0; i < 140; i++) {
    w.record(peer("192.0.2." + (i + 1)), true, i);
  }
  const s = w.finish();
  assert.equal(s?.distinct_tag_buckets, 128);
  assert.equal(s?.overflow_observations, 12);
  assert.equal(s?.window_observations, 140);
});
test("clear discards tags and resets all counters", () => {
  const w = new BoundedPeerWindow(0);
  for (let i = 0; i < 5; i++) w.record(peer("192.0.2.1"), true, i);
  assert.equal(w.finish()?.distinct_tag_buckets, 1);
  w.clear(60_000);
  assert.equal(w.finish(), null);
  for (let i = 0; i < 5; i++) w.record(peer("192.0.2.2"), false, 60_000 + i);
  assert.equal(w.finish()?.allowed, 0);
  assert.equal(w.finish()?.distinct_tag_buckets, 1);
});
test("reject observations outside fixed window", () => {
  const w = new BoundedPeerWindow(100);
  assert.throws(() => w.record(peer("192.0.2.1"), true, 99));
  assert.throws(() => w.record(peer("192.0.2.1"), true, 60_100));
});
test("reject malformed tags and invalid configuration", () => {
  const w = new BoundedPeerWindow(0);
  assert.throws(() => w.record({ ...peer("192.0.2.1"), peer_tag: "raw-ip" }, true, 1));
  assert.throws(() => new BoundedPeerWindow(0, 0));
  assert.throws(() => new BoundedPeerWindow(0, 60_000, 0));
});
test("overflow includes repeated nonadmitted tags without storing them", () => {
  const w = new BoundedPeerWindow(0, 60_000, 1, 1);
  w.record(peer("192.0.2.1"), true, 0);
  w.record(peer("192.0.2.2"), false, 1);
  w.record(peer("192.0.2.2"), false, 2);
  assert.equal(w.finish()?.overflow_observations, 2);
  assert.equal(w.finish()?.distinct_tag_buckets, 1);
});
