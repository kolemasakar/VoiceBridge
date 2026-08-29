import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { WebSocketServer } from "ws";
import {
  DEFAULT_GEMINI_STT_MODEL,
  GEMINI_STT_SAMPLE_RATE_HZ,
  GeminiSttProvider,
  configuredGeminiSttModel,
  resolveGeminiSttModel
} from "../src/gemini_stt_provider.js";
import type { SttTranscript } from "../src/stt_provider.js";

function constantPcm16(samples: number, value: number): Buffer {
  const audio = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    audio.writeInt16LE(value, index * 2);
  }
  return audio;
}

function sinePcm16(
  samples: number,
  frequencyHz: number,
  sampleRateHz: number,
  amplitude: number
): Buffer {
  const audio = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1) {
    audio.writeInt16LE(
      Math.round(
        amplitude * Math.sin(2 * Math.PI * frequencyHz * index / sampleRateHz)
      ),
      index * 2
    );
  }
  return audio;
}

function rmsPcm16(audio: Buffer, skipSamples = 0): number {
  let sumSquares = 0;
  let count = 0;
  for (let offset = skipSamples * 2; offset < audio.byteLength; offset += 2) {
    const sample = audio.readInt16LE(offset);
    sumSquares += sample * sample;
    count += 1;
  }
  return count > 0 ? Math.sqrt(sumSquares / count) : 0;
}

test("Gemini STT model defaults to the approved explicit model", () => {
  assert.equal(resolveGeminiSttModel(undefined), DEFAULT_GEMINI_STT_MODEL);
  assert.equal(configuredGeminiSttModel({}), DEFAULT_GEMINI_STT_MODEL);
  assert.equal(
    resolveGeminiSttModel(" gemini-3.5-transcribe-live "),
    DEFAULT_GEMINI_STT_MODEL
  );
});

test("Gemini STT model rejects empty and unapproved values", () => {
  assert.throws(() => resolveGeminiSttModel("   "), /must not be empty/);
  assert.throws(
    () => resolveGeminiSttModel("gemini-live-latest"),
    /explicitly approved model/
  );
});

test("Gemini STT rejects unsupported source sample rates", async () => {
  const provider = new GeminiSttProvider(
    "test-key",
    "ws://127.0.0.1:1/live",
    DEFAULT_GEMINI_STT_MODEL
  );
  await assert.rejects(
    provider.connect(
      { sampleRateHz: 44100, channels: 1, language: "en-US" },
      {
        onStatus: () => undefined,
        onTranscript: () => undefined,
        onError: () => undefined
      }
    ),
    /16 kHz or the validated VoiceBridge 48 kHz source rate/
  );
});

test("Gemini Live setup and FIR resampling preserve the STT contract", async () => {
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
  let setup: Record<string, unknown> | null = null;
  const providerAudio: Buffer[] = [];
  const providerMimeTypes: string[] = [];

  providerServer.on("connection", (socket, request) => {
    requestUrl = request.url || "";
    socket.on("message", (data, isBinary) => {
      assert.equal(isBinary, false);
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.setup) {
        setup = message.setup as Record<string, unknown>;
        socket.send(JSON.stringify({ setupComplete: {} }));
        return;
      }

      const realtimeInput = message.realtimeInput as
        | Record<string, unknown>
        | undefined;
      const audio = realtimeInput?.audio as Record<string, unknown> | undefined;
      if (audio) {
        assert.equal(typeof audio.data, "string");
        assert.equal(typeof audio.mimeType, "string");
        providerAudio.push(Buffer.from(String(audio.data), "base64"));
        providerMimeTypes.push(String(audio.mimeType));
        if (providerAudio.length === 1) {
          socket.send(JSON.stringify({
            serverContent: {
              interimInputTranscription: { text: "Hello wor" }
            }
          }));
        }
      }
      if (realtimeInput?.audioStreamEnd === true) {
        socket.send(JSON.stringify({
          serverContent: {
            inputTranscription: { text: "Hello world." }
          }
        }));
        socket.close(1000);
      }
    });
  });

  const transcripts: SttTranscript[] = [];
  const statuses: string[] = [];
  try {
    const provider = new GeminiSttProvider(
      "gemini-test-key",
      `ws://127.0.0.1:${address.port}/live`,
      DEFAULT_GEMINI_STT_MODEL
    );
    const connection = await provider.connect(
      { sampleRateHz: 48000, channels: 1, language: "en-US" },
      {
        onStatus: (status) => statuses.push(status),
        onTranscript: (transcript) => transcripts.push(transcript),
        onError: (_code, message) => assert.fail(message)
      }
    );

    const constantFrame = constantPcm16(960, 3000);
    for (let index = 0; index < 5; index += 1) {
      assert.equal(connection.sendAudio(constantFrame), true);
    }
    const outOfBandFrame = sinePcm16(960, 12000, 48000, 10000);
    for (let index = 0; index < 5; index += 1) {
      assert.equal(connection.sendAudio(outOfBandFrame), true);
    }
    await connection.close();

    const requested = new URL(requestUrl, "ws://127.0.0.1");
    assert.equal(requested.searchParams.get("key"), "gemini-test-key");
    assert.ok(setup);
    assert.equal(setup.model, `models/${DEFAULT_GEMINI_STT_MODEL}`);
    assert.deepEqual(setup.generationConfig, { responseModalities: ["TEXT"] });
    assert.deepEqual(setup.inputAudioTranscription, {
      languageCodes: ["en-US"],
      mode: "VERBATIM"
    });

    assert.equal(providerAudio.length, 2);
    assert.equal(providerAudio[0]?.byteLength, 3200);
    assert.equal(providerAudio[1]?.byteLength, 3200);
    assert.deepEqual(providerMimeTypes, [
      `audio/pcm;rate=${GEMINI_STT_SAMPLE_RATE_HZ}`,
      `audio/pcm;rate=${GEMINI_STT_SAMPLE_RATE_HZ}`
    ]);
    const steadyConstantAudio = providerAudio[0]!;
    assert.equal(
      steadyConstantAudio.readInt16LE(steadyConstantAudio.byteLength - 2),
      3000
    );
    assert.ok(rmsPcm16(providerAudio[1]!, 100) < 100);

    assert.ok(statuses.includes("READY"));
    assert.ok(statuses.includes("CLOSED"));
    assert.equal(transcripts.length, 2);
    assert.equal(transcripts[0]?.text, "Hello wor");
    assert.equal(transcripts[0]?.isFinal, false);
    assert.equal(transcripts[1]?.text, "Hello world.");
    assert.equal(transcripts[1]?.isFinal, true);
    assert.equal(transcripts[1]?.speechFinal, true);
    assert.equal(transcripts[1]?.confidence, null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      providerServer.close((error) => error ? reject(error) : resolve());
    });
  }
});
