// Announce Hirewave Connect to the Hirewave web app so the "Connect a site" screen
// can auto-skip the install step. This runs only on the Hirewave origins declared
// in the manifest, and only sets a marker + fires an event -- it reads nothing from
// the page and sends nothing anywhere.
(function () {
  try {
    var version = chrome.runtime.getManifest().version;
    document.documentElement.dataset.hirewaveConnect = version;
    window.dispatchEvent(
      new CustomEvent("hirewave-connect-ready", { detail: { version: version } })
    );
  } catch (e) {
    // Non-fatal: detection is a convenience, the pairing flow works without it.
  }
})();
