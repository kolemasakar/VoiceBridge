const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionRoot = path.join(__dirname, "..");
const popupSource = fs.readFileSync(
  path.join(extensionRoot, "popup.js"),
  "utf8"
);
const popupHtml = fs.readFileSync(
  path.join(extensionRoot, "popup.html"),
  "utf8"
);

test("popup loads the source adapter before popup orchestration", () => {
  const adapterIndex = popupHtml.indexOf('src="source_adapter.js"');
  const popupIndex = popupHtml.indexOf('src="popup.js"');
  assert.notEqual(adapterIndex, -1);
  assert.notEqual(popupIndex, -1);
  assert.ok(adapterIndex < popupIndex);
});

test("popup routes generic source preparation and stream acquisition through adapter", () => {
  assert.match(
    popupSource,
    /createChromiumTabSourceAdapter\(chrome\)/
  );
  assert.match(popupSource, /browserTabSourceAdapter\.prepare\(\)/);
  assert.match(popupSource, /browserTabSourceAdapter\.start\(preparedSource\)/);
  assert.doesNotMatch(popupSource, /chrome\.tabCapture\.getMediaStreamId/);
  assert.doesNotMatch(popupSource, /chrome\.tabs\.query/);
});

test("popup starts the cloud session with normalized browser source metadata", () => {
  assert.match(
    popupSource,
    /serviceWorkerMessage\("START_CLOUD_SESSION",\s*\{\s*source_kind:\s*preparedSource\.source_kind,\s*source_adapter:\s*preparedSource\.source_adapter\s*\}\)/s
  );
});
