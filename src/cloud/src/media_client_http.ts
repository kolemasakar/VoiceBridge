import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { RequestContext } from "./identifiers.js";
import { MediaBetaGate } from "./media_beta.js";
import {
  MAX_CLIENT_AUDIO_BYTES,
  MediaClientIngestService,
  type MediaClientCaptionsInput
} from "./media_client_ingest.js";
import { parseMediaBetaTranscriptInput } from "./media_beta_service.js";
import { MediaTranscriptError } from "./media_transcript.js";

const ROOT = "/api/v1/media/client-transcriptions";
const JOB_PATH = /^\/api\/v1\/media\/client-transcriptions\/(KRCC_[A-Za-z0-9-]+)$/;
const SEGMENTS_PATH = /^\/api\/v1\/media\/client-transcriptions\/(KRCC_[A-Za-z0-9-]+)\/segments$/;
const AUDIO_PATH = /^\/api\/v1\/media\/client-transcriptions\/(KRCC_[A-Za-z0-9-]+)\/audio$/;
const CAPTIONS_PATH = /^\/api\/v1\/media\/client-transcriptions\/(KRCC_[A-Za-z0-9-]+)\/captions$/;
const MAX_CLIENT_CAPTIONS_BYTES = 2 * 1024 * 1024;
const CLIENT_STATUS_PATH = /^\/api\/v1\/media\/client-transcriptions\/(KRCC_[A-Za-z0-9-]+)\/client-status$/;

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
  const body = await readBinaryBody(request, maximumBytes);
  if (body.length === 0) {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The request body is empty.",
      400,
      false
    );
  }
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The request body is not valid JSON.",
      400,
      false
    );
  }
}

async function readBinaryBody(
  request: IncomingMessage,
  maximumBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maximumBytes) {
      throw new MediaTranscriptError(
        "REQUEST_BODY_TOO_LARGE",
        "The browser client upload is too large.",
        413,
        false
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function betaCode(request: IncomingMessage): string {
  const value = request.headers["x-media-beta-code"];
  return typeof value === "string" ? value : "";
}

function sourceUrl(request: IncomingMessage): string {
  const value = request.headers["x-media-source-url"];
  return typeof value === "string" ? value : "";
}

function contentType(request: IncomingMessage): string {
  const value = request.headers["content-type"];
  return typeof value === "string" ? value : "application/octet-stream";
}

function parseCaptionsInput(value: unknown): MediaClientCaptionsInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.language !== "string") return null;
  if (record.caption_type !== "manual" && record.caption_type !== "auto_generated") return null;
  if (!Array.isArray(record.segments)) return null;
  return {
    language: record.language,
    caption_type: record.caption_type,
    segments: record.segments as MediaClientCaptionsInput["segments"]
  };
}

export function createMediaClientHttpHandler(config: AppConfig) {
  const service = new MediaClientIngestService({
    assemblyAiApiKey: config.assemblyAiApiKey,
    betaGate: new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    maxDurationSeconds: config.mediaMaxDurationSeconds ?? 3600,
    jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
    maxConcurrentJobs: config.mediaMaxConcurrentJobs ?? 1
  });

  const capability = {
    mode: service.mode,
    configured: Boolean(config.mediaActionToken && service.configured),
    upload_max_bytes: MAX_CLIENT_AUDIO_BYTES,
    requires_browser_helper: true
  } as const;

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse,
    context: RequestContext
  ): Promise<boolean> => {
    const method = request.method || "GET";
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    const path = requestUrl.pathname;
    if (path !== ROOT && !path.startsWith(`${ROOT}/`)) return false;

    try {
    const captionsMatch = CAPTIONS_PATH.exec(path);
    if (method === "POST" && captionsMatch?.[1]) {
      const code = betaCode(request);
      const activeSourceUrl = sourceUrl(request);
      if (!code || !activeSourceUrl) {
        throw new MediaTranscriptError(
          "MEDIA_CLIENT_HEADERS_REQUIRED",
          "x-media-beta-code and x-media-source-url are required.",
          400,
          false
        );
      }
      const body = await readJsonBody(request, MAX_CLIENT_CAPTIONS_BYTES);
      const captions = parseCaptionsInput(body);
      if (!captions) {
        throw new MediaTranscriptError(
          "MEDIA_CLIENT_CAPTIONS_INVALID",
          "The browser caption payload is invalid.",
          422,
          false
        );
      }
      const job = service.acceptCaptions(
        captionsMatch[1],
        code,
        activeSourceUrl,
        captions
      );
      sendJson(
        response,
        200,
        { request_id: context.requestId, ...job },
        context,
        config.corsAllowedOrigin
      );
      return true;
    }

    const audioMatch = AUDIO_PATH.exec(path);
      if (method === "POST" && audioMatch?.[1]) {
        const code = betaCode(request);
        const activeSourceUrl = sourceUrl(request);
        if (!code || !activeSourceUrl) {
          throw new MediaTranscriptError(
            "MEDIA_CLIENT_HEADERS_REQUIRED",
            "x-media-beta-code and x-media-source-url are required.",
            400,
            false
          );
        }
        const audio = await readBinaryBody(request, MAX_CLIENT_AUDIO_BYTES);
        const job = service.acceptAudio(
          audioMatch[1],
          code,
          activeSourceUrl,
          contentType(request),
          audio
        );
        sendJson(
          response,
          202,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const clientStatusMatch = CLIENT_STATUS_PATH.exec(path);
      if (method === "GET" && clientStatusMatch?.[1]) {
        const code = betaCode(request);
        if (!code) {
          throw new MediaTranscriptError(
            "MEDIA_CLIENT_HEADERS_REQUIRED",
            "x-media-beta-code is required.",
            400,
            false
          );
        }
        const job = service.getForClient(clientStatusMatch[1], code);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      if (!config.mediaActionToken) {
        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
          "Media transcription is not configured.",
          503,
          true
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

      if (method === "POST" && path === ROOT) {
        const body = await readJsonBody(request, config.maxRequestBodyBytes);
        const input = parseMediaBetaTranscriptInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The client-assisted media request is not valid.",
            400,
            false
          );
        }
        const started = service.start(input);
        sendJson(
          response,
          202,
          {
            request_id: context.requestId,
            reused: started.reused,
            ...started.job
          },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const segmentsMatch = SEGMENTS_PATH.exec(path);
      if (method === "GET" && segmentsMatch?.[1]) {
        const cursor = Number(requestUrl.searchParams.get("cursor") || "0");
        const limit = Number(requestUrl.searchParams.get("limit") || "20");
        if (
          !Number.isInteger(cursor) || cursor < 0 || cursor > 100000 ||
          !Number.isInteger(limit) || limit < 1 || limit > 50
        ) {
          throw new MediaTranscriptError(
            "INVALID_PAGINATION",
            "cursor must be a non-negative integer and limit must be 1..50.",
            400,
            false
          );
        }
        const page = service.page(segmentsMatch[1], cursor, limit);
        if (!page) {
          throw new MediaTranscriptError(
            "MEDIA_TRANSCRIPT_NOT_FOUND",
            "The client-assisted media job was not found or expired.",
            404,
            false
          );
        }
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...page },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const jobMatch = JOB_PATH.exec(path);
      if (method === "GET" && jobMatch?.[1]) {
        const job = service.get(jobMatch[1]);
        if (!job) {
          throw new MediaTranscriptError(
            "MEDIA_TRANSCRIPT_NOT_FOUND",
            "The client-assisted media job was not found or expired.",
            404,
            false
          );
        }
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      throw new MediaTranscriptError(
        "NOT_FOUND",
        "The requested client-assisted media endpoint was not found.",
        404,
        false
      );
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MEDIA_CLIENT_REQUEST_FAILED",
          "The client-assisted media request failed.",
          500,
          true
        );
      sendError(
        response,
        normalized,
        context,
        config.corsAllowedOrigin
      );
      return true;
    }
  };

  return { handle, capability };
}
