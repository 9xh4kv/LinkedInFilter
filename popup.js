(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";

  const summaryForm = document.getElementById("keyword-form");
  const summaryInput = document.getElementById("keyword-input");
  const summaryList = document.getElementById("keyword-list");
  const toggleViewed = document.getElementById("toggle-viewed");
  const toggleApplied = document.getElementById("toggle-applied");

  function getStorage() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return chrome.storage.local;
  }

  const storage = getStorage();

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function parseKeywords(rawKeywords) {
    if (!Array.isArray(rawKeywords)) {
      return [];
    }

    return rawKeywords
      .map(normalize)
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);
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
      HIDE_APPLIED_STORAGE_KEY
    ]);

    return {
      summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
      hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
      hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false)
    };
  }

  async function saveKeywords(storageKey, keywords) {
    await storage.set({ [storageKey]: parseKeywords(keywords) });
  }

  async function saveToggleSetting(storageKey, value) {
    await storage.set({ [storageKey]: Boolean(value) });
  }

  function renderKeywords(listElement, keywords) {
    listElement.innerHTML = "";

    if (!keywords.length) {
      const empty = document.createElement("li");
      empty.className = "keyword-item";
      empty.textContent = "No keywords yet.";
      listElement.appendChild(empty);
      return;
    }

    keywords.forEach((keyword) => {
      const item = document.createElement("li");
      item.className = "keyword-item";

      const text = document.createElement("span");
      text.textContent = keyword;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "remove";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", async () => {
        const settings = await getSettings();
        const current = settings.summaryKeywords;
        const updated = current.filter((value) => value !== keyword);
        await saveKeywords(SUMMARY_KEYWORDS_STORAGE_KEY, updated);
        renderKeywords(listElement, updated);
      });

      item.appendChild(text);
      item.appendChild(removeButton);
      listElement.appendChild(item);
    });
  }

  summaryForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newKeyword = normalize(summaryInput.value);
    if (!newKeyword) {
      return;
    }

    const settings = await getSettings();
    const current = settings.summaryKeywords;
    const updated = parseKeywords([...current, newKeyword]);
    await saveKeywords(SUMMARY_KEYWORDS_STORAGE_KEY, updated);
    renderKeywords(summaryList, updated);
    summaryInput.value = "";
    summaryInput.focus();
  });

  toggleViewed.addEventListener("change", async () => {
    await saveToggleSetting(HIDE_VIEWED_STORAGE_KEY, toggleViewed.checked);
  });

  toggleApplied.addEventListener("change", async () => {
    await saveToggleSetting(HIDE_APPLIED_STORAGE_KEY, toggleApplied.checked);
  });

  getSettings()
    .then((settings) => {
      renderKeywords(summaryList, settings.summaryKeywords);
      toggleViewed.checked = settings.hideViewedJobs;
      toggleApplied.checked = settings.hideAppliedJobs;
    })
    .catch((error) => {
      console.error("LinkedIn filter popup failed", error);
    });
})();
