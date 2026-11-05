// Project Harbor Connect — live-apply content script (v1.4.0).
//
// Runs only on the declared job-site hosts (NOT linkedin.com — that stays manual).
// It is IDLE until the user clicks "Fill with Harbor": then it reads the VISIBLE
// application form's fields (labels/types only — never password/hidden/file inputs),
// asks the backend to map them to the user's OWN profile, fills the live inputs, and
// highlights them. It never reads a credential and never clicks Submit — the user
// reviews and submits. This is the Playwright-free, cookie-free apply path.
(function () {
  if (window.__harborApplyLoaded) return;
  window.__harborApplyLoaded = true;

  var BTN_ID = "harbor-fill-btn";
  var TOAST_ID = "harbor-toast";
  var SKIP_TYPES = { password: 1, hidden: 1, file: 1 }; // never read these

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (r) {
          resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r);
        });
      } catch (e) { resolve({ ok: false, error: String((e && e.message) || e) }); }
    });
  }

  function labelFor(el) {
    var t = "";
    try {
      if (el.id) { var l = document.querySelector('label[for="' + (window.CSS ? CSS.escape(el.id) : el.id) + '"]'); if (l) t = l.innerText; }
      if (!t) { var w = el.closest && el.closest("label"); if (w) t = w.innerText; }
      if (!t) t = el.getAttribute("aria-label") || "";
      if (!t && el.getAttribute("aria-labelledby")) { var ref = document.getElementById(el.getAttribute("aria-labelledby")); if (ref) t = ref.innerText; }
      if (!t) t = el.getAttribute("placeholder") || "";
    } catch (e) {}
    return (t || "").replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function visible(el) {
    try { return !!(el.offsetParent || el.getClientRects().length); } catch (e) { return true; }
  }

  // The visible form with the most fillable fields (handles pages with stray forms).
  function findForm() {
    var forms = Array.prototype.slice.call(document.querySelectorAll("form"));
    var best = null, bestN = 0;
    for (var i = 0; i < forms.length; i++) {
      var n = forms[i].querySelectorAll("input:not([type=hidden]), select, textarea").length;
      if (n > bestN && visible(forms[i])) { best = forms[i]; bestN = n; }
    }
    return best;
  }

  function collectFields(form) {
    var out = [];
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      var type = (el.type || el.tagName || "text").toLowerCase();
      if (SKIP_TYPES[type]) return;                 // never read passwords/hidden/file
      if (el.disabled || el.readOnly) return;
      if (type !== "select-one" && !visible(el)) return;
      var label = labelFor(el);
      var name = el.name || el.id || "";
      if (!label && !name) return;
      var field = { name: name, label: label, type: type === "select-one" ? "select" : type, required: !!el.required, options: [] };
      if (el.tagName === "SELECT") {
        field.options = Array.prototype.slice.call(el.options).map(function (o) { return (o.textContent || "").trim(); }).filter(Boolean).slice(0, 40);
      }
      out.push({ el: el, field: field });
    });
    return out;
  }

  // React/framework-safe value set, then fire input+change so the site registers it.
  function setValue(el, value) {
    try {
      if (el.tagName === "SELECT") {
        var opts = Array.prototype.slice.call(el.options);
        var v = String(value).toLowerCase();
        var opt = opts.find(function (o) { return (o.textContent || "").trim().toLowerCase() === v; })
          || opts.find(function (o) { return (o.textContent || "").trim().toLowerCase().indexOf(v) >= 0; });
        if (!opt) return false;
        el.value = opt.value;
      } else {
        var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, String(value));
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }

  function outline(el, ok) {
    try { el.style.outline = ok ? "2px solid #2f6f4f" : "2px dashed #c08a2d"; el.style.outlineOffset = "1px"; } catch (e) {}
  }

  function toast(msg, kind) {
    var el = document.getElementById(TOAST_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = TOAST_ID;
      el.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:64px;max-width:320px;padding:10px 12px;border-radius:10px;font:13px/1.4 system-ui,sans-serif;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25)");
      document.body.appendChild(el);
    }
    el.style.background = kind === "err" ? "#9b2c2c" : kind === "ok" ? "#2f6f4f" : "#333";
    el.textContent = msg;
    clearTimeout(el.__t); el.__t = setTimeout(function () { try { el.remove(); } catch (e) {} }, kind === "muted" ? 8000 : 9000);
  }

  async function fill() {
    var form = findForm();
    if (!form) return toast("No application form found on this page.", "err");
    var items = collectFields(form);
    if (!items.length) return toast("No fillable fields found on this form.", "err");
    toast("Asking Project Harbor to map your details…", "muted");
    var resp = await send({ type: "harbor-field-map", fields: items.map(function (i) { return i.field; }) });
    if (!resp || !resp.ok) return toast(resp && resp.error ? resp.error : "Open Project Harbor and paste your token in the extension (Advanced), then try again.", "err");
    var plan = resp.data || {};
    var byKey = {};
    (plan.mappings || []).forEach(function (m) { byKey[m.field] = m.value; });
    var filled = 0;
    items.forEach(function (it) {
      var key = it.field.name || it.field.label;
      if (Object.prototype.hasOwnProperty.call(byKey, key)) {
        if (setValue(it.el, byKey[key])) { outline(it.el, true); filled++; }
      }
    });
    var you = (plan.needs_user || []).length, skip = (plan.skipped_sensitive || []).length;
    toast("Filled " + filled + " field(s)." + (you ? " " + you + " for you to answer." : "") + (skip ? " " + skip + " left blank (sensitive)." : "") + " Review, then submit.", "ok");
    send({ type: "harbor-apply-report", host: location.hostname, filled: filled }); // best-effort
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return;
    var b = document.createElement("button");
    b.id = BTN_ID;
    b.type = "button";
    b.textContent = "Fill with Harbor";
    b.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:10px 14px;border:0;border-radius:999px;background:#2f6f4f;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 24px rgba(0,0,0,.25)");
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); fill(); });
    document.body.appendChild(b);
  }

  // Only offer the button when a real form is present; apply forms often load late (SPA).
  function maybeShow() { try { if (findForm()) injectButton(); } catch (e) {} }
  if (document.readyState === "interactive" || document.readyState === "complete") maybeShow();
  document.addEventListener("DOMContentLoaded", maybeShow);
  setTimeout(maybeShow, 1500);
  setTimeout(maybeShow, 4000);
})();
