import {
  TelegramPublicWebRetriever,
  type TelegramPublicMediaAsset
} from "./telegram_public_retrieval.js";
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

export interface ManagedTelegramSttResult {
  provider: "assemblyai";
  provider_model: "universal-2";
  provider_data_deleted: boolean;
  detected_language: string | null;
  language_confidence: number | null;
  duration_seconds: number;
  transcript_text: string;
  segments: MediaTranscriptSegment[];
}

export interface ManagedTelegramPipeline {
  readonly configured: boolean;
  retrieve(sourceUrl: string): Promise<TelegramPublicMediaAsset>;
  transcribe(
    asset: TelegramPublicMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ): Promise<ManagedTelegramSttResult>;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

class AssemblyAiTelegramUrlTranscriber {
  constructor(private readonly apiKey: string) {}

  private async request(
    path: string,
    init: RequestInit
  ): Promise<AssemblyAiTranscript & Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.apiKey);
    let response: Response;
    try {
      response = await fetch(`${ASSEMBLYAI_BASE_URL}${path}`, {
        ...init,
        headers
      });
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
        "The transcription provider rejected the Telegram media request.",
        response.status >= 500 ? 502 : 422,
        response.status >= 500
      );
    }
    return payload;
  }

  async submit(
    mediaUrl: string,
    languageHint: MediaLanguageHint
  ): Promise<string> {
    const body: Record<string, unknown> = {
      audio_url: mediaUrl,
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
    const transcriptId = nonEmptyString(payload.id);
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

  async delete(transcriptId: string): Promise<void> {
    await this.request(`/v2/transcript/${transcriptId}`, { method: "DELETE" });
  }
}

export class AssemblyAiTelegramMediaStt {
  readonly configured: boolean;

  constructor(private readonly apiKey: string | null) {
    this.configured = Boolean(apiKey);
  }

  async transcribe(
    asset: TelegramPublicMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ): Promise<ManagedTelegramSttResult> {
    if (!this.apiKey) {
      throw new MediaTranscriptError(
        "MEDIA_TRANSCRIPT_NOT_CONFIGURED",
        "AssemblyAI Telegram media transcription is not configured.",
        503,
        false
      );
    }
    const duration = asset.duration_seconds;
    if (duration === null || !Number.isFinite(duration) || duration <= 0) {
      throw new MediaTranscriptError(
        "TELEGRAM_MEDIA_DURATION_UNKNOWN",
        "The public Telegram embed did not expose a valid video duration.",
        422,
        false
      );
    }

    await reserveSttSeconds(duration);
    const transcriber = new AssemblyAiTelegramUrlTranscriber(this.apiKey);
    let transcriptId: string | null = null;
    let providerDataDeleted = false;
    try {
      transcriptId = await transcriber.submit(asset.media_url, languageHint);
      const result = await transcriber.waitForCompletion(transcriptId);
      const transcriptText = nonEmptyString(result.text) || "";
      const segments = chunkTranscriptWords(result.words, transcriptText);
      if (!transcriptText || segments.length === 0) {
        throw new MediaTranscriptError(
          "STT_TRANSCRIPT_EMPTY",
          "AssemblyAI returned no usable transcript for the Telegram media.",
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
      if (transcriptId && !providerDataDeleted) {
        try {
          await transcriber.delete(transcriptId);
        } catch {}
      }
    }
  }
}

export class DefaultManagedTelegramPipeline implements ManagedTelegramPipeline {
  readonly configured: boolean;

  constructor(
    private readonly retriever: TelegramPublicWebRetriever,
    private readonly stt: AssemblyAiTelegramMediaStt
  ) {
    this.configured = stt.configured;
  }

  async retrieve(sourceUrl: string): Promise<TelegramPublicMediaAsset> {
    return this.retriever.retrieve(sourceUrl);
  }

  async transcribe(
    asset: TelegramPublicMediaAsset,
    languageHint: MediaLanguageHint,
    reserveSttSeconds: (seconds: number) => void | Promise<void>
  ): Promise<ManagedTelegramSttResult> {
    return this.stt.transcribe(asset, languageHint, reserveSttSeconds);
  }
}
