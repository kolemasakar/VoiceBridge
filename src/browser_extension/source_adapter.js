(function exposeSourceAdapters(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.VoiceBridgeSourceAdapters = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildApi() {
  const YOUTUBE_URL_PREFIX = "https://www.youtube.com/";

  function requireChromeApi(chromeApi) {
    if (!chromeApi?.tabs?.query || !chromeApi?.tabCapture?.getMediaStreamId) {
      throw new Error("Chromium tab capture APIs are not available.");
    }
    return chromeApi;
  }

  async function activeTab(chromeApi) {
    const [tab] = await chromeApi.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab || null;
  }

  function phase1CompatibilityCheck(tab) {
    return Boolean(
      tab?.id &&
      typeof tab.url === "string" &&
      tab.url.startsWith(YOUTUBE_URL_PREFIX)
    );
  }

  function createChromiumTabSourceAdapter(chromeApi) {
    const api = requireChromeApi(chromeApi);

    return {
      name: "chromium_tab",
      sourceKind: "BROWSER_TAB",

      async canCapture(context = {}) {
        const tab = context.tab || await activeTab(api);
        return {
          supported: phase1CompatibilityCheck(tab),
          source_kind: "BROWSER_TAB",
          source_adapter: "chromium_tab",
          capture_scope: "CURRENT_TAB"
        };
      },

      async prepare(context = {}) {
        const tab = context.tab || await activeTab(api);
        if (!phase1CompatibilityCheck(tab)) {
          throw new Error("Open a YouTube tab before starting capture.");
        }
        return {
          source_kind: "BROWSER_TAB",
          source_adapter: "chromium_tab",
          display_label: tab.title || "Current YouTube tab",
          capture_scope: "CURRENT_TAB",
          audio_available: true,
          tab_id: tab.id
        };
      },

      async start(preparedSource) {
        const tabId = preparedSource?.tab_id;
        if (!Number.isInteger(tabId) || tabId <= 0) {
          throw new Error("Prepared browser source is not valid.");
        }
        const streamId = await api.tabCapture.getMediaStreamId({
          targetTabId: tabId
        });
        if (!streamId) {
          throw new Error("Unable to acquire the current tab audio stream.");
        }
        return {
          stream_id: streamId,
          tab_id: tabId,
          source_kind: "BROWSER_TAB",
          source_adapter: "chromium_tab"
        };
      },

      async stop(_captureHandle) {
        return undefined;
      }
    };
  }

  return {
    createChromiumTabSourceAdapter
  };
});
