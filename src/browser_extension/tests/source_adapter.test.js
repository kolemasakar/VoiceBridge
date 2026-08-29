const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createChromiumTabSourceAdapter
} = require("../source_adapter.js");

function mockChrome(tab, streamId = "stream-123") {
  const calls = {
    queries: [],
    streamRequests: []
  };
  return {
    calls,
    api: {
      tabs: {
        async query(options) {
          calls.queries.push(options);
          return tab ? [tab] : [];
        }
      },
      tabCapture: {
        async getMediaStreamId(options) {
          calls.streamRequests.push(options);
          return streamId;
        }
      }
    }
  };
}

test("generic source adapter accepts an audible active YouTube tab", async () => {
  const chrome = mockChrome({
    id: 42,
    url: "https://www.youtube.com/watch?v=voicebridge",
    title: "VoiceBridge test",
    audible: true
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  const capability = await adapter.canCapture();
  assert.deepEqual(capability, {
    supported: true,
    reason: null,
    message: null,
    source_kind: "BROWSER_TAB",
    source_adapter: "chromium_tab",
    capture_scope: "CURRENT_TAB"
  });

  const prepared = await adapter.prepare();
  assert.equal(prepared.tab_id, 42);
  assert.equal(prepared.source_kind, "BROWSER_TAB");
  assert.equal(prepared.source_adapter, "chromium_tab");
  assert.equal(prepared.display_label, "VoiceBridge test");
  assert.equal(prepared.audio_available, true);
  assert.deepEqual(chrome.calls.queries[0], {
    active: true,
    currentWindow: true
  });
});

test("generic source adapter accepts an audible non-YouTube web tab", async () => {
  const chrome = mockChrome({
    id: 7,
    url: "https://example.com/podcast",
    title: "Other audio source",
    audible: true
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  const capability = await adapter.canCapture();
  assert.equal(capability.supported, true);
  const prepared = await adapter.prepare();
  assert.equal(prepared.tab_id, 7);
  assert.equal(prepared.display_label, "Other audio source");
});

test("generic source adapter rejects restricted browser pages with actionable error", async () => {
  const chrome = mockChrome({
    id: 8,
    url: "chrome://settings/",
    title: "Settings",
    audible: true
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  const capability = await adapter.canCapture();
  assert.equal(capability.supported, false);
  assert.equal(capability.reason, "UNSUPPORTED_TAB");
  await assert.rejects(
    adapter.prepare(),
    /Open an HTTP or HTTPS page with audio\./
  );
});

test("generic source adapter rejects silent web tabs with actionable error", async () => {
  const chrome = mockChrome({
    id: 9,
    url: "https://example.com/silent",
    title: "Silent source",
    audible: false
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  const capability = await adapter.canCapture();
  assert.equal(capability.supported, false);
  assert.equal(capability.reason, "TAB_NOT_AUDIBLE");
  await assert.rejects(
    adapter.prepare(),
    /Start audio in the current tab before starting capture\./
  );
});

test("source adapter acquires the tab stream through tabCapture", async () => {
  const chrome = mockChrome({
    id: 88,
    url: "https://example.com/source",
    title: "Source",
    audible: true
  }, "voicebridge-stream");
  const adapter = createChromiumTabSourceAdapter(chrome.api);
  const prepared = await adapter.prepare();
  const handle = await adapter.start(prepared);

  assert.deepEqual(chrome.calls.streamRequests, [{ targetTabId: 88 }]);
  assert.deepEqual(handle, {
    stream_id: "voicebridge-stream",
    tab_id: 88,
    source_kind: "BROWSER_TAB",
    source_adapter: "chromium_tab"
  });
});

test("source adapter rejects invalid prepared state before tabCapture", async () => {
  const chrome = mockChrome(null);
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  await assert.rejects(
    adapter.start({ tab_id: null }),
    /Prepared browser source is not valid\./
  );
  assert.equal(chrome.calls.streamRequests.length, 0);
});

test("source adapter requires Chromium tab capture APIs", () => {
  assert.throws(
    () => createChromiumTabSourceAdapter({ tabs: { query: async () => [] } }),
    /Chromium tab capture APIs are not available\./
  );
});
