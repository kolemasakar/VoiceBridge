import { loadConfig } from "./config.js";
import { listen } from "./managed_server.js";
import { configuredAssemblyAiSpeechModel } from "./stt_provider.js";
import { resolveGeminiSttModel } from "./gemini_stt_provider.js";
import { runCobaltStartupDiagnostic } from "./cobalt_startup_diagnostic.js";

try {
  const config = loadConfig();
  const sttProvider = config.sttProvider ?? "gemini";
  const sttModel = sttProvider === "gemini"
    ? resolveGeminiSttModel(config.geminiSttModel)
    : configuredAssemblyAiSpeechModel();
  const { server, url } = await listen(config);
  console.log(
    JSON.stringify({
      event: "service_started",
      service: "voicebridge-cloud",
      url,
      stt_provider: sttProvider,
      stt_model: sttModel,
      krc_media_stt_provider: config.krcMediaSttProvider ?? "assemblyai"
    })
  );

  if (process.env.KRC_MEDIA_COBALT_DIAGNOSTIC_ONCE === "true") {
    void runCobaltStartupDiagnostic(
      config.cobaltEndpoint ?? null,
      config.cobaltApiKey ?? null
    ).then((diagnostic) => {
      console.log(
        JSON.stringify({
          event: "cobalt_startup_diagnostic",
          ...diagnostic
        })
      );
    });
  }

  const shutdown = (signal: string) => {
    console.log(
      JSON.stringify({
        event: "service_stopping",
        service: "voicebridge-cloud",
        signal
      })
    );
    server.close((error) => {
      if (error) {
        console.error(
          JSON.stringify({
            event: "service_stop_failed",
            error: error.message
          })
        );
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  console.error(
    JSON.stringify({
      event: "service_start_failed",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  );
  process.exitCode = 1;
}
