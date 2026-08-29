(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.VoiceBridgeLanguageUI = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeOption(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.tag !== "string" || !value.tag) return null;
    if (typeof value.label !== "string" || !value.label) return null;
    return { tag: value.tag, label: value.label };
  }

  function normalizePair(value) {
    if (!value || typeof value !== "object") return null;
    if (typeof value.source_language !== "string" || !value.source_language) {
      return null;
    }
    if (typeof value.target_language !== "string" || !value.target_language) {
      return null;
    }
    return {
      source_language: value.source_language,
      target_language: value.target_language
    };
  }

  function normalizeCapabilities(value) {
    if (!value || typeof value !== "object") {
      throw new Error("Language capabilities are not available.");
    }
    const sourceLanguages = Array.isArray(value.source_languages)
      ? value.source_languages.map(normalizeOption).filter(Boolean)
      : [];
    const targetLanguages = Array.isArray(value.target_languages)
      ? value.target_languages.map(normalizeOption).filter(Boolean)
      : [];
    const pairs = Array.isArray(value.pairs)
      ? value.pairs.map(normalizePair).filter(Boolean)
      : [];
    const defaults = normalizePair(value.defaults);
    const sourceTags = new Set(sourceLanguages.map((item) => item.tag));
    const targetTags = new Set(targetLanguages.map((item) => item.tag));
    const validPairs = pairs.filter((pair) =>
      sourceTags.has(pair.source_language) &&
      targetTags.has(pair.target_language)
    );
    if (!sourceLanguages.length || !targetLanguages.length || !validPairs.length) {
      throw new Error("Cloud returned no validated language pairs.");
    }
    const defaultPair = defaults && validPairs.some((pair) =>
      pair.source_language === defaults.source_language &&
      pair.target_language === defaults.target_language
    ) ? defaults : validPairs[0];
    return {
      registry_version: typeof value.registry_version === "string"
        ? value.registry_version
        : "unknown",
      validation_policy: value.validation_policy,
      source_languages: sourceLanguages,
      target_languages: targetLanguages,
      pairs: validPairs,
      defaults: defaultPair
    };
  }

  function isValidatedPair(capabilities, sourceLanguage, targetLanguage) {
    return capabilities.pairs.some((pair) =>
      pair.source_language === sourceLanguage &&
      pair.target_language === targetLanguage
    );
  }

  function chooseSelection(capabilities, savedSource, savedTarget) {
    if (savedSource && savedTarget &&
      isValidatedPair(capabilities, savedSource, savedTarget)) {
      return {
        source_language: savedSource,
        target_language: savedTarget
      };
    }
    return { ...capabilities.defaults };
  }

  function targetOptions(capabilities, sourceLanguage) {
    const allowed = new Set(
      capabilities.pairs
        .filter((pair) => pair.source_language === sourceLanguage)
        .map((pair) => pair.target_language)
    );
    return capabilities.target_languages.filter((item) => allowed.has(item.tag));
  }

  function fillSelect(select, options, selected) {
    select.replaceChildren();
    for (const item of options) {
      const option = select.ownerDocument.createElement("option");
      option.value = item.tag;
      option.textContent = item.label;
      option.selected = item.tag === selected;
      select.append(option);
    }
  }

  function attach({ chromeApi = chrome, documentRef = document } = {}) {
    const sourceSelect = documentRef.querySelector("#source-language");
    const targetSelect = documentRef.querySelector("#target-language");
    const detail = documentRef.querySelector("#language-detail");
    const start = documentRef.querySelector("#start");
    const error = documentRef.querySelector("#error");
    if (!sourceSelect || !targetSelect || !detail || !start) return null;

    let capabilities = null;
    let ready = false;
    sourceSelect.disabled = true;
    targetSelect.disabled = true;

    function setReady(value) {
      ready = value;
      sourceSelect.disabled = !value;
      targetSelect.disabled = !value;
      if (!value) start.disabled = true;
    }

    async function saveSelection() {
      if (!capabilities || !isValidatedPair(
        capabilities,
        sourceSelect.value,
        targetSelect.value
      )) {
        throw new Error("Select a validated language pair.");
      }
      await chromeApi.storage.local.set({
        source_language: sourceSelect.value,
        target_language: targetSelect.value
      });
    }

    async function refresh() {
      setReady(false);
      detail.textContent = "Loading validated languages from VoiceBridge Cloud...";
      try {
        const response = await chromeApi.runtime.sendMessage({
          target: "service_worker",
          type: "GET_LANGUAGE_CAPABILITIES"
        });
        if (!response?.ok) {
          throw new Error(response?.error || "Unable to load language capabilities.");
        }
        capabilities = normalizeCapabilities(response.capabilities);
        const saved = await chromeApi.storage.local.get([
          "source_language",
          "target_language"
        ]);
        const selection = chooseSelection(
          capabilities,
          saved.source_language,
          saved.target_language
        );
        fillSelect(
          sourceSelect,
          capabilities.source_languages,
          selection.source_language
        );
        fillSelect(
          targetSelect,
          targetOptions(capabilities, selection.source_language),
          selection.target_language
        );
        await saveSelection();
        detail.textContent =
          "Validated by cloud registry " + capabilities.registry_version + ".";
        setReady(true);
      } catch (cause) {
        capabilities = null;
        detail.textContent = cause.message;
        setReady(false);
      }
    }

    sourceSelect.addEventListener("change", async () => {
      if (!capabilities) return;
      const targets = targetOptions(capabilities, sourceSelect.value);
      fillSelect(targetSelect, targets, targets[0]?.tag || "");
      try {
        await saveSelection();
      } catch (cause) {
        if (error) error.textContent = cause.message;
      }
    });

    targetSelect.addEventListener("change", () => {
      saveSelection().catch((cause) => {
        if (error) error.textContent = cause.message;
      });
    });

    start.addEventListener("click", (event) => {
      if (ready) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (error) {
        error.textContent = "Validated language capabilities must load before capture.";
      }
    }, true);

    chromeApi.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" &&
        (changes.test_access_token || changes.cloud_api_url)) {
        refresh().catch(() => undefined);
      }
    });

    refresh().catch(() => undefined);
    return { refresh };
  }

  return {
    normalizeCapabilities,
    chooseSelection,
    targetOptions,
    isValidatedPair,
    attach
  };
});

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  VoiceBridgeLanguageUI.attach();
}
