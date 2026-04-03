(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";
  const UNBLUR_GATED_STORAGE_KEY = "unblurGatedJobs";

  const summaryForm = document.getElementById("keyword-form");
  const summaryInput = document.getElementById("keyword-input");
  const summaryList = document.getElementById("keyword-list");
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

  async function getSettings() {
    const result = await storage.get([
      SUMMARY_KEYWORDS_STORAGE_KEY,
      HIDE_VIEWED_STORAGE_KEY,
      HIDE_APPLIED_STORAGE_KEY,
      UNBLUR_GATED_STORAGE_KEY
    ]);

    return {
      summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
      hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
      hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false),
      unblurGatedJobs: parseBoolean(result[UNBLUR_GATED_STORAGE_KEY], false)
    };
  }

  async function saveKeywords(storageKey, keywords) {
    await storage.set({ [storageKey]: parseKeywords(keywords) });
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
      toggleViewed.checked = settings.hideViewedJobs;
      toggleApplied.checked = settings.hideAppliedJobs;
      toggleUnblurred.checked = settings.unblurGatedJobs;
    })
    .catch((error) => {
      console.error("LinkedIn filter popup failed", error);
    });
})();
