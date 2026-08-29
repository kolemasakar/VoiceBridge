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
