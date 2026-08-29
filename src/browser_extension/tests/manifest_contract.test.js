const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const manifest = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "manifest.json"),
  "utf8"
));

test("universal active-tab path does not request broad host access", () => {
  assert.equal(manifest.version, "0.7.0");
  assert.deepEqual(manifest.permissions, [
    "activeTab",
    "offscreen",
    "storage",
    "tabCapture"
  ]);
  assert.deepEqual(manifest.host_permissions, [
    "https://voicebridge-cloud-us.onrender.com/*",
    "http://127.0.0.1/*",
    "http://localhost/*"
  ]);
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  assert.ok(!manifest.host_permissions.some((value) => value.includes("*://*")));
});

test("extension metadata no longer claims YouTube-only scope", () => {
  assert.equal(manifest.name, "VoiceBridge");
  assert.doesNotMatch(manifest.description, /YouTube-only/i);
  assert.match(manifest.description, /active browser tab/i);
});
