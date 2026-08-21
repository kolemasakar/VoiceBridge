import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createRequestContext, type RequestContext } from "./identifiers.js";
import { MediaBetaGate } from "./media_beta.js";
import { ManagedMediaPersistentStore } from "./managed_media_persistence.js";
import {
  ManagedMediaService,
  parseManagedMediaAiInput,
  parseManagedMediaFacebookMetadataInput,
  parseManagedMediaNativeInput,
  parseManagedMediaPreflightInput
} from "./managed_media_service.js";
import { MediaTranscriptError } from "./media_transcript.js";
import {
  GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE,
  INSTAGRAM_REEL_GENERATE_MAX_CREDITS
} from "./supadata_provider.js";

const ROOT = "/api/v1/media/managed";
const PREFLIGHT = `${ROOT}/preflight`;
const LOOKUP = `${ROOT}/lookup`;
const TRANSCRIPTIONS = `${ROOT}/transcriptions`;
const JOB_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)$/;
const SEGMENTS_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/segments$/;
const FACEBOOK_METADATA_PREFLIGHT_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/facebook-ai-estimate-preflight$/;
const FACEBOOK_METADATA_START_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/facebook-ai-estimate$/;
const AI_PREFLIGHT_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/ai-preflight$/;
const AI_START_PATH = /^\/api\/v1\/media\/managed\/transcriptions\/(KRCM_[A-Za-z0-9-]+)\/ai$/;

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
        "The managed media request body is too large.",
        413,
        false
      );
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The request body is empty.",
      400,
      false
    );
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new MediaTranscriptError(
      "INVALID_REQUEST",
      "The request body is not valid JSON.",
      400,
      false
    );
  }
}

function withServerOwnerAccessCode(
  value: unknown,
  accessCodes: string[] | undefined
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  if (typeof input.beta_access_code === "string" && input.beta_access_code) {
    return value;
  }
  const ownerCode = accessCodes?.[0];
  if (!ownerCode) return value;
  return { ...input, beta_access_code: ownerCode };
}

function serverOwnerAccessCode(accessCodes: string[] | undefined): string {
  const ownerCode = accessCodes?.[0];
  if (!ownerCode) {
    throw new MediaTranscriptError(
      "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
      "The owner media admission code is not configured.",
      503,
      false
    );
  }
  return ownerCode;
}

function pagination(requestUrl: URL): { cursor: number; limit: number } {
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
  return { cursor, limit };
}

function defaultManagedService(config: AppConfig): ManagedMediaService {
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const store = databaseUrl
    ? new ManagedMediaPersistentStore(databaseUrl)
    : undefined;
  return new ManagedMediaService(
    new MediaBetaGate(
      config.mediaBetaCodes ?? [],
      config.mediaDailySttSeconds ?? 7200
    ),
    config.supadataApiKey ?? null,
    undefined,
    {
      ...(store ? { store } : {}),
      jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600
    }
  );
}

export function createManagedMediaHttpHandler(
  config: AppConfig,
  service = defaultManagedService(config)
) {
  const capability = {
    mode: "zero_client_managed_beta",
    provider: "supadata",
    configured: Boolean(config.mediaActionToken && service.configured),
    platforms: ["youtube", "instagram", "facebook"],
    native_transcript_credits: 1,
    credit_preflight_required: true,
    explicit_user_consent_required: true,
    consent_options: { approve: 1, reject: 2 },
    automatic_ai_fallback: false,
    instagram_reel_ai_fallback: true,
    facebook_ai_fallback: true,
    facebook_ai_requires_duration_metadata: true,
    facebook_ai_metadata_credits: 1,
    ai_requires_separate_preflight: true,
    ai_requires_separate_user_consent: true,
    ai_generate_credits_per_minute: GENERATED_TRANSCRIPT_CREDITS_PER_MINUTE,
    instagram_reel_ai_max_credits: INSTAGRAM_REEL_GENERATE_MAX_CREDITS,
    user_beta_access_code_required: false,
    owner_access_injected_server_side: true,
    durable_store: service.storeKind,
    restart_resilient_jobs: service.durableStore,
    duplicate_start_reuses_job: true
  } as const;

  const handle = async (
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<boolean> => {
    const requestUrl = new URL(request.url || "/", "http://voicebridge.local");
    const path = requestUrl.pathname;
    if (path !== ROOT && !path.startsWith(`${ROOT}/`)) return false;

    const context = createRequestContext(request);
    try {
      if (!config.mediaActionToken) {
        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
          "Managed media transcription is not configured.",
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

      const method = request.method || "GET";
      if (method === "GET" && path === ROOT) {
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...capability },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      if (method === "POST" && path === PREFLIGHT) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The managed media preflight request is not valid.",
            400,
            false
          );
        }
        const quote = await service.preflight(input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...quote },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      if (method === "POST" && path === LOOKUP) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaPreflightInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "The managed media lookup request is not valid.",
            400,
            false
          );
        }
        const job = await service.lookup(input);
        if (!job) {
          throw new MediaTranscriptError(
            "MEDIA_TRANSCRIPT_NOT_FOUND",
            "The managed media job was not found.",
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

      if (method === "POST" && path === TRANSCRIPTIONS) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaNativeInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "MEDIA_CREDIT_CONSENT_REQUIRED",
            "Explicit one-credit user consent is required before native transcript processing.",
            409,
            false
          );
        }
        const job = await service.startNative(input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const facebookMetadataPreflightMatch = FACEBOOK_METADATA_PREFLIGHT_PATH.exec(path);
      if (method === "GET" && facebookMetadataPreflightMatch?.[1]) {
        const quote = await service.facebookMetadataPreflight(
          facebookMetadataPreflightMatch[1],
          serverOwnerAccessCode(config.mediaBetaCodes)
        );
        sendJson(response, 200, { request_id: context.requestId, ...quote }, context, config.corsAllowedOrigin);
        return true;
      }

      const facebookMetadataStartMatch = FACEBOOK_METADATA_START_PATH.exec(path);
      if (method === "POST" && facebookMetadataStartMatch?.[1]) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaFacebookMetadataInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "MEDIA_METADATA_CREDIT_CONSENT_REQUIRED",
            "Separate one-credit metadata consent is required before Facebook duration lookup.",
            409,
            false
          );
        }
        const job = await service.startFacebookMetadata(
          facebookMetadataStartMatch[1],
          input
        );
        sendJson(response, 200, { request_id: context.requestId, ...job }, context, config.corsAllowedOrigin);
        return true;
      }

      const aiPreflightMatch = AI_PREFLIGHT_PATH.exec(path);
      if (method === "GET" && aiPreflightMatch?.[1]) {
        const quote = await service.aiPreflight(
          aiPreflightMatch[1],
          serverOwnerAccessCode(config.mediaBetaCodes)
        );
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...quote },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const aiStartMatch = AI_START_PATH.exec(path);
      if (method === "POST" && aiStartMatch?.[1]) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaAiInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "MEDIA_AI_CREDIT_CONSENT_REQUIRED",
            "Separate AI consent matching the latest AI preflight maximum is required before generated transcription.",
            409,
            false
          );
        }
        const job = await service.startAi(aiStartMatch[1], input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const segmentsMatch = SEGMENTS_PATH.exec(path);
      if (method === "GET" && segmentsMatch?.[1]) {
        const { cursor, limit } = pagination(requestUrl);
        const page = await service.page(segmentsMatch[1], cursor, limit);
        if (!page) {
          throw new MediaTranscriptError(
            "MEDIA_TRANSCRIPT_NOT_FOUND",
            "The managed media job was not found.",
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
        const job = await service.get(jobMatch[1]);
        if (!job) {
          throw new MediaTranscriptError(
            "MEDIA_TRANSCRIPT_NOT_FOUND",
            "The managed media job was not found.",
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
        "The requested managed media endpoint was not found.",
        404,
        false
      );
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MANAGED_MEDIA_REQUEST_FAILED",
          "The managed media request failed.",
          500,
          true
        );
      sendError(response, normalized, context, config.corsAllowedOrigin);
      return true;
    }
  };

  return { handle, capability };
}
