import type { IncomingMessage, ServerResponse } from "node:http";
import { authenticate } from "./auth.js";
import type { AppConfig } from "./config.js";
import type { RequestContext } from "./identifiers.js";
import { MediaBetaGate } from "./media_beta.js";
import {
  MAX_CLIENT_AUDIO_BYTES,
  MediaClientIngestService,
  type MediaClientCaptionsInput,
  type MediaClientTranscriptJobView
} from "./media_client_ingest.js";
import {
  MediaClientPersistentStore,
  mediaClientAccessDigest,
  mediaClientAccessMatches,
  mediaClientRequestKey,
  type PersistedMediaClientJob
} from "./media_client_persistence.js";
import { parseMediaBetaTranscriptInput } from "./media_beta_service.js";
import {
  MediaTranscriptError,
  type MediaTranscriptSegment
} from "./media_transcript.js";

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

function isTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

function externalizeJob(
  job: MediaClientTranscriptJobView,
  externalJobId: string
): MediaClientTranscriptJobView {
  return { ...job, job_id: externalJobId };
}

function interruptedJob(
  job: MediaClientTranscriptJobView
): MediaClientTranscriptJobView {
  const now = new Date().toISOString();
  return {
    ...job,
    status: "FAILED",
    updated_at: now,
    client_upload_required: false,
    error: {
      code: "MEDIA_CLIENT_INTERRUPTED_RETRY_REQUIRED",
      message: "The browser media operation was interrupted by a backend restart. Create a fresh KRCC job and retry.",
      retryable: true
    }
  };
}

export function createMediaClientHttpHandler(config: AppConfig) {
  const betaGate = new MediaBetaGate(
    config.mediaBetaCodes ?? [],
    config.mediaDailySttSeconds ?? 7200
  );
  const service = new MediaClientIngestService({
    assemblyAiApiKey: config.assemblyAiApiKey,
    betaGate,
    maxDurationSeconds: config.mediaMaxDurationSeconds ?? 3600,
    jobTtlSeconds: config.mediaJobTtlSeconds ?? 3600,
    maxConcurrentJobs: config.mediaMaxConcurrentJobs ?? 1
  });
  const jobTtlSeconds = config.mediaJobTtlSeconds ?? 3600;
  const databaseUrl = process.env.KRC_MEDIA_DATABASE_URL?.trim() || null;
  const persistentStore = new MediaClientPersistentStore(databaseUrl);
  const recordCache = new Map<string, PersistedMediaClientJob>();
  const lastPersistedVersion = new Map<string, string>();

  const durabilityReady = (async () => {
    if (!persistentStore.enabled) return;
    await persistentStore.ready();
    await persistentStore.purgeExpired();
    const dayUtc = new Date().toISOString().slice(0, 10);
    const durableUsedSeconds = await persistentStore.sumSttCharges(dayUtc);
    betaGate.restoreUsage(dayUtc, durableUsedSeconds);
  })();

  const capability = {
    mode: service.mode,
    configured: Boolean(config.mediaActionToken && service.configured),
    upload_max_bytes: MAX_CLIENT_AUDIO_BYTES,
    requires_browser_helper: true,
    durable_store: persistentStore.enabled ? "postgres" : "memory",
    restart_resilient_waiting_jobs: persistentStore.enabled,
    durable_quota_ledger: persistentStore.enabled
  } as const;

  const ensureDurability = async (): Promise<void> => {
    try {
      await durabilityReady;
    } catch {
      throw new MediaTranscriptError(
        "MEDIA_DURABLE_STORE_UNAVAILABLE",
        "The MEDIA BETA durable job store is temporarily unavailable.",
        503,
        true
      );
    }
  };

  const expiryFor = (job: MediaClientTranscriptJobView): string => {
    const base = job.status === "AWAITING_CLIENT"
      ? Date.parse(job.created_at)
      : Date.parse(job.updated_at);
    return new Date(base + jobTtlSeconds * 1000).toISOString();
  };

  const recordFor = async (
    jobId: string
  ): Promise<PersistedMediaClientJob | null> => {
    if (!persistentStore.enabled) return null;
    const cached = recordCache.get(jobId);
    if (cached) return cached;
    const record = await persistentStore.get(jobId);
    if (record) recordCache.set(jobId, record);
    return record;
  };

  const saveRecord = async (
    record: PersistedMediaClientJob,
    force = false
  ): Promise<void> => {
    if (!persistentStore.enabled) return;
    const version = [
      record.job.updated_at,
      record.job.status,
      record.job.stt_seconds_charged,
      record.internalJobId || "",
      record.segments.length
    ].join("|");
    if (!force && lastPersistedVersion.get(record.job.job_id) === version) {
      recordCache.set(record.job.job_id, record);
      return;
    }
    await persistentStore.put(record);
    recordCache.set(record.job.job_id, record);
    lastPersistedVersion.set(record.job.job_id, version);
  };

  const liveSegments = (
    liveJobId: string
  ): MediaTranscriptSegment[] => {
    const output: MediaTranscriptSegment[] = [];
    let cursor = 0;
    for (;;) {
      const page = service.page(liveJobId, cursor, 50);
      if (!page || page.segments.length === 0) break;
      output.push(...page.segments);
      if (page.next_cursor === null) break;
      cursor = page.next_cursor;
    }
    return output;
  };

  const saveLiveSnapshot = async (
    externalJobId: string,
    liveJobId: string,
    liveJob: MediaClientTranscriptJobView,
    record: PersistedMediaClientJob
  ): Promise<MediaClientTranscriptJobView> => {
    const externalJob = externalizeJob(liveJob, externalJobId);
    const segments = externalJob.status === "COMPLETED"
      ? liveSegments(liveJobId)
      : record.segments;
    const updated: PersistedMediaClientJob = {
      ...record,
      job: externalJob,
      internalJobId: liveJobId === externalJobId ? null : liveJobId,
      segments,
      expiresAt: expiryFor(externalJob)
    };
    await saveRecord(updated);
    return externalJob;
  };

  const requireOwnedRecord = async (
    jobId: string,
    accessCode: string
  ): Promise<PersistedMediaClientJob | null> => {
    const record = await recordFor(jobId);
    if (!record) return null;
    if (!mediaClientAccessMatches(record.accessCodeDigest, accessCode)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The beta access code does not own this media job.",
        403,
        false
      );
    }
    return record;
  };

  const rehydrateWaitingJob = async (
    record: PersistedMediaClientJob,
    accessCode: string
  ): Promise<string> => {
    if (record.job.status !== "AWAITING_CLIENT") {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_INVALID_STATE",
        "The media job is not waiting for browser source content.",
        409,
        false
      );
    }
    const started = service.start({
      url: record.job.source_url,
      language_hint: record.job.language_hint,
      beta_access_code: accessCode
    });
    const internalJobId = started.job.job_id;
    const updated: PersistedMediaClientJob = {
      ...record,
      internalJobId
    };
    await saveRecord(updated, true);
    return internalJobId;
  };

  const resolveClientStatus = async (
    externalJobId: string,
    accessCode: string
  ): Promise<MediaClientTranscriptJobView> => {
    const record = await requireOwnedRecord(externalJobId, accessCode);
    const liveJobId = record?.internalJobId || externalJobId;
    try {
      const liveJob = service.getForClient(liveJobId, accessCode);
      if (record) {
        return await saveLiveSnapshot(
          externalJobId,
          liveJobId,
          liveJob,
          record
        );
      }
      return externalizeJob(liveJob, externalJobId);
    } catch (error) {
      if (!(error instanceof MediaTranscriptError) || error.code !== "MEDIA_TRANSCRIPT_NOT_FOUND") {
        throw error;
      }
      if (!record) throw error;
      if (record.job.status === "AWAITING_CLIENT" || isTerminal(record.job.status)) {
        return record.job;
      }
      const failed = interruptedJob(record.job);
      const updated = {
        ...record,
        job: failed,
        internalJobId: null,
        expiresAt: expiryFor(failed)
      };
      await saveRecord(updated, true);
      return failed;
    }
  };

  const resolveActionStatus = async (
    externalJobId: string
  ): Promise<MediaClientTranscriptJobView | null> => {
    const record = await recordFor(externalJobId);
    const liveJobId = record?.internalJobId || externalJobId;
    const liveJob = service.get(liveJobId);
    if (liveJob) {
      if (record) {
        return saveLiveSnapshot(externalJobId, liveJobId, liveJob, record);
      }
      return externalizeJob(liveJob, externalJobId);
    }
    if (!record) return null;
    if (record.job.status === "AWAITING_CLIENT" || isTerminal(record.job.status)) {
      return record.job;
    }
    const failed = interruptedJob(record.job);
    await saveRecord({
      ...record,
      job: failed,
      internalJobId: null,
      expiresAt: expiryFor(failed)
    }, true);
    return failed;
  };

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
      await ensureDurability();

      const captionsMatch = CAPTIONS_PATH.exec(path);
      if (method === "POST" && captionsMatch?.[1]) {
        const externalJobId = captionsMatch[1];
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

        const record = await requireOwnedRecord(externalJobId, code);
        let liveJobId = record?.internalJobId || externalJobId;
        let job: MediaClientTranscriptJobView;
        try {
          job = service.acceptCaptions(
            liveJobId,
            code,
            activeSourceUrl,
            captions
          );
        } catch (error) {
          if (
            persistentStore.enabled &&
            record &&
            error instanceof MediaTranscriptError &&
            error.code === "MEDIA_TRANSCRIPT_NOT_FOUND"
          ) {
            liveJobId = await rehydrateWaitingJob(record, code);
            job = service.acceptCaptions(
              liveJobId,
              code,
              activeSourceUrl,
              captions
            );
          } else {
            throw error;
          }
        }

        const externalJob = externalizeJob(job, externalJobId);
        if (record) {
          await saveRecord({
            ...record,
            job: externalJob,
            internalJobId: null,
            segments: liveSegments(liveJobId),
            expiresAt: expiryFor(externalJob)
          }, true);
        }
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...externalJob },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

      const audioMatch = AUDIO_PATH.exec(path);
      if (method === "POST" && audioMatch?.[1]) {
        const externalJobId = audioMatch[1];
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
        const record = await requireOwnedRecord(externalJobId, code);
        let liveJobId = record?.internalJobId || externalJobId;
        let job: MediaClientTranscriptJobView;
        try {
          job = service.acceptAudio(
            liveJobId,
            code,
            activeSourceUrl,
            contentType(request),
            audio
          );
        } catch (error) {
          if (
            persistentStore.enabled &&
            record &&
            error instanceof MediaTranscriptError &&
            error.code === "MEDIA_TRANSCRIPT_NOT_FOUND"
          ) {
            liveJobId = await rehydrateWaitingJob(record, code);
            job = service.acceptAudio(
              liveJobId,
              code,
              activeSourceUrl,
              contentType(request),
              audio
            );
          } else {
            throw error;
          }
        }

        const externalJob = externalizeJob(job, externalJobId);
        if (record) {
          await saveRecord({
            ...record,
            job: externalJob,
            internalJobId: liveJobId === externalJobId ? null : liveJobId,
            expiresAt: expiryFor(externalJob)
          }, true);
        }
        sendJson(
          response,
          202,
          { request_id: context.requestId, ...externalJob },
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
        const job = await resolveClientStatus(clientStatusMatch[1], code);
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

        const requestKey = mediaClientRequestKey(
          input.url,
          input.language_hint,
          input.beta_access_code
        );
        if (persistentStore.enabled) {
          const existing = await persistentStore.findByRequestKey(requestKey);
          if (existing) {
            recordCache.set(existing.job.job_id, existing);
            sendJson(
              response,
              202,
              {
                request_id: context.requestId,
                reused: true,
                ...existing.job
              },
              context,
              config.corsAllowedOrigin
            );
            return true;
          }
          if (await persistentStore.hasOtherActiveJob(requestKey)) {
            throw new MediaTranscriptError(
              "MEDIA_TRANSCRIPT_BUSY",
              "The closed media beta is processing another video.",
              429,
              true
            );
          }
        }

        const started = service.start(input);
        if (persistentStore.enabled) {
          const record: PersistedMediaClientJob = {
            job: started.job,
            requestKey,
            accessCodeDigest: mediaClientAccessDigest(input.beta_access_code),
            internalJobId: null,
            segments: [],
            expiresAt: expiryFor(started.job)
          };
          await saveRecord(record, true);
        }
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
        const externalJobId = segmentsMatch[1];
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

        const record = await recordFor(externalJobId);
        const liveJobId = record?.internalJobId || externalJobId;
        const livePage = service.page(liveJobId, cursor, limit);
        if (livePage) {
          if (record) {
            const liveJob = service.get(liveJobId);
            if (liveJob) {
              await saveLiveSnapshot(
                externalJobId,
                liveJobId,
                liveJob,
                record
              );
            }
          }
          sendJson(
            response,
            200,
            {
              request_id: context.requestId,
              ...livePage,
              job_id: externalJobId
            },
            context,
            config.corsAllowedOrigin
          );
          return true;
        }

        if (record) {
          let job = record.job;
          if (!isTerminal(job.status) && job.status !== "AWAITING_CLIENT") {
            job = interruptedJob(job);
            await saveRecord({
              ...record,
              job,
              internalJobId: null,
              expiresAt: expiryFor(job)
            }, true);
          }
          const segments = job.status === "COMPLETED"
            ? record.segments.slice(cursor, cursor + limit)
            : [];
          const next = cursor + segments.length;
          sendJson(
            response,
            200,
            {
              request_id: context.requestId,
              job_id: externalJobId,
              status: job.status,
              cursor,
              next_cursor: next < record.segments.length ? next : null,
              segments
            },
            context,
            config.corsAllowedOrigin
          );
          return true;
        }

        throw new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_NOT_FOUND",
          "The client-assisted media job was not found or expired.",
          404,
          false
        );
      }

      const jobMatch = JOB_PATH.exec(path);
      if (method === "GET" && jobMatch?.[1]) {
        const job = await resolveActionStatus(jobMatch[1]);
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
