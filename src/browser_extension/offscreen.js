let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let analyserNode = null;
let originalGainNode = null;
let audioProcessorNode = null;
let streamSinkGainNode = null;
let metricsTimer = null;
let duckingTimer = null;
let startedAt = null;
let duckingActive = false;
let streamSocket = null;
let streamCloseExpected = false;

const MAX_CLIENT_BUFFERED_BYTES = 262144;

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
    translationLatencyMs: null
  };
}

function finalTranscriptText() {
  return streamState.transcriptFinalSegments.join(" ").slice(-8000);
}

function finalTranslationText() {
  return streamState.translationFinalSegments.join(" ").slice(-12000);
}

function streamSnapshot() {
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
    translation_latency_ms: streamState.translationLatencyMs
  };
}

async function publishState(state) {
  await chrome.runtime.sendMessage({
    target: "service_worker",
    type: "CAPTURE_STATE",
    data: state
  });
}

function smoothGain(value) {
  if (!originalGainNode || !audioContext) return;
  const safeValue = Math.max(0, Math.min(1, Number(value)));
  originalGainNode.gain.cancelScheduledValues(audioContext.currentTime);
  originalGainNode.gain.setTargetAtTime(
    safeValue,
    audioContext.currentTime,
    0.08
  );
}

function stopMetrics() {
  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
  if (duckingTimer) {
    clearTimeout(duckingTimer);
    duckingTimer = null;
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
    if (streamState.translationStatus !== "ERROR") {
      streamState.translationError = null;
    }
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
    streamState.translationLatencyMs =
      event.data?.translation_latency_ms ?? streamState.translationLatencyMs;
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
  }

  if (
    typeof event.event_type === "string" &&
    (event.event_type.startsWith("STT_") ||
      event.event_type.startsWith("TRANSCRIPT_") ||
      event.event_type.startsWith("TRANSLATION_"))
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
      new Promise((resolve) => setTimeout(resolve, 5000))
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

async function stopCapture(reason = "USER_STOP") {
  stopMetrics();
  if (audioProcessorNode) {
    audioProcessorNode.port.onmessage = null;
    audioProcessorNode.disconnect();
  }
  streamSinkGainNode?.disconnect();
  await closeCloudStream();

  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.onended = null;
      track.stop();
    }
  }
  sourceNode?.disconnect();
  analyserNode?.disconnect();
  originalGainNode?.disconnect();
  if (audioContext && audioContext.state !== "closed") {
    await audioContext.close();
  }

  mediaStream = null;
  audioContext = null;
  sourceNode = null;
  analyserNode = null;
  originalGainNode = null;
  audioProcessorNode = null;
  streamSinkGainNode = null;
  startedAt = null;
  duckingActive = false;

  await publishState({
    status: "IDLE",
    stop_reason: reason,
    error: null,
    ...streamSnapshot()
  });
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
    status: "ACTIVE",
    started_at: startedAt,
    elapsed_seconds: Math.floor((Date.now() - Date.parse(startedAt)) / 1000),
    sample_rate_hz: settings.sampleRate || audioContext.sampleRate,
    channels: settings.channelCount || null,
    rms: Number(level.rms.toFixed(4)),
    peak: Number(level.peak.toFixed(4)),
    original_volume: currentConfig.original_pause_volume,
    effective_original_volume: duckingActive
      ? currentConfig.original_duck_volume
      : currentConfig.original_pause_volume,
    ducking_active: duckingActive,
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
  smoothGain(currentConfig.original_pause_volume);
}

async function testDucking() {
  if (!originalGainNode) throw new Error("Capture is not active.");
  if (duckingTimer) clearTimeout(duckingTimer);
  duckingActive = true;
  smoothGain(currentConfig.original_duck_volume);
  await publishMetrics(mediaStream.getAudioTracks()[0]);
  duckingTimer = setTimeout(() => {
    duckingActive = false;
    smoothGain(currentConfig.original_pause_volume);
    publishMetrics(mediaStream.getAudioTracks()[0]).catch(() => undefined);
    duckingTimer = null;
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
