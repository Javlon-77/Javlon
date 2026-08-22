(() => {
  const originalDownloadBlob = window.downloadBlob;
  if (typeof originalDownloadBlob !== "function") return;

  window.downloadBlob = function(blob, name) {
    if (window.__saveOnlyMode) return;
    return originalDownloadBlob(blob, name);
  };

  const btn = document.getElementById("saveBtn");
  if (!btn) return;

  btn.addEventListener("click", () => {
    window.__saveOnlyMode = true;
    window.setTimeout(() => {
      window.__saveOnlyMode = false;
    }, 5000);
  }, true);
})();
