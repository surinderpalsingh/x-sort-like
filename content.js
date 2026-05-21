const SORT_PARAM = "sort_replies";
const SORT_VALUE = "likes";
const STATUS_PATH_PATTERN = /^\/[^/?#]+\/status\/\d+\/?$/;
const STATUS_CONTEXT_PATH_PATTERN = /^\/[^/?#]+\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/;
const AUTOMATION_CLASS = "x-like-sort-automation";
const AUTOMATION_STYLE_ID = "x-like-sort-automation-style";

let enabled = true;
let observer;
let sortCheckTimer;
let automationCleanupTimer;
let activeSortAttemptUrl = "";
let activeSortAttemptCount = 0;

chrome.storage.sync.get({ enabled: true }, (settings) => {
  enabled = settings.enabled;
  sendEnabledSetting();

  if (enabled) {
    startLinkRewriting();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync" || !changes.enabled) return;

  enabled = changes.enabled.newValue;
  sendEnabledSetting();

  if (enabled) {
    startLinkRewriting();
  } else {
    stopLinkRewriting();
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const message = event.data;
  if (!message || message.source !== "x-like-sort-extension" || message.type !== "settings-request") return;

  sendEnabledSetting();
});

window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  const message = event.data;
  if (!message || message.source !== "x-like-sort-extension" || message.type !== "navigation") return;

  activeSortAttemptUrl = "";
  activeSortAttemptCount = 0;
  scheduleReplySortCheck();
});

function startLinkRewriting() {
  rewriteTweetLinks(document);
  scheduleReplySortCheck();

  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        rewriteTweetLinks(node);
      }
    }

    scheduleReplySortCheck();
  });

  observeDocument();
}

function stopLinkRewriting() {
  observer?.disconnect();
  observer = null;
  clearTimeout(sortCheckTimer);
  clearTimeout(automationCleanupTimer);
  sortCheckTimer = null;
  automationCleanupTimer = null;
  stopVisualAutomation();
  unwriteTweetLinks(document);
}

function rewriteTweetLinks(root) {
  if (!enabled || !root) return;

  if (root instanceof HTMLAnchorElement) {
    rewriteTweetLink(root);
    return;
  }

  if (root instanceof Element || root instanceof Document) {
    for (const anchor of root.querySelectorAll("a[href]")) {
      rewriteTweetLink(anchor);
    }
  }
}

function rewriteTweetLink(anchor) {
  const sortedUrl = getSortedTweetUrl(anchor.href);

  if (sortedUrl && sortedUrl !== anchor.href) {
    anchor.href = sortedUrl;
  }
}

function unwriteTweetLinks(root) {
  if (!root) return;

  if (root instanceof HTMLAnchorElement) {
    unwriteTweetLink(root);
    return;
  }

  if (root instanceof Element || root instanceof Document) {
    for (const anchor of root.querySelectorAll("a[href]")) {
      unwriteTweetLink(anchor);
    }
  }
}

function unwriteTweetLink(anchor) {
  const unsortedUrl = getUnsortedTweetUrl(anchor.href);

  if (unsortedUrl && unsortedUrl !== anchor.href) {
    anchor.href = unsortedUrl;
  }
}

function observeDocument() {
  if (!observer) return;

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    return;
  }

  document.addEventListener("DOMContentLoaded", observeDocument, { once: true });
}

function scheduleReplySortCheck(delay = 80) {
  if (!enabled || !isTweetContextUrl(new URL(window.location.href))) return;
  if (activeSortAttemptUrl === window.location.href && activeSortAttemptCount >= 12) return;

  clearTimeout(sortCheckTimer);
  sortCheckTimer = setTimeout(ensureRepliesSortedByLikes, delay);
}

function ensureRepliesSortedByLikes() {
  if (!enabled || !isTweetContextUrl(new URL(window.location.href))) return;

  if (activeSortAttemptUrl !== window.location.href) {
    activeSortAttemptUrl = window.location.href;
    activeSortAttemptCount = 0;
  }

  if (activeSortAttemptCount >= 12 || pageShowsLikesSort()) return;

  activeSortAttemptCount += 1;

  const likesOption = findOpenLikesOption();
  if (likesOption) {
    likesOption.click();
    scheduleReplySortCheck(220);
    return;
  }

  const sortButton = findReplySortButton();
  if (sortButton) {
    startVisualAutomation();
    sortButton.click();
    scheduleReplySortCheck(120);
    return;
  }

  scheduleReplySortCheck(300);
}

function pageShowsLikesSort() {
  for (const element of getVisibleClickableElements()) {
    const role = element.getAttribute("role");
    if (role === "menuitem" || role === "menuitemradio" || role === "option" || role === "radio") continue;

    const text = getNormalizedText(element);
    if (/^(sort replies by:\s*)?likes$/i.test(text) || /^likes replies$/i.test(text)) {
      return true;
    }
  }

  return false;
}

function findOpenLikesOption() {
  for (const element of getVisibleClickableElements()) {
    const text = getNormalizedText(element);
    const role = element.getAttribute("role");

    if (
      (role === "menuitem" || role === "menuitemradio" || role === "option" || role === "radio" || role === "button") &&
      /^(likes|sort by likes|most liked)$/i.test(text)
    ) {
      return element;
    }
  }

  return null;
}

function findReplySortButton() {
  const candidates = getVisibleClickableElements();

  for (const element of candidates) {
    const text = getNormalizedText(element);
    const label = element.getAttribute("aria-label") || "";

    if (/sort replies/i.test(text) || /sort replies/i.test(label)) {
      return element;
    }
  }

  for (const element of candidates) {
    const text = getNormalizedText(element);

    if (/^(relevant|most relevant|relevant replies|recent|most recent|recent replies)$/i.test(text)) {
      return element;
    }
  }

  return null;
}

function getVisibleClickableElements() {
  return Array.from(
    document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"]')
  ).filter(isVisible);
}

function getNormalizedText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function startVisualAutomation() {
  ensureAutomationStyle();
  document.documentElement.classList.add(AUTOMATION_CLASS);
  clearTimeout(automationCleanupTimer);

  automationCleanupTimer = setTimeout(stopVisualAutomation, 900);
}

function stopVisualAutomation() {
  document.documentElement.classList.remove(AUTOMATION_CLASS);
}

function ensureAutomationStyle() {
  if (document.getElementById(AUTOMATION_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = AUTOMATION_STYLE_ID;
  style.textContent = `
    .${AUTOMATION_CLASS} [role="menu"],
    .${AUTOMATION_CLASS} [role="listbox"] {
      opacity: 0 !important;
    }
  `;
  document.documentElement.appendChild(style);
}

function getSortedTweetUrl(href) {
  let url;

  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }

  if (!isTweetUrl(url)) return null;

  url.searchParams.set(SORT_PARAM, SORT_VALUE);
  return url.toString();
}

function getUnsortedTweetUrl(href) {
  let url;

  try {
    url = new URL(href, window.location.origin);
  } catch {
    return null;
  }

  if (!isTweetUrl(url) || url.searchParams.get(SORT_PARAM) !== SORT_VALUE) return null;

  url.searchParams.delete(SORT_PARAM);
  return url.toString();
}

function isTweetUrl(url) {
  const host = url.hostname.replace(/^www\./, "");
  return (host === "x.com" || host === "twitter.com") && STATUS_PATH_PATTERN.test(url.pathname);
}

function isTweetContextUrl(url) {
  const host = url.hostname.replace(/^www\./, "");
  return (host === "x.com" || host === "twitter.com") && STATUS_CONTEXT_PATH_PATTERN.test(url.pathname);
}

function sendEnabledSetting() {
  window.postMessage(
    {
      source: "x-like-sort-extension",
      type: "settings",
      enabled
    },
    window.location.origin
  );
}
