(function () {
  const SUMMARY_KEYWORDS_STORAGE_KEY = "blockedKeywords";
  const HIGHLIGHT_KEYWORDS_STORAGE_KEY = "highlightKeywords";
  const HIDE_VIEWED_STORAGE_KEY = "hideViewedJobs";
  const HIDE_APPLIED_STORAGE_KEY = "hideAppliedJobs";
  const UNBLUR_GATED_STORAGE_KEY = "unblurGatedJobs";
  const HIDDEN_CLASS = "lkf-hidden-card";
  const UNBLURRED_CLASS = "lkf-unblurred-card";
  const HIGHLIGHT_WORD_CLASS = "lkf-highlight-word";
  const DEFAULT_HIGHLIGHT_COLOR = "#fff2a8";

  function getStorage() {
    if (typeof browser !== "undefined" && browser.storage && browser.storage.local) {
      return browser.storage.local;
    }
    return chrome.storage.local;
  }

  const storage = getStorage();
  const originalBlurredMarkupByCard = new WeakMap();
  let currentSettings = {
    summaryKeywords: [],
    highlightKeywords: [],
    hideViewedJobs: false,
    hideAppliedJobs: false,
    unblurGatedJobs: false
  };
  let previousSummaryKeywords = [];
  let applyTimer = null;
  let isApplyingFilters = false;

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

  function normalizeColor(color) {
    const value = String(color || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : DEFAULT_HIGHLIGHT_COLOR;
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

  function foldText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/\p{M}+/gu, "")
      .toLowerCase();
  }

  function getHighlightMatcher(highlightKeywords) {
    if (!Array.isArray(highlightKeywords) || !highlightKeywords.length) {
      return null;
    }

    const colorByKeyword = new Map();
    highlightKeywords.forEach((entry) => {
      const foldedKeyword = foldText(entry.keyword).trim();
      if (!foldedKeyword) {
        return;
      }
      colorByKeyword.set(foldedKeyword, normalizeColor(entry.color));
    });

    if (!colorByKeyword.size) {
      return null;
    }

    return {
      colorByKeyword
    };
  }

  function clearWordHighlights(scope) {
    scope.querySelectorAll(`.${HIGHLIGHT_WORD_CLASS}`).forEach((node) => {
      node.replaceWith(document.createTextNode(node.textContent || ""));
    });
  }

  function highlightWordsInTextNode(textNode, matcher) {
    const text = textNode.textContent || "";
    if (!text) {
      return;
    }

    const wordRegex = /[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*/gu;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let hasHighlight = false;
    let match = null;

    while ((match = wordRegex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const foldedWord = foldText(match[0]);
      const color = matcher.colorByKeyword.get(foldedWord);

      if (!color) {
        continue;
      }

      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const highlight = document.createElement("span");
      highlight.className = HIGHLIGHT_WORD_CLASS;
      highlight.textContent = match[0];
      highlight.style.setProperty("background-color", color, "important");
      fragment.appendChild(highlight);

      lastIndex = end;
      hasHighlight = true;
    }

    if (!hasHighlight) {
      return;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    textNode.replaceWith(fragment);
  }

  function highlightWordsInElement(rootElement, matcher) {
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node.parentElement.closest(`.${HIGHLIGHT_WORD_CLASS}`)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(node.parentElement.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }

        if (!(node.textContent || "").trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const textNodes = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      textNodes.push(currentNode);
    }

    textNodes.forEach((node) => {
      highlightWordsInTextNode(node, matcher);
    });
  }

  function applyKeywordWordHighlights(card, highlightKeywords) {
    clearWordHighlights(card);

    const matcher = getHighlightMatcher(highlightKeywords);
    if (!matcher) {
      return;
    }

    const highlightTargets = card.querySelectorAll(
      [
        ".job-card-list__title",
        ".job-card-container__link",
        ".artdeco-entity-lockup__subtitle",
        ".job-card-container__metadata-wrapper li",
        ".blurred-job-card__job-posting-title",
        ".blurred-job-card__primary-description",
        ".blurred-job-card__secondary-description"
      ].join(", ")
    );

    highlightTargets.forEach((element) => {
      highlightWordsInElement(element, matcher);
    });
  }

  function applyKeywordWordHighlightsInDetails(highlightKeywords) {
    const detailContainers = document.querySelectorAll(
      ".jobs-search__job-details--container, .scaffold-layout__detail"
    );

    const matcher = getHighlightMatcher(highlightKeywords);

    detailContainers.forEach((container) => {
      clearWordHighlights(container);

      if (!matcher) {
        return;
      }

      const detailTargets = container.querySelectorAll(
        [
          ".job-details-jobs-unified-top-card__job-title",
          ".job-details-jobs-unified-top-card__company-name",
          ".job-details-jobs-unified-top-card__tertiary-description-container",
          ".jobs-description__content",
          ".jobs-company__box"
        ].join(", ")
      );

      detailTargets.forEach((element) => {
        highlightWordsInElement(element, matcher);
      });
    });
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
      .${HIGHLIGHT_WORD_CLASS} {
        color: inherit !important;
        font: inherit !important;
        font-family: inherit !important;
        font-size: inherit !important;
        font-style: inherit !important;
        font-weight: inherit !important;
        letter-spacing: inherit !important;
        line-height: inherit !important;
        text-decoration: inherit !important;
        border-radius: 0;
        padding: 0;
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

  function getCardHideDecision(card, settings) {
    const searchText = getCardSearchText(card);
    const statusText = getCardStatusText(card);

    const hideByKeyword =
      settings.summaryKeywords.length > 0 &&
      cardContainsKeyword(searchText, settings.summaryKeywords);
    const hideByViewed =
      settings.hideViewedJobs && hasAnyStatus(statusText, ["viewed", "visto"]);
    const hideByApplied =
      settings.hideAppliedJobs && hasAnyStatus(statusText, ["applied", "solicitados"]);
    const isActive = hasActiveJobState(card);

    // Active jobs are only force-hidden when a hide keyword matches.
    if (isActive && !hideByKeyword) {
      return {
        hideByKeyword,
        hideByViewed,
        hideByApplied,
        shouldHide: false
      };
    }

    return {
      hideByKeyword,
      hideByViewed,
      hideByApplied,
      shouldHide: hideByKeyword || hideByViewed || hideByApplied
    };
  }

  function focusNextVisibleCard(cards, decisions, startIndex) {
    for (let index = startIndex + 1; index < cards.length; index += 1) {
      if (decisions[index].shouldHide) {
        continue;
      }

      const card = cards[index];
      const clickable = card.querySelector(
        ".job-card-list__title, .job-card-container__link, a[href*='/jobs/view/']"
      );

      if (clickable && typeof clickable.click === "function") {
        clickable.click();
        return true;
      }

      if (typeof card.click === "function") {
        card.click();
        return true;
      }
    }

    return false;
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

    const decisions = cards.map((card) => getCardHideDecision(card, settings));

    // Only trigger focus change if keywords have changed (not just other settings).
    const keywordsChanged = JSON.stringify(settings.summaryKeywords) !== JSON.stringify(previousSummaryKeywords);
    const activeCardIndexToReplace = keywordsChanged
      ? decisions.findIndex(
          (decision, index) => decision.hideByKeyword && hasActiveJobState(cards[index])
        )
      : -1;

    if (activeCardIndexToReplace !== -1) {
      focusNextVisibleCard(cards, decisions, activeCardIndexToReplace);
    }

    cards.forEach((card, index) => {
      applyKeywordWordHighlights(card, settings.highlightKeywords);
      card.classList.toggle(HIDDEN_CLASS, decisions[index].shouldHide);
    });

    applyKeywordWordHighlightsInDetails(settings.highlightKeywords);
  }

  function scheduleApplyFilters() {
    if (applyTimer !== null) {
      return;
    }

    applyTimer = setTimeout(() => {
      applyTimer = null;
      isApplyingFilters = true;
      try {
        applyFilters(currentSettings);
        previousSummaryKeywords = JSON.parse(JSON.stringify(currentSettings.summaryKeywords));
      } finally {
        isApplyingFilters = false;
      }
    }, 50);
  }

  function parseSettingsFromStorage(result) {
    return {
      summaryKeywords: parseKeywords(result[SUMMARY_KEYWORDS_STORAGE_KEY]),
      highlightKeywords: parseHighlightKeywords(result[HIGHLIGHT_KEYWORDS_STORAGE_KEY]),
      hideViewedJobs: parseBoolean(result[HIDE_VIEWED_STORAGE_KEY], false),
      hideAppliedJobs: parseBoolean(result[HIDE_APPLIED_STORAGE_KEY], false),
      unblurGatedJobs: parseBoolean(result[UNBLUR_GATED_STORAGE_KEY], false)
    };
  }

  async function loadSettings() {
    try {
      const result = await storage.get([
        SUMMARY_KEYWORDS_STORAGE_KEY,
        HIGHLIGHT_KEYWORDS_STORAGE_KEY,
        HIDE_VIEWED_STORAGE_KEY,
        HIDE_APPLIED_STORAGE_KEY,
        UNBLUR_GATED_STORAGE_KEY
      ]);

      currentSettings = parseSettingsFromStorage(result);
      previousSummaryKeywords = JSON.parse(JSON.stringify(currentSettings.summaryKeywords));
      scheduleApplyFilters();
    } catch (error) {
      console.error("LinkedIn filter: failed to load settings", error);
    }
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      if (isApplyingFilters) {
        return;
      }
      scheduleApplyFilters();
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
        !changes[HIGHLIGHT_KEYWORDS_STORAGE_KEY] &&
        !changes[HIDE_VIEWED_STORAGE_KEY] &&
        !changes[HIDE_APPLIED_STORAGE_KEY] &&
        !changes[UNBLUR_GATED_STORAGE_KEY]
      ) {
        return;
      }

      if (changes[SUMMARY_KEYWORDS_STORAGE_KEY]) {
        currentSettings.summaryKeywords = parseKeywords(changes[SUMMARY_KEYWORDS_STORAGE_KEY].newValue);
      }
      if (changes[HIGHLIGHT_KEYWORDS_STORAGE_KEY]) {
        currentSettings.highlightKeywords = parseHighlightKeywords(changes[HIGHLIGHT_KEYWORDS_STORAGE_KEY].newValue);
      }
      if (changes[HIDE_VIEWED_STORAGE_KEY]) {
        currentSettings.hideViewedJobs = parseBoolean(changes[HIDE_VIEWED_STORAGE_KEY].newValue, false);
      }
      if (changes[HIDE_APPLIED_STORAGE_KEY]) {
        currentSettings.hideAppliedJobs = parseBoolean(changes[HIDE_APPLIED_STORAGE_KEY].newValue, false);
      }
      if (changes[UNBLUR_GATED_STORAGE_KEY]) {
        currentSettings.unblurGatedJobs = parseBoolean(changes[UNBLUR_GATED_STORAGE_KEY].newValue, false);
      }

      scheduleApplyFilters();
    };

    if (typeof browser !== "undefined" && browser.storage && browser.storage.onChanged) {
      browser.storage.onChanged.addListener(onChanged);
    } else if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(onChanged);
    }
  }

  ensureStyleInjected();
  loadSettings();
  setupObserver();
  setupStorageListener();
})();
