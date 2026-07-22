from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8", newline="\n")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        if new in content:
            return
        raise SystemExit(f"Expected block not found in {path}: {old[:80]!r}")
    write(path, content.replace(old, new, 1))


replace_once(
    "src/cloud/src/server.ts",
    'const SERVICE_VERSION = "0.5.2";',
    'const SERVICE_VERSION = "0.6.0";'
)
replace_once(
    "src/cloud/src/server.ts",
    '''  translationProvider: TranslationProvider = createTranslationProvider(
    config.geminiApiKey,
    config.geminiTranslationModel
  ),''',
    '''  translationProvider: TranslationProvider = createTranslationProvider({
    provider: config.translationProvider ?? "azure",
    fallbackProvider: config.translationFallbackProvider ?? "gemini",
    geminiApiKey: config.geminiApiKey,
    geminiModel: config.geminiTranslationModel,
    azureTranslatorKey: config.azureTranslatorKey ?? null,
    azureTranslatorRegion: config.azureTranslatorRegion ?? "eastus",
    azureTranslatorEndpoint: config.azureTranslatorEndpoint ??
      "https://api.cognitive.microsofttranslator.com"
  }),'''
)

service_worker = "src/browser_extension/service_worker.js"
replace_once(
    service_worker,
    "let creatingOffscreen = null;",
    "let creatingOffscreen = null;\nlet stoppingCloudSession = null;"
)
replace_once(
    service_worker,
    '''      translation: "gemini",
      synthesis: "gemini"
    },
    voice: {
      voice_id: "Iapetus",''',
    '''      translation: "azure",
      synthesis: "azure"
    },
    voice: {
      voice_id: "uk-UA-OstapNeural",'''
)
replace_once(
    service_worker,
    "async function stopCloudSession() {",
    "async function performStopCloudSession() {"
)
replace_once(
    service_worker,
    '''  }
}

async function getStreamTicket() {''',
    '''  }
}

function stopCloudSession() {
  if (stoppingCloudSession) return stoppingCloudSession;
  stoppingCloudSession = performStopCloudSession()
    .finally(() => {
      stoppingCloudSession = null;
    });
  return stoppingCloudSession;
}

async function getStreamTicket() {'''
)

popup = "src/browser_extension/popup.js"
replace_once(
    popup,
    'const DEFAULT_CLOUD_API_URL = "https://voicebridge-cloud-us.onrender.com";',
    'const DEFAULT_CLOUD_API_URL = "https://voicebridge-cloud-us.onrender.com";\nlet stopInProgress = false;'
)
replace_once(
    popup,
    '''function renderState(state) {
  const active = state.status === "ACTIVE";
  const error = state.status === "ERROR";
  elements.status.textContent = state.status || "IDLE";
  elements.statusDot.classList.toggle("active", active);
  elements.statusDot.classList.toggle("error", error);
  elements.elapsed.textContent = formatDuration(state.elapsed_seconds);
  elements.start.disabled = active;
  elements.stop.disabled = !active;
  elements.testDucking.disabled = !active;''',
    '''function renderState(state) {
  const active = ["ACTIVE", "PAUSED"].includes(state.status);
  const stopping = stopInProgress ||
    ["STOPPING", "DRAINING"].includes(state.status);
  const error = state.status === "ERROR";
  elements.status.textContent = stopping
    ? "STOPPING"
    : state.status || "IDLE";
  elements.statusDot.classList.toggle("active", active && !stopping);
  elements.statusDot.classList.toggle("error", error);
  elements.elapsed.textContent = formatDuration(state.elapsed_seconds);
  elements.start.disabled = active || stopping;
  elements.stop.disabled = !active || stopping;
  elements.stop.textContent = stopping ? "Stopping..." : "Stop";
  elements.testDucking.disabled = !active || stopping;'''
)
replace_once(
    popup,
    '''async function stopCapture() {
  elements.error.textContent = "";
  elements.stop.disabled = true;
  elements.status.textContent = "DRAINING";
  const failures = [];
  try {
    const response = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "STOP_CAPTURE"
    });
    if (!response?.ok) {
      failures.push(response?.error || "Unable to stop capture.");
    }
  } catch (error) {
    failures.push(error.message);
  }
  try {
    const cloudResponse = await serviceWorkerMessage("STOP_CLOUD_SESSION");
    renderCloudState(cloudResponse.state);
  } catch (error) {
    failures.push(error.message);
  }
  await refreshState();
  elements.error.textContent = failures.join(" ");
}''',
    '''async function stopCapture() {
  if (stopInProgress) return;
  stopInProgress = true;
  elements.error.textContent = "";
  renderState({ status: "STOPPING" });
  const failures = [];
  try {
    try {
      const response = await chrome.runtime.sendMessage({
        target: "offscreen",
        type: "STOP_CAPTURE"
      });
      if (!response?.ok) {
        failures.push(response?.error || "Unable to stop capture.");
      }
    } catch (error) {
      failures.push(error.message);
    }
    try {
      const cloudResponse = await serviceWorkerMessage("STOP_CLOUD_SESSION");
      renderCloudState(cloudResponse.state);
    } catch (error) {
      failures.push(error.message);
    }
  } finally {
    stopInProgress = false;
    await refreshState();
    elements.error.textContent = failures.join(" ");
  }
}'''
)
replace_once(
    popup,
    '''  if (areaName === "session" && changes.capture_state) {
    renderState(changes.capture_state.newValue);
  }''',
    '''  if (areaName === "session" && changes.capture_state) {
    const state = changes.capture_state.newValue;
    if (["IDLE", "ERROR"].includes(state?.status)) {
      stopInProgress = false;
    }
    renderState(state);
  }'''
)

offscreen = "src/browser_extension/offscreen.js"
replace_once(
    offscreen,
    "let currentTtsSegment = null;",
    "let currentTtsSegment = null;\nlet stopPromise = null;"
)
replace_once(
    offscreen,
    'async function stopCapture(reason = "USER_STOP") {\n  stopMetrics();',
    '''async function performStopCapture(reason = "USER_STOP") {
  await publishState({
    status: "STOPPING",
    started_at: startedAt,
    elapsed_seconds: startedAt
      ? Math.floor((Date.now() - Date.parse(startedAt)) / 1000)
      : 0,
    error: null,
    ...streamSnapshot()
  });
  stopMetrics();'''
)
replace_once(
    offscreen,
    '''  await publishState({
    status: "IDLE",
    stop_reason: reason,
    error: null,
    ...streamSnapshot()
  });
}

function calculateLevel() {''',
    '''  await publishState({
    status: "IDLE",
    stop_reason: reason,
    error: null,
    ...streamSnapshot()
  });
}

function stopCapture(reason = "USER_STOP") {
  if (stopPromise) return stopPromise;
  stopPromise = performStopCapture(reason)
    .finally(() => {
      stopPromise = null;
    });
  return stopPromise;
}

function calculateLevel() {'''
)
replace_once(
    offscreen,
    '''  await publishState({
    status: "ACTIVE",''',
    '''  await publishState({
    status: stopPromise ? "STOPPING" : "ACTIVE",'''
)

replace_once(
    "src/browser_extension/manifest.json",
    '"version": "0.6.1"',
    '"version": "0.6.2"'
)

for path in ["src/cloud/package.json", "src/cloud/package-lock.json"]:
    content = read(path)
    content = content.replace('"version": "0.5.1"', '"version": "0.6.0"')
    write(path, content)

workflow = ".github/workflows/validate.yml"
content = read(workflow)
content = content.replace("extension 0.6.1", "extension 0.6.2")
content = content.replace(
    "VoiceBridge_Extension_0.6.1",
    "VoiceBridge_Extension_0.6.2"
)
write(workflow, content)

cloud_test = "src/cloud/tests/cloud.test.ts"
content = read(cloud_test)
content = content.replace(
    'test("health reports cloud 0.5.1 and pipeline capabilities"',
    'test("health reports cloud 0.6.0 and pipeline capabilities"'
)
content = content.replace(
    'assert.equal(body.version, "0.5.1");',
    'assert.equal(body.version, "0.6.0");'
)
write(cloud_test, content)

tts_test = "src/cloud/tests/tts.test.ts"
content = read(tts_test).replace('"0.5.1"', '"0.6.0"')
write(tts_test, content)

root_readme = "README.md"
content = read(root_readme)
content = content.replace(
    "-> Gemini Ukrainian translation\n    -> Gemini Ukrainian TTS",
    "-> Azure Translator with Gemini fallback\n    -> Azure Speech Ukrainian TTS"
)
if "ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER" not in content:
    marker = "- [TTS Provider ADR](docs/adr/ADR-007_PHASE_1_TTS_PROVIDER.md)\n"
    content = content.replace(
        marker,
        marker + "- [Azure Translation ADR](docs/adr/ADR-008_PHASE_1_AZURE_TRANSLATION_PROVIDER.md)\n"
    )
write(root_readme, content)

print("Azure Translator and Stop-state patch applied.")
