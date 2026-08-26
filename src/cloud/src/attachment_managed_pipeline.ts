import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OpenAiConversationFileRef } from "./managed_attachment_probe.js";
import {
  MediaTranscriptError,
  chunkTranscriptWords,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const ASSEMBLYAI_BASE_URL = (
  process.env.KRC_MEDIA_ASSEMBLYAI_BASE_URL || "https://api.assemblyai.com"
).replace(/\/+$/, "");
const ASSEMBLYAI_ASYNC_MODEL = "universal-2" as const;
const OPENAI_FILE_HOST_SUFFIX = ".oaiusercontent.com";
const DOWNLOAD_TIMEOUT_MS = 60_000;
const COMMAND_TIMEOUT_MS = 120_000;
const TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;
export const MANAGED_ATTACHMENT_MAX_BYTES = 32 * 1024 * 1024;
const MAX_STT_MEDIA_BYTES = 32 * 1024 * 1024;

const AUDIO_EXTENSIONS = new Set([
  ".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".webm"
]);
const VIDEO_EXTENSIONS = new Set([
  ".avi", ".m4v", ".mkv", ".mov", ".mp4", ".webm"
]);

export type ManagedAttachmentClass = "audio" | "video";

export interface ManagedAttachmentSttResult {
  provider: "assemblyai";
  provider_model: "universal-2";
  provider_data_deleted: boolean;
  detected_language: string | null;
  language_confidence: number | null;
  duration_seconds: number;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

export interface ManagedAttachmentPipeline {
  readonly configured: boolean;
  transcribe(
    file: OpenAiConversationFileRef,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void
  ): Promise<ManagedAttachmentSttResult>;
}

interface DownloadedAttachment {
  bytes: Buffer;
  fileClass: ManagedAttachmentClass;
  extension: string;
  responseMime: string;
}

interface AssemblyAiTranscript {
  id?: unknown;
  status?: unknown;
  text?: unknown;
  error?: unknown;
  language_code?: unknown;
  language_confidence?: unknown;
  words?: unknown;
  upload_url?: unknown;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedMime(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function classFromMime(value: string): ManagedAttachmentClass | null {
  const mime = normalizedMime(value);
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/ogg") return "audio";
  if (mime === "application/x-matroska") return "video";
  return null;
}

function extensionOf(name: string): string {
  const clean = name.split(/[?#]/, 1)[0] ?? name;
  const dot = clean.lastIndexOf(".");
  return dot >= 0 ? clean.slice(dot).toLowerCase() : "";
}

function validateDeclaredFile(ref: OpenAiConversationFileRef): {
  fileClass: ManagedAttachmentClass;
  extension: string;
} {
  const fileClass = classFromMime(ref.mime_type);
  const extension = extensionOf(ref.name);
  const extensionOk = fileClass === "audio"
    ? AUDIO_EXTENSIONS.has(extension)
    : fileClass === "video"
      ? VIDEO_EXTENSIONS.has(extension)
      : false;
  if (!fileClass || !extension || !extensionOk) {
    throw new MediaTranscriptError(
      "ATTACHMENT_MEDIA_TYPE_UNSUPPORTED",
      "The attached file must be a supported audio or video file with a matching filename extension.",
      415,
      false
    );
  }
  return { fileClass, extension };
}

function validateDownloadUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_URL_REJECTED",
      "The attachment download URL is not an absolute URL.",
      400,
      false
    );
  }
  const host = url.hostname.toLowerCase();
  const hostOk = host.length > OPENAI_FILE_HOST_SUFFIX.length &&
    host.endsWith(OPENAI_FILE_HOST_SUFFIX);
  const pathOk = url.pathname.startsWith("/") &&
    url.pathname.length > 1 && url.pathname.length <= 4096;
  if (
    url.protocol !== "https:" || !hostOk || !pathOk ||
    Boolean(url.username) || Boolean(url.password) || Boolean(url.port) || Boolean(url.hash)
  ) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_URL_REJECTED",
      "The attachment download URL is outside the trusted OpenAI attachment boundary.",
      400,
      false
    );
  }
  return url;
}

async function readBoundedBody(response: Response, maximumBytes: number): Promise<Buffer> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const contentLength = Number(lengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new MediaTranscriptError(
        "ATTACHMENT_FILE_TOO_LARGE",
        `Local attachments are limited to ${maximumBytes} bytes.`,
        413,
        false
      );
    }
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_EMPTY",
      "The attachment download returned no readable body.",
      422,
      false
    );
  }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MediaTranscriptError(
          "ATTACHMENT_FILE_TOO_LARGE",
          `Local attachments are limited to ${maximumBytes} bytes.`,
          413,
          false
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (total <= 0) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_EMPTY",
      "The attachment download returned an empty body.",
      422,
      false
    );
  }
  return Buffer.concat(chunks, total);
}

export async function downloadManagedAttachment(
  ref: OpenAiConversationFileRef,
  fetchImpl: typeof fetch = fetch
): Promise<DownloadedAttachment> {
  const declared = validateDeclaredFile(ref);
  const url = validateDownloadUrl(ref.download_link);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "*/*" },
      redirect: "manual",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
    });
  } catch (error) {
    if (error instanceof MediaTranscriptError) throw error;
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_UNAVAILABLE",
      "The temporary attachment URL could not be reached by the isolated backend.",
      502,
      true
    );
  }
  if (response.status >= 300 && response.status < 400) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_REDIRECT_BLOCKED",
      "Attachment redirects are blocked.",
      502,
      false
    );
  }
  if (response.status !== 200) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DOWNLOAD_UNAVAILABLE",
      `The temporary attachment URL returned HTTP ${response.status}.`,
      502,
      response.status === 408 || response.status === 429 || response.status >= 500
    );
  }
  const responseMime = normalizedMime(response.headers.get("content-type") ?? "");
  if (!responseMime || classFromMime(responseMime) !== declared.fileClass) {
    throw new MediaTranscriptError(
      "ATTACHMENT_MIME_MISMATCH",
      "The downloaded attachment MIME type does not match the declared audio/video class.",
      415,
      false
    );
  }
  return {
    bytes: await readBoundedBody(response, MANAGED_ATTACHMENT_MAX_BYTES),
    fileClass: declared.fileClass,
    extension: declared.extension,
    responseMime
  };
}

async function runCommand(command: string, args: string[]): Promise<string> {
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
        "ATTACHMENT_PROCESSING_TIMEOUT",
        "Local attachment processing timed out.",
        504,
        true
      ));
    }, COMMAND_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MediaTranscriptError(
        "ATTACHMENT_PROCESSOR_UNAVAILABLE",
        "The attachment media processor is unavailable.",
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
          "ATTACHMENT_PROCESSING_FAILED",
          detail ? detail.slice(0, 400) : "Local attachment processing failed.",
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
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", path
  ]);
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaTranscriptError(
      "ATTACHMENT_DURATION_UNKNOWN",
      "The local attachment duration could not be determined.",
      422,
      false
    );
  }
  return duration;
}

class AssemblyAiAttachmentTranscriber {
  constructor(private readonly apiKey: string) {}

  private async request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.apiKey);
    let response: Response;
    try {
      response = await fetch(`${ASSEMBLYAI_BASE_URL}${path}`, { ...init, headers });
    } catch {
      throw new MediaTranscriptError(
        "STT_PROVIDER_UNREACHABLE",
        "The transcription provider could not be reached.",
        502,
        true
      );
    }
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
        "The transcription provider rejected the local attachment request.",
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
    const uploadUrl = nonEmptyString(payload.upload_url);
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
    if (languageHint === "auto") body.language_detection = true;
    else body.language_code = languageHint;
    const payload = await this.request("/v2/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const id = nonEmptyString(payload.id);
    if (!id) {
      throw new MediaTranscriptError(
        "STT_SUBMIT_FAILED",
        "The transcription provider did not return a transcript identifier.",
        502,
        true
      );
    }
    return id;
  }

  async waitForCompletion(id: string): Promise<AssemblyAiTranscript> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < TRANSCRIPTION_TIMEOUT_MS) {
      const payload = await this.request(`/v2/transcript/${id}`, { method: "GET" });
      if (payload.status === "completed") return payload;
      if (payload.status === "error") {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPTION_FAILED",
          nonEmptyString(payload.error) || "The transcription provider failed.",
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

  async delete(id: string): Promise<void> {
    await this.request(`/v2/transcript/${id}`, { method: "DELETE" });
  }
}

export class DefaultManagedAttachmentPipeline implements ManagedAttachmentPipeline {
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string | null,
    private readonly maxDurationSeconds: number
  ) {
    this.configured = Boolean(apiKey);
  }

  async transcribe(
    file: OpenAiConversationFileRef,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void
  ): Promise<ManagedAttachmentSttResult> {
    if (!this.apiKey) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
        "AssemblyAI local attachment transcription is not configured.",
        503,
        false
      );
    }
    let directory: string | null = null;
    let transcriber: AssemblyAiAttachmentTranscriber | null = null;
    let transcriptId: string | null = null;
    let providerDataDeleted = false;
    try {
      const downloaded = await downloadManagedAttachment(file);
      directory = await mkdtemp(join(tmpdir(), "voicebridge-krc-attachment-"));
      const sourcePath = join(directory, `source${downloaded.extension}`);
      await writeFile(sourcePath, downloaded.bytes);
      const sttPath = join(directory, "stt.mp3");
      await runCommand("ffmpeg", [
        "-y", "-loglevel", "error", "-i", sourcePath,
        "-t", String(this.maxDurationSeconds + 1),
        "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", sttPath
      ]);
      const sttInfo = await stat(sttPath);
      if (!sttInfo.isFile() || sttInfo.size <= 0 || sttInfo.size > MAX_STT_MEDIA_BYTES) {
        throw new MediaTranscriptError(
          "ATTACHMENT_STT_MEDIA_INVALID",
          "The normalized attachment audio exceeds the STT upload limit.",
          413,
          false
        );
      }
      const durationSeconds = await probeDurationSeconds(sttPath);
      if (durationSeconds > this.maxDurationSeconds + 0.5) {
        throw new MediaTranscriptError(
          "MEDIA_DURATION_LIMIT",
          `Closed beta media is limited to ${this.maxDurationSeconds} seconds.`,
          413,
          false
        );
      }
      reserveSttSeconds(durationSeconds);
      transcriber = new AssemblyAiAttachmentTranscriber(this.apiKey);
      const uploadUrl = await transcriber.upload(sttPath);
      transcriptId = await transcriber.submit(uploadUrl, languageHint);
      const result = await transcriber.waitForCompletion(transcriptId);
      const transcriptText = nonEmptyString(result.text) || "";
      const segments = chunkTranscriptWords(result.words, transcriptText);
      if (!transcriptText || segments.length === 0) {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPT_EMPTY",
          "AssemblyAI returned no usable transcript for the local attachment.",
          422,
          false
        );
      }
      try {
        await transcriber.delete(transcriptId);
        providerDataDeleted = true;
      } catch {
        providerDataDeleted = false;
      }
      return {
        provider: "assemblyai",
        provider_model: ASSEMBLYAI_ASYNC_MODEL,
        provider_data_deleted: providerDataDeleted,
        detected_language: nonEmptyString(result.language_code),
        language_confidence: finiteNumber(result.language_confidence),
        duration_seconds: durationSeconds,
        transcript_text: transcriptText,
        segments
      };
    } finally {
      if (transcriber && transcriptId && !providerDataDeleted) {
        try {
          await transcriber.delete(transcriptId);
        } catch {}
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
