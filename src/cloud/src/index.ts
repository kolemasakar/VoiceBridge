import { loadConfig } from "./config.js";
import { listen } from "./server.js";
import { configuredAssemblyAiSpeechModel } from "./stt_provider.js";
import { resolveGeminiSttModel } from "./gemini_stt_provider.js";

try {
  const config = loadConfig();
  const sttProvider = config.sttProvider ?? "assemblyai";
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
      stt_model: sttModel
    })
  );

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
