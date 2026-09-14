import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import {
  GeminiTranscribeProvider,
  KRC_GEMINI_LANGUAGE_CAPABILITY,
  KRC_GEMINI_TRANSCRIBE_MODEL,
  geminiTranscribeLanguageCodes
} from "../src/gemini_media_transcription_provider.js";
import { createGeminiTranscribeCandidate } from "../src/media_transcription_provider.js";
import { MediaTranscriptError } from "../src/media_transcript.js";

const API_KEY = "test-gemini-api-key";
const TEST_ACCESS_TOKEN = "voicebridge-test-token-123456789";

interface CapturedCall {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createSuccessfulFetch(options: {
  deleteOk?: boolean;
  interactionStatus?: number;
  interactionPayload?: Record<string, unknown>;
} = {}): { fetchImpl: typeof fetch; calls: CapturedCall[] } {
  const calls: CapturedCall[] = [];
  let deleteCount = 0;
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = requestUrl(input);
    const method = init?.method ?? "GET";
    calls.push({
      url,
      method,
      headers: new Headers(init?.headers),
      body: init?.body
    });

    if (url.endsWith("/upload/v1beta/files")) {
      return new Response("", {
        status: 200,
        headers: {
          "x-goog-upload-url":
            "https://generativelanguage.googleapis.com/upload-session/krc-123"
        }
      });
    }
    if (url.includes("/upload-session/krc-123")) {
      return Response.json({
        file: {
          name: "files/krc-media-123",
          uri: "https://generativelanguage.googleapis.com/v1beta/files/krc-media-123",
          mimeType: "audio/mpeg"
        }
      });
    }
    if (url.endsWith("/v1beta/interactions")) {
      const status = options.interactionStatus ?? 200;
      const payload = options.interactionPayload ?? {
        status: "completed",
        steps: [{
          type: "model_output",
          content: [{
            type: "text",
            text: "Привіт світе",
            annotations: [
              {
                type: "word_info",
                text: "Привіт",
                speaker: "spk_1",
                start_offset: "0.100s",
                end_offset: "0.450s"
              },
              {
                type: "word_info",
                text: "світе",
                speaker: "spk_1",
                start_offset: "0.500s",
                end_offset: "0.850s"
              }
            ]
          }]
        }]
      };
      return Response.json(payload, { status });
    }
    if (url.endsWith("/v1beta/files/krc-media-123")) {
      deleteCount += 1;
      return Response.json({}, { status: options.deleteOk === false ? 500 : 200 });
    }
    throw new Error(`Unexpected URL ${url}`);
  }) as typeof fetch;

  void deleteCount;
  return { fetchImpl, calls };
}

function baseRequest() {
  return {
    audio: new Uint8Array([1, 2, 3, 4]),
    mimeType: "audio/mpeg",
    durationSeconds: 12,
    languageHint: "uk",
    wordTimestamps: true
  };
}

test("Gemini language mapping is KRC-specific and accepts general BCP-47 hints", () => {
  assert.deepEqual(geminiTranscribeLanguageCodes("auto"), []);
  assert.deepEqual(geminiTranscribeLanguageCodes("uk"), ["uk-UA"]);
  assert.deepEqual(geminiTranscribeLanguageCodes("ru"), ["ru-RU"]);
  assert.deepEqual(geminiTranscribeLanguageCodes("en"), ["en-US"]);
  assert.deepEqual(geminiTranscribeLanguageCodes("ja-JP"), ["ja-JP"]);
  assert.deepEqual(geminiTranscribeLanguageCodes("ar-EG"), ["ar-EG"]);
  assert.deepEqual(geminiTranscribeLanguageCodes("yue-Hant-HK"), ["yue-Hant-HK"]);
  assert.equal(KRC_GEMINI_LANGUAGE_CAPABILITY.provider_documented_locales, "85+");
  assert.equal(KRC_GEMINI_LANGUAGE_CAPABILITY.automatic_detection, true);
  assert.equal(KRC_GEMINI_LANGUAGE_CAPABILITY.code_switching, true);
});

test("Gemini adapter fails closed before network work when no API key is configured", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;
  const provider = new GeminiTranscribeProvider(null, KRC_GEMINI_TRANSCRIBE_MODEL, fetchImpl);
  assert.equal(provider.configured, false);
  await assert.rejects(
    provider.transcribe(baseRequest()),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "MEDIA_TRANSCRIPT_NOT_CONFIGURED"
  );
  assert.equal(calls, 0);
});

test("Gemini adapter uses Files plus Interactions API, verbatim mode, timestamps, and cleanup", async () => {
  const { fetchImpl, calls } = createSuccessfulFetch();
  const provider = new GeminiTranscribeProvider(
    API_KEY,
    KRC_GEMINI_TRANSCRIBE_MODEL,
    fetchImpl
  );
  const result = await provider.transcribe(baseRequest());

  assert.equal(result.provider, "gemini");
  assert.equal(result.provider_model, "gemini-3.5-transcribe");
  assert.equal(result.provider_data_deleted, true);
  assert.equal(result.detected_language, null);
  assert.equal(result.language_confidence, null);
  assert.equal(result.transcript_text, "Привіт світе");
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0]?.start_ms, 100);
  assert.equal(result.segments[0]?.end_ms, 850);
  assert.equal(result.segments[0]?.confidence, null);

  assert.equal(calls.length, 4);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[0]?.headers.get("x-goog-api-key"), API_KEY);
  assert.equal(calls[0]?.headers.get("x-goog-upload-protocol"), "resumable");
  assert.equal(calls[1]?.headers.get("x-goog-upload-command"), "upload, finalize");
  assert.equal(calls[2]?.url.endsWith("/v1beta/interactions"), true);
  assert.equal(calls[3]?.method, "DELETE");

  const interactionBody = JSON.parse(String(calls[2]?.body)) as Record<string, any>;
  assert.equal(interactionBody.model, "gemini-3.5-transcribe");
  assert.deepEqual(
    interactionBody.generation_config.transcription_config.language_codes,
    ["uk-UA"]
  );
  assert.equal(
    interactionBody.generation_config.transcription_config.mode.type,
    "verbatim"
  );
  assert.deepEqual(
    interactionBody.generation_config.transcription_config.mode.timestamp_granularities,
    ["word"]
  );
  assert.equal(
    interactionBody.input[0].uri,
    "https://generativelanguage.googleapis.com/v1beta/files/krc-media-123"
  );
});

test("Gemini adapter keeps automatic detection and verbatim mode without invented annotations", async () => {
  const { fetchImpl, calls } = createSuccessfulFetch({
    interactionPayload: {
      status: "completed",
      steps: [{
        type: "model_output",
        content: [{ type: "text", text: "hola mundo" }]
      }]
    }
  });
  const provider = new GeminiTranscribeProvider(API_KEY, KRC_GEMINI_TRANSCRIBE_MODEL, fetchImpl);
  const result = await provider.transcribe({
    audio: new Uint8Array([5, 6, 7]),
    mimeType: "audio/mp3",
    durationSeconds: 8,
    languageHint: "auto"
  });

  assert.equal(result.segments[0]?.start_ms, null);
  assert.equal(result.segments[0]?.end_ms, null);
  assert.equal(result.segments[0]?.confidence, null);
  const interactionBody = JSON.parse(String(calls[2]?.body)) as Record<string, any>;
  assert.deepEqual(
    interactionBody.generation_config.transcription_config.language_codes,
    []
  );
  assert.deepEqual(
    interactionBody.generation_config.transcription_config.mode,
    { type: "verbatim" }
  );
});

test("Gemini adapter reports cleanup failure conservatively and retries cleanup once", async () => {
  const { fetchImpl, calls } = createSuccessfulFetch({ deleteOk: false });
  const provider = new GeminiTranscribeProvider(API_KEY, KRC_GEMINI_TRANSCRIBE_MODEL, fetchImpl);
  const result = await provider.transcribe(baseRequest());
  assert.equal(result.provider_data_deleted, false);
  assert.equal(
    calls.filter((call) => call.method === "DELETE").length,
    2
  );
});

test("Gemini adapter attempts file cleanup when transcription fails", async () => {
  const { fetchImpl, calls } = createSuccessfulFetch({
    interactionStatus: 503,
    interactionPayload: { error: { message: "temporary" } }
  });
  const provider = new GeminiTranscribeProvider(API_KEY, KRC_GEMINI_TRANSCRIBE_MODEL, fetchImpl);
  await assert.rejects(
    provider.transcribe(baseRequest()),
    (error: unknown) =>
      error instanceof MediaTranscriptError &&
      error.code === "STT_PROVIDER_ERROR" &&
      error.retryable
  );
  assert.equal(calls.some((call) => call.method === "DELETE"), true);
});

test("Gemini adapter rejects empty successful provider output and still cleans uploaded data", async () => {
  const { fetchImpl, calls } = createSuccessfulFetch({
    interactionPayload: {
      status: "completed",
      steps: [{ type: "model_output", content: [{ type: "text", text: "" }] }]
    }
  });
  const provider = new GeminiTranscribeProvider(API_KEY, KRC_GEMINI_TRANSCRIBE_MODEL, fetchImpl);
  await assert.rejects(
    provider.transcribe(baseRequest()),
    (error: unknown) =>
      error instanceof MediaTranscriptError && error.code === "STT_TRANSCRIPT_EMPTY"
  );
  assert.equal(calls.some((call) => call.method === "DELETE"), true);
});

test("Gemini duration limits distinguish plain transcription from annotated transcription", async () => {
  const provider = new GeminiTranscribeProvider(API_KEY, KRC_GEMINI_TRANSCRIBE_MODEL, (() => {
    throw new Error("network must not be reached");
  }) as typeof fetch);

  await assert.rejects(
    provider.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/wav",
      durationSeconds: 1801,
      languageHint: "auto",
      wordTimestamps: true
    }),
    (error: unknown) =>
      error instanceof MediaTranscriptError && error.code === "MEDIA_DURATION_LIMIT"
  );
  await assert.rejects(
    provider.transcribe({
      audio: new Uint8Array([1]),
      mimeType: "audio/wav",
      durationSeconds: 3601,
      languageHint: "auto"
    }),
    (error: unknown) =>
      error instanceof MediaTranscriptError && error.code === "MEDIA_DURATION_LIMIT"
  );
});

test("M2 configuration exposes the candidate model but keeps KRC active selector on AssemblyAI", () => {
  const config = loadConfig({
    TEST_ACCESS_TOKEN,
    ASSEMBLYAI_API_KEY: "assemblyai-test-key",
    GEMINI_API_KEY: API_KEY,
    STT_PROVIDER: "gemini",
    GEMINI_STT_MODEL: "gemini-3.5-transcribe-live",
    KRC_MEDIA_STT_PROVIDER: "assemblyai"
  });
  assert.equal(config.sttProvider, "gemini");
  assert.equal(config.geminiSttModel, "gemini-3.5-transcribe-live");
  assert.equal(config.krcMediaSttProvider, "assemblyai");
  assert.equal(config.krcMediaTranscribeModel, "gemini-3.5-transcribe");

  const candidate = createGeminiTranscribeCandidate(config, (() => {
    throw new Error("unit construction must not make a provider call");
  }) as typeof fetch);
  assert.equal(candidate.name, "gemini");
  assert.equal(candidate.model, "gemini-3.5-transcribe");
  assert.equal(candidate.configured, true);

  assert.throws(
    () => loadConfig({
      TEST_ACCESS_TOKEN,
      KRC_MEDIA_STT_PROVIDER: "gemini"
    }),
    /KRC_MEDIA_STT_PROVIDER must be one of: assemblyai/
  );
});
