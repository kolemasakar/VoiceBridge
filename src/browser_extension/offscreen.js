let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let analyserNode = null;
let originalGainNode = null;
let ukrainianGainNode = null;
let audioProcessorNode = null;
let streamSinkGainNode = null;
let metricsTimer = null;
let manualDuckingTimer = null;
let playbackReleaseTimer = null;
let startedAt = null;
let manualDuckingActive = false;
let playbackDuckingActive = false;
let streamSocket = null;
let streamCloseExpected = false;
let playbackEndTime = 0;
let currentTtsSegment = null;
let stopPromise = null;
const activePlaybackSources = new Set();

const MAX_CLIENT_BUFFERED_BYTES = 262144;
const MAX_PLAYBACK_QUEUE_SECONDS = 90;
const PLAYBACK_DRAIN_TIMEOUT_MS = 70000;
const STREAM_STOP_TIMEOUT_MS = 120000;

let currentConfig = {
  original_pause_volume: 0.5,
  original_duck_volume: 0.15,
  ukrainian_volume: 1
};

let streamState = initialStreamState();

function initialStreamState() {
  return {
    status: "OFFLINE",
    sessionId: null,
    framesSent: 0,
    bytesSent: 0,
    framesDropped: 0,
    framesAcknowledged: 0,
    maxUnacknowledged: 50,
    pausedUntil: 0,
    error: null,
    sttStatus: "OFFLINE",
    sttProvider: null,
    sttError: null,
    transcriptPartial: "",
    transcriptFinalSegments: [],
    transcriptFinalCount: 0,
    recognitionLatencyMs: null,
    translationStatus: "OFFLINE",
    translationProvider: null,
    translationError: null,
    translationFinalSegments: [],
    translationFinalCount: 0,
    translationLatencyMs: null,
    translationPending: 0,
    translationRetryCount: 0,
    translationRetryInMs: 0,
    ttsStatus: "OFFLINE",
    ttsProvider: null,
    ttsVoice: null,
    ttsError: null,
    ttsFinalCount: 0,
    ttsLatencyMs: null,
    ttsAudioBytes: 0,
    ttsAudioDurationMs: 0,
    ttsPending: 0,
    ttsBuffered: 0,
    ttsRetryCount: 0,
    ttsRetryInMs: 0,
    playbackStatus: "IDLE",
    playbackQueuedMs: 0,
    playbackPlayedCount: 0
  };
}

function finalTranscriptText() {
  return streamState.transcriptFinalSegments.join(" ").slice(-8000);
}

function finalTranslationText() {
  return streamState.translationFinalSegments.join(" ").slice(-12000);
}

function isDuckingActive() {
  return manualDuckingActive || playbackDuckingActive;
}

function queuedPlaybackMs() {
  if (!audioContext) return 0;
  return Math.max(0, Math.round((playbackEndTime - audioContext.currentTime) * 1000));
}

function streamSnapshot() {
  streamState.playbackQueuedMs = queuedPlaybackMs();
  return {
    stream_status: streamState.status,
    stream_frames_sent: streamState.framesSent,
    stream_bytes_sent: streamState.bytesSent,
    stream_frames_dropped: streamState.framesDropped,
    stream_unacknowledged: Math.max(
      0,
      streamState.framesSent - streamState.framesAcknowledged
    ),
    stt_status: streamState.sttStatus,
    stt_provider: streamState.sttProvider,
    stt_error: streamState.sttError,
    transcript_partial: streamState.transcriptPartial,
    transcript_final: finalTranscriptText(),
    transcript_final_count: streamState.transcriptFinalCount,
    recognition_latency_ms: streamState.recognitionLatencyMs,
    translation_status: streamState.translationStatus,
    translation_provider: streamState.translationProvider,
    translation_error: streamState.translationError,
    translation_final: finalTranslationText(),
    translation_final_count: streamState.translationFinalCount,
    translation_latency_ms: streamState.translationLatencyMs,
    translation_pending: streamState.translationPending,
    translation_retry_count: streamState.translationRetryCount,
    translation_retry_in_ms: streamState.translationRetryInMs,
    tts_status: streamState.ttsStatus,
    tts_provider: streamState.ttsProvider,
    tts_voice: streamState.ttsVoice,
    tts_error: streamState.ttsError,
    tts_final_count: streamState.ttsFinalCount,
    tts_latency_ms: streamState.ttsLatencyMs,
    tts_audio_bytes: streamState.ttsAudioBytes,
    tts_audio_duration_ms: streamState.ttsAudioDurationMs,
    tts_pending: streamState.ttsPending,
    tts_buffered: streamState.ttsBuffered,
    tts_retry_count: streamState.ttsRetryCount,
    tts_retry_in_ms: streamState.ttsRetryInMs,
    playback_status: streamState.playbackStatus,
    playback_queued_ms: streamState.playbackQueuedMs,
    playback_played_count: streamState.playbackPlayedCount
  };
}

async function publishState(state) {
  await chrome.runtime.sendMessage({
    target: "service_worker",
    type: "CAPTURE_STATE",
    data: state
  });
}

function smoothOriginalGain(value) {
  if (!originalGainNode || !audioContext) return;
  const safeValue = Math.max(0, Math.min(1, Number(value)));
  originalGainNode.gain.cancelScheduledValues(audioContext.currentTime);
  originalGainNode.gain.setTargetAtTime(
    safeValue,
    audioContext.currentTime,
    0.08
  );
}

function smoothUkrainianGain(value) {
  if (!ukrainianGainNode || !audioContext) return;
  const safeValue = Math.max(0, Math.min(1, Number(value)));
  ukrainianGainNode.gain.cancelScheduledValues(audioContext.currentTime);
  ukrainianGainNode.gain.setTargetAtTime(
    safeValue,
    audioContext.currentTime,
    0.05
  );
}

function applyOriginalGain() {
  smoothOriginalGain(
    isDuckingActive()
      ? currentConfig.original_duck_volume
      : currentConfig.original_pause_volume
  );
}

function stopMetrics() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
  if (manualDuckingTimer) {
    clearTimeout(manualDuckingTimer);
    manualDuckingTimer = null;
  }
  if (playbackReleaseTimer) {
    clearTimeout(playbackReleaseTimer);
    playbackReleaseTimer = null;
  }
}

function sendStreamControl(type, payload = {}) {
  if (!streamSocket || streamSocket.readyState !== WebSocket.OPEN) return;
  streamSocket.send(JSON.stringify({
    event_type: type,
    session_id: streamState.sessionId,
    sequence: streamState.framesSent + 1,
    occurred_at: new Date().toISOString(),
    data: payload
  }));
}

function requestMetricsPublish() {
  const track = mediaStream?.getAudioTracks()?.[0];
  if (track) publishMetrics(track).catch(() => undefined);
}

function base64Bytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pcm16AudioBuffer(bytes, sampleRate) {
  if (!audioContext || bytes.byteLength === 0 || bytes.byteLength % 2 !== 0) {
    throw new Error("Invalid TTS PCM audio chunk.");
  }
  const sampleCount = bytes.byteLength / 2;
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channel = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < sampleCount; index += 1) {
    channel[index] = view.getInt16(index * 2, true) / 32768;
  }
  return buffer;
}

function schedulePlaybackRelease() {
  if (!audioContext) return;
  if (playbackReleaseTimer) clearTimeout(playbackReleaseTimer);
  const delayMs = Math.max(
    50,
    Math.ceil((playbackEndTime - audioContext.currentTime) * 1000) + 80
  );
  playbackReleaseTimer = setTimeout(() => {
    playbackReleaseTimer = null;
    if (!audioContext || playbackEndTime > audioContext.currentTime + 0.03) {
      schedulePlaybackRelease();
      return;
    }
    playbackDuckingActive = false;
    streamState.playbackStatus = streamState.ttsStatus === "CLOSED"
      ? "COMPLETED"
      : "IDLE";
    applyOriginalGain();
    requestMetricsPublish();
  }, delayMs);
}

function schedulePcmChunk(bytes, sampleRate) {
  if (!audioContext || !ukrainianGainNode) {
    throw new Error("Ukrainian playback is not initialized.");
  }

  const queuedSeconds = Math.max(0, playbackEndTime - audioContext.currentTime);
  if (queuedSeconds > MAX_PLAYBACK_QUEUE_SECONDS) {
    throw new Error("Ukrainian playback queue is full.");
  }

  const buffer = pcm16AudioBuffer(bytes, sampleRate);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(ukrainianGainNode);
  const startTime = Math.max(audioContext.currentTime + 0.03, playbackEndTime);
  source.start(startTime);
  playbackEndTime = startTime + buffer.duration;
  activePlaybackSources.add(source);
  source.onended = () => {
    activePlaybackSources.delete(source);
    if (
      currentTtsSegment?.ended &&
      activePlaybackSources.size === 0 &&
      audioContext &&
      playbackEndTime <= audioContext.currentTime + 0.05
    ) {
      streamState.playbackPlayedCount = Math.max(
        streamState.playbackPlayedCount,
        streamState.ttsFinalCount
      );
    }
    requestMetricsPublish();
  };

  playbackDuckingActive = true;
  streamState.playbackStatus = "PLAYING";
  applyOriginalGain();
  schedulePlaybackRelease();
}

function cancelPlayback() {
  for (const source of activePlaybackSources) {
    try {
      source.stop();
    } catch {
      // The source may already be stopped.
    }
    source.disconnect();
  }
  activePlaybackSources.clear();
  playbackEndTime = audioContext?.currentTime || 0;
  currentTtsSegment = null;
  playbackDuckingActive = false;
  streamState.playbackStatus = "IDLE";
  applyOriginalGain();
}

async function waitForPlaybackDrain(timeoutMs = PLAYBACK_DRAIN_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (
    audioContext &&
    (activePlaybackSources.size > 0 ||
      playbackEndTime > audioContext.currentTime + 0.05)
  ) {
    if (Date.now() >= deadline) {
      streamState.ttsError = "Ukrainian playback drain timed out.";
      cancelPlayback();
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  playbackDuckingActive = false;
  streamState.playbackStatus = "COMPLETED";
  applyOriginalGain();
  return true;
}

function handleStreamEvent(event) {
  if (event.event_type === "STREAM_READY") {
    streamState.maxUnacknowledged =
      event.data?.max_unacked_frames || streamState.maxUnacknowledged;
    streamState.sttProvider = event.data?.stt_provider || null;
    streamState.sttStatus = event.data?.stt_configured
      ? "READY"
      : "NOT_CONFIGURED";
    streamState.translationProvider =
      event.data?.translation_provider || null;
    streamState.translationStatus = event.data?.translation_configured
      ? "READY"
      : "NOT_CONFIGURED";
    streamState.ttsProvider = event.data?.tts_provider || null;
    streamState.ttsVoice = event.data?.tts_voice || null;
    streamState.ttsStatus = event.data?.tts_configured
      ? "READY"
      : "NOT_CONFIGURED";
    return;
  }

  if (event.event_type === "STT_STATUS") {
    streamState.sttProvider = event.data?.provider || streamState.sttProvider;
    streamState.sttStatus = event.data?.status || "UNKNOWN";
    streamState.sttError = null;
  }

  if (event.event_type === "STT_ERROR") {
    streamState.sttProvider = event.data?.provider || streamState.sttProvider;
    streamState.sttStatus = "ERROR";
    streamState.sttError = event.data?.message || "STT failed.";
  }

  if (event.event_type === "TRANSCRIPT_PARTIAL") {
    streamState.sttStatus = "ACTIVE";
    streamState.transcriptPartial = String(
      event.data?.text || ""
    ).slice(-2000);
    streamState.recognitionLatencyMs =
      event.data?.recognition_latency_ms ?? streamState.recognitionLatencyMs;
  }

  if (event.event_type === "TRANSCRIPT_FINAL") {
    const text = String(event.data?.text || "").trim().slice(-2000);
    if (text) {
      streamState.transcriptFinalSegments.push(text);
      streamState.transcriptFinalSegments =
        streamState.transcriptFinalSegments.slice(-20);
      streamState.transcriptFinalCount += 1;
    }
    streamState.sttStatus = "ACTIVE";
    streamState.transcriptPartial = "";
    streamState.recognitionLatencyMs =
      event.data?.recognition_latency_ms ?? streamState.recognitionLatencyMs;
  }

  if (event.event_type === "TRANSLATION_STATUS") {
    streamState.translationProvider =
      event.data?.provider || streamState.translationProvider;
    streamState.translationStatus = event.data?.status || "UNKNOWN";
    streamState.translationPending = Number(
      event.data?.pending ?? streamState.translationPending
    );
    streamState.translationRetryCount = Number(
      event.data?.retries ?? streamState.translationRetryCount
    );
    streamState.translationRetryInMs = Number(event.data?.retry_in_ms || 0);
  }

  if (event.event_type === "TRANSLATION_ERROR") {
    streamState.translationProvider =
      event.data?.provider || streamState.translationProvider;
    streamState.translationStatus = "ERROR";
    streamState.translationError =
      event.data?.message || "Translation failed.";
  }

  if (event.event_type === "TRANSLATION_FINAL") {
    const text = String(event.data?.translated_text || "")
      .trim()
      .slice(-4000);
    if (text) {
      streamState.translationFinalSegments.push(text);
      streamState.translationFinalSegments =
        streamState.translationFinalSegments.slice(-20);
      streamState.translationFinalCount += 1;
    }
    streamState.translationStatus = "ACTIVE";
    streamState.translationError = null;
    streamState.translationRetryInMs = 0;
    streamState.translationLatencyMs =
      event.data?.translation_latency_ms ?? streamState.translationLatencyMs;
  }

  if (event.event_type === "TTS_STATUS") {
    streamState.ttsProvider = event.data?.provider || streamState.ttsProvider;
    streamState.ttsVoice = event.data?.voice || streamState.ttsVoice;
    streamState.ttsStatus = event.data?.status || "UNKNOWN";
    streamState.ttsPending = Number(
      event.data?.pending ?? streamState.ttsPending
    );
    streamState.ttsBuffered = Number(
      event.data?.buffered ?? streamState.ttsBuffered
    );
    streamState.ttsRetryCount = Number(
      event.data?.retries ?? streamState.ttsRetryCount
    );
    streamState.ttsRetryInMs = Number(event.data?.retry_in_ms || 0);
  }

  if (event.event_type === "TTS_ERROR") {
    streamState.ttsProvider = event.data?.provider || streamState.ttsProvider;
    streamState.ttsStatus = "ERROR";
    streamState.ttsError = event.data?.message || "TTS failed.";
  }

  if (event.event_type === "TTS_AUDIO_START") {
    currentTtsSegment = {
      segmentId: event.data?.segment_id || null,
      sampleRate: Number(event.data?.sample_rate_hz || 24000),
      chunkCount: Number(event.data?.chunk_count || 0),
      chunksReceived: 0,
      ended: false,
      sourceSegmentCount: Number(event.data?.source_segment_count || 1)
    };
    streamState.ttsProvider = event.data?.provider || streamState.ttsProvider;
    streamState.ttsVoice = event.data?.voice || streamState.ttsVoice;
    streamState.ttsStatus = "ACTIVE";
    streamState.ttsError = null;
    streamState.ttsRetryInMs = 0;
    streamState.ttsLatencyMs =
      event.data?.tts_latency_ms ?? streamState.ttsLatencyMs;
    streamState.playbackStatus = "BUFFERING";
  }

  if (event.event_type === "TTS_AUDIO_CHUNK") {
    if (
      !currentTtsSegment ||
      currentTtsSegment.segmentId !== event.data?.segment_id
    ) {
      streamState.ttsStatus = "ERROR";
      streamState.ttsError = "TTS audio segment order is invalid.";
    } else {
      try {
        const bytes = base64Bytes(event.data?.audio_base64);
        schedulePcmChunk(bytes, currentTtsSegment.sampleRate);
        currentTtsSegment.chunksReceived += 1;
        streamState.ttsAudioBytes += bytes.byteLength;
      } catch (error) {
        streamState.ttsStatus = "ERROR";
        streamState.ttsError = error.message;
      }
    }
  }

  if (event.event_type === "TTS_AUDIO_END") {
    if (
      currentTtsSegment &&
      currentTtsSegment.segmentId === event.data?.segment_id
    ) {
      currentTtsSegment.ended = true;
      streamState.ttsFinalCount += currentTtsSegment.sourceSegmentCount;
      streamState.ttsAudioDurationMs += Number(
        event.data?.audio_duration_ms || 0
      );
      streamState.ttsLatencyMs =
        event.data?.tts_latency_ms ?? streamState.ttsLatencyMs;
      streamState.ttsStatus = "ACTIVE";
      streamState.playbackStatus = "PLAYING";
    }
  }

  if (event.event_type === "AUDIO_ACK") {
    streamState.framesAcknowledged = Math.max(
      streamState.framesAcknowledged,
      Number(event.data?.frames_received || 0)
    );
    return;
  }

  if (event.event_type === "BACKPRESSURE_REQUIRED") {
    const retryAfter = Number(event.data?.retry_after_ms || 100);
    streamState.pausedUntil = Date.now() + Math.max(10, retryAfter);
    streamState.status = "PAUSED";
    setTimeout(() => {
      if (streamState.status === "PAUSED") streamState.status = "ACTIVE";
    }, Math.max(10, retryAfter));
    return;
  }

  if (event.event_type === "STREAM_COMPLETED") {
    streamState.status = "COMPLETED";
    if (event.data?.average_recognition_latency_ms !== null) {
      streamState.recognitionLatencyMs =
        event.data?.average_recognition_latency_ms ??
        streamState.recognitionLatencyMs;
    }
    if (event.data?.average_translation_latency_ms !== null) {
      streamState.translationLatencyMs =
        event.data?.average_translation_latency_ms ??
        streamState.translationLatencyMs;
    }
    if (event.data?.average_tts_latency_ms !== null) {
      streamState.ttsLatencyMs =
        event.data?.average_tts_latency_ms ?? streamState.ttsLatencyMs;
    }
    streamState.translationFinalCount = Math.max(
      streamState.translationFinalCount,
      Number(event.data?.final_translations || 0)
    );
    streamState.ttsFinalCount = Math.max(
      streamState.ttsFinalCount,
      Number(event.data?.final_tts_segments || 0)
    );
    streamState.translationRetryCount = Number(
      event.data?.translation_retries ?? streamState.translationRetryCount
    );
    streamState.ttsRetryCount = Number(
      event.data?.tts_retries ?? streamState.ttsRetryCount
    );
    streamState.translationPending = 0;
    streamState.ttsPending = 0;
    streamState.ttsBuffered = 0;
    streamState.translationRetryInMs = 0;
    streamState.ttsRetryInMs = 0;
  }

  if (
    typeof event.event_type === "string" &&
    (event.event_type.startsWith("STT_") ||
      event.event_type.startsWith("TRANSCRIPT_") ||
      event.event_type.startsWith("TRANSLATION_") ||
      event.event_type.startsWith("TTS_"))
  ) {
    requestMetricsPublish();
  }
}

function connectCloudStream(stream, sampleRate) {
  return new Promise((resolve, reject) => {
    streamState = initialStreamState();
    streamState.sessionId = stream.session_id;
    streamState.status = "CONNECTING";
    streamCloseExpected = false;

    const socket = new WebSocket(stream.url, stream.protocols);
    socket.binaryType = "arraybuffer";
    streamSocket = socket;
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        streamState.status = "ERROR";
        streamState.error = "Audio stream handshake timed out.";
        socket.close();
        reject(new Error(streamState.error));
      }
    }, 15000);

    socket.addEventListener("open", () => {
      streamState.status = "CONNECTED";
      sendStreamControl("STREAM_START", {
        format: "pcm_s16le",
        sample_rate_hz: sampleRate,
        channels: 1,
        frame_duration_ms: 20
      });
    });

    socket.addEventListener("message", (message) => {
      if (typeof message.data !== "string") return;
      let event;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }

      handleStreamEvent(event);
      if (event.event_type === "STT_ERROR" && !settled) {
        settled = true;
        clearTimeout(timeout);
        streamState.status = "ERROR";
        streamState.error = streamState.sttError;
        socket.close();
        reject(new Error(streamState.sttError));
        return;
      }
      if (event.event_type === "STREAM_STARTED" && !settled) {
        settled = true;
        clearTimeout(timeout);
        streamState.status = "ACTIVE";
        resolve();
      }
    });

    socket.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        streamState.status = "ERROR";
        streamState.error = "Unable to connect the audio stream.";
        reject(new Error(streamState.error));
      }
    });

    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        streamState.status = "ERROR";
        streamState.error =
          "Audio stream closed before startup: " + event.code + ".";
        reject(new Error(streamState.error));
        return;
      }
      if (streamCloseExpected || event.code === 1000) {
        if (streamState.status !== "ERROR") streamState.status = "COMPLETED";
        return;
      }
      if (streamState.status === "ERROR" && !startedAt) return;
      streamState.status = "ERROR";
      streamState.error = "Audio stream disconnected: " + event.code + ".";
      cancelPlayback();
      if (mediaStream) {
        const errorMessage = streamState.error;
        stopCapture("STREAM_DISCONNECTED")
          .then(() => publishState({
            status: "ERROR",
            error: errorMessage,
            ...streamSnapshot()
          }))
          .catch(() => undefined);
      }
    });
  });
}

function encodePcm16(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(index * 2, Math.round(value), true);
  }
  return buffer;
}

function sendPcmFrame(samples) {
  if (
    !streamSocket ||
    streamSocket.readyState !== WebSocket.OPEN ||
    !["ACTIVE", "PAUSED"].includes(streamState.status)
  ) return;

  const unacknowledged =
    streamState.framesSent - streamState.framesAcknowledged;
  const flowPaused = Date.now() < streamState.pausedUntil;
  const browserBuffered =
    streamSocket.bufferedAmount > MAX_CLIENT_BUFFERED_BYTES;
  if (
    flowPaused ||
    browserBuffered ||
    unacknowledged >= streamState.maxUnacknowledged
  ) {
    streamState.framesDropped += 1;
    return;
  }
  if (streamState.status === "PAUSED") streamState.status = "ACTIVE";

  const pcm = encodePcm16(samples);
  streamSocket.send(pcm);
  streamState.framesSent += 1;
  streamState.bytesSent += pcm.byteLength;
}

async function closeCloudStream() {
  const socket = streamSocket;
  if (!socket) return;

  streamCloseExpected = true;
  if (socket.readyState === WebSocket.OPEN) {
    sendStreamControl("STREAM_STOP");
    await Promise.race([
      new Promise((resolve) => socket.addEventListener("close", resolve, {
        once: true
      })),
      new Promise((resolve) => setTimeout(resolve, STREAM_STOP_TIMEOUT_MS))
    ]);
  }
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close(1000, "Capture stopped");
  }
  if (streamState.status !== "ERROR") streamState.status = "COMPLETED";
  streamSocket = null;
}

async function performStopCapture(reason = "USER_STOP") {
  await publishState({
    status: "STOPPING",
    started_at: startedAt,
    elapsed_seconds: startedAt
      ? Math.floor((Date.now() - Date.parse(startedAt)) / 1000)
      : 0,
    error: null,
    ...streamSnapshot()
  });
  stopMetrics();
  if (audioProcessorNode) {
    audioProcessorNode.port.onmessage = null;
    audioProcessorNode.disconnect();
  }
  streamSinkGainNode?.disconnect();
  await closeCloudStream();
  await waitForPlaybackDrain();

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.onended = null;
      track.stop();
    }
  }
  sourceNode?.disconnect();
  analyserNode?.disconnect();
  originalGainNode?.disconnect();
  ukrainianGainNode?.disconnect();
  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
  }

  mediaStream = null;
  audioContext = null;
  sourceNode = null;
  analyserNode = null;
  originalGainNode = null;
  ukrainianGainNode = null;
  audioProcessorNode = null;
  streamSinkGainNode = null;
  startedAt = null;
  manualDuckingActive = false;
  playbackDuckingActive = false;
  playbackEndTime = 0;
  currentTtsSegment = null;
  activePlaybackSources.clear();

  await publishState({
    status: "IDLE",
    stop_reason: reason,
    error: null,
    ...streamSnapshot()
  });
}

function stopCapture(reason = "USER_STOP") {
  if (stopPromise) return stopPromise;
  stopPromise = performStopCapture(reason)
    .finally(() => {
      stopPromise = null;
    });
  return stopPromise;
}

function calculateLevel() {
  if (!analyserNode) return { rms: 0, peak: 0 };
  const samples = new Float32Array(analyserNode.fftSize);
  analyserNode.getFloatTimeDomainData(samples);
  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const absolute = Math.abs(sample);
    sumSquares += sample * sample;
    peak = Math.max(peak, absolute);
  }
  return {
    rms: Math.sqrt(sumSquares / samples.length),
    peak
  };
}

async function publishMetrics(track) {
  const settings = track.getSettings();
  const level = calculateLevel();
  await publishState({
    status: stopPromise ? "STOPPING" : "ACTIVE",
    started_at: startedAt,
    elapsed_seconds: Math.floor((Date.now() - Date.parse(startedAt)) / 1000),
    sample_rate_hz: settings.sampleRate || audioContext.sampleRate,
    channels: settings.channelCount || null,
    rms: Number(level.rms.toFixed(4)),
    peak: Number(level.peak.toFixed(4)),
    original_volume: currentConfig.original_pause_volume,
    effective_original_volume: isDuckingActive()
      ? currentConfig.original_duck_volume
      : currentConfig.original_pause_volume,
    ducking_active: isDuckingActive(),
    ukrainian_volume: currentConfig.ukrainian_volume,
    error: streamState.error,
    ...streamSnapshot()
  });
}

async function startCapture(streamId, config, streamConfig) {
  if (mediaStream) await stopCapture("RESTART");
  currentConfig = { ...currentConfig, ...config };

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });
    audioContext = new AudioContext();
    await audioContext.resume();
    await audioContext.audioWorklet.addModule(
      chrome.runtime.getURL("audio_processor.js")
    );

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    originalGainNode = audioContext.createGain();
    originalGainNode.gain.value = currentConfig.original_pause_volume;
    ukrainianGainNode = audioContext.createGain();
    ukrainianGainNode.gain.value = currentConfig.ukrainian_volume;
    ukrainianGainNode.connect(audioContext.destination);
    audioProcessorNode = new AudioWorkletNode(
      audioContext,
      "voicebridge-capture-processor",
      {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        processorOptions: { frameDurationMs: 20 }
      }
    );
    audioProcessorNode.port.onmessage = (event) => sendPcmFrame(event.data);
    streamSinkGainNode = audioContext.createGain();
    streamSinkGainNode.gain.value = 0;

    sourceNode.connect(analyserNode);
    analyserNode.connect(originalGainNode);
    originalGainNode.connect(audioContext.destination);
    sourceNode.connect(audioProcessorNode);
    audioProcessorNode.connect(streamSinkGainNode);
    streamSinkGainNode.connect(audioContext.destination);

    const [audioTrack] = mediaStream.getAudioTracks();
    audioTrack.onended = () => {
      stopCapture("TRACK_ENDED").catch(() => undefined);
    };

    playbackEndTime = audioContext.currentTime;
    await connectCloudStream(streamConfig, audioContext.sampleRate);
    startedAt = new Date().toISOString();
    await publishMetrics(audioTrack);
    metricsTimer = setInterval(() => {
      publishMetrics(audioTrack).catch(() => undefined);
    }, 1000);
  } catch (error) {
    const errorMessage = error.message;
    await stopCapture("START_FAILED");
    await publishState({
      status: "ERROR",
      error: errorMessage,
      ...streamSnapshot()
    });
    throw error;
  }
}

async function updateVolumes(data) {
  currentConfig = { ...currentConfig, ...data };
  applyOriginalGain();
  smoothUkrainianGain(currentConfig.ukrainian_volume);
}

async function testDucking() {
  if (!originalGainNode) throw new Error("Capture is not active.");
  if (manualDuckingTimer) clearTimeout(manualDuckingTimer);
  manualDuckingActive = true;
  applyOriginalGain();
  await publishMetrics(mediaStream.getAudioTracks()[0]);
  manualDuckingTimer = setTimeout(() => {
    manualDuckingActive = false;
    applyOriginalGain();
    publishMetrics(mediaStream.getAudioTracks()[0]).catch(() => undefined);
    manualDuckingTimer = null;
  }, 3000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") return false;
  let operation;
  if (message.type === "START_CAPTURE") {
    operation = startCapture(
      message.data.stream_id,
      message.data.config,
      message.data.stream
    );
  } else if (message.type === "STOP_CAPTURE") {
    operation = stopCapture("USER_STOP");
  } else if (message.type === "SET_VOLUMES") {
    operation = updateVolumes(message.data);
  } else if (message.type === "TEST_DUCKING") {
    operation = testDucking();
  } else {
    return false;
  }
  operation
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
