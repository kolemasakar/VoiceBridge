const elements = {
  status: document.querySelector("#status"),
  statusDot: document.querySelector("#status-dot"),
  elapsed: document.querySelector("#elapsed"),
  start: document.querySelector("#start"),
  stop: document.querySelector("#stop"),
  testDucking: document.querySelector("#test-ducking"),
  originalVolume: document.querySelector("#original-volume"),
  originalValue: document.querySelector("#original-value"),
  ukrainianVolume: document.querySelector("#ukrainian-volume"),
  ukrainianValue: document.querySelector("#ukrainian-value"),
  sampleRate: document.querySelector("#sample-rate"),
  channels: document.querySelector("#channels"),
  rms: document.querySelector("#rms"),
  peak: document.querySelector("#peak"),
  error: document.querySelector("#error")
};

function formatDuration(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, "0") + ":" +
    String(seconds).padStart(2, "0");
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
  elements.sampleRate.textContent = state.sample_rate_hz
    ? state.sample_rate_hz + " Hz"
    : "-";
  elements.channels.textContent = state.channels ?? "-";
  elements.rms.textContent = state.rms ?? "-";
  elements.peak.textContent = state.peak ?? "-";
  elements.error.textContent = state.error || "";
}

async function prepareOffscreen() {
  const response = await chrome.runtime.sendMessage({
    target: "service_worker",
    type: "PREPARE_OFFSCREEN"
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Unable to prepare audio runtime.");
  }
}

async function refreshState() {
  const response = await chrome.runtime.sendMessage({
    target: "service_worker",
    type: "GET_STATE"
  });

  if (response?.ok) {
    renderState(response.state);
  }
}

async function startCapture() {
  elements.error.textContent = "";
  elements.start.disabled = true;

  try {
    await prepareOffscreen();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) {
      throw new Error("Open a YouTube tab before starting capture.");
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });

    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "START_CAPTURE",
      data: {
        stream_id: streamId,
        tab_id: tab.id
      }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to start capture.");
    }

    await refreshState();
  } catch (error) {
    elements.error.textContent = error.message;
    elements.start.disabled = false;
  }
}

async function stopCapture() {
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "STOP_CAPTURE"
  });

  if (!response?.ok) {
    elements.error.textContent = response?.error || "Unable to stop capture.";
  }

  await refreshState();
}

async function sendVolumes() {
  const data = {
    original_pause_volume: Number(elements.originalVolume.value) / 100,
    ukrainian_volume: Number(elements.ukrainianVolume.value) / 100
  };

  elements.originalValue.textContent = elements.originalVolume.value + "%";
  elements.ukrainianValue.textContent = elements.ukrainianVolume.value + "%";

  await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "SET_VOLUMES",
    data
  });
}

async function loadVolumes() {
  const settings = await chrome.storage.local.get([
    "original_pause_volume",
    "ukrainian_volume"
  ]);

  elements.originalVolume.value = Math.round(
    (settings.original_pause_volume ?? 0.5) * 100
  );
  elements.ukrainianVolume.value = Math.round(
    (settings.ukrainian_volume ?? 1) * 100
  );
  elements.originalValue.textContent = elements.originalVolume.value + "%";
  elements.ukrainianValue.textContent = elements.ukrainianVolume.value + "%";
}

elements.start.addEventListener("click", startCapture);
elements.stop.addEventListener("click", stopCapture);
elements.testDucking.addEventListener("click", async () => {
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "TEST_DUCKING"
  });
  if (!response?.ok) {
    elements.error.textContent = response?.error || "Ducking test failed.";
  }
});
elements.originalVolume.addEventListener("input", sendVolumes);
elements.ukrainianVolume.addEventListener("input", sendVolumes);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "session" && changes.capture_state) {
    renderState(changes.capture_state.newValue);
  }
});

Promise.all([prepareOffscreen(), loadVolumes(), refreshState()])
  .catch((error) => {
    elements.error.textContent = error.message;
    renderState({ status: "ERROR", error: error.message });
  });
