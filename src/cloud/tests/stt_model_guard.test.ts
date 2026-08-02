import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import {
  AssemblyAiSttProvider,
  DEFAULT_ASSEMBLYAI_SPEECH_MODEL,
  configuredAssemblyAiSpeechModel,
  createSttProvider,
  resolveAssemblyAiSpeechModel
} from "../src/stt_provider.js";

test("AssemblyAI speech model defaults to the approved explicit model", () => {
  assert.equal(
    resolveAssemblyAiSpeechModel(undefined),
    DEFAULT_ASSEMBLYAI_SPEECH_MODEL
  );
  assert.equal(
    configuredAssemblyAiSpeechModel({}),
    DEFAULT_ASSEMBLYAI_SPEECH_MODEL
  );
  assert.equal(
    resolveAssemblyAiSpeechModel(" universal-streaming-english "),
    DEFAULT_ASSEMBLYAI_SPEECH_MODEL
  );
});

test("AssemblyAI speech model rejects empty and unapproved values", () => {
  assert.throws(
    () => resolveAssemblyAiSpeechModel("   "),
    /must not be empty/
  );
  assert.throws(
    () => resolveAssemblyAiSpeechModel("universal-3-pro"),
    /explicitly approved model/
  );
  assert.throws(
    () => configuredAssemblyAiSpeechModel({
      ASSEMBLYAI_SPEECH_MODEL: "universal-3-5-pro"
    }),
    /explicitly approved model/
  );
});

test("STT provider reports the selected model even when disabled", () => {
  assert.equal(
    createSttProvider(null, DEFAULT_ASSEMBLYAI_SPEECH_MODEL).model,
    DEFAULT_ASSEMBLYAI_SPEECH_MODEL
  );
  assert.equal(
    createSttProvider("test-key", DEFAULT_ASSEMBLYAI_SPEECH_MODEL).model,
    DEFAULT_ASSEMBLYAI_SPEECH_MODEL
  );
});

test("AssemblyAI connection always sends a non-empty explicit speech_model", async () => {
  const providerServer = new WebSocketServer({
    host: "127.0.0.1",
    port: 0
  });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("listening", resolve);
    providerServer.once("error", reject);
  });

  const address = providerServer.address() as AddressInfo;
  let requestUrl = "";

  providerServer.on("connection", (socket, request) => {
    requestUrl = request.url || "";
    socket.send(JSON.stringify({ type: "Begin", id: "model-guard" }));
    socket.on("message", (data, isBinary) => {
      if (isBinary) {
        return;
      }
      const message = JSON.parse(data.toString()) as { type?: string };
      if (message.type === "Terminate") {
        socket.close(1000);
      }
    });
  });

  try {
    const provider = new AssemblyAiSttProvider(
      "assembly-test-key",
      `ws://127.0.0.1:${address.port}/v3/ws`,
      DEFAULT_ASSEMBLYAI_SPEECH_MODEL
    );
    const connection = await provider.connect(
      { sampleRateHz: 48000, channels: 1, language: "en-US" },
      {
        onStatus: () => undefined,
        onTranscript: () => undefined,
        onError: (_code, message) => assert.fail(message)
      }
    );

    const requested = new URL(requestUrl, "ws://127.0.0.1");
    assert.equal(
      requested.searchParams.get("speech_model"),
      DEFAULT_ASSEMBLYAI_SPEECH_MODEL
    );
    assert.notEqual(requested.searchParams.get("speech_model"), "");
    assert.equal(requested.searchParams.get("format_turns"), "true");

    await connection.close();
  } finally {
    await new Promise<void>((resolve, reject) => {
      providerServer.close((error) => error ? reject(error) : resolve());
    });
  }
});
