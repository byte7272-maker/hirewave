// Project Harbor Connect — passive enrichment content script.
//
// When the user opens a job DETAIL page on a board they use, this hands the page's
// own HTML to the background worker once. The background matches it (by title) to one
// of the user's saved jobs and fills pay/benefits/location the server couldn't fetch
// itself. It reads nothing but this page's own HTML, fires at most once per page, and
// only on a job-detail URL — never on search/list/profile pages.
(function () {
  try {
    function isJobDetail() {
      const h = location.host;
      const p = location.pathname;
      const s = location.search;
      if (/(^|\.)indeed\./i.test(h)) return /\/viewjob/i.test(p) || /[?&]jk=/i.test(s);
      if (/(^|\.)linkedin\./i.test(h)) return /\/jobs\/view\//i.test(p);
      if (/(^|\.)glassdoor\./i.test(h)) return /job-listing|\/Job\//i.test(p);
      if (/(^|\.)ziprecruiter\./i.test(h)) return /\/jobs?\/|\/c\/|\/job\//i.test(p);
      if (/(^|\.)monster\./i.test(h)) return /\/job-openings?\/|\/jobs?\//i.test(p);
      if (/(^|\.)dice\./i.test(h)) return /\/job-detail\/|\/jobs?\//i.test(p);
      if (/(^|\.)simplyhired\./i.test(h)) return /\/job\//i.test(p);
      if (/(^|\.)careerbuilder\./i.test(h)) return /\/job\//i.test(p);
      if (/(^|\.)michaelpage\./i.test(h)) return /\/job-detail\/|\/jobs?\//i.test(p);
      if (/(^|\.)wellfound\./i.test(h)) return /\/jobs?\//i.test(p);
      if (/lever\.co|greenhouse\.io|myworkday\.com|workday\.com/i.test(h)) return true;
      return /\/viewjob|\/jobs?\/view/i.test(p);
    }

    if (!isJobDetail()) return;

    var sent = false;
    function send() {
      if (sent) return;
      sent = true;
      try {
        chrome.runtime.sendMessage(
          {
            type: "harbor-passive-enrich",
            url: location.href,
            html: (document.documentElement.outerHTML || "").slice(0, 1500000),
          },
          function () { void chrome.runtime.lastError; } // ignore if no receiver
        );
      } catch (_) {
        // Extension context can be invalidated across a reload; harmless.
      }
    }

    // Let a client-rendered page (Indeed/LinkedIn) hydrate its embedded data first.
    if (document.readyState === "complete") {
      setTimeout(send, 2500);
    } else {
      window.addEventListener("load", function () { setTimeout(send, 2500); }, { once: true });
    }
  } catch (_) {
    // Never throw into the host page.
  }
})();
