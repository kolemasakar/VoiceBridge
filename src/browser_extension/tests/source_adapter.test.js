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

test("Phase 1 compatibility gate accepts an active YouTube tab", async () => {
  const chrome = mockChrome({
    id: 42,
    url: "https://www.youtube.com/watch?v=voicebridge",
    title: "VoiceBridge test"
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  const capability = await adapter.canCapture();
  assert.deepEqual(capability, {
    supported: true,
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

test("Phase 1 compatibility gate preserves the existing non-YouTube error", async () => {
  const chrome = mockChrome({
    id: 7,
    url: "https://example.com/video",
    title: "Other source"
  });
  const adapter = createChromiumTabSourceAdapter(chrome.api);

  await assert.rejects(
    adapter.prepare(),
    /Open a YouTube tab before starting capture\./
  );
});

test("source adapter acquires the tab stream through tabCapture", async () => {
  const chrome = mockChrome({
    id: 88,
    url: "https://www.youtube.com/watch?v=source",
    title: "Source"
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
