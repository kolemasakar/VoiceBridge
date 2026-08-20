import { spawn } from "node:child_process";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaBetaGate, type MediaBetaUsage } from "./media_beta.js";
import {
  MediaTranscriptError,
  chunkTranscriptWords,
  normalizeMediaUrl,
  type MediaLanguageHint,
  type MediaTranscriptSegment,
  type MediaTranscriptStatus
} from "./media_transcript.js";

const ASSEMBLYAI_BASE_URL = (
  process.env.KRC_MEDIA_ASSEMBLYAI_BASE_URL || "https://api.assemblyai.com"
).replace(/\/+$/, "");
const ASSEMBLYAI_ASYNC_MODEL = "universal-2";
const COMMAND_TIMEOUT_MS = 120000;
const TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
export const MAX_CLIENT_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_STT_MEDIA_BYTES = 32 * 1024 * 1024;

export interface MediaClientTranscriptInput {
  url: string;
  language_hint: MediaLanguageHint;
  beta_access_code: string;
}

export interface MediaClientCaptionSegmentInput {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface MediaClientCaptionsInput {
  language: string;
  caption_type: "manual" | "auto_generated";
  segments: MediaClientCaptionSegmentInput[];
}

export type MediaClientTranscriptStatus =
  | MediaTranscriptStatus
  | "AWAITING_CLIENT";

export interface MediaClientTranscriptJobView {
  job_id: string;
  status: MediaClientTranscriptStatus;
  created_at: string;
  updated_at: string;
  source_url: string;
  language_hint: MediaLanguageHint;
  detected_language: string | null;
  language_confidence: number | null;
  ingress_mode: "client_assisted";
  client_upload_required: boolean;
  transcript_source: "assemblyai_stt" | "youtube_captions" | null;
  caption_type: "manual" | "auto_generated" | null;
  provider: "assemblyai" | "youtube" | null;
  provider_model: string | null;
  provider_data_deleted: boolean | null;
  stt_seconds_charged: number;
  beta_quota: MediaBetaUsage;
  media: {
    platform: "youtube";
    title: string | null;
    channel: string | null;
    duration_seconds: number | null;
    canonical_url: string | null;
  };
  transcript_characters: number;
  segment_count: number;
  error: null | {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface MediaClientTranscriptPage {
  job_id: string;
  status: MediaClientTranscriptStatus;
  cursor: number;
  next_cursor: number | null;
  segments: MediaTranscriptSegment[];
}

interface MediaClientTranscriptJob extends MediaClientTranscriptJobView {
  request_key: string;
  access_code_digest: Buffer;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

interface AssemblyAiTranscript {
  id?: unknown;
  status?: unknown;
  text?: unknown;
  error?: unknown;
  language_code?: unknown;
  language_confidence?: unknown;
  words?: unknown;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function accessDigest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function sameDigest(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const queryId = url.searchParams.get("v");
      if (queryId) return queryId;
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0] || "")) {
        return parts[1] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function mediaClientSourceMatches(
  expectedSourceUrl: string,
  actualSourceUrl: string
): boolean {
  let expected: string;
  let actual: string;
  try {
    expected = normalizeMediaUrl(expectedSourceUrl);
    actual = normalizeMediaUrl(actualSourceUrl);
  } catch {
    return false;
  }
  const expectedId = youtubeVideoId(expected);
  const actualId = youtubeVideoId(actual);
  if (expectedId && actualId) return expectedId === actualId;
  return expected === actual;
}

function extensionForContentType(contentType: string): string {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase() || "";
  if (normalized === "audio/webm") return ".webm";
  if (normalized === "audio/ogg") return ".ogg";
  if (normalized === "audio/mp4" || normalized === "audio/x-m4a") return ".m4a";
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return ".mp3";
  if (normalized === "application/octet-stream") return ".bin";
  throw new MediaTranscriptError(
    "MEDIA_CLIENT_CONTENT_TYPE_UNSUPPORTED",
    "The browser helper audio format is not supported.",
    415,
    false
  );
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaTranscriptError(
        "MEDIA_CLIENT_PROCESSING_TIMEOUT",
        "Client media processing timed out.",
        504,
        true
      ));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MediaTranscriptError(
        "MEDIA_CLIENT_PROCESSOR_UNAVAILABLE",
        "The client media processing component is unavailable.",
        503,
        true
      ));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new MediaTranscriptError(
          "MEDIA_CLIENT_PROCESSING_FAILED",
          detail ? detail.slice(0, 400) : "Client media processing failed.",
          422,
          false
        ));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
  });
}

async function probeDurationSeconds(path: string): Promise<number> {
  const output = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path
  ]);
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaTranscriptError(
      "MEDIA_DURATION_UNKNOWN",
      "The browser-captured audio duration could not be determined.",
      422,
      false
    );
  }
  return duration;
}

class AssemblyAiAsyncTranscriber {
  constructor(private readonly apiKey: string) {}

  private async request(
    path: string,
    init: RequestInit
  ): Promise<AssemblyAiTranscript & Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.apiKey);
    const response = await fetch(`${ASSEMBLYAI_BASE_URL}${path}`, {
      ...init,
      headers
    });
    const text = await response.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new MediaTranscriptError(
          "STT_PROVIDER_INVALID_RESPONSE",
          "The transcription provider returned invalid JSON.",
          502,
          true
        );
      }
    }
    if (!response.ok) {
      throw new MediaTranscriptError(
        "STT_PROVIDER_ERROR",
        "The transcription provider rejected the request.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500
      );
    }
    return payload;
  }

  async upload(path: string): Promise<string> {
    const data = await readFile(path);
    const payload = await this.request("/v2/upload", {
      method: "POST",
      headers: { "content-type": "audio/mpeg" },
      body: data
    });
    const uploadUrl = nullableString(payload.upload_url);
    if (!uploadUrl) {
      throw new MediaTranscriptError(
        "STT_UPLOAD_FAILED",
        "The transcription provider did not return an upload URL.",
        502,
        true
      );
    }
    return uploadUrl;
  }

  async submit(audioUrl: string, languageHint: MediaLanguageHint): Promise<string> {
    const body: Record<string, unknown> = {
      audio_url: audioUrl,
      speech_models: [ASSEMBLYAI_ASYNC_MODEL],
      format_text: true,
      punctuate: true
    };
    if (languageHint === "auto") {
      body.language_detection = true;
    } else {
      body.language_code = languageHint;
    }
    const payload = await this.request("/v2/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const transcriptId = nullableString(payload.id);
    if (!transcriptId) {
      throw new MediaTranscriptError(
        "STT_SUBMIT_FAILED",
        "The transcription provider did not return a transcript identifier.",
        502,
        true
      );
    }
    return transcriptId;
  }

  async waitForCompletion(transcriptId: string): Promise<AssemblyAiTranscript> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < TRANSCRIPTION_TIMEOUT_MS) {
      const payload = await this.request(`/v2/transcript/${transcriptId}`, {
        method: "GET"
      });
      if (payload.status === "completed") return payload;
      if (payload.status === "error") {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPTION_FAILED",
          nullableString(payload.error) || "The transcription provider failed.",
          422,
          false
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new MediaTranscriptError(
      "STT_TRANSCRIPTION_TIMEOUT",
      "The transcription job did not complete within the allowed time.",
      504,
      true
    );
  }

  async delete(transcriptId: string): Promise<void> {
    await this.request(`/v2/transcript/${transcriptId}`, { method: "DELETE" });
  }
}

export interface MediaClientIngestServiceOptions {
  assemblyAiApiKey: string | null;
  betaGate: MediaBetaGate;
  maxDurationSeconds: number;
  jobTtlSeconds: number;
  maxConcurrentJobs: number;
}

export class MediaClientIngestService {
  readonly configured: boolean;
  readonly mode = "client_assisted" as const;
  readonly provider = "assemblyai" as const;
  readonly providerModel = ASSEMBLYAI_ASYNC_MODEL;
  private readonly jobs = new Map<string, MediaClientTranscriptJob>();
  private readonly requestKeys = new Map<string, string>();
  private activeJobs = 0;

  constructor(private readonly options: MediaClientIngestServiceOptions) {
    this.configured = Boolean(
      options.assemblyAiApiKey && options.betaGate.configured
    );
  }

  start(input: MediaClientTranscriptInput): {
    job: MediaClientTranscriptJobView;
    reused: boolean;
  } {
    this.cleanupExpired();
    this.authorizeCode(input.beta_access_code);
    if (!this.configured || !this.options.assemblyAiApiKey) {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_NOT_CONFIGURED",
        "Client-assisted media transcription is not configured.",
        503,
        true
      );
    }

    const normalizedUrl = normalizeMediaUrl(input.url);
    const digest = accessDigest(input.beta_access_code);
    const requestKey = `${normalizedUrl}|${input.language_hint}|${digest.toString("hex")}`;
    const existingId = this.requestKeys.get(requestKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing && existing.status !== "FAILED") {
        return { job: this.publicJob(existing), reused: true };
      }
    }

    if (this.activeJobs >= this.options.maxConcurrentJobs) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_BUSY",
        "The closed media beta is processing another video.",
        429,
        true
      );
    }

    const now = new Date().toISOString();
    const job: MediaClientTranscriptJob = {
      job_id: `KRCC_${randomUUID()}`,
      status: "AWAITING_CLIENT",
      created_at: now,
      updated_at: now,
      source_url: normalizedUrl,
      language_hint: input.language_hint,
      detected_language: null,
      language_confidence: null,
      ingress_mode: "client_assisted",
      client_upload_required: true,
      transcript_source: null,
      caption_type: null,
      provider: null,
      provider_model: null,
      provider_data_deleted: null,
      stt_seconds_charged: 0,
      beta_quota: this.options.betaGate.usage(),
      media: {
        platform: "youtube",
        title: null,
        channel: null,
        duration_seconds: null,
        canonical_url: normalizedUrl
      },
      transcript_characters: 0,
      segment_count: 0,
      error: null,
      request_key: requestKey,
      access_code_digest: digest,
      transcript_text: "",
      segments: []
    };
    this.jobs.set(job.job_id, job);
    this.requestKeys.set(requestKey, job.job_id);
    this.activeJobs += 1;
    return { job: this.publicJob(job), reused: false };
  }

  get(jobId: string): MediaClientTranscriptJobView | null {
    this.cleanupExpired();
    const job = this.jobs.get(jobId);
    return job ? this.publicJob(job) : null;
  }

  getForClient(jobId: string, accessCode: string): MediaClientTranscriptJobView {
    this.cleanupExpired();
    const job = this.requireClientJob(jobId, accessCode);
    return this.publicJob(job);
  }

  page(jobId: string, cursor: number, limit: number): MediaClientTranscriptPage | null {
    this.cleanupExpired();
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const safeCursor = Math.max(0, Math.floor(cursor));
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const segments = job.status === "COMPLETED"
      ? job.segments.slice(safeCursor, safeCursor + safeLimit)
      : [];
    const next = safeCursor + segments.length;
    return {
      job_id: job.job_id,
      status: job.status,
      cursor: safeCursor,
      next_cursor: next < job.segments.length ? next : null,
      segments: segments.map((segment) => ({ ...segment }))
    };
  }

  acceptCaptions(
  jobId: string,
  accessCode: string,
  sourceUrl: string,
  input: MediaClientCaptionsInput
): MediaClientTranscriptJobView {
  this.cleanupExpired();
  const job = this.requireClientJob(jobId, accessCode);
  if (job.status !== "AWAITING_CLIENT") {
    throw new MediaTranscriptError(
      "MEDIA_CLIENT_INVALID_STATE",
      "The media job is not waiting for browser source content.",
      409,
      false
    );
  }
  if (!mediaClientSourceMatches(job.source_url, sourceUrl)) {
    throw new MediaTranscriptError(
      "MEDIA_CLIENT_SOURCE_MISMATCH",
      "The active browser tab does not match the YouTube URL for this job.",
      409,
      false
    );
  }

  const language = typeof input?.language === "string"
    ? input.language.trim().toLowerCase()
    : "";
  if (!/^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(language) || language.length > 32) {
    throw new MediaTranscriptError(
      "MEDIA_CLIENT_CAPTIONS_INVALID",
      "Caption language metadata is invalid.",
      422,
      false
    );
  }
  if (input.caption_type !== "manual" && input.caption_type !== "auto_generated") {
    throw new MediaTranscriptError(
      "MEDIA_CLIENT_CAPTIONS_INVALID",
      "Caption type must be manual or auto_generated.",
      422,
      false
    );
  }
  if (!Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 20000) {
    throw new MediaTranscriptError(
      "MEDIA_CLIENT_CAPTIONS_INVALID",
      "Caption segments must contain 1..20000 entries.",
      422,
      false
    );
  }

  const segments: MediaTranscriptSegment[] = [];
  let totalCharacters = 0;
  let previousStart = -1;
  let maximumEnd = 0;
  for (const raw of input.segments) {
    const start = Number(raw?.start_ms);
    const end = Number(raw?.end_ms);
    const value = typeof raw?.text === "string" ? raw.text.replace(/\s+/g, " ").trim() : "";
    if (
      !Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || end <= start || start < previousStart ||
      !value || value.length > 1600
    ) {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_CAPTIONS_INVALID",
        "Caption timestamps or text are invalid.",
        422,
        false
      );
    }
    const startMs = Math.round(start);
    const endMs = Math.round(end);
    if (endMs > (this.options.maxDurationSeconds * 1000) + 1000) {
      throw new MediaTranscriptError(
        "MEDIA_DURATION_LIMIT",
        `Closed beta videos are limited to ${this.options.maxDurationSeconds} seconds.`,
        413,
        false
      );
    }
    totalCharacters += value.length;
    if (totalCharacters > 1000000) {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_CAPTIONS_TOO_LARGE",
        "The caption transcript exceeds the closed beta text limit.",
        413,
        false
      );
    }
    segments.push({
      index: segments.length,
      start_ms: startMs,
      end_ms: endMs,
      text: value,
      confidence: null
    });
    previousStart = startMs;
    maximumEnd = Math.max(maximumEnd, endMs);
  }

  job.status = "COMPLETED";
  job.client_upload_required = false;
  job.transcript_source = "youtube_captions";
  job.caption_type = input.caption_type;
  job.provider = "youtube";
  job.provider_model = null;
  job.provider_data_deleted = null;
  job.stt_seconds_charged = 0;
  job.detected_language = language;
  job.language_confidence = null;
  job.transcript_text = segments.map((segment) => segment.text).join(" ");
  job.segments = segments;
  job.transcript_characters = job.transcript_text.length;
  job.segment_count = segments.length;
  job.media.duration_seconds = maximumEnd / 1000;
  job.error = null;
  this.activeJobs = Math.max(0, this.activeJobs - 1);
  this.touch(job);
  return this.publicJob(job);
}

  acceptAudio(
    jobId: string,
    accessCode: string,
    sourceUrl: string,
    contentType: string,
    audio: Buffer
  ): MediaClientTranscriptJobView {
    this.cleanupExpired();
    const job = this.requireClientJob(jobId, accessCode);
    if (job.status !== "AWAITING_CLIENT") {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_INVALID_STATE",
        "The media job is not waiting for browser audio.",
        409,
        false
      );
    }
    if (!mediaClientSourceMatches(job.source_url, sourceUrl)) {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_SOURCE_MISMATCH",
        "The active browser tab does not match the YouTube URL for this job.",
        409,
        false
      );
    }
    extensionForContentType(contentType);
    if (audio.length <= 0 || audio.length > MAX_CLIENT_AUDIO_BYTES) {
      throw new MediaTranscriptError(
        "MEDIA_CLIENT_AUDIO_SIZE_INVALID",
        `Browser audio must contain 1..${MAX_CLIENT_AUDIO_BYTES} bytes.`,
        413,
        false
      );
    }

    job.status = "UPLOADING";
    job.client_upload_required = false;
    job.transcript_source = "assemblyai_stt";
    job.provider = "assemblyai";
    job.provider_model = ASSEMBLYAI_ASYNC_MODEL;
    job.error = null;
    this.touch(job);
    void this.processAudio(job, Buffer.from(audio), contentType);
    return this.publicJob(job);
  }

  private authorizeCode(accessCode: string): void {
    if (!this.options.betaGate.authorize(accessCode)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The closed media beta access code is invalid.",
        403,
        false
      );
    }
  }

  private requireClientJob(
    jobId: string,
    accessCode: string
  ): MediaClientTranscriptJob {
    this.authorizeCode(accessCode);
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_FOUND",
        "The client-assisted media job was not found or expired.",
        404,
        false
      );
    }
    if (!sameDigest(job.access_code_digest, accessDigest(accessCode))) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The beta access code does not own this media job.",
        403,
        false
      );
    }
    return job;
  }

  private publicJob(job: MediaClientTranscriptJob): MediaClientTranscriptJobView {
    return {
      job_id: job.job_id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      source_url: job.source_url,
      language_hint: job.language_hint,
      detected_language: job.detected_language,
      language_confidence: job.language_confidence,
      ingress_mode: job.ingress_mode,
      client_upload_required: job.client_upload_required,
      transcript_source: job.transcript_source,
      caption_type: job.caption_type,
      provider: job.provider,
      provider_model: job.provider_model,
      provider_data_deleted: job.provider_data_deleted,
      stt_seconds_charged: job.stt_seconds_charged,
      beta_quota: { ...job.beta_quota },
      media: { ...job.media },
      transcript_characters: job.transcript_characters,
      segment_count: job.segment_count,
      error: job.error ? { ...job.error } : null
    };
  }

  private touch(job: MediaClientTranscriptJob): void {
    job.updated_at = new Date().toISOString();
    job.beta_quota = this.options.betaGate.usage();
  }

  private async processAudio(
    job: MediaClientTranscriptJob,
    audio: Buffer,
    contentType: string
  ): Promise<void> {
    let directory: string | null = null;
    let transcriber: AssemblyAiAsyncTranscriber | null = null;
    let providerTranscriptId: string | null = null;
    try {
      directory = await mkdtemp(join(tmpdir(), "voicebridge-krc-client-"));
      const sourcePath = join(directory, `client${extensionForContentType(contentType)}`);
      await writeFile(sourcePath, audio);

      // MediaRecorder WebM/Opus blobs may omit a container-level duration.
      // Normalize first with a hard processing cap, then probe the normalized
      // MP3 where duration metadata is reliable. Reserve quota only after
      // duration validation succeeds.
      const sttPath = join(directory, "stt.mp3");
      await runCommand("ffmpeg", [
        "-y",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-t",
        String(this.options.maxDurationSeconds + 1),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "32k",
        sttPath
      ]);
      const sttInfo = await stat(sttPath);
      if (!sttInfo.isFile() || sttInfo.size <= 0 || sttInfo.size > MAX_STT_MEDIA_BYTES) {
        throw new MediaTranscriptError(
          "MEDIA_FILE_TOO_LARGE",
          "The STT audio exceeds the closed beta upload limit.",
          413,
          false
        );
      }

      const durationSeconds = await probeDurationSeconds(sttPath);
      if (durationSeconds > this.options.maxDurationSeconds + 0.5) {
        throw new MediaTranscriptError(
          "MEDIA_DURATION_LIMIT",
          `Closed beta videos are limited to ${this.options.maxDurationSeconds} seconds.`,
          413,
          false
        );
      }
      job.media.duration_seconds = durationSeconds;

      const reservation = this.options.betaGate.reserveSttSeconds(durationSeconds);
      job.beta_quota = reservation.usage;
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          "MEDIA_DAILY_STT_QUOTA_EXHAUSTED",
          "The closed beta daily STT budget is exhausted.",
          429,
          true
        );
      }
      job.stt_seconds_charged = Math.ceil(durationSeconds);

      if (!this.options.assemblyAiApiKey) {
        throw new MediaTranscriptError(
          "STT_PROVIDER_NOT_CONFIGURED",
          "AssemblyAI is not configured for client-assisted ingestion.",
          503,
          true
        );
      }
      transcriber = new AssemblyAiAsyncTranscriber(this.options.assemblyAiApiKey);
      const uploadUrl = await transcriber.upload(sttPath);
      providerTranscriptId = await transcriber.submit(uploadUrl, job.language_hint);
      job.status = "TRANSCRIBING";
      this.touch(job);

      const result = await transcriber.waitForCompletion(providerTranscriptId);
      const transcriptText = nullableString(result.text) || "";
      job.transcript_text = transcriptText;
      job.detected_language = nullableString(result.language_code);
      job.language_confidence = finiteNumber(result.language_confidence);
      job.segments = chunkTranscriptWords(result.words, transcriptText);
      job.transcript_characters = transcriptText.length;
      job.segment_count = job.segments.length;

      try {
        await transcriber.delete(providerTranscriptId);
        job.provider_data_deleted = true;
      } catch {
        job.provider_data_deleted = false;
      }

      job.status = "COMPLETED";
      job.error = null;
      this.touch(job);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MEDIA_CLIENT_TRANSCRIPT_FAILED",
          "Client-assisted media transcription failed.",
          500,
          true
        );
      job.status = "FAILED";
      job.error = {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable
      };
      this.touch(job);
    } finally {
      if (
        job.status === "FAILED" &&
        transcriber &&
        providerTranscriptId &&
        job.provider_data_deleted !== true
      ) {
        try {
          await transcriber.delete(providerTranscriptId);
          job.provider_data_deleted = true;
        } catch {
          job.provider_data_deleted = false;
        }
      }
      this.activeJobs = Math.max(0, this.activeJobs - 1);
      if (directory) {
        await rm(directory, { recursive: true, force: true });
      }
      this.touch(job);
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const ttlMs = this.options.jobTtlSeconds * 1000;
    for (const [jobId, job] of this.jobs) {
      const reference = job.status === "AWAITING_CLIENT"
        ? Date.parse(job.created_at)
        : Date.parse(job.updated_at);
      const terminal = job.status === "COMPLETED" || job.status === "FAILED";
      const waiting = job.status === "AWAITING_CLIENT";
      if ((!terminal && !waiting) || !Number.isFinite(reference)) continue;
      if (now - reference <= ttlMs) continue;
      this.jobs.delete(jobId);
      if (this.requestKeys.get(job.request_key) === jobId) {
        this.requestKeys.delete(job.request_key);
      }
      if (waiting) {
        this.activeJobs = Math.max(0, this.activeJobs - 1);
      }
    }
  }
}
