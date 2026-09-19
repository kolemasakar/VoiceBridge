import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GeminiTranscribeProvider,
  KRC_GEMINI_TRANSCRIBE_MODEL
} from "../dist/src/gemini_media_transcription_provider.js";
import { chunkTranscriptWords } from "../dist/src/media_transcript.js";

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com";
const ASSEMBLYAI_MODEL = "universal-2";
const POLL_INTERVAL_MS = 2000;
const TRANSCRIPTION_TIMEOUT_MS = 20 * 60 * 1000;
const RESULT_PATH = process.env.M3B_AB_RESULTS_PATH || "m3b-live-ab-results.json";

const CASES = [
  {
    case_id: "en-long-harvard-001",
    source_class: "public_web",
    test_dimension: "longer multi-sentence clean English speech",
    url: "https://raw.githubusercontent.com/realpython/python-speech-recognition/0c07b810808c01144a9611faf84739f24513184e/audio_files/harvard.wav",
    filename: "en-long-harvard-001.wav",
    mime_type: "audio/wav",
    language_hint: "en",
    word_timestamps: true,
    diarization: false,
    asset_sha256: "971b4163670445c415c6b0fb6813c38093409ecac2f6b4d429ae3574d24ad470",
    reference_transcript_sha256: "f9e9eddbd0130ab1505d877a18cb29a26492114ecda86b9e7da92ec29b78b211"
  },
  {
    case_id: "en-noisy-jackhammer-001",
    source_class: "public_web",
    test_dimension: "English speech under loud jackhammer background noise",
    url: "https://raw.githubusercontent.com/realpython/python-speech-recognition/0c07b810808c01144a9611faf84739f24513184e/audio_files/jackhammer.wav",
    filename: "en-noisy-jackhammer-001.wav",
    mime_type: "audio/wav",
    language_hint: "en",
    word_timestamps: true,
    diarization: false,
    asset_sha256: "a9484bb0ec40468683ebe6a064f6b4b579bfa800ac8b360a15ae3d225c5037e2",
    reference_transcript_sha256: "cf62ebe3e7e89f77272a5f6fdf296d2860af8e738799d939a672c08fe4484724"
  },
  {
    case_id: "en-numeric-vosk-001",
    source_class: "public_web",
    test_dimension: "spoken digit sequences and zero/oh distinction",
    url: "https://raw.githubusercontent.com/alphacep/vosk-api/05adbfcc0df27a1535913c6accd4b7fc60ffd59d/python/example/test.wav",
    filename: "en-numeric-vosk-001.wav",
    mime_type: "audio/wav",
    language_hint: "en",
    word_timestamps: true,
    diarization: false,
    asset_sha256: "dcfea5712c43a43ba7ae8083afb39d36993e5a69c46e88b68aaa72b65cb615bb",
    reference_transcript_sha256: "cc73ecc627780d8b6ef02fd5d8b093d85f21420a9a646b871e3ce0a0934eb1f4"
  },
  {
    case_id: "en-hard-librispeech-001",
    source_class: "public_web",
    test_dimension: "LibriSpeech test-other challenging English speech",
    url: "https://raw.githubusercontent.com/anasali0006/automatic-speech-to-text-using-speechbrain/d135b8d488f9b129e2c6c37fbf3011e168f9acd2/LibriSpeechWave/1688-142285-0007.wav",
    filename: "en-hard-librispeech-001.wav",
    mime_type: "audio/wav",
    language_hint: "en",
    word_timestamps: true,
    diarization: false,
    asset_sha256: "078553534e86b6c32eb0d3e30a75be8a4546735a910e14ab924c0b9f51367f4d",
    reference_transcript_sha256: "a5bbd76f41e8929020cacf75c98208b7d6a42d6b669c95a8e8303f27ac97ec49"
  }
];

function requireSecret(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`${name} is not configured for the authorized M3B A/B run.`);
  }
  return value.trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error && error.name ? error.name : "Error",
    message: message.replace(/[\r\n]+/g, " ").slice(0, 500)
  };
}

async function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `${command} failed.`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8").trim());
    });
  });
}

async function probeDurationSeconds(path) {
  const output = await runCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path
  ]);
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Unable to determine exact asset duration.");
  }
  return duration;
}

async function downloadExactAsset(testCase, directory) {
  const response = await fetch(testCase.url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) {
    throw new Error(`Exact asset download failed with HTTP ${response.status}.`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== testCase.asset_sha256) {
    throw new Error(`Exact asset SHA-256 mismatch for ${testCase.case_id}.`);
  }
  const path = join(directory, testCase.filename);
  await writeFile(path, bytes);
  const durationSeconds = await probeDurationSeconds(path);
  return { bytes, durationSeconds };
}

async function assemblyAiRequest(apiKey, path, init) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", apiKey);
  const response = await fetch(`${ASSEMBLYAI_BASE_URL}${path}`, {
    ...init,
    headers,
    signal: init.signal || AbortSignal.timeout(60_000)
  });
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`AssemblyAI returned invalid JSON (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? ` ${payload.error}` : "";
    throw new Error(`AssemblyAI request failed with HTTP ${response.status}.${detail}`);
  }
  return payload;
}

async function transcribeAssemblyAi(apiKey, testCase, bytes, durationSeconds) {
  const started = Date.now();
  let transcriptId = null;
  let providerDataDeleted = false;
  try {
    const upload = await assemblyAiRequest(apiKey, "/v2/upload", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: bytes
    });
    if (typeof upload.upload_url !== "string" || !upload.upload_url) {
      throw new Error("AssemblyAI upload did not return upload_url.");
    }

    const submitted = await assemblyAiRequest(apiKey, "/v2/transcript", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        audio_url: upload.upload_url,
        speech_models: [ASSEMBLYAI_MODEL],
        format_text: true,
        punctuate: true,
        language_code: testCase.language_hint
      })
    });
    if (typeof submitted.id !== "string" || !submitted.id) {
      throw new Error("AssemblyAI submit did not return transcript id.");
    }
    transcriptId = submitted.id;

    const pollStarted = Date.now();
    let completed = null;
    while (Date.now() - pollStarted < TRANSCRIPTION_TIMEOUT_MS) {
      const current = await assemblyAiRequest(apiKey, `/v2/transcript/${transcriptId}`, {
        method: "GET"
      });
      if (current.status === "completed") {
        completed = current;
        break;
      }
      if (current.status === "error") {
        throw new Error(typeof current.error === "string" ? current.error : "AssemblyAI transcription failed.");
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    if (!completed) throw new Error("AssemblyAI transcription timed out.");
    if (typeof completed.text !== "string" || !completed.text.trim()) {
      throw new Error("AssemblyAI returned an empty transcript.");
    }

    const segments = chunkTranscriptWords(completed.words, completed.text);
    try {
      await assemblyAiRequest(apiKey, `/v2/transcript/${transcriptId}`, { method: "DELETE" });
      providerDataDeleted = true;
    } catch {
      providerDataDeleted = false;
    }

    return {
      status: "SUCCESS",
      provider: "assemblyai",
      provider_model: ASSEMBLYAI_MODEL,
      transcript_text: completed.text.trim(),
      segments,
      detected_language: typeof completed.language_code === "string" ? completed.language_code : null,
      language_confidence: Number.isFinite(completed.language_confidence) ? completed.language_confidence : null,
      provider_data_deleted: providerDataDeleted,
      latency_ms: Date.now() - started,
      quota_seconds_reserved: durationSeconds
    };
  } finally {
    if (transcriptId && !providerDataDeleted) {
      try {
        await assemblyAiRequest(apiKey, `/v2/transcript/${transcriptId}`, { method: "DELETE" });
      } catch {}
    }
  }
}

async function transcribeGemini(apiKey, testCase, bytes, durationSeconds) {
  const provider = new GeminiTranscribeProvider(apiKey, KRC_GEMINI_TRANSCRIBE_MODEL);
  const started = Date.now();
  const result = await provider.transcribe({
    audio: new Uint8Array(bytes),
    mimeType: testCase.mime_type,
    durationSeconds,
    languageHint: testCase.language_hint,
    wordTimestamps: testCase.word_timestamps,
    diarization: testCase.diarization
  });
  return {
    status: "SUCCESS",
    provider: result.provider,
    provider_model: result.provider_model,
    transcript_text: result.transcript_text,
    segments: result.segments,
    detected_language: result.detected_language,
    language_confidence: result.language_confidence,
    provider_data_deleted: result.provider_data_deleted,
    latency_ms: Date.now() - started,
    quota_seconds_reserved: durationSeconds
  };
}

async function persist(results) {
  await writeFile(RESULT_PATH, `${JSON.stringify(results, null, 2)}\n`, "utf8");
}

async function main() {
  const assemblyAiApiKey = requireSecret("ASSEMBLYAI_API_KEY");
  const geminiApiKey = requireSecret("GEMINI_API_KEY");
  const results = {
    schema_version: 1,
    purpose: "KRC MEDIA BETA M3B expanded-corpus same-asset prerecorded provider A/B",
    source_commit: process.env.GITHUB_SHA || null,
    started_at: new Date().toISOString(),
    bounded_submission_policy: {
      cases: CASES.length,
      providers_per_case: 2,
      maximum_provider_submissions: CASES.length * 2,
      automatic_resubmit_retry: false,
      normal_krc_provider_changed: false,
      raw_media_artifact: false
    },
    cases: []
  };
  let providerFailure = false;

  for (const testCase of CASES) {
    const directory = await mkdtemp(join(tmpdir(), "krc-m3b-live-ab-"));
    const caseResult = {
      case_id: testCase.case_id,
      source_class: testCase.source_class,
      test_dimension: testCase.test_dimension,
      asset_sha256: testCase.asset_sha256,
      reference_transcript_sha256: testCase.reference_transcript_sha256,
      reference_review_state: "independent_reviewed",
      language_hint: testCase.language_hint,
      word_timestamps: testCase.word_timestamps,
      diarization: testCase.diarization,
      readiness: "READY_FOR_AB",
      duration_seconds: null,
      assemblyai: null,
      gemini: null
    };
    results.cases.push(caseResult);
    try {
      const { bytes, durationSeconds } = await downloadExactAsset(testCase, directory);
      caseResult.duration_seconds = durationSeconds;

      try {
        caseResult.assemblyai = await transcribeAssemblyAi(
          assemblyAiApiKey,
          testCase,
          bytes,
          durationSeconds
        );
      } catch (error) {
        providerFailure = true;
        caseResult.assemblyai = {
          status: "FAILED",
          provider: "assemblyai",
          provider_model: ASSEMBLYAI_MODEL,
          error: safeError(error)
        };
      }
      await persist(results);

      try {
        caseResult.gemini = await transcribeGemini(
          geminiApiKey,
          testCase,
          bytes,
          durationSeconds
        );
      } catch (error) {
        providerFailure = true;
        caseResult.gemini = {
          status: "FAILED",
          provider: "gemini",
          provider_model: KRC_GEMINI_TRANSCRIBE_MODEL,
          error: safeError(error)
        };
      }
      await persist(results);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  results.finished_at = new Date().toISOString();
  results.provider_failure_observed = providerFailure;
  await persist(results);

  for (const item of results.cases) {
    console.log(
      `${item.case_id}: AssemblyAI=${item.assemblyai?.status ?? "NOT_RUN"}; Gemini=${item.gemini?.status ?? "NOT_RUN"}`
    );
  }
  console.log(`Results written to ${RESULT_PATH}; raw media removed; transcript bodies not printed to logs.`);
  if (providerFailure) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`M3B live A/B execution failed before completion: ${safeError(error).message}`);
  process.exitCode = 1;
});
