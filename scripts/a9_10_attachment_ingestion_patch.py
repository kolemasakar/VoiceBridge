from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "cloud" / "src"
TESTS = ROOT / "src" / "cloud" / "tests"


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor missing in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {path}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


pipeline = r'''import { spawn } from "node:child_process";
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
'''
(SRC / "attachment_managed_pipeline.ts").write_text(pipeline, encoding="utf-8")

service = SRC / "managed_media_service.ts"
replace_once(
    service,
    'import type { ManagedTelegramPipeline } from "./telegram_managed_pipeline.js";\n',
    'import type { ManagedTelegramPipeline } from "./telegram_managed_pipeline.js";\n'
    'import type { ManagedAttachmentPipeline } from "./attachment_managed_pipeline.js";\n'
    'import {\n  parseManagedAttachmentProbeInput,\n  type OpenAiConversationFileRef\n} from "./managed_attachment_probe.js";\n'
)
replace_once(
    service,
    'export interface ManagedMediaNativeInput extends ManagedMediaPreflightInput {\n',
    'export interface ManagedMediaAttachmentInput {\n'
    '  openaiFileIdRefs: [OpenAiConversationFileRef];\n'
    '  language_hint: MediaLanguageHint;\n'
    '  beta_access_code: string;\n'
    '}\n\n'
    'export interface ManagedMediaNativeInput extends ManagedMediaPreflightInput {\n'
)
replace_once(
    service,
    '    | "facebook_retrieval_stt"\n    | "telegram_public_retrieval_stt";\n',
    '    | "facebook_retrieval_stt"\n    | "telegram_public_retrieval_stt"\n    | "attachment_upload_stt";\n'
)
replace_once(
    service,
    '  retrieval_provider?: "cobalt" | "scrapecreators" | "telegram_public_web" | null;\n',
    '  retrieval_provider?: "cobalt" | "scrapecreators" | "telegram_public_web" | "openai_attachment" | null;\n'
)
replace_once(
    service,
    '  telegramPipeline?: ManagedTelegramPipeline;\n',
    '  telegramPipeline?: ManagedTelegramPipeline;\n  attachmentPipeline?: ManagedAttachmentPipeline;\n'
)
replace_once(
    service,
    'export function managedTelegramRequestKey(\n',
    'export function managedAttachmentRequestKey(\n'
    '  file: OpenAiConversationFileRef,\n'
    '  languageHint: MediaLanguageHint,\n'
    '  accessCode: string\n'
    '): string {\n'
    '  return createHash("sha256")\n'
    '    .update(\n'
    '      `attachment-upload-stt|${file.id}|${file.name}|${file.mime_type}|${languageHint}|${managedMediaAccessDigest(accessCode)}`,\n'
    '      "utf8"\n'
    '    )\n'
    '    .digest("hex");\n'
    '}\n\n'
    'export function managedTelegramRequestKey(\n'
)
replace_once(
    service,
    'export function parseManagedMediaPreflightInput(\n  value: unknown\n): ManagedMediaPreflightInput | null {\n  return parseCommonInput(value);\n}\n\n',
    'export function parseManagedMediaPreflightInput(\n  value: unknown\n): ManagedMediaPreflightInput | null {\n  return parseCommonInput(value);\n}\n\n'
    'export function parseManagedMediaAttachmentInput(\n'
    '  value: unknown\n'
    '): ManagedMediaAttachmentInput | null {\n'
    '  if (!value || typeof value !== "object" || Array.isArray(value)) return null;\n'
    '  const input = value as Record<string, unknown>;\n'
    '  if (!validAccessCode(input.beta_access_code)) return null;\n'
    '  const languageHint = parseLanguageHint(input.language_hint);\n'
    '  if (!languageHint) return null;\n'
    '  const parsed = parseManagedAttachmentProbeInput({\n'
    '    openaiFileIdRefs: input.openaiFileIdRefs\n'
    '  });\n'
    '  if (!parsed) return null;\n'
    '  return {\n'
    '    openaiFileIdRefs: [parsed.file],\n'
    '    language_hint: languageHint,\n'
    '    beta_access_code: input.beta_access_code\n'
    '  };\n'
    '}\n\n'
)
replace_once(
    service,
    '  private readonly telegramPipeline: ManagedTelegramPipeline | null;\n',
    '  private readonly telegramPipeline: ManagedTelegramPipeline | null;\n  private readonly attachmentPipeline: ManagedAttachmentPipeline | null;\n'
)
replace_once(
    service,
    '    this.telegramPipeline = options.telegramPipeline ?? null;\n',
    '    this.telegramPipeline = options.telegramPipeline ?? null;\n    this.attachmentPipeline = options.attachmentPipeline ?? null;\n'
)
replace_once(
    service,
    '      this.facebookPipeline?.configured ||\n      this.telegramPipeline?.configured\n',
    '      this.facebookPipeline?.configured ||\n      this.telegramPipeline?.configured ||\n      this.attachmentPipeline?.configured\n'
)
replace_once(
    service,
    '  private authorizeTelegramPipeline(accessCode: string): void {\n',
    '  private authorizeAttachmentPipeline(accessCode: string): void {\n'
    '    this.authorizeAccess(accessCode);\n'
    '    if (!this.attachmentPipeline?.configured) {\n'
    '      throw new MediaTranscriptError(\n'
    '        "ATTACHMENT_MANAGED_PIPELINE_NOT_CONFIGURED",\n'
    '        "Managed local attachment transcription is not configured.",\n'
    '        503,\n'
    '        false\n'
    '      );\n'
    '    }\n'
    '  }\n\n'
    '  private authorizeTelegramPipeline(accessCode: string): void {\n'
)
attachment_method = r'''
  async startAttachment(
    input: ManagedMediaAttachmentInput
  ): Promise<ManagedMediaJobView> {
    this.authorizeAttachmentPipeline(input.beta_access_code);
    await this.ensureStore();
    const file = input.openaiFileIdRefs[0];
    const requestKey = managedAttachmentRequestKey(
      file,
      input.language_hint,
      input.beta_access_code
    );
    const existing = await this.reusableRecord(requestKey);
    if (existing) return this.publicJob(existing.job, true);

    const now = new Date().toISOString();
    const job: ManagedMediaJobView = {
      job_id: `KRCM_${randomUUID()}`,
      status: "PROCESSING",
      created_at: now,
      updated_at: now,
      source_url: "attachment://local-media",
      language_hint: input.language_hint,
      provider: "assemblyai",
      provider_mode: "attachment_upload_stt",
      detected_language: null,
      available_languages: [],
      credits_charged: 0,
      credits_remaining_estimate: 0,
      credit_charge_uncertain: false,
      reused: false,
      segment_count: 0,
      transcript_characters: 0,
      ai_fallback_requires_new_consent: false,
      media_duration_seconds: null,
      ai_credit_ceiling: null,
      metadata_credits_charged: 0,
      retrieval_provider: "openai_attachment",
      retrieval_credits_charged: 0,
      stt_seconds_charged: 0,
      provider_data_deleted: null,
      language_confidence: null,
      error: null
    };
    const record: ManagedMediaStoredRecord = {
      job,
      requestKey,
      accessCodeDigest: managedMediaAccessDigest(input.beta_access_code),
      segments: [],
      expiresAt: this.expiryFrom(now, job)
    };
    const reservation = await this.store.reserve(record);
    if (!reservation.created) {
      const resolved = reservation.record.job.status === "PROCESSING" &&
        !this.inFlight.has(requestKey)
        ? await this.interruptedRecord(reservation.record)
        : reservation.record;
      return this.publicJob(resolved.job, true);
    }

    this.inFlight.add(requestKey);
    try {
      const stt = await this.attachmentPipeline!.transcribe(
        file,
        input.language_hint,
        (seconds) => {
          const quota = this.betaGate.reserveSttSeconds(seconds);
          if (!quota.allowed) {
            throw new MediaTranscriptError(
              "MEDIA_BETA_STT_QUOTA_EXHAUSTED",
              "The closed MEDIA BETA daily STT quota is exhausted.",
              429,
              false
            );
          }
        }
      );
      const updatedAt = new Date().toISOString();
      const completed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "COMPLETED",
          updated_at: updatedAt,
          detected_language: stt.detected_language,
          available_languages: stt.detected_language ? [stt.detected_language] : [],
          credit_charge_uncertain: false,
          segment_count: stt.segments.length,
          transcript_characters: stt.transcript_text.length,
          media_duration_seconds: stt.duration_seconds,
          retrieval_provider: "openai_attachment",
          retrieval_credits_charged: 0,
          stt_seconds_charged: Math.ceil(stt.duration_seconds),
          provider_data_deleted: stt.provider_data_deleted,
          language_confidence: stt.language_confidence,
          error: null
        },
        segments: stt.segments.map((segment) => ({ ...segment })),
        expiresAt: this.expiryFrom(updatedAt, job)
      };
      completed.expiresAt = this.expiryFrom(updatedAt, completed.job);
      await this.store.put(completed);
      return this.publicJob(completed.job, false);
    } catch (error) {
      const normalized = error instanceof MediaTranscriptError
        ? error
        : new MediaTranscriptError(
          "ATTACHMENT_MANAGED_PIPELINE_FAILED",
          "Managed local attachment transcription failed.",
          500,
          false
        );
      const updatedAt = new Date().toISOString();
      const failed: ManagedMediaStoredRecord = {
        ...record,
        job: {
          ...job,
          status: "FAILED",
          updated_at: updatedAt,
          credit_charge_uncertain: false,
          retrieval_provider: "openai_attachment",
          retrieval_credits_charged: 0,
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: normalized.retryable
          }
        },
        expiresAt: this.expiryFrom(updatedAt, job)
      };
      await this.store.put(failed);
      return this.publicJob(failed.job, false);
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

'''
replace_once(service, '  async startTelegram(\n', attachment_method + '  async startTelegram(\n')

http = SRC / "managed_media_http.ts"
replace_once(
    http,
    'import { TelegramPublicWebRetriever } from "./telegram_public_retrieval.js";\n',
    'import { TelegramPublicWebRetriever } from "./telegram_public_retrieval.js";\n'
    'import {\n  DefaultManagedAttachmentPipeline,\n  MANAGED_ATTACHMENT_MAX_BYTES\n} from "./attachment_managed_pipeline.js";\n'
)
replace_once(
    http,
    '  ManagedMediaService,\n',
    '  ManagedMediaService,\n  parseManagedMediaAttachmentInput,\n'
)
replace_once(
    http,
    'const TELEGRAM_PUBLIC = `${ROOT}/telegram`;\n',
    'const TELEGRAM_PUBLIC = `${ROOT}/telegram`;\nconst ATTACHMENT = `${ROOT}/attachment`;\n'
)
replace_once(
    http,
    '  const telegramPipeline = new DefaultManagedTelegramPipeline(\n    new TelegramPublicWebRetriever(),\n    new AssemblyAiTelegramMediaStt(config.assemblyAiApiKey)\n  );\n',
    '  const telegramPipeline = new DefaultManagedTelegramPipeline(\n    new TelegramPublicWebRetriever(),\n    new AssemblyAiTelegramMediaStt(config.assemblyAiApiKey)\n  );\n'
    '  const attachmentPipeline = new DefaultManagedAttachmentPipeline(\n'
    '    config.assemblyAiApiKey,\n'
    '    config.mediaMaxDurationSeconds ?? 3600\n'
    '  );\n'
)
replace_once(
    http,
    '      facebookPipeline,\n      telegramPipeline\n',
    '      facebookPipeline,\n      telegramPipeline,\n      attachmentPipeline\n'
)
replace_once(
    http,
    '    telegram_stt_configured: Boolean(config.assemblyAiApiKey),\n',
    '    telegram_stt_configured: Boolean(config.assemblyAiApiKey),\n'
    '    local_attachment_transport: true,\n'
    '    local_attachment_transcription: Boolean(config.assemblyAiApiKey),\n'
    '    local_attachment_provider: "assemblyai",\n'
    '    local_attachment_retrieval_provider: "openai_attachment",\n'
    '    local_attachment_max_bytes: MANAGED_ATTACHMENT_MAX_BYTES,\n'
    '    local_attachment_max_duration_seconds: config.mediaMaxDurationSeconds ?? 3600,\n'
)
attachment_route = r'''
      if (method === "POST" && path === ATTACHMENT) {
        const rawBody = await readJsonBody(request, config.maxRequestBodyBytes);
        const body = withServerOwnerAccessCode(rawBody, config.mediaBetaCodes);
        const input = parseManagedMediaAttachmentInput(body);
        if (!input) {
          throw new MediaTranscriptError(
            "INVALID_REQUEST",
            "Exactly one runtime OpenAI audio/video attachment reference is required.",
            400,
            false
          );
        }
        const job = await service.startAttachment(input);
        sendJson(
          response,
          200,
          { request_id: context.requestId, ...job },
          context,
          config.corsAllowedOrigin
        );
        return true;
      }

'''
replace_once(http, '      if (method === "POST" && path === TELEGRAM_PUBLIC) {\n', attachment_route + '      if (method === "POST" && path === TELEGRAM_PUBLIC) {\n')

unit_test = r'''import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MANAGED_ATTACHMENT_MAX_BYTES,
  downloadManagedAttachment
} from "../src/attachment_managed_pipeline.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const REF = {
  name: "sample.mp4",
  id: "file_runtime_test",
  mime_type: "video/mp4",
  download_link: "https://sdmntprcacentral.oaiusercontent.com/opaque/runtime/path?sig=redacted"
};

test("A9.10 full attachment downloader accepts regional OpenAI host and opaque path", async () => {
  const result = await downloadManagedAttachment(REF, async () => new Response(
    Buffer.from("0123456789"),
    { status: 200, headers: { "content-type": "video/mp4", "content-length": "10" } }
  ));
  assert.equal(result.fileClass, "video");
  assert.equal(result.extension, ".mp4");
  assert.equal(result.responseMime, "video/mp4");
  assert.equal(result.bytes.length, 10);
});

test("A9.10 full attachment downloader rejects lookalike hosts", async () => {
  await assert.rejects(
    () => downloadManagedAttachment({
      ...REF,
      download_link: "https://evil-oaiusercontent.com/file.mp4"
    }, async () => new Response(Buffer.from("x"), { status: 200, headers: { "content-type": "video/mp4" } })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_DOWNLOAD_URL_REJECTED"
  );
});

test("A9.10 full attachment downloader rejects declared oversize content before body read", async () => {
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(
      Buffer.from("x"),
      {
        status: 200,
        headers: {
          "content-type": "video/mp4",
          "content-length": String(MANAGED_ATTACHMENT_MAX_BYTES + 1)
        }
      }
    )),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_FILE_TOO_LARGE"
  );
});

test("A9.10 full attachment downloader rejects redirects and MIME mismatch", async () => {
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(null, {
      status: 302,
      headers: { location: "https://example.com/file.mp4" }
    })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_DOWNLOAD_REDIRECT_BLOCKED"
  );
  await assert.rejects(
    () => downloadManagedAttachment(REF, async () => new Response(Buffer.from("x"), {
      status: 200,
      headers: { "content-type": "audio/mpeg" }
    })),
    (error: unknown) => error instanceof MediaTranscriptError && error.code === "ATTACHMENT_MIME_MISMATCH"
  );
});
'''
(TESTS / "managed_attachment_ingestion.test.ts").write_text(unit_test, encoding="utf-8")

http_test = r'''import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { AppConfig } from "../src/config.js";
import type { ManagedAttachmentPipeline } from "../src/attachment_managed_pipeline.js";
import type { OpenAiConversationFileRef } from "../src/managed_attachment_probe.js";
import { createManagedMediaHttpHandler } from "../src/managed_media_http.js";
import { ManagedMediaService } from "../src/managed_media_service.js";
import { MediaBetaGate } from "../src/media_beta.js";

const ACTION_TOKEN = "managed-action-token-attachment-123456";
const ACCESS_CODE = "abcdefghijkl";
const REF: OpenAiConversationFileRef = {
  name: "sample.mp4",
  id: "file_runtime_attachment_test",
  mime_type: "video/mp4",
  download_link: "https://sdmntprcacentral.oaiusercontent.com/opaque/path?sig=test"
};

const CONFIG: AppConfig = {
  host: "127.0.0.1",
  port: 0,
  testAccessToken: "voicebridge-test-token-attachment-123456",
  mediaActionToken: ACTION_TOKEN,
  mediaBetaCodes: [ACCESS_CODE],
  mediaDailySttSeconds: 7200,
  mediaMaxDurationSeconds: 3600,
  assemblyAiApiKey: null,
  supadataApiKey: null,
  geminiApiKey: null,
  geminiTranslationModel: "gemini-3.1-flash-lite",
  corsAllowedOrigin: "*",
  maxRequestBodyBytes: 32768,
  rateLimitRequestsPerMinute: 1000
};

class FakeAttachmentPipeline implements ManagedAttachmentPipeline {
  readonly configured = true;
  calls = 0;
  async transcribe(
    _file: OpenAiConversationFileRef,
    _languageHint: "auto" | "uk" | "ru" | "en",
    reserveSttSeconds: (seconds: number) => void
  ) {
    this.calls += 1;
    reserveSttSeconds(7.2);
    return {
      provider: "assemblyai" as const,
      provider_model: "universal-2" as const,
      provider_data_deleted: true,
      detected_language: "en",
      language_confidence: 0.98,
      duration_seconds: 7.2,
      transcript_text: "Local attachment transcript",
      segments: [{
        index: 0,
        start_ms: 0,
        end_ms: 7200,
        text: "Local attachment transcript",
        confidence: 0.97
      }]
    };
  }
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function headers(): Record<string, string> {
  return {
    authorization: `Bearer ${ACTION_TOKEN}`,
    "content-type": "application/json"
  };
}

test("A9.10 managed attachment HTTP route creates durable-compatible KRCM result and reuses duplicate", async () => {
  const pipeline = new FakeAttachmentPipeline();
  const service = new ManagedMediaService(
    new MediaBetaGate([ACCESS_CODE], 7200),
    null,
    undefined,
    { attachmentPipeline: pipeline }
  );
  const handler = createManagedMediaHttpHandler(CONFIG, service);
  const server = createServer((request, response) => { void handler.handle(request, response); });
  const base = await listen(server);
  try {
    const capabilityResponse = await fetch(`${base}/api/v1/media/managed`, {
      headers: { authorization: `Bearer ${ACTION_TOKEN}` }
    });
    assert.equal(capabilityResponse.status, 200);
    const capability = await capabilityResponse.json() as Record<string, unknown>;
    assert.equal(capability.local_attachment_transport, true);
    assert.equal(capability.local_attachment_retrieval_provider, "openai_attachment");

    const body = JSON.stringify({ openaiFileIdRefs: [REF], language_hint: "auto" });
    const startResponse = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body
    });
    assert.equal(startResponse.status, 200);
    const started = await startResponse.json() as Record<string, unknown>;
    assert.equal(started.status, "COMPLETED");
    assert.equal(started.source_url, "attachment://local-media");
    assert.equal(started.provider_mode, "attachment_upload_stt");
    assert.equal(started.retrieval_provider, "openai_attachment");
    assert.equal(started.retrieval_credits_charged, 0);
    assert.equal(started.stt_seconds_charged, 8);
    assert.equal(started.provider_data_deleted, true);
    const jobId = String(started.job_id);

    const segmentsResponse = await fetch(
      `${base}/api/v1/media/managed/transcriptions/${jobId}/segments?cursor=0&limit=20`,
      { headers: { authorization: `Bearer ${ACTION_TOKEN}` } }
    );
    assert.equal(segmentsResponse.status, 200);
    const page = await segmentsResponse.json() as { segments?: Array<{ text?: string }> };
    assert.equal(page.segments?.[0]?.text, "Local attachment transcript");

    const duplicate = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body
    });
    assert.equal(duplicate.status, 200);
    const reused = await duplicate.json() as Record<string, unknown>;
    assert.equal(reused.job_id, jobId);
    assert.equal(reused.reused, true);
    assert.equal(pipeline.calls, 1);

    const invalid = await fetch(`${base}/api/v1/media/managed/attachment`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ openaiFileIdRefs: ["literal-placeholder"], language_hint: "auto" })
    });
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});
'''
(TESTS / "managed_media_attachment_http.test.ts").write_text(http_test, encoding="utf-8")

print("A9.10 attachment ingestion patch applied")
