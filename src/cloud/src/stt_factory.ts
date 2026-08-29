import type { SttProviderName } from "./config.js";
import {
  configuredAssemblyAiSpeechModel,
  createSttProvider as createAssemblyAiSttProvider,
  type SttProvider
} from "./stt_provider.js";
import {
  configuredGeminiSttModel,
  createGeminiSttProvider
} from "./gemini_stt_provider.js";

export interface SttProviderFactoryOptions {
  provider: SttProviderName;
  assemblyAiApiKey: string | null;
  geminiApiKey: string | null;
  assemblyAiSpeechModel?: string | undefined;
  geminiModel?: string | undefined;
}

export function createConfiguredSttProvider(
  options: SttProviderFactoryOptions
): SttProvider {
  if (options.provider === "gemini") {
    return createGeminiSttProvider(
      options.geminiApiKey,
      options.geminiModel ?? configuredGeminiSttModel()
    );
  }
  return createAssemblyAiSttProvider(
    options.assemblyAiApiKey,
    options.assemblyAiSpeechModel ?? configuredAssemblyAiSpeechModel()
  );
}
