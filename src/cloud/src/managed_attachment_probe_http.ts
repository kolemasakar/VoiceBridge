import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createRequestContext, type RequestContext } from "./identifiers.js";
import {
  parseManagedAttachmentProbeInput,
  probeManagedAttachmentTransport,
  type ManagedAttachmentProbeRunner
} from "./managed_attachment_probe.js";
import { MediaTranscriptError } from "./media_transcript.js";

const ATTACHMENT_PROBE_PATH = "/api/v1/media/managed/attachment-probe";
const MAX_PROBE_REQUEST_BYTES = 64 * 1024;

function setHeaders(
  response: ServerResponse,
  context: RequestContext,
  origin: string
): void {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("x-request-id", context.requestId);
  response.setHeader("x-correlation-id", context.correlationId);
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  context: RequestContext,
  origin: string
): void {
  setHeaders(response, context, origin);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  error: MediaTranscriptError,
  context: RequestContext,
  origin: string
): void {
  sendJson(
    response,
    error.httpStatus,
    {
      error: {
        code: error.code,
        message: error.message,
        category: "MEDIA",
        retryable: error.retryable,
        request_id: context.requestId,
        session_id: null,
        correlation_id: context.correlationId,
        details: []
      }
    },
    context,
    origin
  );
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new MediaTranscriptError(
        "REQUEST_BODY_TOO_LARGE",
        "The attachment probe request body is too large.",
        413,
        false
      );
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The attachment probe request body is empty.",
      400,
      false
    );
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The attachment probe request body is not valid JSON.",
      400,
      false
    );
  }
}

export function createManagedAttachmentProbeHttpHandler(
  config: AppConfig,
  probe: ManagedAttachmentProbeRunner = probeManagedAttachmentTransport
) {
  const handle = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    if (requestUrl.pathname !== ATTACHMENT_PROBE_PATH) return false;

    const context = createRequestContext(request);
    try {
      if (!config.mediaActionToken) {
        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
          "Managed media Action authentication is not configured.",
          503,
          true
        );
      }
      if (!config.mediaBetaCodes?.[0]) {
        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
          "Owner media admission is not configured.",
          503,
          false
        );
      }

      const authentication = authenticate(request, config.mediaActionToken);
      if (!authentication.ok) {
        throw new MediaTranscriptError(
          authentication.code,
          authentication.code === "AUTHENTICATION_REQUIRED"
            ? "A bearer token is required."
            : "The bearer token is invalid or revoked.",
          401,
          false
        );
      }

      if ((request.method || "GET") !== "POST") {
        throw new MediaTranscriptError(
          "METHOD_NOT_ALLOWED",
          "The attachment transport probe requires POST.",
          405,
          false
        );
      }

      const body = await readJsonBody(
        request,
        Math.min(config.maxRequestBodyBytes, MAX_PROBE_REQUEST_BYTES)
      );
      const input = parseManagedAttachmentProbeInput(body);
      if (!input) {
        throw new MediaTranscriptError(
          "INVALID_REQUEST",
          "Exactly one runtime OpenAI conversation-file reference is required.",
          400,
          false
        );
      }

      const result = await probe(input);
      sendJson(
        response,
        200,
        {
          request_id: context.requestId,
          ...result,
          retrieval_credits_charged: 0,
          stt_seconds_charged: 0
        },
        context,
        config.corsAllowedOrigin
      );
      return true;
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "ATTACHMENT_PROBE_FAILED",
          "The attachment transport probe failed.",
          500,
          true
        );
      sendError(response, normalized, context, config.corsAllowedOrigin);
      return true;
    }
  };

  return { handle };
}
