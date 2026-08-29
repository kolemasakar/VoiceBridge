const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const serviceWorkerPath = path.join(__dirname, "..", "service_worker.js");
const source = fs.readFileSync(serviceWorkerPath, "utf8");

test("browser session request leaves provider selection to cloud defaults", () => {
  assert.match(
    source,
    /provider_preferences:\s*\{\s*recognition:\s*null,\s*translation:\s*null,\s*synthesis:\s*null\s*\}/s
  );
  assert.doesNotMatch(source, /recognition:\s*["']assemblyai["']/);
});

test("live browser capture selects the universal runtime with normalized source metadata", () => {
  assert.match(
    source,
    /runtime_mode:\s*source\s*\?\s*["']UNIVERSAL_BROWSER_AUDIO["']\s*:\s*["']YOUTUBE_MVP["']/
  );
  assert.match(
    source,
    /kind:\s*["']BROWSER_TAB["'],\s*adapter:\s*["']chromium_tab["']/s
  );
  assert.match(
    source,
    /START_CLOUD_SESSION["']\)\s*\{?[\s\S]*startCloudSession\(message\.data\)/
  );
});

test("session languages come from the cloud registry rather than a browser support list", () => {
  assert.match(source, /GET_LANGUAGE_CAPABILITIES/);
  assert.match(source, /cloudRequest\(["']\/api\/v1\/health["']\)/);
  assert.match(
    source,
    /source_language:\s*languageSelection\.source_language/
  );
  assert.match(
    source,
    /target_language:\s*languageSelection\.target_language/
  );
  assert.doesNotMatch(source, /source_language:\s*["']en["']/);
  assert.doesNotMatch(source, /target_language:\s*["']uk["']/);
});

test("cloud connection test uses cloud registry defaults", () => {
  assert.match(
    source,
    /created\s*=\s*await createCloudSession\(null,\s*capabilities\.defaults\);/
  );
});

test("service worker rejects unexpected browser source metadata", () => {
  assert.match(
    source,
    /value\.source_kind\s*!==\s*["']BROWSER_TAB["']/
  );
  assert.match(
    source,
    /value\.source_adapter\s*!==\s*["']chromium_tab["']/
  );
  assert.match(source, /The browser source metadata is not valid\./);
});

test("stale saved language selections cannot silently start a session", () => {
  assert.match(source, /isValidatedLanguagePair\(capabilities, selection\)/);
  assert.match(
    source,
    /The saved language pair is no longer validated by VoiceBridge Cloud\./
  );
  assert.match(
    source,
    /const languageSelection = await selectedLanguagePair\(capabilities\);/
  );
});
