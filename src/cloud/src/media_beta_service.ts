import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
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
import { tryYoutubeCaptions } from "./youtube_captions.js";

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_ASYNC_MODEL = "universal-2";
const COMMAND_TIMEOUT_MS = 120000;
const TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
const MAX_SOURCE_MEDIA_BYTES = 128 * 1024 * 1024;
const MAX_STT_MEDIA_BYTES = 32 * 1024 * 1024;

export interface MediaBetaTranscriptInput {
  url: string;
  language_hint: MediaLanguageHint;
  beta_access_code: string;
}

export type MediaTranscriptSource = "youtube_captions" | "assemblyai_stt";

export interface MediaBetaTranscriptJobView {
  job_id: string;
  status: MediaTranscriptStatus;
  created_at: string;
  updated_at: string;
  source_url: string;
  language_hint: MediaLanguageHint;
  detected_language: string | null;
  language_confidence: number | null;
  transcript_source: MediaTranscriptSource | null;
  provider: "youtube" | "assemblyai" | null;
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

export interface MediaBetaTranscriptPage {
  job_id: string;
  status: MediaTranscriptStatus;
  cursor: number;
  next_cursor: number | null;
  segments: MediaTranscriptSegment[];
}

interface MediaInspection {
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  canonicalUrl: string | null;
  language: string | null;
}

interface MediaBetaTranscriptJob extends MediaBetaTranscriptJobView {
  request_key: string;
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

export function parseMediaBetaTranscriptInput(
  value: unknown
): MediaBetaTranscriptInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) return null;
  if (
    typeof input.beta_access_code !== "string" ||
    input.beta_access_code.length < 12 ||
    input.beta_access_code.length > 128
  ) {
    return null;
  }
  const languageHint = input.language_hint === undefined
    ? "auto"
    : String(input.language_hint);
  if (!["auto", "uk", "ru", "en"].includes(languageHint)) return null;
  try {
    return {
      url: normalizeMediaUrl(input.url.trim()),
      language_hint: languageHint as MediaLanguageHint,
      beta_access_code: input.beta_access_code
    };
  } catch {
    return null;
  }
}

async function runCommand(
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaTranscriptError(
        "MEDIA_FETCH_TIMEOUT",
        "Media processing timed out.",
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
        "MEDIA_FETCH_UNAVAILABLE",
        "The media processing component is unavailable.",
        503,
        true
      ));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new MediaTranscriptError(
          "MEDIA_FETCH_FAILED",
          Buffer.concat(stderr).toString("utf8").trim().slice(0, 500) ||
            "Media processing failed.",
          422,
          false
        ));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
  });
}

async function inspectYoutube(url: string): Promise<MediaInspection> {
  const output = await runCommand("yt-dlp", [
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--no-warnings",
    "--quiet",
    url
  ]);
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(output) as Record<string, unknown>;
  } catch {
    throw new MediaTranscriptError(
      "MEDIA_METADATA_INVALID",
      "Media metadata could not be parsed.",
      502,
      true
    );
  }
  if (metadata.is_live === true || metadata.live_status === "is_live") {
    throw new MediaTranscriptError(
      "MEDIA_LIVE_NOT_SUPPORTED",
      "Live streams are not supported by the closed media beta.",
      422,
      false
    );
  }
  return {
    title: nullableString(metadata.title),
    channel: nullableString(metadata.channel) || nullableString(metadata.uploader),
    durationSeconds: finiteNumber(metadata.duration),
    canonicalUrl: nullableString(metadata.webpage_url),
    language: nullableString(metadata.language)
  };
}

async function downloadLowBitrateAudio(url: string): Promise<{
  directory: string;
  path: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "voicebridge-krc-beta-"));
  try {
    const template = join(directory, "source.%(ext)s");
    const output = await runCommand("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--max-filesize",
      String(MAX_SOURCE_MEDIA_BYTES),
      "-f",
      "bestaudio/best",
      "-o",
      template,
      "--print",
      "after_move:filepath",
      url
    ]);
    let sourcePath = output.split(/\r?\n/).filter(Boolean).at(-1) || "";
    if (!sourcePath) {
      const files = await readdir(directory);
      const source = files.find((name) => name.startsWith("source."));
      if (!source) {
        throw new MediaTranscriptError(
          "MEDIA_FETCH_FAILED",
          "The media audio file was not produced.",
          502,
          true
        );
      }
      sourcePath = join(directory, source);
    }
    const sourceInfo = await stat(sourcePath);
    if (
      !sourceInfo.isFile() ||
      sourceInfo.size <= 0 ||
      sourceInfo.size > MAX_SOURCE_MEDIA_BYTES
    ) {
      throw new MediaTranscriptError(
        "MEDIA_FILE_TOO_LARGE",
        "The source audio exceeds the closed beta size limit.",
        413,
        false
      );
    }

    const sttPath = join(directory, "stt.mp3");
    await runCommand("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-i",
      sourcePath,
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
    if (
      !sttInfo.isFile() ||
      sttInfo.size <= 0 ||
      sttInfo.size > MAX_STT_MEDIA_BYTES
    ) {
      throw new MediaTranscriptError(
        "MEDIA_FILE_TOO_LARGE",
        "The STT audio exceeds the closed beta upload limit.",
        413,
        false
      );
    }
    return { directory, path: sttPath };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
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
    const started = Date.now();
    while (Date.now() - started < TRANSCRIPTION_TIMEOUT_MS) {
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

export interface MediaBetaTranscriptServiceOptions {
  assemblyAiApiKey: string | null;
  betaGate: MediaBetaGate;
  maxDurationSeconds: number;
  jobTtlSeconds: number;
  maxConcurrentJobs: number;
}

export class MediaBetaTranscriptService {
  readonly configured: boolean;
  readonly mode = "closed_beta" as const;
  readonly providers = ["youtube_captions", "assemblyai_stt"] as const;
  private readonly jobs = new Map<string, MediaBetaTranscriptJob>();
  private readonly requestKeys = new Map<string, string>();
  private activeJobs = 0;

  constructor(private readonly options: MediaBetaTranscriptServiceOptions) {
    this.configured = options.betaGate.configured;
  }

  start(input: MediaBetaTranscriptInput): {
    job: MediaBetaTranscriptJobView;
    reused: boolean;
  } {
    this.cleanupExpired();
    if (!this.options.betaGate.authorize(input.beta_access_code)) {
      throw new MediaTranscriptError(
        "MEDIA_BETA_ACCESS_DENIED",
        "The closed media beta access code is invalid.",
        403,
        false
      );
    }
    const normalizedUrl = normalizeMediaUrl(input.url);
    const requestKey = `${normalizedUrl}|${input.language_hint}`;
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
    const job: MediaBetaTranscriptJob = {
      job_id: `KRCB_${randomUUID()}`,
      status: "QUEUED",
      created_at: now,
      updated_at: now,
      source_url: normalizedUrl,
      language_hint: input.language_hint,
      detected_language: null,
      language_confidence: null,
      transcript_source: null,
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
        canonical_url: null
      },
      transcript_characters: 0,
      segment_count: 0,
      error: null,
      request_key: requestKey,
      transcript_text: "",
      segments: []
    };
    this.jobs.set(job.job_id, job);
    this.requestKeys.set(requestKey, job.job_id);
    this.activeJobs += 1;
    void this.process(job);
    return { job: this.publicJob(job), reused: false };
  }

  get(jobId: string): MediaBetaTranscriptJobView | null {
    this.cleanupExpired();
    const job = this.jobs.get(jobId);
    return job ? this.publicJob(job) : null;
  }

  page(jobId: string, cursor: number, limit: number): MediaBetaTranscriptPage | null {
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

  private publicJob(job: MediaBetaTranscriptJob): MediaBetaTranscriptJobView {
    return {
      job_id: job.job_id,
      status: job.status,
      created_at: job.created_at,
      updated_at: job.updated_at,
      source_url: job.source_url,
      language_hint: job.language_hint,
      detected_language: job.detected_language,
      language_confidence: job.language_confidence,
      transcript_source: job.transcript_source,
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

  private touch(job: MediaBetaTranscriptJob): void {
    job.updated_at = new Date().toISOString();
    job.beta_quota = this.options.betaGate.usage();
  }

  private async process(job: MediaBetaTranscriptJob): Promise<void> {
    let temporaryDirectory: string | null = null;
    let transcriber: AssemblyAiAsyncTranscriber | null = null;
    let providerTranscriptId: string | null = null;
    try {
      job.status = "FETCHING_MEDIA";
      this.touch(job);
      const inspection = await inspectYoutube(job.source_url);
      job.media = {
        platform: "youtube",
        title: inspection.title,
        channel: inspection.channel,
        duration_seconds: inspection.durationSeconds,
        canonical_url: inspection.canonicalUrl
      };
      if (inspection.durationSeconds === null) {
        throw new MediaTranscriptError(
          "MEDIA_DURATION_UNKNOWN",
          "Video duration is required for closed beta resource limits.",
          422,
          false
        );
      }
      if (inspection.durationSeconds > this.options.maxDurationSeconds) {
        throw new MediaTranscriptError(
          "MEDIA_DURATION_LIMIT",
          `Closed beta videos are limited to ${this.options.maxDurationSeconds} seconds.`,
          413,
          false
        );
      }

      const captions = await tryYoutubeCaptions(
        job.source_url,
        job.language_hint,
        inspection.language
      );
      if (captions) {
        job.detected_language = captions.language;
        job.language_confidence = null;
        job.transcript_source = "youtube_captions";
        job.provider = "youtube";
        job.provider_model = null;
        job.provider_data_deleted = null;
        job.transcript_text = captions.transcriptText;
        job.segments = captions.segments;
        job.transcript_characters = captions.transcriptText.length;
        job.segment_count = captions.segments.length;
        job.status = "COMPLETED";
        job.error = null;
        this.touch(job);
        return;
      }

      if (!this.options.assemblyAiApiKey) {
        throw new MediaTranscriptError(
          "STT_PROVIDER_NOT_CONFIGURED",
          "No captions were available and AssemblyAI is not configured.",
          503,
          true
        );
      }

      const reservation = this.options.betaGate.reserveSttSeconds(
        inspection.durationSeconds
      );
      job.beta_quota = reservation.usage;
      if (!reservation.allowed) {
        throw new MediaTranscriptError(
          "MEDIA_DAILY_STT_QUOTA_EXHAUSTED",
          "The closed beta daily STT budget is exhausted. Caption-backed videos remain available.",
          429,
          true
        );
      }
      job.stt_seconds_charged = Math.ceil(inspection.durationSeconds);

      const downloaded = await downloadLowBitrateAudio(job.source_url);
      temporaryDirectory = downloaded.directory;
      job.status = "UPLOADING";
      job.transcript_source = "assemblyai_stt";
      job.provider = "assemblyai";
      job.provider_model = ASSEMBLYAI_ASYNC_MODEL;
      this.touch(job);

      transcriber = new AssemblyAiAsyncTranscriber(this.options.assemblyAiApiKey);
      const uploadUrl = await transcriber.upload(downloaded.path);
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
          "MEDIA_TRANSCRIPT_FAILED",
          "Closed beta media transcription failed.",
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
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
      this.touch(job);
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const ttlMs = this.options.jobTtlSeconds * 1000;
    for (const [jobId, job] of this.jobs) {
      if (!["COMPLETED", "FAILED"].includes(job.status)) continue;
      const updatedAt = Date.parse(job.updated_at);
      if (Number.isFinite(updatedAt) && now - updatedAt > ttlMs) {
        this.jobs.delete(jobId);
        if (this.requestKeys.get(job.request_key) === jobId) {
          this.requestKeys.delete(job.request_key);
        }
      }
    }
  }
}
