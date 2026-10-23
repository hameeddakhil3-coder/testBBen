(() => {
  const SW_URL = "/sw.js";
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch((error) => {
        console.warn("BBen offline support could not be enabled:", error);
      });
    });
  }

  let installPrompt = null;
  const addInstallButton = () => {
    if (document.getElementById("bben-install-app")) return;
    const button = document.createElement("button");
    button.id = "bben-install-app";
    button.type = "button";
    button.textContent = "تثبيت تطبيق BBen";
    button.setAttribute("aria-label", "تثبيت تطبيق BBen على الجهاز");
    Object.assign(button.style, {
      position: "fixed", left: "16px", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
      zIndex: "9999", border: "0", borderRadius: "999px", padding: "12px 18px",
      background: "#047857", color: "#fff", font: "600 14px system-ui, sans-serif",
      boxShadow: "0 4px 16px rgba(0,0,0,.18)", cursor: "pointer"
    });
    button.addEventListener("click", async () => {
      if (!installPrompt) return;
      button.disabled = true;
      try {
        await installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        button.remove();
      } finally {
        button.disabled = false;
      }
    });
    document.body.append(button);
  };

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    addInstallButton();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    document.getElementById("bben-install-app")?.remove();
  });
})();