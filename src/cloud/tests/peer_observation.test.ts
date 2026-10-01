import assert from "node:assert/strict";
import { test } from "node:test";
import { newObservationKey, observePeer } from "../src/peer_observation.js";

const A = Buffer.alloc(32, 0x61);
const B = Buffer.alloc(32, 0x62);

test("same peer and key give stable tag irrespective of untrusted header", () => {
  assert.equal(observePeer("192.0.2.1", undefined, A).peer_tag,
    observePeer("192.0.2.1", "203.0.113.1", A).peer_tag);
});
test("different key changes tag", () => {
  assert.notEqual(observePeer("192.0.2.1", undefined, A).peer_tag,
    observePeer("192.0.2.1", undefined, B).peer_tag);
});
test("different peer changes tag", () => {
  assert.notEqual(observePeer("192.0.2.1", undefined, A).peer_tag,
    observePeer("192.0.2.2", undefined, A).peer_tag);
});
test("tag is fixed 96-bit hex", () => {
  assert.match(observePeer("2001:db8::1", undefined, A).peer_tag, /^[0-9a-f]{24}$/);
});
test("header shape only and no raw header or peer in returned object", () => {
  const cases: Array<[string | undefined, string]> = [
    [undefined, "absent"], ["", "empty"], ["  ", "empty"],
    ["203.0.113.5", "single_untrusted"],
    ["203.0.113.5, 198.51.100.7", "multiple_untrusted"],
    ["x".repeat(1025), "oversize"]
  ];
  for (const [header, shape] of cases) {
    const o = observePeer("192.0.2.1", header, A);
    assert.equal(o.forwarded_shape, shape);
    assert.equal(o.forwarded_present, header !== undefined);
    assert.ok(!JSON.stringify(o).includes("192.0.2.1"));
    assert.ok(!JSON.stringify(o).includes("203.0.113.5"));
  }
});
test("reject weak key and invalid peer", () => {
  assert.throws(() => observePeer("192.0.2.1", undefined, Buffer.alloc(16)));
  assert.throws(() => observePeer("not an ip", undefined, A));
});
test("fresh random keys differ", () => {
  assert.notDeepEqual(newObservationKey(), newObservationKey());
});
