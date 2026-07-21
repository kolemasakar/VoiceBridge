import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import { createRequestContext, type RequestContext } from "./identifiers.js";
import { FixedWindowRateLimiter } from "./rate_limit.js";
import {
  InvalidSessionStateError,
  SessionStore,
  type CreateSessionInput,
  type Session
} from "./session_store.js";
import { StreamTicketStore } from "./stream_ticket_store.js";
import { attachStreamTransport } from "./stream_transport.js";
import {
  createSttProvider,
  type SttProvider
} from "./stt_provider.js";
import {
  createTranslationProvider,
  type TranslationProvider
} from "./translation_provider.js";
import {
  createTtsProvider,
  type TtsProvider
} from "./tts_provider.js";

const SERVICE_NAME = "voicebridge-cloud";
const SERVICE_VERSION = "0.5.1";
const SESSION_PATH = /^\/api\/v1\/sessions\/([A-Za-z0-9-]+)$/;
const COMMAND_PATH =
  /^\/api\/v1\/sessions\/([A-Za-z0-9-]+)\/(start|pause|resume|stop)$/;
const STREAM_TICKET_PATH =
  /^\/api\/v1\/sessions\/([A-Za-z0-9-]+)\/stream-ticket$/;

interface ApiError {
  error: {
    code: string;
    message: string;
    category: string;
    retryable: boolean;
    request_id: string;
    session_id: string | null;
    correlation_id: string;
    details: unknown[];
  };
}

function setCommonHeaders(
  response: ServerResponse,
  context: RequestContext,
  origin: string
): void {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, x-request-id, x-correlation-id"
  );
  response.setHeader(
    "access-control-allow-methods",
    "GET, POST, OPTIONS"
  );
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
  setCommonHeaders(response, context, origin);
  response.statusCode = statusCode;
  response.end(JSON.stringify(body));
}

function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  category: string,
  retryable: boolean,
  context: RequestContext,
  origin: string,
  sessionId: string | null = null
): void {
  const body: ApiError = {
    error: {
      code,
      message,
      category,
      retryable,
      request_id: context.requestId,
      session_id: sessionId,
      correlation_id: context.correlationId,
      details: []
    }
  };
  sendJson(response, statusCode, body, context, origin);
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maximumBytes) {
      throw new Error("REQUEST_BODY_TOO_LARGE");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    throw new Error("INVALID_JSON");
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseCreateSessionInput(value: unknown): CreateSessionInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  const providers = input.provider_preferences as
    | Record<string, unknown>
    | undefined;
  const voice = input.voice as Record<string, unknown> | undefined;
  if (
    input.source_language !== "en" ||
    input.target_language !== "uk" ||
    input.runtime_mode !== "YOUTUBE_MVP" ||
    input.input_type !== "BROWSER_AUDIO" ||
    input.output_type !== "BROWSER_PLAYBACK" ||
    !providers ||
    !isNullableString(providers.recognition) ||
    !isNullableString(providers.translation) ||
    !isNullableString(providers.synthesis) ||
    !voice ||
    !isNullableString(voice.voice_id) ||
    !(
      voice.speaking_rate === null ||
      (typeof voice.speaking_rate === "number" &&
        voice.speaking_rate >= 0.5 &&
        voice.speaking_rate <= 2)
    )
  ) {
    return null;
  }

  return {
    source_language: "en",
    target_language: "uk",
    runtime_mode: "YOUTUBE_MVP",
    input_type: "BROWSER_AUDIO",
    output_type: "BROWSER_PLAYBACK",
    provider_preferences: {
      recognition: providers.recognition,
      translation: providers.translation,
      synthesis: providers.synthesis
    },
    voice: {
      voice_id: voice.voice_id,
      speaking_rate: voice.speaking_rate
    }
  };
}

function withRequestId(session: Session, requestId: string): Session & {
  request_id: string;
} {
  return { request_id: requestId, ...session };
}

function clientKey(request: IncomingMessage): string {
  return request.socket.remoteAddress || "unknown";
}

export function createVoiceBridgeServer(
  config: AppConfig,
  sessionStore = new SessionStore(),
  sttProvider: SttProvider = createSttProvider(config.assemblyAiApiKey),
  translationProvider: TranslationProvider = createTranslationProvider(
    config.geminiApiKey,
    config.geminiTranslationModel
  ),
  ttsProvider: TtsProvider = createTtsProvider({
    provider: config.ttsProvider,
    geminiApiKey: config.geminiApiKey,
    geminiModel: config.geminiTtsModel,
    geminiVoice: config.geminiTtsVoice,
    azureSpeechKey: config.azureSpeechKey,
    azureSpeechRegion: config.azureSpeechRegion,
    azureVoice: config.azureTtsVoice
  })
) {
  const rateLimiter = new FixedWindowRateLimiter(
    config.rateLimitRequestsPerMinute
  );
  const streamTickets = new StreamTicketStore();
  const selectedTtsVoice = ttsProvider.name === "azure"
    ? config.azureTtsVoice || "uk-UA-OstapNeural"
    : config.geminiTtsVoice || "Iapetus";
  const selectedTtsModel = ttsProvider.name === "azure"
    ? null
    : config.geminiTtsModel || "gemini-2.5-flash-preview-tts";
  const selectedTtsRegion = ttsProvider.name === "azure"
    ? config.azureSpeechRegion || "eastus"
    : null;

  const server = createServer(async (request, response) => {
    const context = createRequestContext(request);
    const method = request.method || "GET";
    const path = new URL(request.url || "/", "http://voicebridge.local").pathname;

    if (method === "OPTIONS") {
      setCommonHeaders(response, context, config.corsAllowedOrigin);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (!rateLimiter.allow(clientKey(request))) {
      response.setHeader("retry-after", "60");
      sendError(
        response,
        429,
        "RATE_LIMITED",
        "The request limit was reached.",
        "AUTH",
        true,
        context,
        config.corsAllowedOrigin
      );
      return;
    }

    if (method === "GET" && path === "/api/v1/health") {
      sendJson(
        response,
        200,
        {
          status: "ok",
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          capabilities: {
            stt: {
              provider: sttProvider.name,
              configured: sttProvider.configured
            },
            translation: {
              provider: translationProvider.name,
              configured: translationProvider.configured,
              model: config.geminiTranslationModel
            },
            tts: {
              provider: ttsProvider.name,
              configured: ttsProvider.configured,
              model: selectedTtsModel,
              voice: selectedTtsVoice,
              region: selectedTtsRegion,
              audio_format: "pcm_s16le",
              sample_rate_hz: 24000,
              channels: 1
            }
          },
          request_id: context.requestId,
          correlation_id: context.correlationId,
          timestamp: new Date().toISOString()
        },
        context,
        config.corsAllowedOrigin
      );
      return;
    }

    const authentication = authenticate(request, config.testAccessToken);
    if (!authentication.ok) {
      sendError(
        response,
        401,
        authentication.code,
        authentication.code === "AUTHENTICATION_REQUIRED"
          ? "A bearer token is required."
          : "The bearer token is invalid or revoked.",
        "AUTH",
        false,
        context,
        config.corsAllowedOrigin
      );
      return;
    }

    if (method === "POST" && path === "/api/v1/sessions") {
      try {
        const body = await readJsonBody(request, config.maxRequestBodyBytes);
        const input = parseCreateSessionInput(body);
        if (!input) {
          sendError(
            response,
            400,
            "INVALID_REQUEST",
            "The session request is not valid.",
            "VALIDATION",
            false,
            context,
            config.corsAllowedOrigin
          );
          return;
        }
        const session = sessionStore.create(input);
        sendJson(
          response,
          201,
          withRequestId(session, context.requestId),
          context,
          config.corsAllowedOrigin
        );
      } catch (error) {
        const tooLarge =
          error instanceof Error && error.message === "REQUEST_BODY_TOO_LARGE";
        sendError(
          response,
          tooLarge ? 413 : 400,
          tooLarge ? "REQUEST_BODY_TOO_LARGE" : "INVALID_REQUEST",
          tooLarge
            ? "The request body is too large."
            : "The request body is not valid JSON.",
          "VALIDATION",
          false,
          context,
          config.corsAllowedOrigin
        );
      }
      return;
    }

    const sessionMatch = SESSION_PATH.exec(path);
    if (method === "GET" && sessionMatch?.[1]) {
      const session = sessionStore.get(sessionMatch[1]);
      if (!session) {
        sendError(
          response,
          404,
          "SESSION_NOT_FOUND",
          "The session was not found.",
          "SESSION",
          false,
          context,
          config.corsAllowedOrigin,
          sessionMatch[1]
        );
        return;
      }
      sendJson(
        response,
        200,
        withRequestId(session, context.requestId),
        context,
        config.corsAllowedOrigin
      );
      return;
    }

    const streamTicketMatch = STREAM_TICKET_PATH.exec(path);
    if (method === "POST" && streamTicketMatch?.[1]) {
      const session = sessionStore.get(streamTicketMatch[1]);
      if (!session) {
        sendError(
          response,
          404,
          "SESSION_NOT_FOUND",
          "The session was not found.",
          "SESSION",
          false,
          context,
          config.corsAllowedOrigin,
          streamTicketMatch[1]
        );
        return;
      }
      if (session.state !== "ACTIVE") {
        sendError(
          response,
          409,
          "INVALID_SESSION_STATE",
          "A stream ticket requires an ACTIVE session.",
          "SESSION",
          false,
          context,
          config.corsAllowedOrigin,
          session.session_id
        );
        return;
      }
      const ticket = streamTickets.issue(session.session_id);
      sendJson(
        response,
        201,
        {
          request_id: context.requestId,
          session_id: session.session_id,
          stream_path: `/api/v1/sessions/${session.session_id}/stream`,
          protocols: [
            "voicebridge.v1",
            `voicebridge.ticket.${ticket.ticket}`
          ],
          expires_at: new Date(ticket.expiresAt).toISOString()
        },
        context,
        config.corsAllowedOrigin
      );
      return;
    }

    const commandMatch = COMMAND_PATH.exec(path);
    if (method === "POST" && commandMatch?.[1] && commandMatch[2]) {
      try {
        const session = sessionStore.command(commandMatch[1], commandMatch[2]);
        if (!session) {
          sendError(
            response,
            404,
            "SESSION_NOT_FOUND",
            "The session was not found.",
            "SESSION",
            false,
            context,
            config.corsAllowedOrigin,
            commandMatch[1]
          );
          return;
        }
        sendJson(
          response,
          200,
          withRequestId(session, context.requestId),
          context,
          config.corsAllowedOrigin
        );
      } catch (error) {
        if (error instanceof InvalidSessionStateError) {
          sendError(
            response,
            409,
            "INVALID_SESSION_STATE",
            error.message,
            "SESSION",
            false,
            context,
            config.corsAllowedOrigin,
            commandMatch[1]
          );
          return;
        }
        throw error;
      }
      return;
    }

    sendError(
      response,
      404,
      "NOT_FOUND",
      "The requested endpoint was not found.",
      "ROUTING",
      false,
      context,
      config.corsAllowedOrigin
    );
  });

  attachStreamTransport(
    server,
    sessionStore,
    streamTickets,
    config.corsAllowedOrigin,
    sttProvider,
    translationProvider,
    ttsProvider,
    selectedTtsVoice
  );
  return server;
}

export async function listen(
  config: AppConfig
): Promise<{ server: ReturnType<typeof createVoiceBridgeServer>; url: string }> {
  const server = createVoiceBridgeServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    url: `http://${address.address}:${address.port}`
  };
}
