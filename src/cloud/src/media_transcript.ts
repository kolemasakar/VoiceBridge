import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_ASYNC_MODEL = "universal-2";
const DEFAULT_COMMAND_TIMEOUT_MS = 120000;
const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MEDIA_MAX_DURATION_SECONDS = 7200;
const DEFAULT_MEDIA_JOB_TTL_SECONDS = 3600;
const DEFAULT_MEDIA_MAX_CONCURRENT_JOBS = 2;
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_MEDIA_FILE_BYTES = 128 * 1024 * 1024;
const MAX_SEGMENT_CHARACTERS = 1600;
const MAX_SEGMENT_DURATION_MS = 60000;

export type MediaLanguageHint = "auto" | "uk" | "ru" | "en";

export interface MediaTranscriptInput {
  url: string;
  language_hint: MediaLanguageHint;
}

export type MediaTranscriptStatus =
  | "QUEUED"
  | "FETCHING_MEDIA"
  | "UPLOADING"
  | "TRANSCRIBING"
  | "COMPLETED"
  | "FAILED";

export interface MediaTranscriptSegment {
  index: number;
  start_ms: number | null;
  end_ms: number | null;
  text: string;
  confidence: number | null;
}

export interface MediaTranscriptJobView {
  job_id: string;
  status: MediaTranscriptStatus;
  created_at: string;
  updated_at: string;
  source_url: string;
  language_hint: MediaLanguageHint;
  detected_language: string | null;
  language_confidence: number | null;
  provider: "assemblyai";
  provider_model: string;
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

export interface MediaTranscriptPage {
  job_id: string;
  status: MediaTranscriptStatus;
  cursor: number;
  next_cursor: number | null;
  segments: MediaTranscriptSegment[];
}

interface MediaTranscriptJob extends MediaTranscriptJobView {
  request_key: string;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

interface AssemblyAiWord {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  confidence?: unknown;
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

interface MediaInspection {
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  canonicalUrl: string | null;
}

export class MediaTranscriptError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean
  ) {
    super(message);
  }
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSupportedYoutubeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be");
}

export function normalizeMediaUrl(value: string): string {
  if (value.length > 2048) {
    throw new MediaTranscriptError(
      "MEDIA_URL_INVALID",
      "The media URL is too long.",
      400,
      false
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaTranscriptError(
      "MEDIA_URL_INVALID",
      "The media URL is not valid.",
      400,
      false
    );
  }

  if (url.protocol !== "https:" || !isSupportedYoutubeHost(url.hostname)) {
    throw new MediaTranscriptError(
      "MEDIA_URL_UNSUPPORTED",
      "Only public HTTPS YouTube URLs are supported in the initial media mode.",
      400,
      false
    );
  }

  url.hash = "";
  return url.toString();
}

export function parseMediaTranscriptInput(
  value: unknown
): MediaTranscriptInput | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const input = value as Record<string, unknown>;
  if (typeof input.url !== "string" || !input.url.trim()) {
    return null;
  }

  const languageHint = input.language_hint === undefined
    ? "auto"
    : input.language_hint;
  if (!["auto", "uk", "ru", "en"].includes(String(languageHint))) {
    return null;
  }

  try {
    return {
      url: normalizeMediaUrl(input.url.trim()),
      language_hint: languageHint as MediaLanguageHint
    };
  } catch {
    return null;
  }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function chunkTranscriptWords(
  wordsValue: unknown,
  fallbackText: string
): MediaTranscriptSegment[] {
  const words = Array.isArray(wordsValue) ? wordsValue : [];
  const normalized = words.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const word = value as AssemblyAiWord;
    const text = nullableString(word.text);
    if (!text) return [];
    return [{
      text,
      start: finiteNumber(word.start),
      end: finiteNumber(word.end),
      confidence: finiteNumber(word.confidence)
    }];
  });

  if (normalized.length === 0) {
    const text = fallbackText.trim();
    if (!text) return [];
    const segments: MediaTranscriptSegment[] = [];
    for (let offset = 0; offset < text.length; offset += MAX_SEGMENT_CHARACTERS) {
      segments.push({
        index: segments.length,
        start_ms: null,
        end_ms: null,
        text: text.slice(offset, offset + MAX_SEGMENT_CHARACTERS).trim(),
        confidence: null
      });
    }
    return segments.filter((segment) => segment.text.length > 0);
  }

  const segments: MediaTranscriptSegment[] = [];
  let currentWords: typeof normalized = [];
  let currentCharacters = 0;
  let segmentStart: number | null = null;

  const flush = () => {
    if (currentWords.length === 0) return;
    const starts = currentWords
      .map((word) => word.start)
      .filter((value): value is number => value !== null);
    const ends = currentWords
      .map((word) => word.end)
      .filter((value): value is number => value !== null);
    const confidences = currentWords
      .map((word) => word.confidence)
      .filter((value): value is number => value !== null && value >= 0);
    segments.push({
      index: segments.length,
      start_ms: starts.length > 0 ? Math.round(Math.min(...starts)) : null,
      end_ms: ends.length > 0 ? Math.round(Math.max(...ends)) : null,
      text: currentWords.map((word) => word.text).join(" "),
      confidence: average(confidences)
    });
    currentWords = [];
    currentCharacters = 0;
    segmentStart = null;
  };

  for (const word of normalized) {
    if (segmentStart === null && word.start !== null) {
      segmentStart = word.start;
    }
    const projectedCharacters = currentCharacters + word.text.length + 1;
    const projectedDuration = segmentStart !== null && word.end !== null
      ? word.end - segmentStart
      : 0;
    if (
      currentWords.length > 0 &&
      (projectedCharacters > MAX_SEGMENT_CHARACTERS ||
        projectedDuration > MAX_SEGMENT_DURATION_MS)
    ) {
      flush();
      if (word.start !== null) segmentStart = word.start;
    }
    currentWords.push(word);
    currentCharacters += word.text.length + 1;
  }
  flush();
  return segments;
}

function publicJob(job: MediaTranscriptJob): MediaTranscriptJobView {
  return {
    job_id: job.job_id,
    status: job.status,
    created_at: job.created_at,
    updated_at: job.updated_at,
    source_url: job.source_url,
    language_hint: job.language_hint,
    detected_language: job.detected_language,
    language_confidence: job.language_confidence,
    provider: job.provider,
    provider_model: job.provider_model,
    media: { ...job.media },
    transcript_characters: job.transcript_characters,
    segment_count: job.segment_count,
    error: job.error ? { ...job.error } : null
  };
}

async function runTextCommand(
  command: string,
  args: string[],
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaTranscriptError(
        "MEDIA_FETCH_TIMEOUT",
        "Media retrieval timed out.",
        504,
        true
      ));
    }, timeoutMs);

    const collect = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new MediaTranscriptError(
            "MEDIA_FETCH_FAILED",
            "Media retrieval returned excessive diagnostic output.",
            502,
            false
          ));
        }
        return;
      }
      target.push(chunk);
    };

    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MediaTranscriptError(
        "MEDIA_FETCH_UNAVAILABLE",
        "The media retrieval component is unavailable.",
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
          "The public media could not be retrieved or is not supported.",
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
  const output = await runTextCommand("yt-dlp", [
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
      "Live streams are not supported by prerecorded media research mode.",
      422,
      false
    );
  }

  return {
    title: nullableString(metadata.title),
    channel: nullableString(metadata.channel) || nullableString(metadata.uploader),
    durationSeconds: finiteNumber(metadata.duration),
    canonicalUrl: nullableString(metadata.webpage_url)
  };
}

async function downloadYoutubeAudio(url: string): Promise<{
  directory: string;
  path: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "voicebridge-krc-"));
  try {
    const template = join(directory, "media.%(ext)s");
    const output = await runTextCommand("yt-dlp", [
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      "--max-filesize",
      String(MAX_MEDIA_FILE_BYTES),
      "-f",
      "bestaudio/best",
      "-o",
      template,
      "--print",
      "after_move:filepath",
      url
    ]);
    let path = output.split(/\r?\n/).filter(Boolean).at(-1) || "";
    if (!path) {
      const files = await readdir(directory);
      const first = files[0];
      if (!first) {
        throw new MediaTranscriptError(
          "MEDIA_FETCH_FAILED",
          "The media audio file was not produced.",
          502,
          true
        );
      }
      path = join(directory, first);
    }
    const info = await stat(path);
    if (!info.isFile() || info.size <= 0 || info.size > MAX_MEDIA_FILE_BYTES) {
      throw new MediaTranscriptError(
        "MEDIA_FILE_TOO_LARGE",
        "The media audio file exceeds the supported size limit.",
        413,
        false
      );
    }
    return { directory, path };
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
      headers: { "content-type": "application/octet-stream" },
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

  async submit(
    audioUrl: string,
    languageHint: MediaLanguageHint
  ): Promise<string> {
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

  async waitForCompletion(
    transcriptId: string,
    timeoutMs = DEFAULT_TRANSCRIPTION_TIMEOUT_MS
  ): Promise<AssemblyAiTranscript> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const payload = await this.request(`/v2/transcript/${transcriptId}`, {
        method: "GET"
      });
      if (payload.status === "completed") {
        return payload;
      }
      if (payload.status === "error") {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPTION_FAILED",
          nullableString(payload.error) || "The transcription provider failed.",
          422,
          false
        );
      }
      await new Promise((resolve) => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
    }
    throw new MediaTranscriptError(
      "STT_TRANSCRIPTION_TIMEOUT",
      "The transcription job did not complete within the allowed time.",
      504,
      true
    );
  }
}

export interface MediaTranscriptServiceOptions {
  assemblyAiApiKey: string | null;
  maxDurationSeconds?: number;
  jobTtlSeconds?: number;
  maxConcurrentJobs?: number;
}

type NormalizedMediaTranscriptServiceOptions = {
  assemblyAiApiKey: string | null;
  maxDurationSeconds: number;
  jobTtlSeconds: number;
  maxConcurrentJobs: number;
};

export class MediaTranscriptService {
  readonly configured: boolean;
  readonly provider = "assemblyai" as const;
  readonly providerModel = ASSEMBLYAI_ASYNC_MODEL;
  private readonly jobs = new Map<string, MediaTranscriptJob>();
  private readonly requestKeys = new Map<string, string>();
  private readonly options: NormalizedMediaTranscriptServiceOptions;
  private activeJobs = 0;

  constructor(options: MediaTranscriptServiceOptions) {
    this.options = {
      assemblyAiApiKey: options.assemblyAiApiKey,
      maxDurationSeconds:
        options.maxDurationSeconds ?? DEFAULT_MEDIA_MAX_DURATION_SECONDS,
      jobTtlSeconds: options.jobTtlSeconds ?? DEFAULT_MEDIA_JOB_TTL_SECONDS,
      maxConcurrentJobs:
        options.maxConcurrentJobs ?? DEFAULT_MEDIA_MAX_CONCURRENT_JOBS
    };
    this.configured = Boolean(this.options.assemblyAiApiKey);
  }

  start(input: MediaTranscriptInput): {
    job: MediaTranscriptJobView;
    reused: boolean;
  } {
    this.cleanupExpired();
    if (!this.configured || !this.options.assemblyAiApiKey) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
        "Media transcription is not configured.",
        503,
        true
      );
    }

    const normalizedUrl = normalizeMediaUrl(input.url);
    const requestKey = `${normalizedUrl}|${input.language_hint}`;
    const existingId = this.requestKeys.get(requestKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing && existing.status !== "FAILED") {
        return { job: publicJob(existing), reused: true };
      }
    }

    if (this.activeJobs >= this.options.maxConcurrentJobs) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_BUSY",
        "The media transcription service is at its concurrency limit.",
        429,
        true
      );
    }

    const now = new Date().toISOString();
    const job: MediaTranscriptJob = {
      job_id: `KRCM_${randomUUID()}`,
      status: "QUEUED",
      created_at: now,
      updated_at: now,
      source_url: normalizedUrl,
      language_hint: input.language_hint,
      detected_language: null,
      language_confidence: null,
      provider: "assemblyai",
      provider_model: ASSEMBLYAI_ASYNC_MODEL,
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
    return { job: publicJob(job), reused: false };
  }

  get(jobId: string): MediaTranscriptJobView | null {
    this.cleanupExpired();
    const job = this.jobs.get(jobId);
    return job ? publicJob(job) : null;
  }

  page(jobId: string, cursor: number, limit: number): MediaTranscriptPage | null {
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

  private touch(job: MediaTranscriptJob): void {
    job.updated_at = new Date().toISOString();
  }

  private async process(job: MediaTranscriptJob): Promise<void> {
    let temporaryDirectory: string | null = null;
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
      if (
        inspection.durationSeconds !== null &&
        inspection.durationSeconds > this.options.maxDurationSeconds
      ) {
        throw new MediaTranscriptError(
          "MEDIA_DURATION_LIMIT",
          `Media duration exceeds the ${this.options.maxDurationSeconds}-second limit.`,
          413,
          false
        );
      }

      const downloaded = await downloadYoutubeAudio(job.source_url);
      temporaryDirectory = downloaded.directory;
      job.status = "UPLOADING";
      this.touch(job);

      const transcriber = new AssemblyAiAsyncTranscriber(
        this.options.assemblyAiApiKey
      );
      const uploadUrl = await transcriber.upload(downloaded.path);
      const transcriptId = await transcriber.submit(uploadUrl, job.language_hint);
      job.status = "TRANSCRIBING";
      this.touch(job);

      const result = await transcriber.waitForCompletion(transcriptId);
      const transcriptText = nullableString(result.text) || "";
      job.transcript_text = transcriptText;
      job.detected_language = nullableString(result.language_code);
      job.language_confidence = finiteNumber(result.language_confidence);
      job.segments = chunkTranscriptWords(result.words, transcriptText);
      job.transcript_characters = transcriptText.length;
      job.segment_count = job.segments.length;
      job.status = "COMPLETED";
      job.error = null;
      this.touch(job);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "MEDIA_TRANSCRIPT_FAILED",
          "Media transcription failed.",
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
      this.activeJobs = Math.max(0, this.activeJobs - 1);
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
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
