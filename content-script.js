(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";
  const UNBLUR_GATED_STORAGE_KEY = "unblurGatedJobs";
  const HIDDEN_CLASS = "lkf-hidden-card";
  const UNBLURRED_CLASS = "lkf-unblurred-card";

  function getStorage() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return chrome.storage.local;
  }

  const storage = getStorage();
  const originalBlurredMarkupByCard = new WeakMap();

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
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

  function cardContainsKeyword(cardText, keywords) {
    return keywords.some((keyword) => {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escapedKeyword}\\b`);
      return regex.test(cardText);
    });
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

    return normalize(card.innerText || card.textContent || "");
  }

  function hasStatus(statusText, statusWord) {
    const escapedWord = statusWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedWord}\\b`, "i");
    return regex.test(statusText);
  }

  function hasAnyStatus(statusText, words) {
    return words.some((word) => hasStatus(statusText, word));
  }

  function ensureStyleInjected() {
    if (document.getElementById("lkf-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "lkf-style";
    style.textContent = `
      .${HIDDEN_CLASS} { display: none !important; }
      .${UNBLURRED_CLASS} {
        background: #e5e7eb !important;
        border-radius: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  function setUnblurredCards(unblurEnabled) {
    const cards = Array.from(document.querySelectorAll("li.scaffold-layout__list-item"));

    cards.forEach((card) => {
      const blurredRoot = card.querySelector(".blurred-job-card");

      if (!unblurEnabled) {
        if (!card.classList.contains(UNBLURRED_CLASS)) {
          return;
        }

        const originalMarkup = originalBlurredMarkupByCard.get(card);
        if (typeof originalMarkup === "string") {
          card.innerHTML = originalMarkup;
        }
        card.classList.remove(UNBLURRED_CLASS);
        return;
      }

      if (!blurredRoot || card.classList.contains(UNBLURRED_CLASS)) {
        return;
      }

      originalBlurredMarkupByCard.set(card, card.innerHTML);

      const wrappers = card.querySelectorAll(".blurred-job-card");
      wrappers.forEach((wrapper) => {
        const fragment = document.createDocumentFragment();
        while (wrapper.firstChild) {
          fragment.appendChild(wrapper.firstChild);
        }
        wrapper.replaceWith(fragment);
      });

      card.classList.add(UNBLURRED_CLASS);
    });
  }

  function shouldHideCard(card, settings) {
    // Never hide the currently selected job card.
    if (hasActiveJobState(card)) {
      return false;
    }

    const searchText = getCardSearchText(card);
    const statusText = getCardStatusText(card);

    const hideByKeyword =
      settings.summaryKeywords.length > 0 &&
      cardContainsKeyword(searchText, settings.summaryKeywords);
    const hideByViewed =
      settings.hideViewedJobs && hasAnyStatus(statusText, ["viewed", "visto"]);
    const hideByApplied =
      settings.hideAppliedJobs && hasAnyStatus(statusText, ["applied", "solicitados"]);

    return hideByKeyword || hideByViewed || hideByApplied;
  }

  function applyFilters(settings) {
    setUnblurredCards(settings.unblurGatedJobs);

    const cardCandidates = document.querySelectorAll(
      [
        "li[data-occludable-job-id]",
        "li.discovery-templates-entity-item",
        "li.scaffold-layout__list-item"
      ].join(", ")
    );

    const cards = Array.from(cardCandidates).filter((card) =>
      card.querySelector(".job-card-container")
    );

    cards.forEach((card) => {
      card.classList.toggle(HIDDEN_CLASS, shouldHideCard(card, settings));
    });
  }

  async function loadSettingsAndApply() {
    try {
      const result = await storage.get([
        SUMMARY_KEYWORDS_STORAGE_KEY,
        HIDE_VIEWED_STORAGE_KEY,
        HIDE_APPLIED_STORAGE_KEY,
        UNBLUR_GATED_STORAGE_KEY
      ]);

      const settings = {
        summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
        hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
        hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false),
        unblurGatedJobs: parseBoolean(result[UNBLUR_GATED_STORAGE_KEY], false)
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
        !changes[HIDE_APPLIED_STORAGE_KEY] &&
        !changes[UNBLUR_GATED_STORAGE_KEY]
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
