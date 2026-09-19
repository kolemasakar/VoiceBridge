import type { AppConfig } from "./config.js";
import {
  DefaultManagedAttachmentPipeline,
  type ManagedAttachmentPipeline
} from "./attachment_managed_pipeline.js";
import { AssemblyAiFacebookMediaStt } from "./facebook_managed_pipeline.js";
import {
  GeminiTranscribeProvider,
  KRC_GEMINI_TRANSCRIBE_MODEL
} from "./gemini_media_transcription_provider.js";
import { AssemblyAiTelegramMediaStt } from "./telegram_managed_pipeline.js";

export const KRC_MEDIA_ASSEMBLYAI_MODEL = "universal-2" as const;

export interface MediaTranscriptionProvider {
  readonly name: "assemblyai";
  readonly model: typeof KRC_MEDIA_ASSEMBLYAI_MODEL;
  readonly configured: boolean;
  readonly attachmentPipeline: ManagedAttachmentPipeline;
  readonly facebookStt: AssemblyAiFacebookMediaStt;
  readonly telegramStt: AssemblyAiTelegramMediaStt;
}

export function createMediaTranscriptionProvider(
  config: AppConfig
): MediaTranscriptionProvider {
  const selected = config.krcMediaSttProvider ?? "assemblyai";
  if (selected !== "assemblyai") {
    throw new Error(
      "KRC_MEDIA_STT_PROVIDER must remain assemblyai until the Gemini adapter activation gate."
    );
  }

  const attachmentPipeline = new DefaultManagedAttachmentPipeline(
    config.assemblyAiApiKey,
    config.mediaMaxDurationSeconds ?? 3600
  );
  const facebookStt = new AssemblyAiFacebookMediaStt(config.assemblyAiApiKey);
  const telegramStt = new AssemblyAiTelegramMediaStt(config.assemblyAiApiKey);

  return {
    name: "assemblyai",
    model: KRC_MEDIA_ASSEMBLYAI_MODEL,
    configured: Boolean(config.assemblyAiApiKey),
    attachmentPipeline,
    facebookStt,
    telegramStt
  };
}

export function createGeminiTranscribeCandidate(
  config: AppConfig,
  fetchImpl: typeof fetch = fetch
): GeminiTranscribeProvider {
  const model = (config.krcMediaTranscribeModel ?? KRC_GEMINI_TRANSCRIBE_MODEL) as
    typeof KRC_GEMINI_TRANSCRIBE_MODEL;
  return new GeminiTranscribeProvider(
    config.geminiApiKey,
    model,
    fetchImpl
  );
}
