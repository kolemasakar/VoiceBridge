let mediaStream = null;
let audioContext = null;
let sourceNode = null;
let recorder = null;
let chunks = [];
let captureConfig = null;
let autoStopTimer = null;
let stopPromise = null;

const MAX_CAPTURE_MS = 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const STATUS_POLL_MS = 2000;
const STATUS_POLL_TIMEOUT_MS = 20 * 60 * 1000;

async function publish(status, message, extra = {}) {
  const state = {
    status,
    jobId: captureConfig?.jobId || extra.jobId || null,
    sourceUrl: captureConfig?.sourceUrl || extra.sourceUrl || null,
    message,
    ...extra
  };
  await chrome.runtime.sendMessage({
    target: "media_beta_service_worker",
    type: "CAPTURE_STATE",
    data: state
  });
}

function selectMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg"
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  throw new Error("This browser does not provide a supported Opus recording format.");
}

async function closeCaptureResources() {
  if (autoStopTimer) {
    clearTimeout(autoStopTimer);
    autoStopTimer = null;
  }
  if (sourceNode) {
    try { sourceNode.disconnect(); } catch {}
    sourceNode = null;
  }
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) track.stop();
    mediaStream = null;
  }
  if (audioContext) {
    try { await audioContext.close(); } catch {}
    audioContext = null;
  }
}

async function uploadBlob(blob) {
  if (!captureConfig) throw new Error("Capture configuration is unavailable.");
  if (blob.size <= 0) throw new Error("The browser recording is empty.");
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("The browser recording exceeds the 32 MB beta upload limit.");
  }

  await publish("UPLOADING", "Uploading captured audio to MEDIA BETA...", {
    recordedBytes: blob.size
  });

  const response = await fetch(
    captureConfig.endpoint +
      "/api/v1/media/client-transcriptions/" +
      encodeURIComponent(captureConfig.jobId) +
      "/audio",
    {
      method: "POST",
      headers: {
        "content-type": blob.type || "application/octet-stream",
        "x-media-beta-code": captureConfig.betaCode,
        "x-media-source-url": captureConfig.sourceUrl
      },
      body: blob
    }
  );
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) {
    const apiError = payload?.error;
    throw new Error(
      apiError?.code
        ? apiError.code + ": " + (apiError.message || "Upload failed.")
        : "MEDIA BETA upload returned HTTP " + response.status + "."
    );
  }
  await publish("TRANSCRIBING", "Audio accepted. Waiting for transcription...", {
    recordedBytes: blob.size,
    providerStatus: payload?.status || null
  });
  await pollStatus();
}

async function pollStatus() {
  if (!captureConfig) return;
  const started = Date.now();
  while (Date.now() - started < STATUS_POLL_TIMEOUT_MS) {
    const response = await fetch(
      captureConfig.endpoint +
        "/api/v1/media/client-transcriptions/" +
        encodeURIComponent(captureConfig.jobId) +
        "/client-status",
      {
        method: "GET",
        headers: {
          "x-media-beta-code": captureConfig.betaCode
        }
      }
    );
    let payload = null;
    try {
      payload = await response.json();
    } catch {}
    if (!response.ok) {
      const apiError = payload?.error;
      throw new Error(
        apiError?.code
          ? apiError.code + ": " + (apiError.message || "Status check failed.")
          : "MEDIA BETA status returned HTTP " + response.status + "."
      );
    }
    if (payload?.status === "COMPLETED") {
      await publish("COMPLETED", "Transcript completed. Return to K-Research & Critic.", {
        detectedLanguage: payload.detected_language || null,
        segmentCount: payload.segment_count || 0,
        sttSecondsCharged: payload.stt_seconds_charged || 0,
        providerDataDeleted: payload.provider_data_deleted ?? null
      });
      return;
    }
    if (payload?.status === "FAILED") {
      const message = payload?.error?.message || "MEDIA BETA transcription failed.";
      throw new Error(payload?.error?.code ? payload.error.code + ": " + message : message);
    }
    await publish("TRANSCRIBING", "Transcription is still processing...", {
      providerStatus: payload?.status || null,
      sttSecondsCharged: payload?.stt_seconds_charged || 0
    });
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_MS));
  }
  throw new Error("Transcription status polling timed out. The job may still be available in K-Research & Critic.");
}

async function finalizeRecording() {
  const localRecorder = recorder;
  recorder = null;
  const localChunks = chunks;
  chunks = [];
  await closeCaptureResources();
  const mimeType = localRecorder?.mimeType || localChunks[0]?.type || "audio/webm";
  const blob = new Blob(localChunks, { type: mimeType });
  await uploadBlob(blob);
}

async function startCapture(config) {
  if (recorder && recorder.state !== "inactive") {
    throw new Error("A capture is already active.");
  }
  captureConfig = config;
  chunks = [];

  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: config.streamId
      }
    },
    video: false
  };
  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  sourceNode.connect(audioContext.destination);

  const mimeType = selectMimeType();
  recorder = new MediaRecorder(mediaStream, {
    mimeType,
    audioBitsPerSecond: 32000
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener("error", async (event) => {
    await publish("ERROR", event.error?.message || "MediaRecorder failed.");
  });
  recorder.addEventListener("stop", () => {
    stopPromise = finalizeRecording()
      .catch((error) => publish("ERROR", error.message))
      .finally(() => {
        stopPromise = null;
        captureConfig = null;
      });
  }, { once: true });

  recorder.start(1000);
  autoStopTimer = setTimeout(() => {
    if (recorder && recorder.state === "recording") recorder.stop();
  }, MAX_CAPTURE_MS);
  await publish(
    "CAPTURING",
    "Recording active tab audio. Play the video at normal speed, then press Stop."
  );
}

async function stopCapture() {
  if (!recorder || recorder.state !== "recording") {
    if (stopPromise) await stopPromise;
    return;
  }
  await publish("STOPPING", "Stopping recording...");
  recorder.stop();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "media_beta_offscreen") return false;
  let operation;
  if (message.type === "START_CAPTURE") {
    operation = startCapture(message.data).then(() => ({ ok: true }));
  } else if (message.type === "STOP_CAPTURE") {
    operation = stopCapture().then(() => ({ ok: true }));
  } else {
    return false;
  }
  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
