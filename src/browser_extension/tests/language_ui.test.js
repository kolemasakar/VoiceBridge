const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeCapabilities,
  chooseSelection,
  targetOptions,
  isValidatedPair,
  captureAllowsStart
} = require("../language_ui.js");

function registry() {
  return normalizeCapabilities({
    registry_version: "1.0.0",
    validation_policy: "validated_pairs_only",
    source_languages: [
      { tag: "en", label: "English" },
      { tag: "de", label: "German" }
    ],
    target_languages: [
      { tag: "uk", label: "Ukrainian" },
      { tag: "fr", label: "French" }
    ],
    pairs: [
      { source_language: "en", target_language: "uk" },
      { source_language: "de", target_language: "fr" },
      { source_language: "ghost", target_language: "uk" }
    ],
    defaults: { source_language: "en", target_language: "uk" }
  });
}

test("language UI accepts only options and pairs supplied by cloud capabilities", () => {
  const capabilities = registry();
  assert.deepEqual(capabilities.source_languages, [
    { tag: "en", label: "English" },
    { tag: "de", label: "German" }
  ]);
  assert.deepEqual(capabilities.pairs, [
    { source_language: "en", target_language: "uk" },
    { source_language: "de", target_language: "fr" }
  ]);
  assert.equal(isValidatedPair(capabilities, "en", "fr"), false);
  assert.equal(isValidatedPair(capabilities, "de", "fr"), true);
});

test("target choices are constrained by validated cloud pairs", () => {
  const capabilities = registry();
  assert.deepEqual(targetOptions(capabilities, "en"), [
    { tag: "uk", label: "Ukrainian" }
  ]);
  assert.deepEqual(targetOptions(capabilities, "de"), [
    { tag: "fr", label: "French" }
  ]);
});

test("saved valid pair is retained and stale pair falls back only in UI selection", () => {
  const capabilities = registry();
  assert.deepEqual(chooseSelection(capabilities, "de", "fr"), {
    source_language: "de",
    target_language: "fr"
  });
  assert.deepEqual(chooseSelection(capabilities, "en", "fr"), {
    source_language: "en",
    target_language: "uk"
  });
});

test("language readiness never re-enables Start during an active or stopping capture", () => {
  assert.equal(captureAllowsStart(null), false);
  assert.equal(captureAllowsStart("ACTIVE"), false);
  assert.equal(captureAllowsStart("PAUSED"), false);
  assert.equal(captureAllowsStart("STOPPING"), false);
  assert.equal(captureAllowsStart("DRAINING"), false);
  assert.equal(captureAllowsStart("IDLE"), true);
  assert.equal(captureAllowsStart("ERROR"), true);
});

test("invalid capability payload fails closed", () => {
  assert.throws(() => normalizeCapabilities(null), /not available/);
  assert.throws(
    () => normalizeCapabilities({
      source_languages: [],
      target_languages: [],
      pairs: []
    }),
    /no validated language pairs/
  );
});
