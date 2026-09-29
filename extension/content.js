// Project Harbor Connect — content script (runs only on the app origins in the
// manifest). Two jobs:
//   1) Announce the extension to the app so it can skip the install step.
//   2) Bridge: relay the app's connect request (a window message) to the
//      background worker and post the reply back — so the app needs no extension
//      ID and no pairing code. It reads nothing from the page on its own.
(function () {
  try {
    var version = chrome.runtime.getManifest().version;
    document.documentElement.dataset.harborConnect = version;
    window.dispatchEvent(new CustomEvent("harbor-connect-ready", { detail: { version: version } }));
  } catch (e) {
    // Non-fatal: detection is a convenience; the pairing flow works without it.
  }

  // Relay app -> background -> app. Only same-page messages tagged "harbor-app"
  // are honored; the reply is posted back to the app's own origin.
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    var msg = event.data;
    if (!msg || msg.source !== "harbor-app" || !msg.type) return;
    var reqId = msg.reqId;
    function reply(response) {
      window.postMessage(
        { source: "harbor-ext", reqId: reqId, response: response || { ok: false, error: "no response" } },
        window.location.origin
      );
    }
    try {
      chrome.runtime.sendMessage(
        { type: msg.type, provider: msg.provider, token: msg.token, apiBase: msg.apiBase, label: msg.label },
        function (resp) {
          if (chrome.runtime.lastError) {
            reply({ ok: false, error: chrome.runtime.lastError.message || "extension error" });
            return;
          }
          reply(resp);
        }
      );
    } catch (e) {
      reply({ ok: false, error: String((e && e.message) || e) });
    }
  });
})();
