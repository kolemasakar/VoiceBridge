import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";

/**
 * Research-only diagnostics. Not imported by the live server.
 * Socket peer is observed; Forwarded/X-Forwarded-For is never trusted as identity.
 */
export type HeaderShape =
  | "absent"
  | "empty"
  | "single_untrusted"
  | "multiple_untrusted"
  | "oversize";

export interface PeerObservation {
  peer_tag: string;
  forwarded_present: boolean;
  forwarded_shape: HeaderShape;
}

export function newObservationKey(): Buffer {
  return randomBytes(32);
}

export function observePeer(
  peer: string,
  forwarded: string | undefined,
  key: Uint8Array
): PeerObservation {
  if (key.byteLength < 32) {
    throw new Error("observation key must contain at least 32 bytes");
  }
  const version = isIP(peer);
  if (version === 0) {
    throw new Error("invalid socket peer");
  }
  // WHATWG URL serializes equivalent IPv6 forms canonically.
  const normalizedPeer = version === 6
    ? new URL("http://[" + peer + "]/").hostname.slice(1, -1)
    : peer;
  const peerTag = createHmac("sha256", key)
    .update("krc-voicebridge-peer-observation:v1\0")
    .update(normalizedPeer)
    .digest("hex")
    .slice(0, 24);
  let shape: HeaderShape;
  if (forwarded === undefined) {
    shape = "absent";
  } else if (forwarded.length > 1024) {
    shape = "oversize";
  } else if (forwarded.trim() === "") {
    shape = "empty";
  } else if (forwarded.includes(",")) {
    shape = "multiple_untrusted";
  } else {
    shape = "single_untrusted";
  }
  return {
    peer_tag: peerTag,
    forwarded_present: forwarded !== undefined,
    forwarded_shape: shape
  };
}
