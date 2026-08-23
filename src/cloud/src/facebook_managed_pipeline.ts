import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FacebookMediaRetrievalError,
  type FacebookMediaAsset,
  type FacebookMediaRetrievalProvider,
  type FacebookMediaRetriever,
  type FacebookRetrievalCreditConsent,
  type FacebookRetrievalHttpStatusClass
} from "./facebook_media_retrieval.js";
import {
  MediaTranscriptError,
  chunkTranscriptWords,
  type MediaLanguageHint,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const ASSEMBLYAI_BASE_URL = (
  process.env.KRC_MEDIA_ASSEMBLYAI_BASE_URL || "https://api.assemblyai.com"
).replace(/\/+$/, "");
const ASSEMBLYAI_ASYNC_MODEL = "universal-2";
const MAX_MEDIA_FILE_BYTES = 128 * 1024 * 1024;
const COMMAND_TIMEOUT_MS = 120000;
const TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

interface AssemblyAiTranscript {
  id?: unknown;
  status?: unknown;
  text?: unknown;
  error?: unknown;
  language_code?: unknown;
  language_confidence?: unknown;
  words?: unknown;
}

export interface ManagedFacebookSttResult {
  provider: "assemblyai";
  provider_model: "universal-2";
  provider_data_deleted: boolean;
  detected_language: string | null;
  language_confidence: number | null;
  duration_seconds: number;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

export interface ManagedFacebookFreeRetrievalFailure {
  kind: "failure";
  error_code: string;
  provider: FacebookMediaRetrievalProvider | null;
  http_status_class: FacebookRetrievalHttpStatusClass;
}

export type ManagedFacebookFreeRetrievalResult =
  | FacebookMediaAsset
  | ManagedFacebookFreeRetrievalFailure
  | null;

export function isManagedFacebookFreeRetrievalFailure(
  value: ManagedFacebookFreeRetrievalResult
): value is ManagedFacebookFreeRetrievalFailure {
  return value !== null && "kind" in value && value.kind === "failure";
}

export interface ManagedFacebookPipeline {
  readonly configured: boolean;
  freeRetrieve(sourceUrl: string): Promise<ManagedFacebookFreeRetrievalResult>;
  paidRetrieve(
    sourceUrl: string,
    consent: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset>;
  transcribe(
    asset: FacebookMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void
  ): Promise<ManagedFacebookSttResult>;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function runTextCommand(
  command: string,
  args: string[],
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new MediaTranscriptError(
        "FACEBOOK_MEDIA_PROBE_TIMEOUT",
        "Facebook media duration probing timed out.",
        504,
        true
      ));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", () => {});
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new MediaTranscriptError(
        "FACEBOOK_MEDIA_PROBE_UNAVAILABLE",
        "The server media probe is unavailable.",
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
          "FACEBOOK_MEDIA_PROBE_FAILED",
          "The retrieved Facebook media duration could not be verified.",
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
  const output = await runTextCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path
  ]);
  const duration = Number(output.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new MediaTranscriptError(
      "FACEBOOK_MEDIA_DURATION_UNKNOWN",
      "The retrieved Facebook media duration is invalid.",
      422,
      false
    );
  }
  return duration;
}

async function downloadMedia(mediaUrl: string): Promise<{ directory: string; path: string }> {
  const directory = await mkdtemp(join(tmpdir(), "voicebridge-facebook-"));
  const path = join(directory, "media.bin");
  try {
    let response: Response;
    try {
      response = await fetch(mediaUrl, { method: "GET", redirect: "follow" });
    } catch {
      throw new MediaTranscriptError(
        "FACEBOOK_MEDIA_DOWNLOAD_UNREACHABLE",
        "The retrieved Facebook media asset could not be downloaded.",
        502,
        true
      );
    }
    if (!response.ok) {
      throw new MediaTranscriptError(
        "FACEBOOK_MEDIA_DOWNLOAD_FAILED",
        "The retrieved Facebook media asset was rejected by its origin.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500
      );
    }
    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_MEDIA_FILE_BYTES) {
      throw new MediaTranscriptError(
        "MEDIA_FILE_TOO_LARGE",
        "The retrieved Facebook media exceeds the supported size limit.",
        413,
        false
      );
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length <= 0 || body.length > MAX_MEDIA_FILE_BYTES) {
      throw new MediaTranscriptError(
        body.length <= 0 ? "FACEBOOK_MEDIA_DOWNLOAD_EMPTY" : "MEDIA_FILE_TOO_LARGE",
        body.length <= 0
          ? "The retrieved Facebook media asset is empty."
          : "The retrieved Facebook media exceeds the supported size limit.",
        body.length <= 0 ? 422 : 413,
        false
      );
    }
    await writeFile(path, body);
    const info = await stat(path);
    if (!info.isFile() || info.size !== body.length) {
      throw new MediaTranscriptError(
        "FACEBOOK_MEDIA_DOWNLOAD_FAILED",
        "The retrieved Facebook media asset could not be persisted safely.",
        502,
        true
      );
    }
    return { directory, path };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

class AssemblyAiFileTranscriber {
  constructor(private readonly apiKey: string) {}

  private async request(
    path: string,
    init: RequestInit
  ): Promise<AssemblyAiTranscript & Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.apiKey);
    const response = await fetch(`${ASSEMBLYAI_BASE_URL}${path}`, { ...init, headers });
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

export class AssemblyAiFacebookMediaStt {
  readonly configured: boolean;

  constructor(private readonly apiKey: string | null) {
    this.configured = Boolean(apiKey);
  }

  async transcribe(
    asset: FacebookMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void
  ): Promise<ManagedFacebookSttResult> {
    if (!this.apiKey) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
        "AssemblyAI media transcription is not configured.",
        503,
        false
      );
    }
    const downloaded = await downloadMedia(asset.media_url);
    let transcriber: AssemblyAiFileTranscriber | null = null;
    let transcriptId: string | null = null;
    let providerDataDeleted = false;
    try {
      const duration = await probeDurationSeconds(downloaded.path);
      reserveSttSeconds(duration);
      transcriber = new AssemblyAiFileTranscriber(this.apiKey);
      const uploadUrl = await transcriber.upload(downloaded.path);
      transcriptId = await transcriber.submit(uploadUrl, languageHint);
      const result = await transcriber.waitForCompletion(transcriptId);
      const transcriptText = nonEmptyString(result.text) || "";
      const segments = chunkTranscriptWords(result.words, transcriptText);
      if (!transcriptText || segments.length === 0) {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPT_EMPTY",
          "AssemblyAI returned no usable transcript for the retrieved Facebook media.",
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
        duration_seconds: duration,
        transcript_text: transcriptText,
        segments
      };
    } finally {
      if (transcriber && transcriptId && !providerDataDeleted) {
        try {
          await transcriber.delete(transcriptId);
        } catch {}
      }
      await rm(downloaded.directory, { recursive: true, force: true });
    }
  }
}

export class DefaultManagedFacebookPipeline implements ManagedFacebookPipeline {
  readonly configured: boolean;

  constructor(
    private readonly freeRetriever: FacebookMediaRetriever | null,
    private readonly paidRetriever: FacebookMediaRetriever | null,
    private readonly stt: AssemblyAiFacebookMediaStt
  ) {
    this.configured = stt.configured && Boolean(freeRetriever || paidRetriever);
  }

  async freeRetrieve(sourceUrl: string): Promise<ManagedFacebookFreeRetrievalResult> {
    if (!this.freeRetriever) {
      return {
        kind: "failure",
        error_code: "FACEBOOK_FREE_RETRIEVER_NOT_CONFIGURED",
        provider: null,
        http_status_class: null
      };
    }
    try {
      return await this.freeRetriever.retrieve(sourceUrl);
    } catch (error) {
      if (error instanceof FacebookMediaRetrievalError) {
        return {
          kind: "failure",
          error_code: error.code,
          provider: error.provider ?? this.freeRetriever.provider,
          http_status_class: error.providerHttpStatusClass
        };
      }
      return {
        kind: "failure",
        error_code: "FACEBOOK_FREE_RETRIEVAL_UNKNOWN",
        provider: this.freeRetriever.provider,
        http_status_class: null
      };
    }
  }

  async paidRetrieve(
    sourceUrl: string,
    consent: FacebookRetrievalCreditConsent
  ): Promise<FacebookMediaAsset> {
    if (!this.paidRetriever) {
      throw new MediaTranscriptError(
        "FACEBOOK_PAID_RETRIEVER_NOT_CONFIGURED",
        "The consent-gated Facebook retrieval fallback is not configured.",
        503,
        false
      );
    }
    return this.paidRetriever.retrieve(sourceUrl, consent);
  }

  async transcribe(
    asset: FacebookMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void
  ): Promise<ManagedFacebookSttResult> {
    return this.stt.transcribe(asset, languageHint, reserveSttSeconds);
  }
}
