import assert from "node:assert/strict";
import { test } from "node:test";
import { PeerWindowCoordinator } from "../src/peer_window_coordinator.js";
import { observePeer } from "../src/peer_observation.js";
import { FixedWindowRateLimiter } from "../src/rate_limit.js";

const key = Buffer.alloc(32, 0x61);
const peer = (ip: string) => observePeer(ip, undefined, key);
function fill(c: PeerWindowCoordinator, start: number, ip = "192.0.2.1") {
  for (let i = 0; i < 5; i++) c.record(peer(ip), true, start + i);
}
test("rotates exactly at boundary and retains aggregate only", () => {
  const c = new PeerWindowCoordinator(0);
  fill(c, 0);
  assert.equal(c.readSummaries(59_999).length, 0);
  const summaries = c.readSummaries(60_000);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].window_observations, 5);
  assert.ok(!JSON.stringify(summaries).includes(peer("192.0.2.1").peer_tag));
});
test("suppresses low-volume windows and skips idle windows", () => {
  const c = new PeerWindowCoordinator(0);
  c.record(peer("192.0.2.1"), true, 0);
  assert.equal(c.readSummaries(600_000).length, 0);
  fill(c, 600_000);
  assert.equal(c.readSummaries(660_000).length, 1);
});
test("retention expiry removes old summaries", () => {
  const c = new PeerWindowCoordinator(0, 60_000, 120_000);
  fill(c, 0);
  assert.equal(c.readSummaries(60_000).length, 1);
  assert.equal(c.readSummaries(180_000).length, 0);
});
test("hard cap bounds retained summary count", () => {
  const c = new PeerWindowCoordinator(0, 60_000, 600_000, 2);
  for (let window = 0; window < 3; window++) {
    fill(c, window * 60_000);
    c.advance((window + 1) * 60_000);
  }
  assert.equal(c.readSummaries(180_000).length, 2);
});
test("rejects nonmonotonic time and invalid settings", () => {
  const c = new PeerWindowCoordinator(100);
  assert.throws(() => c.advance(99));
  assert.throws(() => new PeerWindowCoordinator(0, 60_000, 1));
  assert.throws(() => new PeerWindowCoordinator(0, 60_000, 86_400_000, 0));
});
test("clear discards summaries and current window", () => {
  const c = new PeerWindowCoordinator(0);
  fill(c, 0);
  c.advance(60_000);
  fill(c, 60_000);
  c.clear(60_005);
  assert.equal(c.readSummaries(120_000).length, 0);
});
test("observation path never changes limiter decision", () => {
  const baseline = new FixedWindowRateLimiter(2);
  const observed = new FixedWindowRateLimiter(2);
  const c = new PeerWindowCoordinator(0);
  for (let i = 0; i < 4; i++) {
    const expected = baseline.allow("socket-peer", i);
    const actual = observed.allow("socket-peer", i);
    c.record(peer("192.0.2.1"), actual, i);
    assert.equal(actual, expected);
  }
});
