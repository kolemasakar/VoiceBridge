import type { Server as HttpServer, IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer, type RawData } from "ws";
import type { SessionStore } from "./session_store.js";
import type {
  SttConnection,
  SttProvider,
  SttTranscript
} from "./stt_provider.js";
import type { StreamTicketStore } from "./stream_ticket_store.js";

const STREAM_PATH = /^\/api\/v1\/sessions\/([A-Za-z0-9-]+)\/stream$/;
const BASE_PROTOCOL = "voicebridge.v1";
const TICKET_PROTOCOL_PREFIX = "voicebridge.ticket.";
const MAX_BINARY_FRAME_BYTES = 32768;
const MAX_CONTROL_FRAME_BYTES = 8192;
const MAX_UNACKED_FRAMES = 50;
const ACK_EVERY_FRAMES = 10;
const MAX_SERVER_BUFFERED_BYTES = 262144;

interface ClientEvent {
  event_type: string;
  sequence?: number;
  occurred_at?: string;
  data?: Record<string, unknown>;
}

interface StreamContext {
  sessionId: string;
  started: boolean;
  starting: boolean;
  stopping: boolean;
  framesReceived: number;
  bytesReceived: number;
  sequence: number;
  connectedAt: number;
  sttConnection: SttConnection | null;
  partialTranscripts: number;
  finalTranscripts: number;
  latencyTotalMs: number;
  latencyMaximumMs: number;
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string): void {
  const body = JSON.stringify({ error: message });
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\n` +
    "Connection: close\r\n" +
    "Content-Type: application/json\r\n" +
    `Content-Length: ${Buffer.byteLength(body)}\r\n` +
    "\r\n" +
    body
  );
  socket.destroy();
}

function parseProtocols(request: IncomingMessage): string[] {
  const header = request.headers["sec-websocket-protocol"];
  if (typeof header !== "string") {
    return [];
  }
  return header.split(",").map((value) => value.trim()).filter(Boolean);
}

function ticketFromProtocols(protocols: string[]): string | null {
  const ticketProtocol = protocols.find((protocol) =>
    protocol.startsWith(TICKET_PROTOCOL_PREFIX)
  );
  return ticketProtocol?.slice(TICKET_PROTOCOL_PREFIX.length) || null;
}

function rawDataLength(data: RawData): number {
  if (Array.isArray(data)) {
    return data.reduce((total, part) => total + part.byteLength, 0);
  }
  return data.byteLength;
}

function rawDataText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

function rawDataBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function validStartPayload(payload: Record<string, unknown> | undefined): boolean {
  return Boolean(
    payload &&
    payload.format === "pcm_s16le" &&
    typeof payload.sample_rate_hz === "number" &&
    payload.sample_rate_hz >= 8000 &&
    payload.sample_rate_hz <= 96000 &&
    payload.channels === 1 &&
    typeof payload.frame_duration_ms === "number" &&
    payload.frame_duration_ms >= 10 &&
    payload.frame_duration_ms <= 100
  );
}

function summary(context: StreamContext): Record<string, unknown> {
  const transcriptCount =
    context.partialTranscripts + context.finalTranscripts;
  return {
    frames_received: context.framesReceived,
    bytes_received: context.bytesReceived,
    duration_ms: Date.now() - context.connectedAt,
    partial_transcripts: context.partialTranscripts,
    final_transcripts: context.finalTranscripts,
    average_recognition_latency_ms: transcriptCount > 0
      ? Math.round(context.latencyTotalMs / transcriptCount)
      : null,
    maximum_recognition_latency_ms: transcriptCount > 0
      ? context.latencyMaximumMs
      : null
  };
}

export function attachStreamTransport(
  server: HttpServer,
  sessions: SessionStore,
  tickets: StreamTicketStore,
  allowedOrigin: string,
  sttProvider: SttProvider
): void {
  const requestSessions = new WeakMap<IncomingMessage, string>();
  const activeSessions = new Map<string, WebSocket>();
  const webSocketServer = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: MAX_BINARY_FRAME_BYTES,
    handleProtocols: (protocols) =>
      protocols.has(BASE_PROTOCOL) ? BASE_PROTOCOL : false
  });

  server.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url || "/", "http://voicebridge.local").pathname;
    const match = STREAM_PATH.exec(path);

    if (!match?.[1]) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    if (
      allowedOrigin !== "*" &&
      request.headers.origin !== allowedOrigin
    ) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }

    const sessionId = match[1];
    const session = sessions.get(sessionId);
    if (!session || session.state !== "ACTIVE") {
      rejectUpgrade(socket, 409, "Session Not Active");
      return;
    }

    if (activeSessions.has(sessionId)) {
      rejectUpgrade(socket, 409, "Stream Already Active");
      return;
    }

    const protocols = parseProtocols(request);
    const ticket = ticketFromProtocols(protocols);
    if (!protocols.includes(BASE_PROTOCOL) || !ticket) {
      rejectUpgrade(socket, 401, "Authentication Required");
      return;
    }

    if (!tickets.consume(ticket, sessionId)) {
      rejectUpgrade(socket, 401, "Invalid Stream Ticket");
      return;
    }

    requestSessions.set(request, sessionId);
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (webSocket, request) => {
    const sessionId = requestSessions.get(request);
    if (!sessionId) {
      webSocket.close(1011, "Missing stream context");
      return;
    }

    activeSessions.set(sessionId, webSocket);
    const context: StreamContext = {
      sessionId,
      started: false,
      starting: false,
      stopping: false,
      framesReceived: 0,
      bytesReceived: 0,
      sequence: 0,
      connectedAt: Date.now(),
      sttConnection: null,
      partialTranscripts: 0,
      finalTranscripts: 0,
      latencyTotalMs: 0,
      latencyMaximumMs: 0
    };
    const correlationId = randomUUID();

    const sendEvent = (
      eventType: string,
      data: Record<string, unknown>
    ): void => {
      if (webSocket.readyState !== WebSocket.OPEN) {
        return;
      }
      context.sequence += 1;
      webSocket.send(JSON.stringify({
        event_id: randomUUID(),
        event_type: eventType,
        sequence: context.sequence,
        session_id: sessionId,
        occurred_at: new Date().toISOString(),
        correlation_id: correlationId,
        data
      }));
    };

    sendEvent("STREAM_READY", {
      protocol: BASE_PROTOCOL,
      max_binary_frame_bytes: MAX_BINARY_FRAME_BYTES,
      max_unacked_frames: MAX_UNACKED_FRAMES,
      ack_every_frames: ACK_EVERY_FRAMES,
      stt_provider: sttProvider.name,
      stt_configured: sttProvider.configured
    });

    const handleTranscript = (transcript: SttTranscript): void => {
      if (transcript.isFinal) {
        context.finalTranscripts += 1;
      } else {
        context.partialTranscripts += 1;
      }
      context.latencyTotalMs += transcript.recognitionLatencyMs;
      context.latencyMaximumMs = Math.max(
        context.latencyMaximumMs,
        transcript.recognitionLatencyMs
      );

      sendEvent(
        transcript.isFinal ? "TRANSCRIPT_FINAL" : "TRANSCRIPT_PARTIAL",
        {
          provider: sttProvider.name,
          text: transcript.text,
          is_final: transcript.isFinal,
          speech_final: transcript.speechFinal,
          confidence: transcript.confidence,
          audio_start_ms: transcript.audioStartMs,
          audio_duration_ms: transcript.audioDurationMs,
          recognition_latency_ms: transcript.recognitionLatencyMs
        }
      );
    };

    webSocket.on("message", async (data, isBinary) => {
      if (isBinary) {
        const frameBytes = rawDataLength(data);
        if (!context.started) {
          webSocket.close(1008, "stream.start is required");
          return;
        }
        if (frameBytes === 0 || frameBytes > MAX_BINARY_FRAME_BYTES) {
          webSocket.close(1009, "Invalid binary frame size");
          return;
        }

        context.framesReceived += 1;
        context.bytesReceived += frameBytes;

        const forwarded = context.sttConnection?.sendAudio(
          rawDataBuffer(data)
        ) ?? false;
        if (!forwarded) {
          sendEvent("STT_ERROR", {
            provider: sttProvider.name,
            code: "STT_PROVIDER_BACKPRESSURE",
            message: "The STT provider cannot accept audio fast enough.",
            retryable: true
          });
          webSocket.close(1013, "STT provider backpressure");
          return;
        }

        if (context.framesReceived % ACK_EVERY_FRAMES === 0) {
          sendEvent("AUDIO_ACK", {
            frames_received: context.framesReceived,
            bytes_received: context.bytesReceived
          });
        }

        if (webSocket.bufferedAmount > MAX_SERVER_BUFFERED_BYTES) {
          sendEvent("BACKPRESSURE_REQUIRED", {
            action: "PAUSE",
            reason: "server_output_buffer",
            retry_after_ms: 100
          });
        }
        return;
      }

      if (rawDataLength(data) > MAX_CONTROL_FRAME_BYTES) {
        webSocket.close(1009, "Control frame is too large");
        return;
      }

      let event: ClientEvent;
      try {
        event = JSON.parse(rawDataText(data)) as ClientEvent;
      } catch {
        webSocket.close(1007, "Control frame is not valid JSON");
        return;
      }

      if (event.event_type === "STREAM_START") {
        if (
          context.started ||
          context.starting ||
          !validStartPayload(event.data)
        ) {
          webSocket.close(1008, "Invalid stream.start event");
          return;
        }

        context.starting = true;
        sendEvent("STT_STATUS", {
          provider: sttProvider.name,
          status: sttProvider.configured ? "CONNECTING" : "NOT_CONFIGURED"
        });

        try {
          context.sttConnection = await sttProvider.connect(
            {
              sampleRateHz: Number(event.data?.sample_rate_hz),
              channels: 1,
              language: "en-US"
            },
            {
              onStatus: (status) => sendEvent("STT_STATUS", {
                provider: sttProvider.name,
                status
              }),
              onTranscript: handleTranscript,
              onError: (code, message) => sendEvent("STT_ERROR", {
                provider: sttProvider.name,
                code,
                message,
                retryable: false
              })
            }
          );
          context.started = true;
          context.starting = false;
          sendEvent("STREAM_STARTED", {
            accepted_format: "pcm_s16le",
            stt_provider: sttProvider.name,
            stt_configured: sttProvider.configured,
            ...event.data
          });
        } catch (error) {
          context.starting = false;
          sendEvent("STT_ERROR", {
            provider: sttProvider.name,
            code: "STT_CONNECTION_FAILED",
            message: error instanceof Error
              ? error.message
              : "Unable to connect to the STT provider.",
            retryable: true
          });
          webSocket.close(1011, "STT connection failed");
        }
        return;
      }

      if (event.event_type === "STREAM_STOP") {
        if (context.stopping) {
          return;
        }
        context.stopping = true;
        await context.sttConnection?.close();
        sendEvent("STREAM_COMPLETED", summary(context));
        webSocket.close(1000, "Stream completed");
        return;
      }

      if (event.event_type === "PING") {
        sendEvent("PONG", { client_sequence: event.sequence ?? null });
        return;
      }

      webSocket.close(1008, "Unknown control event");
    });

    webSocket.on("close", () => {
      if (activeSessions.get(sessionId) === webSocket) {
        activeSessions.delete(sessionId);
      }
      if (!context.stopping) {
        context.stopping = true;
        context.sttConnection?.close().catch(() => undefined);
      }
    });
  });

  server.on("close", () => {
    for (const webSocket of activeSessions.values()) {
      webSocket.terminate();
    }
    activeSessions.clear();
    webSocketServer.close();
  });
}
