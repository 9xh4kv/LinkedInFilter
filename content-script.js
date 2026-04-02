(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";
  const HIDDEN_CLASS = "lkf-hidden-card";

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

  function cardContainsKeyword(cardText, keywords) {
    const normalizedCardText = normalize(cardText);
    return keywords.some((keyword) => normalizedCardText.includes(keyword));
  }

  function getCardSearchText(card) {
    const title = card.querySelector(".job-card-list__title, .job-card-container__link");
    const company = card.querySelector(".artdeco-entity-lockup__subtitle");
    const location = card.querySelector(".job-card-container__metadata-wrapper li");

    return [
      title ? title.textContent : "",
      company ? company.textContent : "",
      location ? location.textContent : ""
    ].join(" ");
  }

  function hasActiveJobState(card) {
    return Boolean(
      card.matches(".jobs-search-results-list__list-item--active") ||
        card.querySelector(".jobs-search-results-list__list-item--active") ||
        card.querySelector("[aria-current='page']") ||
        card.getAttribute("aria-current") === "page"
    );
  }

  function getCardStatusText(card) {
    const statusNodes = card.querySelectorAll(
      [
        ".job-card-container__footer-item",
        ".job-card-container__footer-job-state",
        ".job-card-list__footer-wrapper",
        ".job-card-container__footer-wrapper",
        "[aria-label*='Viewed' i]",
        "[aria-label*='Applied' i]"
      ].join(", ")
    );

    const statusText = Array.from(statusNodes)
      .map((node) => normalize(node.textContent || node.getAttribute("aria-label")))
      .join(" ")
      .trim();

    if (statusText) {
      return statusText;
    }

    // Fallback for LinkedIn UI variants where status is not in the usual footer classes.
    return normalize(card.innerText || card.textContent || "");
  }

  function hasStatus(statusText, statusWord) {
    const escapedWord = statusWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
    return regex.test(statusText);
  }

  function ensureStyleInjected() {
    if (document.getElementById("lkf-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "lkf-style";
    style.textContent = `.${HIDDEN_CLASS} { display: none !important; }`;
    document.head.appendChild(style);
  }

  function shouldHideCard(card, settings) {
    const searchText = getCardSearchText(card);
    const statusText = getCardStatusText(card);

    const hideByKeyword =
      settings.summaryKeywords.length > 0 &&
      cardContainsKeyword(searchText, settings.summaryKeywords);
    const hideByViewed = settings.hideViewedJobs && hasStatus(statusText, "viewed");
    const hideByApplied = settings.hideAppliedJobs && hasStatus(statusText, "applied");

    return hideByKeyword || hideByViewed || hideByApplied;
  }

  function applyFilters(settings) {
    const cards = document.querySelectorAll("li[data-occludable-job-id]");

    cards.forEach((card) => {
      card.classList.toggle(HIDDEN_CLASS, shouldHideCard(card, settings));
    });
  }

  async function loadSettingsAndApply() {
    try {
      const result = await storage.get([
        SUMMARY_KEYWORDS_STORAGE_KEY,
        HIDE_VIEWED_STORAGE_KEY,
        HIDE_APPLIED_STORAGE_KEY
      ]);

      const settings = {
        summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
        hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
        hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false)
      };

      applyFilters(settings);
    } catch (error) {
      console.error("LinkedIn filter: failed to load settings", error);
    }
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      loadSettingsAndApply();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function setupStorageListener() {
    const onChanged = (changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (
        !changes[SUMMARY_KEYWORDS_STORAGE_KEY] &&
        !changes[HIDE_VIEWED_STORAGE_KEY] &&
        !changes[HIDE_APPLIED_STORAGE_KEY]
      ) {
        return;
      }

      loadSettingsAndApply();
    };

    if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(onChanged);
    } else if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(onChanged);
    }
  }

  ensureStyleInjected();
  loadSettingsAndApply();
  setupObserver();
  setupStorageListener();
})();
