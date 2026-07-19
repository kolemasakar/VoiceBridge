const OFFSCREEN_PATH = "offscreen.html";
const DEFAULT_CLOUD_API_URL = "https://voicebridge-cloud.onrender.com";
const CLOUD_REQUEST_TIMEOUT_MS = 70000;

let creatingOffscreen = null;

function sessionRequestBody() {
  return {
    source_language: "en",
    target_language: "uk",
    runtime_mode: "YOUTUBE_MVP",
    input_type: "BROWSER_AUDIO",
    output_type: "BROWSER_PLAYBACK",
    provider_preferences: {
      recognition: "assemblyai",
      translation: null,
      synthesis: null
    },
    voice: {
      voice_id: null,
      speaking_rate: null
    }
  };
}

function normalizeCloudApiUrl(value) {
  const parsed = new URL(value);
  const localHttp =
    parsed.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(parsed.hostname);

  if (parsed.protocol !== "https:" && !localHttp) {
    throw new Error("Cloud API URL must use HTTPS.");
  }

  return (parsed.origin + parsed.pathname).replace(/\/+$/, "");
}

async function cloudSettings() {
  const settings = await chrome.storage.local.get([
    "cloud_api_url",
    "test_access_token"
  ]);
  const cloudApiUrl = normalizeCloudApiUrl(
    settings.cloud_api_url || DEFAULT_CLOUD_API_URL
  );
  const testAccessToken = settings.test_access_token || "";

  if (testAccessToken.length < 16) {
    throw new Error("Test access token must contain at least 16 characters.");
  }

  return { cloudApiUrl, testAccessToken };
}

async function cloudRequest(path, options = {}) {
  const { cloudApiUrl, testAccessToken } = await cloudSettings();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    CLOUD_REQUEST_TIMEOUT_MS
  );

  try {
    const headers = new Headers(options.headers);
    headers.set("authorization", "Bearer " + testAccessToken);
    headers.set("x-correlation-id", crypto.randomUUID());

    if (options.body) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(cloudApiUrl + path, {
      ...options,
      headers,
      signal: controller.signal
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const apiError = body?.error;
      const message = apiError?.message ||
        "Cloud API returned HTTP " + response.status + ".";
      throw new Error(
        apiError?.code ? apiError.code + ": " + message : message
      );
    }

    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        "Cloud request timed out. The free Render service may still be waking up."
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function setCloudState(state) {
  await chrome.storage.session.set({ cloud_state: state });
  return state;
}

async function getCloudState() {
  const { cloud_state } = await chrome.storage.session.get("cloud_state");
  return cloud_state || {
    status: "NOT_CONFIGURED",
    session_id: null,
    message: "Enter the test token generated in Render."
  };
}

async function createCloudSession() {
  return cloudRequest("/api/v1/sessions", {
    method: "POST",
    body: JSON.stringify(sessionRequestBody())
  });
}

async function stopSessionById(sessionId) {
  return cloudRequest("/api/v1/sessions/" + sessionId + "/stop", {
    method: "POST"
  });
}

async function testCloudConnection() {
  const current = await getCloudState();
  if (current.status === "ACTIVE" || current.status === "STARTING") {
    throw new Error("Stop the active capture before testing cloud access.");
  }

  await setCloudState({
    status: "CHECKING",
    session_id: null,
    message: "Checking authenticated cloud access..."
  });

  let created = null;
  try {
    created = await createCloudSession();
    await stopSessionById(created.session_id);
    return setCloudState({
      status: "READY",
      session_id: null,
      message: "Cloud API and token are valid."
    });
  } catch (error) {
    if (created?.session_id) {
      await stopSessionById(created.session_id).catch(() => undefined);
    }
    await setCloudState({
      status: "ERROR",
      session_id: created?.session_id || null,
      message: error.message
    });
    throw error;
  }
}

async function startCloudSession() {
  const current = await getCloudState();
  if (current.status === "ACTIVE" && current.session_id) {
    return current;
  }

  await setCloudState({
    status: "STARTING",
    session_id: null,
    message: "Creating cloud session..."
  });

  let created = null;
  try {
    created = await createCloudSession();
    await setCloudState({
      status: "STARTING",
      session_id: created.session_id,
      message: "Starting cloud session..."
    });

    const started = await cloudRequest(
      "/api/v1/sessions/" + created.session_id + "/start",
      { method: "POST" }
    );

    return setCloudState({
      status: started.state,
      session_id: started.session_id,
      message: "Cloud session is active."
    });
  } catch (error) {
    if (created?.session_id) {
      await stopSessionById(created.session_id).catch(() => undefined);
    }
    await setCloudState({
      status: "ERROR",
      session_id: created?.session_id || null,
      message: error.message
    });
    throw error;
  }
}

async function stopCloudSession() {
  const current = await getCloudState();
  if (!current.session_id) {
    if (current.status === "READY" || current.status === "NOT_CONFIGURED") {
      return current;
    }
    return setCloudState({
      status: "READY",
      session_id: null,
      message: "No active cloud session."
    });
  }

  if (current.status === "COMPLETED") {
    return current;
  }

  await setCloudState({
    status: "STOPPING",
    session_id: current.session_id,
    message: "Stopping cloud session..."
  });

  try {
    const stopped = await stopSessionById(current.session_id);
    return setCloudState({
      status: stopped.state,
      session_id: stopped.session_id,
      message: "Cloud session completed."
    });
  } catch (error) {
    await setCloudState({
      status: "ERROR",
      session_id: current.session_id,
      message: error.message
    });
    throw error;
  }
}

async function getStreamTicket() {
  const current = await getCloudState();
  if (current.status !== "ACTIVE" || !current.session_id) {
    throw new Error("An ACTIVE cloud session is required for streaming.");
  }

  const ticket = await cloudRequest(
    "/api/v1/sessions/" + current.session_id + "/stream-ticket",
    { method: "POST" }
  );
  const { cloudApiUrl } = await cloudSettings();
  const streamUrl = new URL(cloudApiUrl);
  streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
  streamUrl.pathname = ticket.stream_path;
  streamUrl.search = "";
  streamUrl.hash = "";

  return {
    url: streamUrl.toString(),
    protocols: ticket.protocols,
    session_id: current.session_id,
    expires_at: ticket.expires_at
  };
}

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
  const existing = await chrome.storage.local.get([
    "original_pause_volume",
    "original_duck_volume",
    "ukrainian_volume",
    "cloud_api_url"
  ]);
  const defaults = {};

  if (existing.original_pause_volume === undefined) {
    defaults.original_pause_volume = 0.5;
  }
  if (existing.original_duck_volume === undefined) {
    defaults.original_duck_volume = 0.15;
  }
  if (existing.ukrainian_volume === undefined) {
    defaults.ukrainian_volume = 1;
  }
  if (existing.cloud_api_url === undefined) {
    defaults.cloud_api_url = DEFAULT_CLOUD_API_URL;
  }

  await chrome.storage.local.set(defaults);
  await chrome.storage.session.set({
    capture_state: {
      status: "IDLE",
      error: null
    },
    cloud_state: {
      status: "NOT_CONFIGURED",
      session_id: null,
      message: "Enter the test token generated in Render."
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "service_worker") {
    return false;
  }

  let operation = null;

  if (message.type === "PREPARE_OFFSCREEN") {
    operation = ensureOffscreenDocument().then(() => ({ ok: true }));
  } else if (message.type === "GET_STATE") {
    operation = chrome.storage.session.get("capture_state").then(
      ({ capture_state }) => ({
        ok: true,
        state: capture_state || { status: "IDLE", error: null }
      })
    );
  } else if (message.type === "GET_CLOUD_STATE") {
    operation = getCloudState().then((state) => ({ ok: true, state }));
  } else if (message.type === "TEST_CLOUD_CONNECTION") {
    operation = testCloudConnection().then((state) => ({ ok: true, state }));
  } else if (message.type === "START_CLOUD_SESSION") {
    operation = startCloudSession().then((state) => ({ ok: true, state }));
  } else if (message.type === "STOP_CLOUD_SESSION") {
    operation = stopCloudSession().then((state) => ({ ok: true, state }));
  } else if (message.type === "GET_STREAM_TICKET") {
    operation = getStreamTicket().then((stream) => ({ ok: true, stream }));
  } else if (message.type === "CAPTURE_STATE") {
    const state = message.data;
    operation = chrome.storage.session.set({ capture_state: state })
      .then(() => updateBadge(state))
      .then(() => {
        if (["IDLE", "ERROR"].includes(state.status)) {
          stopCloudSession().catch(() => undefined);
        }
        return { ok: true };
      });
  } else {
    return false;
  }

  operation
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
