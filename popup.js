(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIGHLIGHT_KEYWORDS_STORAGE_KEY = "highlightKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";
  const UNBLUR_GATED_STORAGE_KEY = "unblurGatedJobs";
  const DEFAULT_HIGHLIGHT_COLOR = "#fff2a8";
  const HIGHLIGHT_COLOR_OPTIONS = [
    { value: "#fff2a8", label: "Yellow" },
    { value: "#ffd6a5", label: "Peach" },
    { value: "#ffadad", label: "Coral" },
    { value: "#caffbf", label: "Mint" },
    { value: "#a0c4ff", label: "Sky" },
    { value: "#bdb2ff", label: "Lavender" },
    { value: "#9bf6ff", label: "Cyan" },
    { value: "#fdffb6", label: "Lemon" }
  ];

  const summaryForm = document.getElementById("keyword-form");
  const summaryInput = document.getElementById("keyword-input");
  const summaryList = document.getElementById("keyword-list");
  const highlightForm = document.getElementById("highlight-form");
  const highlightInput = document.getElementById("highlight-input");
  const highlightColorPicker = document.getElementById("highlight-color-picker");
  const highlightList = document.getElementById("highlight-list");
  const toggleViewed = document.getElementById("toggle-viewed");
  const toggleApplied = document.getElementById("toggle-applied");
  const toggleUnblurred = document.getElementById("toggle-unblurred");

  function getStorage() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return chrome.storage.local;
  }

  const storage = getStorage();

  function normalizeColor(color) {
    const value = String(color || "").trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      return DEFAULT_HIGHLIGHT_COLOR;
    }

    const normalized = value.toLowerCase();
    const isAllowed = HIGHLIGHT_COLOR_OPTIONS.some((option) => option.value === normalized);
    return isAllowed ? normalized : DEFAULT_HIGHLIGHT_COLOR;
  }

  function closeAllColorPickers(exceptPicker) {
    document.querySelectorAll(".color-picker.is-open").forEach((picker) => {
      if (exceptPicker && picker === exceptPicker) {
        return;
      }
      picker.classList.remove("is-open");
    });
  }

  function parseKeywords(rawKeywords) {
    if (!Array.isArray(rawKeywords)) {
      return [];
    }

    const cleaned = rawKeywords.map((kw) => String(kw || "").trim()).filter(Boolean);
    
    const seen = new Set();
    return cleaned.filter((keyword) => {
      if (seen.has(keyword)) {
        return false;
      }
      seen.add(keyword);
      return true;
    });
  }

  function parseBoolean(value, fallback) {
    if (typeof value === "boolean") {
      return value;
    }
    return fallback;
  }

  function parseHighlightKeywords(rawKeywords) {
    if (!Array.isArray(rawKeywords)) {
      return [];
    }

    const byKeyword = new Map();

    rawKeywords.forEach((entry) => {
      const keyword =
        typeof entry === "string"
          ? String(entry || "").trim()
          : String(entry && entry.keyword ? entry.keyword : "").trim();

      if (!keyword) {
        return;
      }

      const color =
        typeof entry === "string"
          ? DEFAULT_HIGHLIGHT_COLOR
          : normalizeColor(entry.color);

      byKeyword.set(keyword.toLowerCase(), { keyword, color });
    });

    return Array.from(byKeyword.values());
  }

  function getSelectedHighlightColor() {
    if (!highlightColorPicker) {
      return DEFAULT_HIGHLIGHT_COLOR;
    }

    const selectedColor = highlightColorPicker.dataset.value;
    return normalizeColor(selectedColor);
  }

  function createColorPicker(selectedColor, ariaLabel, onColorChange, isLarge = false) {
    const picker = document.createElement("div");
    picker.className = `color-picker${isLarge ? " color-picker--large" : ""}`;

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "color-picker__trigger";
    trigger.setAttribute("aria-label", ariaLabel);

    const menu = document.createElement("div");
    menu.className = "color-picker__menu";

    HIGHLIGHT_COLOR_OPTIONS.forEach((option) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "color-picker__option";
      swatch.style.backgroundColor = option.value;
      swatch.setAttribute("aria-label", option.label);
      swatch.dataset.value = option.value;

      swatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setColorPickerValue(picker, option.value);
        onColorChange(normalizeColor(option.value));
      });

      menu.appendChild(swatch);
    });

    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = picker.classList.contains("is-open");
      closeAllColorPickers(picker);
      picker.classList.toggle("is-open", !isOpen);
    });

    picker.appendChild(trigger);
    picker.appendChild(menu);
    setColorPickerValue(picker, selectedColor);

    return picker;
  }

  function setColorPickerValue(picker, color) {
    const normalized = normalizeColor(color);
    picker.dataset.value = normalized;

    const trigger = picker.querySelector(".color-picker__trigger");
    if (trigger) {
      trigger.style.backgroundColor = normalized;
    }

    picker.querySelectorAll(".color-picker__option").forEach((option) => {
      option.classList.toggle("is-selected", normalizeColor(option.dataset.value) === normalized);
    });
  }

  function initAddColorPicker() {
    if (!highlightColorPicker) {
      return;
    }

    const picker = createColorPicker(
      DEFAULT_HIGHLIGHT_COLOR,
      "Highlight color",
      (color) => setColorPickerValue(highlightColorPicker, color),
      true
    );

    highlightColorPicker.replaceWith(picker);
    picker.id = "highlight-color-picker";
  }

  async function getSettings() {
    const result = await storage.get([
      SUMMARY_KEYWORDS_STORAGE_KEY,
      HIGHLIGHT_KEYWORDS_STORAGE_KEY,
      HIDE_VIEWED_STORAGE_KEY,
      HIDE_APPLIED_STORAGE_KEY,
      UNBLUR_GATED_STORAGE_KEY
    ]);

    return {
      summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
      highlightKeywords: parseHighlightKeywords(result[HIGHLIGHT_KEYWORDS_STORAGE_KEY]),
      hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
      hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false),
      unblurGatedJobs: parseBoolean(result[UNBLUR_GATED_STORAGE_KEY], false)
    };
  }

  async function saveKeywords(storageKey, keywords) {
    await storage.set({ [storageKey]: parseKeywords(keywords) });
  }

  async function saveHighlightKeywords(keywords) {
    await storage.set({ [HIGHLIGHT_KEYWORDS_STORAGE_KEY]: parseHighlightKeywords(keywords) });
  }

  async function saveToggleSetting(storageKey, value) {
    await storage.set({ [storageKey]: Boolean(value) });
  }

  async function removeSummaryKeyword(keyword) {
    const settings = await getSettings();
    const updated = settings.summaryKeywords.filter((value) => value !== keyword);
    await saveKeywords(SUMMARY_KEYWORDS_STORAGE_KEY, updated);
    renderKeywords(summaryList, updated, removeSummaryKeyword);
  }

  async function removeHighlightKeyword(keyword) {
    const settings = await getSettings();
    const target = String(keyword || "").toLowerCase();
    const updated = settings.highlightKeywords.filter((entry) => entry.keyword.toLowerCase() !== target);
    await saveHighlightKeywords(updated);
    renderHighlightKeywords(highlightList, updated, removeHighlightKeyword, updateHighlightKeywordColor);
  }

  async function updateHighlightKeywordColor(keyword, color) {
    const settings = await getSettings();
    const target = String(keyword || "").toLowerCase();
    const updated = settings.highlightKeywords.map((entry) => {
      if (entry.keyword.toLowerCase() !== target) {
        return entry;
      }

      return {
        keyword: entry.keyword,
        color: normalizeColor(color)
      };
    });

    await saveHighlightKeywords(updated);
  }

  function renderKeywords(listElement, keywords, onRemove) {
    listElement.innerHTML = "";

    if (!keywords.length) {
      const empty = document.createElement("li");
      empty.className = "keyword-item";
      empty.textContent = "No keywords yet.";
      listElement.appendChild(empty);
      return;
    }

    [...keywords].reverse().forEach((keyword) => {
      const item = document.createElement("li");
      item.className = "keyword-item";

      const text = document.createElement("span");
      text.textContent = keyword;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", async () => {
        await onRemove(keyword);
      });

      item.appendChild(text);
      item.appendChild(removeButton);
      listElement.appendChild(item);
    });
  }

  function renderHighlightKeywords(listElement, entries, onRemove, onColorChange) {
    listElement.innerHTML = "";

    if (!entries.length) {
      const empty = document.createElement("li");
      empty.className = "keyword-item";
      empty.textContent = "No highlight keywords yet.";
      listElement.appendChild(empty);
      return;
    }

    [...entries].reverse().forEach((entry) => {
      const item = document.createElement("li");
      item.className = "keyword-item";

      const text = document.createElement("span");
      text.className = "keyword-item__text";
      text.textContent = entry.keyword;

      const actions = document.createElement("div");
      actions.className = "keyword-item__actions";

      const colorPicker = createColorPicker(
        entry.color,
        `Highlight color for ${entry.keyword}`,
        async (color) => {
          await onColorChange(entry.keyword, color);
        }
      );

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", async () => {
        await onRemove(entry.keyword);
      });

      actions.appendChild(colorPicker);
      actions.appendChild(removeButton);
      item.appendChild(text);
      item.appendChild(actions);
      listElement.appendChild(item);
    });
  }

  summaryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newKeyword = summaryInput.value.trim();
    if (!newKeyword) {
      return;
    }

    const settings = await getSettings();
    const current = settings.summaryKeywords;
    const updated = parseKeywords([...current, newKeyword]);
    await saveKeywords(SUMMARY_KEYWORDS_STORAGE_KEY, updated);
    renderKeywords(summaryList, updated, removeSummaryKeyword);
    summaryInput.value = "";
    summaryInput.focus();
  });

  highlightForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newKeyword = highlightInput.value.trim();
    if (!newKeyword) {
      return;
    }

    const settings = await getSettings();
    const current = settings.highlightKeywords;
    const updated = parseHighlightKeywords([
      ...current,
      {
        keyword: newKeyword,
        color: getSelectedHighlightColor()
      }
    ]);

    await saveHighlightKeywords(updated);
    renderHighlightKeywords(highlightList, updated, removeHighlightKeyword, updateHighlightKeywordColor);
    highlightInput.value = "";
    highlightInput.focus();
  });

  toggleViewed.addEventListener("change", async () => {
    await saveToggleSetting(HIDE_VIEWED_STORAGE_KEY, toggleViewed.checked);
  });

  toggleApplied.addEventListener("change", async () => {
    await saveToggleSetting(HIDE_APPLIED_STORAGE_KEY, toggleApplied.checked);
  });

  toggleUnblurred.addEventListener("change", async () => {
    await saveToggleSetting(UNBLUR_GATED_STORAGE_KEY, toggleUnblurred.checked);
  });

  getSettings()
    .then((settings) => {
      renderKeywords(summaryList, settings.summaryKeywords, removeSummaryKeyword);
      renderHighlightKeywords(
        highlightList,
        settings.highlightKeywords,
        removeHighlightKeyword,
        updateHighlightKeywordColor
      );
      initAddColorPicker();
      toggleViewed.checked = settings.hideViewedJobs;
      toggleApplied.checked = settings.hideAppliedJobs;
      toggleUnblurred.checked = settings.unblurGatedJobs;
    })
    .catch((error) => {
      console.error("LinkedIn filter popup failed", error);
    });

  document.addEventListener("click", () => {
    closeAllColorPickers();
  });
})();
