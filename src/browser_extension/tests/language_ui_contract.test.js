const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "popup.html"), "utf8");
const languageUi = fs.readFileSync(
  path.join(__dirname, "..", "language_ui.js"),
  "utf8"
);

test("popup exposes source and target selectors backed by language_ui", () => {
  assert.match(html, /id=["']source-language["']/);
  assert.match(html, /id=["']target-language["']/);
  assert.match(html, /id=["']language-detail["']/);
  assert.match(html, /<script src=["']language_ui\.js["']><\/script>/);
});

test("language UI asks the service worker for cloud capabilities", () => {
  assert.match(languageUi, /GET_LANGUAGE_CAPABILITIES/);
  assert.match(languageUi, /source_languages/);
  assert.match(languageUi, /target_languages/);
  assert.match(languageUi, /capabilities\.pairs/);
});

test("language UI contains no local catalog of supported languages", () => {
  assert.doesNotMatch(languageUi, /\{\s*tag:\s*["']en["']/);
  assert.doesNotMatch(languageUi, /\{\s*tag:\s*["']uk["']/);
  assert.doesNotMatch(languageUi, /English/);
  assert.doesNotMatch(languageUi, /Ukrainian/);
});

test("capture is guarded until validated cloud capabilities load", () => {
  assert.match(html, /id=["']start["'][^>]*disabled/);
  assert.match(languageUi, /Validated language capabilities must load before capture\./);
  assert.match(languageUi, /stopImmediatePropagation\(\)/);
});
