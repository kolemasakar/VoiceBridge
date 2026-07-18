import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;

function readHeader(
  request: IncomingMessage,
  name: string
): string | undefined {
  const value = request.headers[name];

  if (typeof value !== "string" || !SAFE_IDENTIFIER.test(value)) {
    return undefined;
  }

  return value;
}

export interface RequestContext {
  requestId: string;
  correlationId: string;
}

export function createRequestContext(
  request: IncomingMessage
): RequestContext {
  const requestId = readHeader(request, "x-request-id") || randomUUID();
  const correlationId =
    readHeader(request, "x-correlation-id") || requestId;

  return { requestId, correlationId };
}
