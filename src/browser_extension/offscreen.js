let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let analyserNode = null;
let originalGainNode = null;
let metricsTimer = null;
let startedAt = null;
let currentConfig = {
  original_pause_volume: 0.5,
  original_duck_volume: 0.15,
  ukrainian_volume: 1
};

async function publishState(state) {
  await chrome.runtime.sendMessage({
    target: "service_worker",
    type: "CAPTURE_STATE",
    data: state
  });
}

function smoothGain(value) {
  if (!originalGainNode || !audioContext) {
    return;
  }

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
}

async function stopCapture(reason = "USER_STOP") {
  stopMetrics();

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
  startedAt = null;

  await publishState({
    status: "IDLE",
    stop_reason: reason,
    error: null
  });
}

function calculateLevel() {
  if (!analyserNode) {
    return { rms: 0, peak: 0 };
  }

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
    ukrainian_volume: currentConfig.ukrainian_volume,
    error: null
  });
}

async function startCapture(streamId, config) {
  if (mediaStream) {
    await stopCapture("RESTART");
  }

  currentConfig = {
    ...currentConfig,
    ...config
  };

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

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    originalGainNode = audioContext.createGain();
    originalGainNode.gain.value = currentConfig.original_pause_volume;

    sourceNode.connect(analyserNode);
    analyserNode.connect(originalGainNode);
    originalGainNode.connect(audioContext.destination);

    const [audioTrack] = mediaStream.getAudioTracks();
    audioTrack.onended = () => {
      stopCapture("TRACK_ENDED").catch(() => undefined);
    };

    startedAt = new Date().toISOString();
    await publishMetrics(audioTrack);

    metricsTimer = setInterval(() => {
      publishMetrics(audioTrack).catch(() => undefined);
    }, 1000);
  } catch (error) {
    await stopCapture("START_FAILED");
    await publishState({
      status: "ERROR",
      error: error.message
    });
    throw error;
  }
}

async function updateVolumes(data) {
  currentConfig = {
    ...currentConfig,
    ...data
  };

  smoothGain(currentConfig.original_pause_volume);
}

async function testDucking() {
  if (!originalGainNode) {
    throw new Error("Capture is not active.");
  }

  smoothGain(currentConfig.original_duck_volume);
  setTimeout(() => smoothGain(currentConfig.original_pause_volume), 3000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "offscreen") {
    return false;
  }

  let operation;

  if (message.type === "START_CAPTURE") {
    operation = startCapture(message.data.stream_id, message.data.config);
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
