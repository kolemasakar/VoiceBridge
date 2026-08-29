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

test("cloud connection test remains backward compatible without universal source metadata", () => {
  assert.match(source, /created\s*=\s*await createCloudSession\(\);/);
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
