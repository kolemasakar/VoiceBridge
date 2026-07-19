const elements = {
  status: document.querySelector("#status"),
  statusDot: document.querySelector("#status-dot"),
  elapsed: document.querySelector("#elapsed"),
  cloudApiUrl: document.querySelector("#cloud-api-url"),
  cloudToken: document.querySelector("#cloud-token"),
  cloudStatus: document.querySelector("#cloud-status"),
  cloudDetail: document.querySelector("#cloud-detail"),
  saveCloud: document.querySelector("#save-cloud"),
  streamStatus: document.querySelector("#stream-status"),
  streamFrames: document.querySelector("#stream-frames"),
  streamBytes: document.querySelector("#stream-bytes"),
  streamDropped: document.querySelector("#stream-dropped"),
  streamUnacked: document.querySelector("#stream-unacked"),
  sttStatus: document.querySelector("#stt-status"),
  sttProvider: document.querySelector("#stt-provider"),
  sttLatency: document.querySelector("#stt-latency"),
  sttError: document.querySelector("#stt-error"),
  transcriptFinal: document.querySelector("#transcript-final"),
  transcriptPartial: document.querySelector("#transcript-partial"),
  transcriptEmpty: document.querySelector("#transcript-empty"),
  transcriptCount: document.querySelector("#transcript-count"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  testDucking: document.querySelector("#test-ducking"),
  originalVolume: document.querySelector("#original-volume"),
  originalValue: document.querySelector("#original-value"),
  effectiveLevel: document.querySelector(".effective-level"),
  effectiveVolume: document.querySelector("#effective-volume"),
  effectiveLabel: document.querySelector("#effective-label"),
  ukrainianVolume: document.querySelector("#ukrainian-volume"),
  ukrainianValue: document.querySelector("#ukrainian-value"),
  sampleRate: document.querySelector("#sample-rate"),
  channels: document.querySelector("#channels"),
  rms: document.querySelector("#rms"),
  peak: document.querySelector("#peak"),
  error: document.querySelector("#error")
};

const DEFAULT_CLOUD_API_URL = "https://voicebridge-cloud-us.onrender.com";

async function serviceWorkerMessage(type, data = undefined) {
  const response = await chrome.runtime.sendMessage({
    target: "service_worker",
    type,
    data
  });
  if (!response?.ok) throw new Error(response?.error || "The extension operation failed.");
  return response;
}

function formatDuration(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

function renderState(state) {
  const active = state.status === "ACTIVE";
  const error = state.status === "ERROR";
  elements.status.textContent = state.status || "IDLE";
  elements.statusDot.classList.toggle("active", active);
  elements.statusDot.classList.toggle("error", error);
  elements.elapsed.textContent = formatDuration(state.elapsed_seconds);
  elements.start.disabled = active;
  elements.stop.disabled = !active;
  elements.testDucking.disabled = !active;
  elements.sampleRate.textContent = state.sample_rate_hz ? state.sample_rate_hz + " Hz" : "-";
  elements.channels.textContent = state.channels ?? "-";
  elements.rms.textContent = state.rms ?? "-";
  elements.peak.textContent = state.peak ?? "-";
  elements.error.textContent = state.error || "";
  const streamStatus = state.stream_status || "OFFLINE";
  elements.streamStatus.textContent = streamStatus;
  elements.streamStatus.className = streamStatus.toLowerCase();
  elements.streamFrames.textContent = state.stream_frames_sent ?? 0;
  elements.streamBytes.textContent = state.stream_bytes_sent ?? 0;
  elements.streamDropped.textContent = state.stream_frames_dropped ?? 0;
  elements.streamUnacked.textContent = state.stream_unacknowledged ?? 0;
  const sttStatus = state.stt_status || "OFFLINE";
  const finalTranscript = state.transcript_final || "";
  const partialTranscript = state.transcript_partial || "";
  elements.sttStatus.textContent = sttStatus.replaceAll("_", " ");
  elements.sttStatus.className = sttStatus.toLowerCase();
  elements.sttProvider.textContent = state.stt_provider || "-";
  elements.sttLatency.textContent = state.recognition_latency_ms == null ? "-" : state.recognition_latency_ms + " ms";
  elements.sttError.textContent = state.stt_error || "";
  elements.transcriptFinal.textContent = finalTranscript;
  elements.transcriptPartial.textContent = partialTranscript ? (finalTranscript ? " " : "") + partialTranscript : "";
  elements.transcriptEmpty.hidden = Boolean(finalTranscript || partialTranscript);
  elements.transcriptCount.textContent = state.transcript_final_count ?? 0;
  const effectivePercent = Math.round((state.effective_original_volume ?? Number(elements.originalVolume.value) / 100) * 100);
  const ducking = Boolean(state.ducking_active);
  elements.effectiveVolume.value = effectivePercent;
  elements.effectiveLabel.textContent = (ducking ? "DUCKING " : "Background ") + effectivePercent + "%";
  elements.effectiveLevel.classList.toggle("ducking", ducking);
}

function renderCloudState(state = {}) {
  const status = state.status || "NOT_CONFIGURED";
  elements.cloudStatus.textContent = status.replaceAll("_", " ");
  elements.cloudStatus.className = status.toLowerCase();
  if (state.session_id) elements.cloudDetail.textContent = "Session " + state.session_id.slice(0, 8) + "...";
  else if (state.message) elements.cloudDetail.textContent = state.message;
  else if (status === "READY") elements.cloudDetail.textContent = "Cloud API and token are valid.";
  else if (status === "NOT_CONFIGURED") elements.cloudDetail.textContent = "Enter the test token generated in Render.";
}

function validateCloudForm() {
  const cloudApiUrl = elements.cloudApiUrl.value.trim().replace(/\/+$/, "");
  const cloudToken = elements.cloudToken.value.trim();
  if (!cloudApiUrl) throw new Error("Cloud API URL is required.");
  let parsedUrl;
  try { parsedUrl = new URL(cloudApiUrl); } catch { throw new Error("Cloud API URL is not valid."); }
  const localHttp = parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);
  if (parsedUrl.protocol !== "https:" && !localHttp) throw new Error("Cloud API URL must use HTTPS.");
  if (cloudToken.length < 16) throw new Error("Test access token must contain at least 16 characters.");
  return { cloud_api_url: cloudApiUrl, test_access_token: cloudToken };
}

async function saveCloudSettings(testConnection) {
  const settings = validateCloudForm();
  await chrome.storage.local.set(settings);
  if (!testConnection) return;
  elements.saveCloud.disabled = true;
  renderCloudState({ status: "CHECKING", message: "Checking authenticated cloud access..." });
  try {
    const response = await serviceWorkerMessage("TEST_CLOUD_CONNECTION");
    renderCloudState(response.state);
  } finally { elements.saveCloud.disabled = false; }
}

async function loadCloudSettings() {
  const settings = await chrome.storage.local.get(["cloud_api_url", "test_access_token"]);
  elements.cloudApiUrl.value = settings.cloud_api_url || DEFAULT_CLOUD_API_URL;
  elements.cloudToken.value = settings.test_access_token || "";
  const response = await serviceWorkerMessage("GET_CLOUD_STATE");
  renderCloudState(response.state);
}

async function prepareOffscreen() { await serviceWorkerMessage("PREPARE_OFFSCREEN"); }
async function refreshState() {
  const response = await chrome.runtime.sendMessage({ target: "service_worker", type: "GET_STATE" });
  if (response?.ok) renderState(response.state);
}

async function startCapture() {
  elements.error.textContent = "";
  elements.start.disabled = true;
  try {
    await prepareOffscreen();
    await saveCloudSettings(false);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) throw new Error("Open a YouTube tab before starting capture.");
    const cloudResponse = await serviceWorkerMessage("START_CLOUD_SESSION");
    renderCloudState(cloudResponse.state);
    const streamResponse = await serviceWorkerMessage("GET_STREAM_TICKET");
    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const config = {
        original_pause_volume: Number(elements.originalVolume.value) / 100,
        original_duck_volume: 0.15,
        ukrainian_volume: Number(elements.ukrainianVolume.value) / 100
      };
      const response = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "START_CAPTURE",
        data: { stream_id: streamId, tab_id: tab.id, config, stream: streamResponse.stream }
      });
      if (!response?.ok) throw new Error(response?.error || "Unable to start capture.");
    } catch (error) {
      await serviceWorkerMessage("STOP_CLOUD_SESSION").catch(() => undefined);
      throw error;
    }
    await refreshState();
  } catch (error) {
    elements.error.textContent = error.message;
    elements.start.disabled = false;
  }
}

async function stopCapture() {
  elements.error.textContent = "";
  const failures = [];
  try {
    const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "STOP_CAPTURE" });
    if (!response?.ok) failures.push(response?.error || "Unable to stop capture.");
  } catch (error) { failures.push(error.message); }
  try {
    const cloudResponse = await serviceWorkerMessage("STOP_CLOUD_SESSION");
    renderCloudState(cloudResponse.state);
  } catch (error) { failures.push(error.message); }
  await refreshState();
  elements.error.textContent = failures.join(" ");
}

async function sendVolumes() {
  const data = {
    original_pause_volume: Number(elements.originalVolume.value) / 100,
    ukrainian_volume: Number(elements.ukrainianVolume.value) / 100
  };
  elements.originalValue.textContent = elements.originalVolume.value + "%";
  elements.ukrainianValue.textContent = elements.ukrainianVolume.value + "%";
  elements.effectiveVolume.value = elements.originalVolume.value;
  elements.effectiveLabel.textContent = "Background " + elements.originalVolume.value + "%";
  await chrome.storage.local.set(data);
  await chrome.runtime.sendMessage({ target: "offscreen", type: "SET_VOLUMES", data });
}

async function loadVolumes() {
  const settings = await chrome.storage.local.get(["original_pause_volume", "ukrainian_volume"]);
  elements.originalVolume.value = Math.round((settings.original_pause_volume ?? 0.5) * 100);
  elements.ukrainianVolume.value = Math.round((settings.ukrainian_volume ?? 1) * 100);
  elements.originalValue.textContent = elements.originalVolume.value + "%";
  elements.ukrainianValue.textContent = elements.ukrainianVolume.value + "%";
}

elements.start.addEventListener("click", startCapture);
elements.stop.addEventListener("click", stopCapture);
elements.saveCloud.addEventListener("click", () => {
  elements.error.textContent = "";
  saveCloudSettings(true).catch((error) => {
    elements.error.textContent = error.message;
    renderCloudState({ status: "ERROR", message: error.message });
  });
});
elements.testDucking.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({ target: "offscreen", type: "TEST_DUCKING" });
  if (!response?.ok) elements.error.textContent = response?.error || "Ducking test failed.";
});
elements.originalVolume.addEventListener("input", sendVolumes);
elements.ukrainianVolume.addEventListener("input", sendVolumes);
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session" && changes.capture_state) renderState(changes.capture_state.newValue);
  if (areaName === "session" && changes.cloud_state) renderCloudState(changes.cloud_state.newValue);
});
Promise.all([prepareOffscreen(), loadVolumes(), loadCloudSettings(), refreshState()]).catch((error) => {
  elements.error.textContent = error.message;
  renderState({ status: "ERROR", error: error.message });
});
