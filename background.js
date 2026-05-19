const RULE_ID = 1;

const sortRepliesRule = {
  id: RULE_ID,
  priority: 1,
  action: {
    type: "redirect",
    redirect: {
      transform: {
        queryTransform: {
          addOrReplaceParams: [
            {
              key: "sort_replies",
              value: "likes"
            }
          ]
        }
      }
    }
  },
  condition: {
    regexFilter: "^https://(www\\.)?(x|twitter)\\.com/[^/?#]+/status/[0-9]+([?#].*)?$",
    resourceTypes: ["main_frame"]
  }
};

chrome.runtime.onInstalled.addListener(syncRedirectRule);
chrome.runtime.onStartup.addListener(syncRedirectRule);
syncRedirectRule();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.enabled) {
    setRedirectRule(changes.enabled.newValue);
  }
});

async function syncRedirectRule() {
  const { enabled } = await chrome.storage.sync.get({ enabled: true });
  await setRedirectRule(enabled);
}

async function setRedirectRule(enabled) {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [RULE_ID],
    addRules: enabled ? [sortRepliesRule] : []
  });
}
