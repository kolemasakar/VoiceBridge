const OFFSCREEN_PATH = "offscreen.html";
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });

  if (contexts.length > 0) {
    return;
  }

  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
      justification: "Capture and play audio from the active YouTube tab."
    });
  }

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

async function updateBadge(state) {
  const active = state.status === "ACTIVE";
  await chrome.action.setBadgeText({ text: active ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    original_pause_volume: 0.5,
    original_duck_volume: 0.15,
    ukrainian_volume: 1
  });
  await chrome.storage.session.set({
    capture_state: {
      status: "IDLE",
      error: null
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target === "service_worker" && message.type === "PREPARE_OFFSCREEN") {
    ensureOffscreenDocument()
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.target === "service_worker" && message.type === "GET_STATE") {
    chrome.storage.session.get("capture_state")
      .then(({ capture_state }) => sendResponse({
        ok: true,
        state: capture_state || { status: "IDLE", error: null }
      }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.target === "service_worker" && message.type === "CAPTURE_STATE") {
    const state = message.data;
    chrome.storage.session.set({ capture_state: state })
      .then(() => updateBadge(state))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
