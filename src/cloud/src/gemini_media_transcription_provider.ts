import {
  MediaTranscriptError,
  chunkTranscriptWords,
  type MediaTranscriptSegment
} from "./media_transcript.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_UPLOAD_PATH = "/upload/v1beta/files";
const GEMINI_INTERACTIONS_PATH = "/v1beta/interactions";
const MAX_AUDIO_SECONDS = 60 * 60;
const MAX_ANNOTATED_AUDIO_SECONDS = 30 * 60;
const MAX_CUSTOM_VOCABULARY = 1000;

export const KRC_GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe" as const;

export const KRC_GEMINI_LANGUAGE_CAPABILITY = Object.freeze({
  automatic_detection: true,
  provider_documented_locales: "85+",
  accepts_bcp47_hints: true,
  code_switching: true
});

const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  "audio/wav",
  "audio/mp3",
  "audio/aiff",
  "audio/aac",
  "audio/ogg",
  "audio/flac",
  "audio/mpeg",
  "audio/m4a",
  "audio/l16",
  "audio/opus",
  "audio/alaw",
  "audio/mulaw",
  "audio/webm"
]);

const KRC_SHORT_LANGUAGE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  en: "en-US",
  uk: "uk-UA",
  ru: "ru-RU"
});

interface GeminiUploadedFile {
  name: string;
  uri: string;
  mimeType: string;
}

interface GeminiWordAnnotation {
  type?: unknown;
  text?: unknown;
  speaker?: unknown;
  start_offset?: unknown;
  end_offset?: unknown;
}

export interface GeminiTranscribeRequest {
  audio: Uint8Array;
  mimeType: string;
  durationSeconds: number;
  languageHint: string;
  wordTimestamps?: boolean;
  diarization?: boolean;
  customVocabulary?: string[];
}

export interface GeminiTranscribeResult {
  provider: "gemini";
  provider_model: typeof KRC_GEMINI_TRANSCRIBE_MODEL;
  provider_data_deleted: boolean;
  detected_language: null;
  language_confidence: null;
  duration_seconds: number;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedMimeType(value: string): string {
  return value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function canonicalLanguageCode(value: string): string {
  const trimmed = value.trim();
  const defaultCode = KRC_SHORT_LANGUAGE_DEFAULTS[trimmed.toLowerCase()];
  if (defaultCode) return defaultCode;
  try {
    return Intl.getCanonicalLocales(trimmed)[0] ?? "";
  } catch {
    return "";
  }
}

export function geminiTranscribeLanguageCodes(languageHint: string): string[] {
  if (languageHint.trim().toLowerCase() === "auto") return [];
  const canonical = canonicalLanguageCode(languageHint);
  if (!canonical) {
    throw new MediaTranscriptError(
      "MEDIA_LANGUAGE_UNSUPPORTED",
      "The transcription language hint is not a valid BCP-47 language tag.",
      400,
      false
    );
  }
  return [canonical];
}

function parseOffsetMs(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match?.[1]) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

function responseRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function parseJsonResponse(
  response: Response,
  errorCode: string,
  errorMessage: string
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    const text = await response.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new MediaTranscriptError(
      "STT_PROVIDER_INVALID_RESPONSE",
      "The Gemini transcription provider returned invalid JSON.",
      502,
      true
    );
  }
  if (!response.ok) {
    throw new MediaTranscriptError(
      errorCode,
      errorMessage,
      response.status >= 500 || response.status === 429 ? 502 : 422,
      responseRetryable(response.status)
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MediaTranscriptError(
      "STT_PROVIDER_INVALID_RESPONSE",
      "The Gemini transcription provider returned an invalid response object.",
      502,
      true
    );
  }
  return payload as Record<string, unknown>;
}

function validateUploadUrl(value: string, apiBaseUrl: string): string {
  let parsed: URL;
  let apiBase: URL;
  try {
    parsed = new URL(value);
    apiBase = new URL(apiBaseUrl);
  } catch {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API did not return a valid upload URL.",
      502,
      true
    );
  }
  const trustedGoogleHost = parsed.hostname === apiBase.hostname ||
    parsed.hostname.endsWith(".googleapis.com");
  if (parsed.protocol !== "https:" || !trustedGoogleHost) {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API returned an untrusted upload URL.",
      502,
      false
    );
  }
  return parsed.toString();
}

function parseUploadedFile(
  payload: Record<string, unknown>,
  requestedMimeType: string
): GeminiUploadedFile {
  const fileValue = payload.file;
  if (!fileValue || typeof fileValue !== "object" || Array.isArray(fileValue)) {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API did not return file metadata.",
      502,
      true
    );
  }
  const file = fileValue as Record<string, unknown>;
  const name = nonEmptyString(file.name);
  const uri = nonEmptyString(file.uri);
  const mimeType = nonEmptyString(file.mimeType) ||
    nonEmptyString(file.mime_type) || requestedMimeType;
  if (!name || !/^files\/[a-z0-9-]{1,80}$/.test(name) || !uri) {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API returned incomplete file metadata.",
      502,
      true
    );
  }
  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API returned an invalid file URI.",
      502,
      true
    );
  }
  if (parsedUri.protocol !== "https:") {
    throw new MediaTranscriptError(
      "STT_UPLOAD_FAILED",
      "The Gemini Files API returned a non-HTTPS file URI.",
      502,
      false
    );
  }
  return { name, uri, mimeType };
}

function interactionTranscriptText(payload: Record<string, unknown>): string {
  const direct = nonEmptyString(payload.output_text);
  if (direct) return direct;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const textBlocks: string[] = [];
  for (const stepValue of steps) {
    if (!stepValue || typeof stepValue !== "object") continue;
    const step = stepValue as Record<string, unknown>;
    if (step.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const contentValue of step.content) {
      if (!contentValue || typeof contentValue !== "object") continue;
      const content = contentValue as Record<string, unknown>;
      if (content.type !== "text") continue;
      const text = nonEmptyString(content.text);
      if (text) textBlocks.push(text);
    }
  }
  return textBlocks.join("\n").trim();
}

function interactionWords(payload: Record<string, unknown>): Array<{
  text: string;
  start: number | null;
  end: number | null;
  confidence: null;
}> {
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const words: Array<{
    text: string;
    start: number | null;
    end: number | null;
    confidence: null;
  }> = [];
  for (const stepValue of steps) {
    if (!stepValue || typeof stepValue !== "object") continue;
    const step = stepValue as Record<string, unknown>;
    if (!Array.isArray(step.content)) continue;
    for (const contentValue of step.content) {
      if (!contentValue || typeof contentValue !== "object") continue;
      const content = contentValue as Record<string, unknown>;
      if (!Array.isArray(content.annotations)) continue;
      for (const annotationValue of content.annotations) {
        if (!annotationValue || typeof annotationValue !== "object") continue;
        const annotation = annotationValue as GeminiWordAnnotation;
        if (annotation.type !== "word_info") continue;
        const text = nonEmptyString(annotation.text);
        if (!text) continue;
        words.push({
          text,
          start: parseOffsetMs(annotation.start_offset),
          end: parseOffsetMs(annotation.end_offset),
          confidence: null
        });
      }
    }
  }
  return words;
}

function validateRequest(request: GeminiTranscribeRequest): {
  mimeType: string;
  languageCodes: string[];
  customVocabulary: string[];
} {
  const mimeType = normalizedMimeType(request.mimeType);
  if (!SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    throw new MediaTranscriptError(
      "STT_MEDIA_TYPE_UNSUPPORTED",
      "Gemini 3.5 Transcribe does not support this audio MIME type.",
      415,
      false
    );
  }
  if (!(request.audio instanceof Uint8Array) || request.audio.byteLength <= 0) {
    throw new MediaTranscriptError(
      "STT_MEDIA_EMPTY",
      "The transcription audio is empty.",
      422,
      false
    );
  }
  if (!Number.isFinite(request.durationSeconds) || request.durationSeconds <= 0) {
    throw new MediaTranscriptError(
      "MEDIA_DURATION_LIMIT",
      "The transcription duration is invalid.",
      422,
      false
    );
  }
  const annotated = Boolean(request.wordTimestamps || request.diarization);
  const maximum = annotated ? MAX_ANNOTATED_AUDIO_SECONDS : MAX_AUDIO_SECONDS;
  if (request.durationSeconds > maximum) {
    throw new MediaTranscriptError(
      "MEDIA_DURATION_LIMIT",
      annotated
        ? "Gemini annotated transcription is limited to 30 minutes per request."
        : "Gemini transcription is limited to 60 minutes per request.",
      413,
      false
    );
  }
  const customVocabulary = (request.customVocabulary ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (customVocabulary.length > MAX_CUSTOM_VOCABULARY) {
    throw new MediaTranscriptError(
      "STT_CUSTOM_VOCABULARY_LIMIT",
      `Gemini custom vocabulary is limited to ${MAX_CUSTOM_VOCABULARY} terms.`,
      400,
      false
    );
  }
  return {
    mimeType,
    languageCodes: geminiTranscribeLanguageCodes(request.languageHint),
    customVocabulary
  };
}

export class GeminiTranscribeProvider {
  readonly name = "gemini" as const;
  readonly model: typeof KRC_GEMINI_TRANSCRIBE_MODEL;
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string | null,
    model = KRC_GEMINI_TRANSCRIBE_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBaseUrl = GEMINI_API_BASE_URL
  ) {
    if (model !== KRC_GEMINI_TRANSCRIBE_MODEL) {
      throw new Error(
        `KRC_MEDIA_TRANSCRIBE_MODEL must be ${KRC_GEMINI_TRANSCRIBE_MODEL}.`
      );
    }
    this.model = KRC_GEMINI_TRANSCRIBE_MODEL;
    this.configured = Boolean(apiKey);
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
        "Gemini prerecorded transcription is not configured.",
        503,
        false
      );
    }
    return this.apiKey;
  }

  private async upload(
    audio: Uint8Array,
    mimeType: string,
    apiKey: string
  ): Promise<GeminiUploadedFile> {
    let startResponse: Response;
    try {
      startResponse = await this.fetchImpl(`${this.apiBaseUrl}${GEMINI_UPLOAD_PATH}`, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "x-goog-upload-protocol": "resumable",
          "x-goog-upload-command": "start",
          "x-goog-upload-header-content-length": String(audio.byteLength),
          "x-goog-upload-header-content-type": mimeType,
          "content-type": "application/json"
        },
        body: JSON.stringify({ file: { display_name: "krc-media-audio" } })
      });
    } catch {
      throw new MediaTranscriptError(
        "STT_PROVIDER_UNREACHABLE",
        "The Gemini Files API could not be reached.",
        502,
        true
      );
    }
    if (!startResponse.ok) {
      throw new MediaTranscriptError(
        "STT_UPLOAD_FAILED",
        "The Gemini Files API rejected the upload reservation.",
        startResponse.status >= 500 || startResponse.status === 429 ? 502 : 422,
        responseRetryable(startResponse.status)
      );
    }
    const uploadHeader = startResponse.headers.get("x-goog-upload-url");
    if (!uploadHeader) {
      throw new MediaTranscriptError(
        "STT_UPLOAD_FAILED",
        "The Gemini Files API did not return an upload URL.",
        502,
        true
      );
    }
    const uploadUrl = validateUploadUrl(uploadHeader, this.apiBaseUrl);
    let uploadResponse: Response;
    try {
      uploadResponse = await this.fetchImpl(uploadUrl, {
        method: "POST",
        headers: {
          "content-length": String(audio.byteLength),
          "x-goog-upload-offset": "0",
          "x-goog-upload-command": "upload, finalize"
        },
        body: Buffer.from(audio)
      });
    } catch {
      throw new MediaTranscriptError(
        "STT_PROVIDER_UNREACHABLE",
        "The Gemini media upload could not be completed.",
        502,
        true
      );
    }
    const payload = await parseJsonResponse(
      uploadResponse,
      "STT_UPLOAD_FAILED",
      "The Gemini Files API rejected the media upload."
    );
    return parseUploadedFile(payload, mimeType);
  }

  private async deleteFile(fileName: string, apiKey: string): Promise<boolean> {
    try {
      const response = await this.fetchImpl(
        `${this.apiBaseUrl}/v1beta/${fileName}`,
        {
          method: "DELETE",
          headers: { "x-goog-api-key": apiKey }
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async transcribe(request: GeminiTranscribeRequest): Promise<GeminiTranscribeResult> {
    const apiKey = this.requireApiKey();
    const validated = validateRequest(request);
    let uploaded: GeminiUploadedFile | null = null;
    let providerDataDeleted = false;
    try {
      uploaded = await this.upload(request.audio, validated.mimeType, apiKey);
      const mode: Record<string, unknown> = { type: "verbatim" };
      if (request.wordTimestamps) mode.timestamp_granularities = ["word"];
      if (request.diarization) mode.diarization_mode = "speaker";
      const transcriptionConfig: Record<string, unknown> = {
        language_codes: validated.languageCodes,
        mode
      };
      if (validated.customVocabulary.length > 0) {
        transcriptionConfig.custom_vocabulary = validated.customVocabulary;
      }

      let response: Response;
      try {
        response = await this.fetchImpl(
          `${this.apiBaseUrl}${GEMINI_INTERACTIONS_PATH}`,
          {
            method: "POST",
            headers: {
              "x-goog-api-key": apiKey,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: this.model,
              input: [{
                type: "audio",
                uri: uploaded.uri,
                mime_type: uploaded.mimeType
              }],
              generation_config: {
                transcription_config: transcriptionConfig
              }
            })
          }
        );
      } catch {
        throw new MediaTranscriptError(
          "STT_PROVIDER_UNREACHABLE",
          "The Gemini transcription endpoint could not be reached.",
          502,
          true
        );
      }

      const payload = await parseJsonResponse(
        response,
        "STT_PROVIDER_ERROR",
        "The Gemini transcription provider rejected the request."
      );
      const status = nonEmptyString(payload.status);
      if (status && status !== "completed") {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPTION_FAILED",
          "Gemini transcription did not complete successfully.",
          502,
          true
        );
      }
      const transcriptText = interactionTranscriptText(payload);
      if (!transcriptText) {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPT_EMPTY",
          "Gemini returned no usable transcript.",
          422,
          false
        );
      }
      const words = interactionWords(payload);
      const segments = chunkTranscriptWords(words, transcriptText);
      if (segments.length === 0) {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPT_EMPTY",
          "Gemini returned no usable transcript segments.",
          422,
          false
        );
      }

      providerDataDeleted = await this.deleteFile(uploaded.name, apiKey);
      return {
        provider: "gemini",
        provider_model: this.model,
        provider_data_deleted: providerDataDeleted,
        detected_language: null,
        language_confidence: null,
        duration_seconds: request.durationSeconds,
        transcript_text: transcriptText,
        segments
      };
    } finally {
      if (uploaded && !providerDataDeleted) {
        providerDataDeleted = await this.deleteFile(uploaded.name, apiKey);
      }
    }
  }
}
