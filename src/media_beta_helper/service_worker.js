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
    throw new Error("Helper configuration is missing.");
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
  const active = ["STARTING", "CAPTURING", "UPLOADING", "TRANSCRIBING", "FETCHING_CAPTIONS"].includes(state.status);
  const badge = state.status === "FETCHING_CAPTIONS" ? "TXT" : active ? "REC" : "";
  await chrome.action.setBadgeText({ text: badge });
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

async function activeYoutubeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url || !isYoutubeUrl(tab.url)) {
    throw new Error("Open the YouTube video for this job in the active tab first.");
  }
  return tab;
}

async function readClientJob(input) {
  const response = await fetch(
    `${input.endpoint}/api/v1/media/client-transcriptions/${encodeURIComponent(input.jobId)}/client-status`,
    { headers: { "x-media-beta-code": input.betaCode }, cache: "no-store" }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Client job status failed (${response.status}).`);
  }
  return payload;
}

async function extractYouTubeCaptions(languageHint) {
  try {
    const player = document.getElementById("movie_player");
    let response = window.ytInitialPlayerResponse || null;
    if (!response && player && typeof player.getPlayerResponse === "function") {
      try { response = player.getPlayerResponse(); } catch {}
    }
    if (!response) {
      const raw = window.ytplayer?.config?.args?.player_response;
      if (typeof raw === "string") {
        try { response = JSON.parse(raw); } catch {}
      }
    }
    const renderer = response?.captions?.playerCaptionsTracklistRenderer;
    const tracks = Array.isArray(renderer?.captionTracks) ? renderer.captionTracks : [];
    if (!tracks.length) {
      return { ok: false, reason: "CAPTIONS_NOT_AVAILABLE" };
    }

    const baseLanguage = (value) => String(value || "").toLowerCase().split("-")[0];
    const requested = String(languageHint || "auto").toLowerCase();
    let eligible = tracks.filter((track) => typeof track?.baseUrl === "string" && track.baseUrl);
    if (requested !== "auto") {
      eligible = eligible.filter((track) => baseLanguage(track.languageCode) === baseLanguage(requested));
      if (!eligible.length) {
        return { ok: false, reason: "CAPTIONS_LANGUAGE_UNAVAILABLE" };
      }
    }

    let activeLanguage = null;
    if (player && typeof player.getOption === "function") {
      try {
        const activeTrack = player.getOption("captions", "track");
        activeLanguage = activeTrack?.languageCode || null;
      } catch {}
    }

    let track = null;
    if (activeLanguage) {
      track = eligible.find((candidate) =>
        baseLanguage(candidate.languageCode) === baseLanguage(activeLanguage)
      ) || null;
    }
    if (!track) {
      track = eligible.find((candidate) => candidate.kind !== "asr") || eligible[0] || null;
    }
    if (!track) {
      return { ok: false, reason: "CAPTIONS_NOT_AVAILABLE" };
    }

    const timedTextUrl = new URL(track.baseUrl, location.href);
    timedTextUrl.searchParams.set("fmt", "json3");
    const timedText = await fetch(timedTextUrl.toString(), {
      credentials: "include",
      cache: "no-store"
    });
    if (!timedText.ok) {
      return { ok: false, reason: `CAPTIONS_FETCH_${timedText.status}` };
    }
    const data = await timedText.json();
    const events = Array.isArray(data?.events) ? data.events : [];
    const segments = [];
    for (const event of events) {
      const start = Number(event?.tStartMs);
      const duration = Number(event?.dDurationMs);
      if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) continue;
      const pieces = Array.isArray(event?.segs) ? event.segs : [];
      const text = pieces
        .map((piece) => typeof piece?.utf8 === "string" ? piece.utf8 : "")
        .join("")
        .replace(/[\u200b\u200e\u200f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      segments.push({
        start_ms: Math.max(0, Math.round(start)),
        end_ms: Math.max(1, Math.round(start + duration)),
        text
      });
    }
    if (!segments.length) {
      return { ok: false, reason: "CAPTIONS_EMPTY" };
    }
    const name = track?.name?.simpleText ||
      (Array.isArray(track?.name?.runs) ? track.name.runs.map((run) => run?.text || "").join("") : "");
    return {
      ok: true,
      language: String(track.languageCode || "und").toLowerCase(),
      captionType: track.kind === "asr" ? "auto_generated" : "manual",
      trackName: name || null,
      segments
    };
  } catch (error) {
    return { ok: false, reason: "CAPTIONS_EXTRACTION_FAILED", detail: String(error?.message || error) };
  }
}

async function getCaptions(rawInput) {
  const current = await getState();
  if (["STARTING", "CAPTURING", "UPLOADING", "TRANSCRIBING", "FETCHING_CAPTIONS"].includes(current.status)) {
    throw new Error("A MEDIA BETA operation is already active.");
  }
  const input = validateStartInput(rawInput);
  const tab = await activeYoutubeTab();
  await setState({
    status: "FETCHING_CAPTIONS",
    jobId: input.jobId,
    sourceUrl: tab.url,
    message: "Reading YouTube caption track..."
  });
  try {
    const job = await readClientJob(input);
    if (job.status !== "AWAITING_CLIENT") {
      throw new Error(`Job is ${job.status}; create a fresh KRCC_ job if needed.`);
    }
    const injected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: extractYouTubeCaptions,
      args: [job.language_hint || "auto"]
    });
    const result = injected?.[0]?.result;
    if (!result?.ok) {
      const state = {
        status: "CAPTIONS_UNAVAILABLE",
        jobId: input.jobId,
        sourceUrl: tab.url,
        message: `No usable YouTube captions (${result?.reason || "unknown"}). Use Audio fallback.`
      };
      await setState(state);
      return state;
    }

    const response = await fetch(
      `${input.endpoint}/api/v1/media/client-transcriptions/${encodeURIComponent(input.jobId)}/captions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-media-beta-code": input.betaCode,
          "x-media-source-url": tab.url
        },
        body: JSON.stringify({
          language: result.language,
          caption_type: result.captionType,
          segments: result.segments
        })
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Caption upload failed (${response.status}).`);
    }
    const state = {
      status: payload.status,
      jobId: payload.job_id,
      sourceUrl: tab.url,
      message: `Transcript loaded from YouTube captions (${result.captionType}, ${result.language}).`,
      transcriptSource: payload.transcript_source,
      captionType: payload.caption_type,
      detectedLanguage: payload.detected_language,
      segmentCount: payload.segment_count,
      sttSecondsCharged: payload.stt_seconds_charged,
      providerDataDeleted: payload.provider_data_deleted
    };
    await setState(state);
    return state;
  } catch (error) {
    const state = {
      status: "ERROR",
      jobId: input.jobId,
      sourceUrl: tab.url,
      message: error.message
    };
    await setState(state);
    throw error;
  }
}

async function startCapture(rawInput) {
  const current = await getState();
  if (["STARTING", "CAPTURING", "UPLOADING", "TRANSCRIBING", "FETCHING_CAPTIONS"].includes(current.status)) {
    throw new Error("A MEDIA BETA operation is already active.");
  }
  const input = validateStartInput(rawInput);
  const tab = await activeYoutubeTab();

  await setState({
    status: "STARTING",
    jobId: input.jobId,
    sourceUrl: tab.url,
    message: "Preparing tab audio fallback..."
  });

  try {
    await ensureOffscreenDocument();
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    const response = await chrome.runtime.sendMessage({
      target: "media_beta_offscreen",
      type: "START_CAPTURE",
      data: { ...input, sourceUrl: tab.url, streamId }
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
  await setState({ status: "IDLE", jobId: null, sourceUrl: null, message: "Ready." });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "media_beta_service_worker") return false;
  let operation;
  if (message.type === "GET_STATE") {
    operation = getState().then((state) => ({ ok: true, state }));
  } else if (message.type === "GET_CAPTIONS") {
    operation = getCaptions(message.data).then((state) => ({ ok: true, state }));
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
