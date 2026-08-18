const DEFAULT_BETA_API_URL = "https://voicebridge-krc-media-beta-kolemasakar.onrender.com";

const elements = {
  endpoint: document.getElementById("endpoint"),
  jobId: document.getElementById("jobId"),
  betaCode: document.getElementById("betaCode"),
  captions: document.getElementById("captions"),
  start: document.getElementById("start"),
  stop: document.getElementById("stop"),
  status: document.getElementById("status"),
  message: document.getElementById("message"),
  stateJob: document.getElementById("stateJob"),
  source: document.getElementById("source"),
  captionType: document.getElementById("captionType"),
  language: document.getElementById("language"),
  segments: document.getElementById("segments"),
  sttSeconds: document.getElementById("sttSeconds"),
  providerDeleted: document.getElementById("providerDeleted")
};

function send(message) {
  return chrome.runtime.sendMessage({ target: "media_beta_service_worker", ...message });
}

function isBusy(status) {
  return ["STARTING", "CAPTURING", "STOPPING", "UPLOADING", "TRANSCRIBING", "FETCHING_CAPTIONS"].includes(status);
}

function currentInputJobId() {
  return elements.jobId.value.trim();
}

function stateMatchesInput(state) {
  const inputJobId = currentInputJobId();
  const stateJobId = String(state?.jobId || "").trim();
  return !inputJobId || !stateJobId || inputJobId === stateJobId;
}

function render(state) {
  const rawStatus = state?.status || "IDLE";
  const sameJob = stateMatchesInput(state);
  const staleTerminal = rawStatus === "COMPLETED" && !sameJob;
  const status = staleTerminal ? "READY" : rawStatus;

  elements.status.textContent = status;
  elements.message.textContent = staleTerminal
    ? "New Job ID entered. Choose Use subtitles or Audio fallback."
    : state?.message || "Ready.";
  elements.stateJob.textContent = staleTerminal
    ? currentInputJobId() || "-"
    : state?.jobId || "-";
  elements.source.textContent = staleTerminal ? "-" : state?.transcriptSource || "-";
  elements.captionType.textContent = staleTerminal ? "-" : state?.captionType || "-";
  elements.language.textContent = staleTerminal ? "-" : state?.detectedLanguage || "-";
  elements.segments.textContent = staleTerminal ? "-" : state?.segmentCount ?? "-";
  elements.sttSeconds.textContent = staleTerminal ? "-" : state?.sttSecondsCharged ?? "-";
  elements.providerDeleted.textContent = staleTerminal
    ? "-"
    : state?.transcriptSource === "youtube_captions"
      ? "not applicable"
      : state?.providerDataDeleted === true
        ? "deleted"
        : state?.providerDataDeleted === false
          ? "delete failed"
          : "-";

  const terminal = rawStatus === "COMPLETED" && sameJob;
  const busy = isBusy(rawStatus) && sameJob;
  elements.captions.disabled = busy || terminal;
  elements.start.disabled = busy || terminal;
  elements.stop.disabled = !(rawStatus === "CAPTURING" && sameJob);
}

async function load() {
  const settings = await chrome.storage.local.get([
    "media_beta_api_url",
    "media_beta_job_id",
    "media_beta_access_code"
  ]);
  elements.endpoint.value = settings.media_beta_api_url || DEFAULT_BETA_API_URL;
  elements.jobId.value = settings.media_beta_job_id || "";
  elements.betaCode.value = settings.media_beta_access_code || "";
  const response = await send({ type: "GET_STATE" });
  if (response?.ok) render(response.state);
  else render({ status: "ERROR", message: response?.error || "Could not read helper state." });
}

async function persist() {
  await chrome.storage.local.set({
    media_beta_api_url: elements.endpoint.value.trim(),
    media_beta_job_id: elements.jobId.value.trim(),
    media_beta_access_code: elements.betaCode.value
  });
}

async function persistJobIdAndRefresh() {
  await chrome.storage.local.set({ media_beta_job_id: currentInputJobId() });
  const response = await send({ type: "GET_STATE" });
  if (response?.ok) render(response.state);
}

function input() {
  return {
    endpoint: elements.endpoint.value.trim(),
    jobId: elements.jobId.value.trim(),
    betaCode: elements.betaCode.value
  };
}

async function captions() {
  elements.captions.disabled = true;
  elements.message.textContent = "Reading subtitles...";
  try {
    await persist();
    const response = await send({ type: "GET_CAPTIONS", data: input() });
    if (!response?.ok) throw new Error(response?.error || "Subtitles could not be read.");
    render(response.state);
  } catch (error) {
    render({ status: "ERROR", jobId: currentInputJobId(), message: error.message });
  }
}

async function start() {
  elements.start.disabled = true;
  elements.message.textContent = "Starting audio fallback...";
  try {
    await persist();
    const response = await send({ type: "START_CAPTURE", data: input() });
    if (!response?.ok) throw new Error(response?.error || "Capture could not start.");
    render(response.state);
  } catch (error) {
    render({ status: "ERROR", jobId: currentInputJobId(), message: error.message });
  }
}

async function stop() {
  elements.stop.disabled = true;
  elements.message.textContent = "Stopping...";
  try {
    const response = await send({ type: "STOP_CAPTURE" });
    if (!response?.ok) throw new Error(response?.error || "Capture could not stop.");
    render(response.state);
  } catch (error) {
    render({ status: "ERROR", jobId: currentInputJobId(), message: error.message });
  }
}

elements.captions.addEventListener("click", captions);
elements.start.addEventListener("click", start);
elements.stop.addEventListener("click", stop);
elements.jobId.addEventListener("input", () => {
  persistJobIdAndRefresh().catch(() => {});
});

setInterval(async () => {
  try {
    const response = await send({ type: "GET_STATE" });
    if (response?.ok) render(response.state);
  } catch {}
}, 1000);

load();
