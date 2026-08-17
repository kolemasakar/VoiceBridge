const OFFSCREEN_PATH = "offscreen.html";
const DEFAULT_BETA_API_URL = "https://voicebridge-krc-media-beta-kolemasakar.onrender.com";
let creatingOffscreen = null;

function normalizeApiUrl(value) {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Beta API URL must use HTTPS.");
  }
  return (url.origin + url.pathname).replace(/\/+$/, "");
}

function isYoutubeUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtu.be" ||
      host.endsWith(".youtu.be")
    );
  } catch {
    return false;
  }
}

function validateStartInput(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Capture configuration is missing.");
  }
  if (!/^KRCC_[A-Za-z0-9-]+$/.test(input.jobId || "")) {
    throw new Error("Job ID must start with KRCC_.");
  }
  if (typeof input.betaCode !== "string" || input.betaCode.length < 12) {
    throw new Error("Beta access code must contain at least 12 characters.");
  }
  return {
    endpoint: normalizeApiUrl(input.endpoint || DEFAULT_BETA_API_URL),
    jobId: input.jobId,
    betaCode: input.betaCode
  };
}

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length > 0) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Capture audio from the active YouTube tab for KRC MEDIA BETA transcription."
    });
  }
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function setState(state) {
  await chrome.storage.session.set({ media_beta_state: state });
  const active = ["STARTING", "CAPTURING", "UPLOADING", "TRANSCRIBING"].includes(state.status);
  await chrome.action.setBadgeText({ text: active ? "REC" : "" });
  if (active) {
    await chrome.action.setBadgeBackgroundColor({ color: "#b91c1c" });
  }
  return state;
}

async function getState() {
  const { media_beta_state } = await chrome.storage.session.get("media_beta_state");
  return media_beta_state || {
    status: "IDLE",
    jobId: null,
    sourceUrl: null,
    message: "Ready."
  };
}

async function startCapture(rawInput) {
  const current = await getState();
  if (["STARTING", "CAPTURING", "UPLOADING", "TRANSCRIBING"].includes(current.status)) {
    throw new Error("A MEDIA BETA capture is already active.");
  }
  const input = validateStartInput(rawInput);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !isYoutubeUrl(tab.url)) {
    throw new Error("Open the YouTube video for this job in the active tab first.");
  }

  await setState({
    status: "STARTING",
    jobId: input.jobId,
    sourceUrl: tab.url,
    message: "Preparing tab audio capture..."
  });

  try {
    await ensureOffscreenDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    const response = await chrome.runtime.sendMessage({
      target: "media_beta_offscreen",
      type: "START_CAPTURE",
      data: {
        ...input,
        sourceUrl: tab.url,
        streamId
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || "The offscreen capture could not start.");
    }
    return getState();
  } catch (error) {
    await setState({
      status: "ERROR",
      jobId: input.jobId,
      sourceUrl: tab.url,
      message: error.message
    });
    throw error;
  }
}

async function stopCapture() {
  const current = await getState();
  if (current.status !== "CAPTURING") {
    throw new Error("No active MEDIA BETA capture is running.");
  }
  const response = await chrome.runtime.sendMessage({
    target: "media_beta_offscreen",
    type: "STOP_CAPTURE"
  });
  if (!response?.ok) {
    throw new Error(response?.error || "The capture could not be stopped.");
  }
  return getState();
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(["media_beta_api_url"]);
  if (!current.media_beta_api_url) {
    await chrome.storage.local.set({ media_beta_api_url: DEFAULT_BETA_API_URL });
  }
  await setState({
    status: "IDLE",
    jobId: null,
    sourceUrl: null,
    message: "Ready."
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "media_beta_service_worker") return false;
  let operation;
  if (message.type === "GET_STATE") {
    operation = getState().then((state) => ({ ok: true, state }));
  } else if (message.type === "START_CAPTURE") {
    operation = startCapture(message.data).then((state) => ({ ok: true, state }));
  } else if (message.type === "STOP_CAPTURE") {
    operation = stopCapture().then((state) => ({ ok: true, state }));
  } else if (message.type === "CAPTURE_STATE") {
    operation = setState(message.data).then((state) => ({ ok: true, state }));
  } else {
    return false;
  }
  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
