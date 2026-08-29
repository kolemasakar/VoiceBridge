(function exposeSourceAdapters(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.VoiceBridgeSourceAdapters = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function buildApi() {
  const CAPTURABLE_PROTOCOLS = new Set(["http:", "https:"]);

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

  function tabProtocol(tab) {
    if (typeof tab?.url !== "string") return null;
    try {
      return new URL(tab.url).protocol;
    } catch {
      return null;
    }
  }

  function inspectTab(tab) {
    if (!Number.isInteger(tab?.id) || tab.id <= 0) {
      return {
        supported: false,
        reason: "NO_ACTIVE_TAB",
        message: "No capturable active browser tab was found."
      };
    }

    if (!CAPTURABLE_PROTOCOLS.has(tabProtocol(tab))) {
      return {
        supported: false,
        reason: "UNSUPPORTED_TAB",
        message: "The current tab cannot be captured. Open an HTTP or HTTPS page with audio."
      };
    }

    if (tab.audible !== true) {
      return {
        supported: false,
        reason: "TAB_NOT_AUDIBLE",
        message: "Start audio in the current tab before starting capture."
      };
    }

    return {
      supported: true,
      reason: null,
      message: null
    };
  }

  function createChromiumTabSourceAdapter(chromeApi) {
    const api = requireChromeApi(chromeApi);

    return {
      name: "chromium_tab",
      sourceKind: "BROWSER_TAB",

      async canCapture(context = {}) {
        const tab = context.tab || await activeTab(api);
        const capability = inspectTab(tab);
        return {
          ...capability,
          source_kind: "BROWSER_TAB",
          source_adapter: "chromium_tab",
          capture_scope: "CURRENT_TAB"
        };
      },

      async prepare(context = {}) {
        const tab = context.tab || await activeTab(api);
        const capability = inspectTab(tab);
        if (!capability.supported) {
          throw new Error(capability.message);
        }
        return {
          source_kind: "BROWSER_TAB",
          source_adapter: "chromium_tab",
          display_label: tab.title || "Current browser tab",
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
