// Project Harbor Connect — résumé sync content script (v1.7.0).
//
// Runs on the job boards that keep a reusable *profile* résumé (LinkedIn, Indeed,
// Glassdoor, ZipRecruiter, Dice, Monster). It is IDLE until the user clicks the
// injected "Update résumé with Harbor" button, which appears only on a page that has
// a résumé file input (the board's own upload control).
//
// On click it asks the background worker for the user's current résumé FILE (the one
// pinned to this board, resolved server-side), sets that file on the board's
// <input type=file> via a synthetic DataTransfer, fires input/change so the site
// registers it, and highlights the board's own Save button. It NEVER clicks Save —
// the user reviews and saves. After the site confirms, a "Mark updated" affordance
// records the new live version so drift tracking stays honest.
//
// The file bytes come from the user's own account (background mints a short-lived
// token); no credential is read and no page script is executed.
(function () {
  if (window.__harborSyncLoaded) return;
  window.__harborSyncLoaded = true;

  var BTN_ID = "harbor-sync-btn";
  var TOAST_ID = "harbor-sync-toast";

  // hostname -> board slug (must match the backend's board_sync keys).
  function boardFor(host) {
    host = String(host || "").toLowerCase();
    if (host.indexOf("linkedin.") >= 0) return "linkedin";
    if (host.indexOf("indeed.") >= 0) return "indeed";
    if (host.indexOf("glassdoor.") >= 0) return "glassdoor";
    if (host.indexOf("ziprecruiter.") >= 0) return "ziprecruiter";
    if (host.indexOf("dice.") >= 0) return "dice";
    if (host.indexOf("monster.") >= 0) return "monster";
    return "";
  }

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (r) {
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r);
        });
      } catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
    });
  }

  function visible(el) {
    try { return !!(el.offsetParent || el.getClientRects().length); } catch (e) { return true; }
  }

  // The résumé upload control on the page: a visible file input that accepts a
  // document, preferring one whose accept/label hints at a résumé/CV.
  function findFileInput() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll('input[type="file"]'));
    var best = null, bestScore = -1;
    inputs.forEach(function (el) {
      if (!visible(el) && el.offsetHeight === 0 && el.type !== "file") return; // some boards hide the real input behind a styled button; keep hidden file inputs as candidates
      var accept = (el.getAttribute("accept") || "").toLowerCase();
      var ctx = ((el.name || "") + " " + (el.id || "") + " " + (el.getAttribute("aria-label") || "") + " " + nearbyText(el)).toLowerCase();
      var score = 0;
      if (/pdf|msword|officedocument|\.doc|\.docx/.test(accept)) score += 2;
      if (/resume|résumé|cv\b|curriculum/.test(ctx)) score += 3;
      if (visible(el)) score += 1;
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function nearbyText(el) {
    try {
      var p = el.closest("label, section, div, form");
      return p ? (p.innerText || "").slice(0, 160) : "";
    } catch (e) { return ""; }
  }

  // The most likely Save/Submit button to highlight (never clicked by us).
  function findSaveButton(near) {
    var scope = (near && near.closest && near.closest("form, section, div")) || document;
    var cands = Array.prototype.slice.call(scope.querySelectorAll('button, input[type="submit"], [role="button"]'));
    var re = /\b(save|upload|update|submit|apply|replace|done)\b/i;
    for (var i = 0; i < cands.length; i++) {
      var t = (cands[i].innerText || cands[i].value || "").trim();
      if (re.test(t) && visible(cands[i])) return cands[i];
    }
    return null;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // Put the fetched résumé onto the board's file input via a synthetic DataTransfer,
  // then fire the events the board listens for.
  function setFile(input, bytes, filename, contentType) {
    try {
      var file = new File([bytes], filename || "resume.pdf", { type: contentType || "application/pdf" });
      var dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  function toast(msg, kind, extra) {
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      el.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:112px;max-width:340px;padding:12px 14px;border-radius:10px;font:13px/1.45 system-ui,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25)");
      document.body.appendChild(el);
    }
    el.style.background = kind === "err" ? "#9b2c2c" : kind === "ok" ? "#2f6f4f" : "#333";
    el.innerHTML = "";
    var span = document.createElement("div");
    span.textContent = msg;
    el.appendChild(span);
    if (extra) el.appendChild(extra);
    clearTimeout(el.__t);
    if (!extra) el.__t = setTimeout(function () { try { el.remove(); } catch (e) {} }, 9000);
  }

  function markButton(board, resumeId) {
    var wrap = document.createElement("div");
    wrap.setAttribute("style", "margin-top:8px");
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "I saved it — mark updated";
    b.setAttribute("style", "padding:6px 10px;border:0;border-radius:8px;background:#fff;color:#2f6f4f;font:600 12px system-ui,sans-serif;cursor:pointer");
    b.addEventListener("click", function () {
      b.disabled = true; b.textContent = "Marking…";
      send({ type: "harbor-sync-mark", board: board, resume_id: resumeId }).then(function (r) {
        toast(r && r.ok ? "Marked up to date on this site." : ("Couldn't mark it: " + ((r && r.error) || "error")), r && r.ok ? "ok" : "err");
      });
    });
    wrap.appendChild(b);
    return wrap;
  }

  async function doSync() {
    var board = boardFor(location.hostname);
    if (!board) return toast("This site isn't a résumé-sync board.", "err");
    var input = findFileInput();
    if (!input) return toast("Open the résumé upload on this page, then click again.", "err");
    toast("Fetching your current résumé…", "muted");
    var resp = await send({ type: "harbor-sync-fetch", board: board });
    if (!resp || !resp.ok) {
      return toast(resp && resp.error ? resp.error : "Open Project Harbor to link the extension, then try again.", "err");
    }
    var bytes;
    try { bytes = b64ToBytes(resp.b64 || ""); } catch (e) { bytes = null; }
    if (!bytes || !bytes.length) return toast("Couldn't read the résumé file.", "err");
    if (!setFile(input, bytes, resp.filename, resp.contentType)) {
      return toast("This site blocked an automatic file set — use the download + upload steps instead.", "err");
    }
    var save = findSaveButton(input);
    if (save) { try { save.style.outline = "3px solid #2f6f4f"; save.style.outlineOffset = "2px"; save.scrollIntoView({ block: "center" }); } catch (e) {} }
    var label = resp.resume_label ? ('"' + resp.resume_label + '"') : "your résumé";
    toast("Attached " + label + ". Review, then click the highlighted Save.", "ok", markButton(board, resp.resume_id || ""));
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    var b = document.createElement("button");
    b.id = BTN_ID;
    b.type = "button";
    b.textContent = "Update résumé with Harbor";
    b.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:64px;padding:10px 14px;border:0;border-radius:999px;background:#2f6f4f;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.25)");
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); doSync(); });
    document.body.appendChild(b);
  }

  // Offer the button only when the page actually has a résumé file input.
  function maybeShow() { try { if (boardFor(location.hostname) && findFileInput()) injectButton(); } catch (e) {} }
  if (document.readyState === "interactive" || document.readyState === "complete") maybeShow();
  document.addEventListener("DOMContentLoaded", maybeShow);
  setTimeout(maybeShow, 1500);
  setTimeout(maybeShow, 4000);
  // Boards reveal the upload control after a click; re-check on interaction.
  document.addEventListener("click", function () { setTimeout(maybeShow, 600); }, true);
})();
