const enabledInput = document.getElementById("enabled");

chrome.storage.sync.get({ enabled: true }, (settings) => {
  enabledInput.checked = settings.enabled;
});

enabledInput.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: enabledInput.checked });
});
