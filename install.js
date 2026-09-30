const installButton = document.querySelector("#installButton");
const installHelp = document.querySelector("#installHelp");
const offlineStatus = document.querySelector("#offlineStatus");
let installPrompt = null;

function showInstallHelp() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  installHelp.textContent = standalone ? "Installed on this device." : apple
    ? "In Safari, tap Share, then Add to Home Screen. Enable Open as Web App if offered."
    : "Open the browser menu and choose Install app or Add to Home screen, when available.";
  if (location.protocol === "file:") {
    installHelp.textContent = "Open the hosted HTTPS version to install on a phone. This local copy still works in your browser.";
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.classList.remove("hidden");
});

installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  installButton.classList.add("hidden");
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {
    installHelp.textContent = "Use your browser menu to install this app.";
  }
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installButton.classList.add("hidden");
  installHelp.textContent = "Installed on this device.";
});

showInstallHelp();
if ("serviceWorker" in navigator && window.isSecureContext && location.protocol !== "file:") {
  offlineStatus.textContent = "Preparing offline access...";
  navigator.serviceWorker.register("./sw.js").then(async () => {
    await navigator.serviceWorker.ready;
    offlineStatus.textContent = "Ready for offline use. Photos stay on this device.";
  }).catch(() => {
    offlineStatus.textContent = "Offline setup failed. Reopen the app online to try again.";
  });
} else {
  offlineStatus.textContent = "Photos are processed on this device.";
}
