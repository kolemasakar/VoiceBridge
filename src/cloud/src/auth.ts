import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export type AuthenticationResult =
  | { ok: true }
  | { ok: false; code: "AUTHENTICATION_REQUIRED" | "AUTHENTICATION_FAILED" };

export function authenticate(
  request: IncomingMessage,
  expectedToken: string
): AuthenticationResult {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return { ok: false, code: "AUTHENTICATION_REQUIRED" };
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);

  if (!match?.[1] || !secureEqual(match[1], expectedToken)) {
    return { ok: false, code: "AUTHENTICATION_FAILED" };
  }

  return { ok: true };
}
