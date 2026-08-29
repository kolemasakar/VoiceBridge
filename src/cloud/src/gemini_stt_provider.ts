import WebSocket, { type RawData } from "ws";
import type {
  SttConnection,
  SttObserver,
  SttProvider,
  SttStreamOptions,
  SttTranscript
} from "./stt_provider.js";

const GEMINI_LIVE_ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/" +
  "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
export const DEFAULT_GEMINI_STT_MODEL = "gemini-3.5-transcribe-live";
const APPROVED_GEMINI_STT_MODELS = [DEFAULT_GEMINI_STT_MODEL] as const;
export const GEMINI_STT_SAMPLE_RATE_HZ = 16000;
export const GEMINI_STT_VALIDATED_SOURCE_SAMPLE_RATE_HZ = 48000;
const TARGET_AUDIO_CHUNK_MS = 100;
const TARGET_AUDIO_CHUNK_BYTES =
  GEMINI_STT_SAMPLE_RATE_HZ * 2 * TARGET_AUDIO_CHUNK_MS / 1000;
const MAX_PROVIDER_BUFFERED_BYTES = 524288;
const MAX_PROVIDER_MESSAGE_BYTES = 1048576;
const CONNECT_TIMEOUT_MS = 10000;
const FINALIZATION_GRACE_MS = 1500;
const CLOSE_TIMEOUT_MS = 3000;
const PCM16_MIN = -32768;
const PCM16_MAX = 32767;
const DECIMATION_FACTOR = 3;
// 31-tap Hamming-windowed sinc low-pass for 48 kHz to 16 kHz decimation.
const FIR_COEFFICIENTS = [
  0.0016948642895205,
  0.0012014915300349335,
  -0.0009047320201385198,
  -0.00422754533561236,
  -0.005427042574212399,
  0,
  0.011365095290230158,
  0.01858421791009226,
  0.008250100127311023,
  -0.02123646030330576,
  -0.04893920635990442,
  -0.039590259460608554,
  0.02985812514688922,
  0.14510694985134165,
  0.25451078063616367,
  0.29950724254439726,
  0.25451078063616367,
  0.14510694985134162,
  0.029858125146889226,
  -0.03959025946060857,
  -0.04893920635990444,
  -0.021236460303305768,
  0.00825010012731103,
  0.018584217910092266,
  0.011365095290230161,
  0,
  -0.005427042574212398,
  -0.004227545335612362,
  -0.0009047320201385194,
  0.0012014915300349335,
  0.0016948642895205
] as const;

export function resolveGeminiSttModel(value: string | undefined): string {
  const model = value === undefined ? DEFAULT_GEMINI_STT_MODEL : value.trim();
  if (!model) {
    throw new Error("GEMINI_STT_MODEL must not be empty.");
  }
  if (!APPROVED_GEMINI_STT_MODELS.includes(
    model as (typeof APPROVED_GEMINI_STT_MODELS)[number]
  )) {
    throw new Error(
      "GEMINI_STT_MODEL must be an explicitly approved model: " +
      APPROVED_GEMINI_STT_MODELS.join(", ") + "."
    );
  }
  return model;
}

export function configuredGeminiSttModel(
  environment: NodeJS.ProcessEnv = process.env
): string {
  return resolveGeminiSttModel(environment.GEMINI_STT_MODEL);
}

class DisabledGeminiSttConnection implements SttConnection {
  sendAudio(_frame: Buffer): boolean {
    return true;
  }

  async close(): Promise<void> {
    return Promise.resolve();
  }
}

export class DisabledGeminiSttProvider implements SttProvider {
  readonly name = "gemini";
  readonly configured = false;
  readonly model: string;

  constructor(model = configuredGeminiSttModel()) {
    this.model = resolveGeminiSttModel(model);
  }

  async connect(
    _options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    observer.onStatus("NOT_CONFIGURED");
    return new DisabledGeminiSttConnection();
  }
}

interface GeminiTranscription {
  text?: unknown;
  languageCode?: unknown;
}

interface GeminiServerContent {
  interimInputTranscription?: GeminiTranscription;
  inputTranscription?: GeminiTranscription;
}

interface GeminiLiveMessage {
  setupComplete?: unknown;
  serverContent?: GeminiServerContent;
  error?: unknown;
}

function rawDataText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return data.toString("utf8");
}

class Pcm48kTo16kFirDecimator {
  private readonly history = new Float64Array(FIR_COEFFICIENTS.length);
  private historyCursor = 0;
  private phase = 0;
  private byteRemainder: Buffer = Buffer.alloc(0);

  process(frame: Buffer): Buffer {
    const source = this.byteRemainder.byteLength > 0
      ? Buffer.concat([this.byteRemainder, frame])
      : frame;
    const completeBytes = source.byteLength - source.byteLength % 2;
    this.byteRemainder = source.subarray(completeBytes);
    if (completeBytes === 0) {
      return Buffer.alloc(0);
    }

    const maximumOutputSamples = Math.ceil(
      completeBytes / 2 / DECIMATION_FACTOR
    );
    const output = Buffer.allocUnsafe(maximumOutputSamples * 2);
    let outputSamples = 0;

    for (let offset = 0; offset < completeBytes; offset += 2) {
      this.history[this.historyCursor] = source.readInt16LE(offset);
      this.historyCursor = (this.historyCursor + 1) % this.history.length;
      this.phase = (this.phase + 1) % DECIMATION_FACTOR;
      if (this.phase !== 0) {
        continue;
      }

      let filtered = 0;
      for (let index = 0; index < FIR_COEFFICIENTS.length; index += 1) {
        const historyIndex =
          (this.historyCursor - 1 - index + this.history.length) %
          this.history.length;
        filtered += FIR_COEFFICIENTS[index]! * this.history[historyIndex]!;
      }
      const sample = Math.max(
        PCM16_MIN,
        Math.min(PCM16_MAX, Math.round(filtered))
      );
      output.writeInt16LE(sample, outputSamples * 2);
      outputSamples += 1;
    }

    return output.subarray(0, outputSamples * 2);
  }
}

class GeminiSttConnection implements SttConnection {
  private readonly resampler: Pcm48kTo16kFirDecimator | null;
  private pendingAudio = Buffer.alloc(0);
  private audioSamplesSent = 0;
  private finalAudioEndMs = 0;
  private closing = false;

  constructor(
    private readonly socket: WebSocket,
    sourceSampleRateHz: number,
    private readonly openedAt: number
  ) {
    this.resampler = sourceSampleRateHz === GEMINI_STT_SAMPLE_RATE_HZ
      ? null
      : new Pcm48kTo16kFirDecimator();
  }

  sendAudio(frame: Buffer): boolean {
    if (
      this.closing ||
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_PROVIDER_BUFFERED_BYTES
    ) {
      return false;
    }

    const converted = this.resampler ? this.resampler.process(frame) : frame;
    if (converted.byteLength === 0) {
      return true;
    }
    this.pendingAudio = this.pendingAudio.byteLength === 0
      ? Buffer.from(converted)
      : Buffer.concat([this.pendingAudio, converted]);

    while (this.pendingAudio.byteLength >= TARGET_AUDIO_CHUNK_BYTES) {
      const chunk = this.pendingAudio.subarray(0, TARGET_AUDIO_CHUNK_BYTES);
      this.pendingAudio = this.pendingAudio.subarray(TARGET_AUDIO_CHUNK_BYTES);
      if (!this.sendProviderAudio(chunk)) {
        return false;
      }
    }
    return true;
  }

  private sendProviderAudio(audio: Buffer): boolean {
    if (
      this.socket.readyState !== WebSocket.OPEN ||
      this.socket.bufferedAmount > MAX_PROVIDER_BUFFERED_BYTES
    ) {
      return false;
    }
    this.socket.send(JSON.stringify({
      realtimeInput: {
        audio: {
          data: audio.toString("base64"),
          mimeType: `audio/pcm;rate=${GEMINI_STT_SAMPLE_RATE_HZ}`
        }
      }
    }));
    this.audioSamplesSent += Math.floor(audio.byteLength / 2);
    return true;
  }

  transcript(text: string, isFinal: boolean): SttTranscript | null {
    const normalized = text.trim().slice(-8000);
    if (!normalized) {
      return null;
    }
    const audioEndMs = Math.round(
      this.audioSamplesSent * 1000 / GEMINI_STT_SAMPLE_RATE_HZ
    );
    const audioStartMs = this.finalAudioEndMs;
    const audioDurationMs = Math.max(0, audioEndMs - audioStartMs);
    const result: SttTranscript = {
      text: normalized,
      isFinal,
      speechFinal: isFinal,
      confidence: null,
      audioStartMs,
      audioDurationMs,
      recognitionLatencyMs: Math.max(
        0,
        Date.now() - this.openedAt - audioEndMs
      )
    };
    if (isFinal) {
      this.finalAudioEndMs = audioEndMs;
    }
    return result;
  }

  async close(): Promise<void> {
    if (this.closing || this.socket.readyState === WebSocket.CLOSED) {
      return;
    }
    this.closing = true;

    const closed = new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
    });

    if (this.socket.readyState === WebSocket.OPEN) {
      if (this.pendingAudio.byteLength > 0) {
        this.sendProviderAudio(this.pendingAudio);
        this.pendingAudio = Buffer.alloc(0);
      }
      this.socket.send(JSON.stringify({
        realtimeInput: { audioStreamEnd: true }
      }));
    }

    await Promise.race([
      closed,
      new Promise<void>((resolve) => setTimeout(resolve, FINALIZATION_GRACE_MS))
    ]);

    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.close(1000, "VoiceBridge stream complete");
    }

    await Promise.race([
      closed,
      new Promise<void>((resolve) => setTimeout(resolve, CLOSE_TIMEOUT_MS))
    ]);

    if (Number(this.socket.readyState) !== WebSocket.CLOSED) {
      this.socket.terminate();
    }
  }
}

export class GeminiSttProvider implements SttProvider {
  readonly name = "gemini";
  readonly configured = true;
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    private readonly endpoint = GEMINI_LIVE_ENDPOINT,
    model = configuredGeminiSttModel()
  ) {
    this.model = resolveGeminiSttModel(model);
  }

  connect(
    options: SttStreamOptions,
    observer: SttObserver
  ): Promise<SttConnection> {
    if (
      options.sampleRateHz !== GEMINI_STT_SAMPLE_RATE_HZ &&
      options.sampleRateHz !== GEMINI_STT_VALIDATED_SOURCE_SAMPLE_RATE_HZ
    ) {
      return Promise.reject(new Error(
        "Gemini STT candidate supports PCM16 mono at 16 kHz or the validated " +
        "VoiceBridge 48 kHz source rate."
      ));
    }

    const url = new URL(this.endpoint);
    url.searchParams.set("key", this.apiKey);

    return new Promise((resolve, reject) => {
      let openedAt = Date.now();
      const socket = new WebSocket(url, {
        perMessageDeflate: false,
        maxPayload: MAX_PROVIDER_MESSAGE_BYTES
      });
      let connection: GeminiSttConnection | null = null;
      let settled = false;
      let ready = false;
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        socket.terminate();
        reject(new Error("STT provider connection timed out."));
      }, CONNECT_TIMEOUT_MS);

      socket.on("open", () => {
        openedAt = Date.now();
        connection = new GeminiSttConnection(
          socket,
          options.sampleRateHz,
          openedAt
        );
        socket.send(JSON.stringify({
          setup: {
            model: `models/${this.model}`,
            generationConfig: {
              responseModalities: ["TEXT"]
            },
            inputAudioTranscription: {
              languageCodes: [options.language],
              mode: "VERBATIM"
            }
          }
        }));
      });

      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          return;
        }

        let message: GeminiLiveMessage;
        try {
          message = JSON.parse(rawDataText(data)) as GeminiLiveMessage;
        } catch {
          observer.onError(
            "STT_INVALID_RESPONSE",
            "The STT provider returned invalid JSON."
          );
          return;
        }

        if (message.setupComplete !== undefined && !settled && connection) {
          settled = true;
          ready = true;
          clearTimeout(timeout);
          observer.onStatus("READY");
          resolve(connection);
          return;
        }

        if (message.error !== undefined) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            reject(new Error("STT provider rejected the session."));
            return;
          }
          observer.onError(
            "STT_PROVIDER_ERROR",
            "The STT provider reported an error."
          );
          return;
        }

        if (!connection) {
          return;
        }
        const interim = message.serverContent?.interimInputTranscription?.text;
        if (typeof interim === "string") {
          const transcript = connection.transcript(interim, false);
          if (transcript) {
            observer.onTranscript(transcript);
          }
        }
        const finalText = message.serverContent?.inputTranscription?.text;
        if (typeof finalText === "string") {
          const transcript = connection.transcript(finalText, true);
          if (transcript) {
            observer.onTranscript(transcript);
          }
        }
      });

      socket.on("error", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error("Unable to connect to the STT provider."));
          return;
        }
        observer.onError(
          "STT_PROVIDER_ERROR",
          "The STT provider connection failed."
        );
      });

      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(
            `STT provider rejected the connection with HTTP ${response.statusCode}.`
          ));
        }
      });

      socket.on("close", () => {
        clearTimeout(timeout);
        if (!ready) {
          if (!settled) {
            settled = true;
            reject(new Error("STT provider closed before becoming ready."));
          }
          return;
        }
        observer.onStatus("CLOSED");
      });
    });
  }
}

export function createGeminiSttProvider(
  apiKey: string | null,
  model = configuredGeminiSttModel()
): SttProvider {
  const selectedModel = resolveGeminiSttModel(model);
  return apiKey
    ? new GeminiSttProvider(apiKey, GEMINI_LIVE_ENDPOINT, selectedModel)
    : new DisabledGeminiSttProvider(selectedModel);
}
