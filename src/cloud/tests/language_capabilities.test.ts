import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canonicalizeLanguageTag,
  publicLanguageCapabilities,
  resolveLanguagePair
} from "../src/language_capabilities.js";

test("BCP 47 language tags are canonicalized centrally", () => {
  assert.equal(canonicalizeLanguageTag("EN"), "en");
  assert.equal(canonicalizeLanguageTag("uk"), "uk");
  assert.equal(canonicalizeLanguageTag("en-us"), "en-US");
  assert.equal(canonicalizeLanguageTag("not_a_language"), null);
  assert.equal(canonicalizeLanguageTag(""), null);
});

test("registry resolves only the currently validated VoiceBridge pair", () => {
  assert.deepEqual(resolveLanguagePair("EN", "UK"), {
    source_language: "en",
    target_language: "uk",
    stt_language: "en-US",
    target_locale: "uk-UA"
  });
  assert.equal(resolveLanguagePair("de", "uk"), null);
  assert.equal(resolveLanguagePair("en", "fr"), null);
  assert.equal(resolveLanguagePair("en-US", "uk"), null);
});

test("public capability payload is sanitized and validated-only", () => {
  const capabilities = publicLanguageCapabilities();
  assert.equal(capabilities.registry_version, "1.0.0");
  assert.equal(capabilities.validation_policy, "validated_pairs_only");
  assert.deepEqual(capabilities.source_languages, [
    { tag: "en", label: "English" }
  ]);
  assert.deepEqual(capabilities.target_languages, [
    { tag: "uk", label: "Ukrainian" }
  ]);
  assert.deepEqual(capabilities.pairs, [
    { source_language: "en", target_language: "uk" }
  ]);
  assert.deepEqual(capabilities.defaults, {
    source_language: "en",
    target_language: "uk"
  });
  const serialized = JSON.stringify(capabilities).toLowerCase();
  for (const forbidden of ["key", "secret", "billing", "account", "endpoint"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
