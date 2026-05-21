(() => {
  const SORT_PARAM = "sort_replies";
  const SORT_VALUE = "likes";
  const STATUS_PATH_PATTERN = /^\/[^/?#]+\/status\/\d+\/?$/;
  const STATUS_CONTEXT_PATH_PATTERN = /^\/[^/?#]+\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/;
  const MESSAGE_SOURCE = "x-like-sort-extension";

  let enabled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    const message = event.data;
    if (!message || message.source !== MESSAGE_SOURCE || message.type !== "settings") return;

    enabled = Boolean(message.enabled);
  });
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: "settings-request"
    },
    window.location.origin
  );

  document.addEventListener("click", prepareClickedTweetLink, true);

  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    return originalFetch.call(this, getSortedFetchInput(input), init);
  };

  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    return originalXhrOpen.call(this, method, getSortedTweetDetailApiUrl(url) || url, ...rest);
  };

  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    args[2] = getSortedHistoryUrl(args[2]);

    if (shouldReplaceSameTweetNavigation(args[2])) {
      const result = originalReplaceState.apply(this, args);
      notifyNavigation();
      return result;
    }

    const result = originalPushState.apply(this, args);
    notifyNavigation();
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    args[2] = getSortedHistoryUrl(args[2]);
    const result = originalReplaceState.apply(this, args);
    notifyNavigation();
    return result;
  };

  function getSortedHistoryUrl(value) {
    if (!enabled || value === undefined || value === null) return value;

    const sortedUrl = getSortedUrl(value);
    if (!sortedUrl) return value;

    return sortedUrl;
  }

  function prepareClickedTweetLink(event) {
    if (!enabled) return;

    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest("a[href]");
    if (!anchor) return;

    const sortedUrl = getSortedUrl(anchor.href);
    if (sortedUrl && sortedUrl !== anchor.href) {
      anchor.href = sortedUrl;
    }
  }

  function getSortedUrl(value) {
    let url;

    try {
      url = new URL(value, window.location.href);
    } catch {
      return null;
    }

    if (!isTweetContextUrl(url)) return null;

    url.searchParams.set(SORT_PARAM, SORT_VALUE);
    return url.toString();
  }

  function getSortedFetchInput(input) {
    if (!enabled) return input;

    if (input instanceof Request) {
      const sortedUrl = getSortedTweetDetailApiUrl(input.url);
      return sortedUrl ? new Request(sortedUrl, input) : input;
    }

    const sortedUrl = getSortedTweetDetailApiUrl(input);
    return sortedUrl || input;
  }

  function getSortedTweetDetailApiUrl(value) {
    let url;

    try {
      url = new URL(value, window.location.href);
    } catch {
      return null;
    }

    const host = url.hostname.replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    if (!/^\/i\/api\/graphql\/[^/]+\/TweetDetail$/.test(url.pathname)) return null;

    const variables = getTweetDetailVariables(url);
    if (!variables) return null;

    if (variables.rankingMode === "Likes") {
      return url.toString();
    }

    variables.rankingMode = "Likes";
    url.searchParams.set("variables", JSON.stringify(variables));

    return url.toString();
  }

  function getTweetDetailVariables(url) {
    const value = url.searchParams.get("variables");
    if (!value) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function shouldReplaceSameTweetNavigation(value) {
    if (!enabled || value === undefined || value === null) return false;

    let currentUrl;
    let nextUrl;

    try {
      currentUrl = new URL(window.location.href);
      nextUrl = new URL(value, window.location.href);
    } catch {
      return false;
    }

    return (
      isTweetUrl(currentUrl) &&
      isTweetUrl(nextUrl) &&
      currentUrl.pathname === nextUrl.pathname &&
      nextUrl.searchParams.get(SORT_PARAM) === SORT_VALUE
    );
  }

  function notifyNavigation() {
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "navigation"
      },
      window.location.origin
    );
  }

  function isTweetUrl(url) {
    const host = url.hostname.replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && STATUS_PATH_PATTERN.test(url.pathname);
  }

  function isTweetContextUrl(url) {
    const host = url.hostname.replace(/^www\./, "");
    return (host === "x.com" || host === "twitter.com") && STATUS_CONTEXT_PATH_PATTERN.test(url.pathname);
  }
})();
