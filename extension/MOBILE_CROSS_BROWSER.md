# Mobile & cross-browser strategy — Project Harbor Connect

One WebExtension codebase, three store targets, plus a mobile web path that needs no
extension at all. This doc covers the platform reality, how to ship each target, and when
a native app would replace all of it.

## Platform reality (read this first)

Browser extensions do **not** run on mobile Chrome (Android or iOS). So:

| Platform | Extension support | Our target |
|---|---|---|
| **Desktop** Chrome / Edge / Brave | Yes (Chromium MV3) | `…-<ver>.zip` → Chrome Web Store + Edge Add-ons |
| **Desktop** Firefox | Yes | `…-firefox-<ver>.zip` → Firefox AMO |
| **Android** Firefox | **Yes** | same `…-firefox-<ver>.zip` → AMO (Android-enabled) |
| **Android** Chrome | **No** | — (use the mobile web app, P77) |
| **iOS / iPadOS** Safari | **Yes** (Safari Web Extension) | Xcode wrap → App Store |
| **iOS / iPadOS** Chrome | **No** (uses WebKit; no extensions) | — (mobile web app, P77) |

**Key correction:** Safari covers **iOS/iPadOS/macOS — not Android.** Android extension
coverage comes from **Firefox for Android**, not Safari. So "parallel to Chrome, also
covering Android" = **Safari (iOS) + Firefox (Android)**, both from this same code.

The same files run everywhere because the code uses the cross-browser `chrome.*` namespace
(Firefox and Safari alias it) and standard MV3 content scripts. `build.py` only swaps the
background style + adds a Firefox id for the AMO package.

## Firefox (desktop + ANDROID) — AMO

1. `python extension/build.py` → `dist/project-harbor-connect-firefox-<ver>.zip`.
   (Background is an event page `{scripts:[…]}` and a `browser_specific_settings.gecko` id
   is added — both required by Firefox; the rest is identical to the Chrome build.)
2. addons.mozilla.org → **Submit a New Add-on** → upload the `-firefox-` zip.
3. Set it to run on **Firefox for Android** (AMO supports Android add-ons). Reuse the same
   listing copy, permission justifications, and privacy-policy URL as the Chrome kit
   (`SUBMIT_CHECKLIST.md`) — AMO asks for the same substance.
4. AMO review is usually fast; updates are the same upload flow.

This is the **Android** answer: an Android user installs Firefox for Android, adds the
add-on, and gets the same connect / pull / Fill-with-Harbor behavior as desktop.

## Safari (iOS / iPadOS / macOS) — App Store

Safari extensions ship **inside a thin app** via the App Store. This step needs a **Mac
with Xcode** and an **Apple Developer account ($99/yr)** — it cannot be produced on
Windows/CI without a Mac. The extension files are already Safari-ready; the work is the wrap:

1. On a Mac, from the unpacked `extension/` folder:
   ```
   xcrun safari-web-extension-converter ./extension --app-name "Project Harbor Connect" --bundle-identifier app.hirewave.connect --macos --ios
   ```
   This generates an Xcode project containing the same `manifest.json`, `content.js`,
   `apply.js`, `background.js`, `popup.*`, and `icons/` as a Safari Web Extension.
2. In Xcode: set the team/signing, confirm the host permissions prompt copy, and build the
   iOS + macOS targets.
3. Archive → **App Store Connect** → submit both the iOS app (containing the extension) and
   the macOS app for review. The user enables the extension in **Settings → Safari →
   Extensions** (iOS) after installing the app.
4. Keep the same privacy policy URL + data-use disclosures; Apple also asks its own App
   Privacy questions — answer them consistently with `PRIVACY.md`.

Notes: Safari throttles background pages harder than Chrome, so the on-user-action model
(nothing runs until the user taps "Fill with Harbor") fits Safari well. The one-click token
link works the same (the app posts the session to the extension on its own origin).

## Mobile web app (no extension) — the default phone experience

Most phone users won't install any extension. The web app must deliver value without one —
see **P77** in `docs/READDY_PROMPTS.md`:
- **Email-fed matches** (Gmail/iCloud) — needs no extension, works on any mobile browser.
- **Apply helper** — tap-to-copy field values from `POST /api/v1/apply/field-map` (the same
  endpoint the extension uses), so a phone user fills a form fast by copy/paste.
- **Desktop handoff** — one quiet line: "On a computer, the extension fills this in one click."

## Would a native app replace all of this?

**How it would work.** A native iOS + Android app (e.g. React Native / Flutter, or two
native shells) wraps the Project Harbor web experience and adds an **in-app browser
(WebView/SFSafariViewController/Custom Tabs)** for job sites. Because the app controls that
in-app browser, it can inject the same field-map fill into the page the user opened — the
**exact apply.js logic, but driven by the app instead of a browser extension.** The user
logs into job sites inside the app's browser (their own session), taps "Fill," and the app
fills the live form in its own WebView. Auth is the app's own login (no extension token
handoff). Push notifications and the activity feed become native.

**Why it's beneficial.**
- **One product covers both mobile platforms** with real auto-fill — no Safari/Firefox/Chrome
  extension matrix, no "can't do this on your phone."
- **True mobile auto-fill**, which no mobile browser extension path gives cleanly today.
- **Native push** for the activity/approval checkpoints, home-screen presence, and a smoother
  connect flow (the login happens in the app's own browser).
- **One review surface per store** you already need (App Store / Play) instead of three
  extension stores.

**What becomes unnecessary if you go native.**
- The **browser extensions themselves on mobile** — the native in-app browser does the fill,
  so no Safari wrap and no Firefox-Android add-on are needed for phones. (You'd likely keep
  the **desktop** Chrome/Edge extension, since desktop has no app.)
- The **one-click token handoff / `harbor-session` bridge** on mobile — the app owns the
  session directly; nothing to pass to an extension.
- The **cookie-capture → server-Playwright** path for mobile — the app fills in its own
  WebView on the user's real session, same as the extension model, so no server browser.
- The **"finish on desktop" handoff** messaging on mobile — the phone can now auto-fill.

**The trade-off.** A native app is a bigger build and two store review processes (plus app
maintenance), and in-app-browser automation on some ATS sites is as brittle as any fill path
(same selector/field-map robustness concerns — which the Claude field-map already mitigates).
It's the right move once mobile apply is a core, high-volume flow; until then, **P77 (mobile
web) + the Chrome desktop extension + Safari/Firefox for the extension-wanting minority** is
the lower-cost path.

## Recommended order

1. **Now:** ship P77 (mobile web: email matches + Apply helper + handoff) — covers all phones
   with zero store dependency.
2. **Desktop:** the Chrome/Edge extension (v1.4.1, already built).
3. **Reach the extension-wanting mobile minority:** Firefox AMO (Android) from the `-firefox-`
   zip; Safari (iOS) when you have a Mac + Apple Developer account.
4. **Later, if mobile apply is core:** a native app, which supersedes the mobile extensions
   and the token handoff as described above.
