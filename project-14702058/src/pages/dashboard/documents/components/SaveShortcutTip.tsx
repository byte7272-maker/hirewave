import { useEffect, useState } from "react";
import {
  SHORTCUT_TIPS_RESET_EVENT,
  isSaveShortcutTipSeen,
  markSaveShortcutTipSeen,
} from "@/lib/shortcutTipsMemory";

/**
 * A one-time, dismissible tip that surfaces the editor's key shortcuts the first
 * time it is opened: Cmd/Ctrl+S saves in place, Shift+Cmd/Ctrl+S saves as a new
 * tracked version, and Cmd/Ctrl+F opens Find & Replace. It shows once across
 * both editors — dismissing it anywhere remembers the choice, so it never nags
 * again. It can be brought back on demand from the Shortcuts panel.
 */

/** Use the platform's modifier + shift symbols so the hints read naturally. */
const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? "\u2318"
    : "Ctrl";

/** The Option/Alt key label for the "jump to Ask AI to change it" shortcut. */
const ALT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? "\u2325"
    : "Alt";

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-background-300 bg-background-50 text-[10px] font-semibold text-foreground-700">
      {children}
    </kbd>
  );
}

export default function SaveShortcutTip() {
  const [hidden, setHidden] = useState(isSaveShortcutTipSeen);

  // The Shortcuts panel's "Show shortcut tips again" brings this back on demand.
  useEffect(() => {
    function onReset() {
      setHidden(false);
    }
    window.addEventListener(SHORTCUT_TIPS_RESET_EVENT, onReset);
    return () => window.removeEventListener(SHORTCUT_TIPS_RESET_EVENT, onReset);
  }, []);

  if (hidden) return null;

  function dismiss() {
    markSaveShortcutTipSeen();
    setHidden(true);
  }

  return (
    <div className="animate-fade-in-up flex items-start gap-3 rounded-xl border border-primary-200 bg-primary-100/70 px-4 py-3 hw-print-hide">
      <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
        <i className="ri-keyboard-line"></i>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground-950">
          New: drive the editor from the keyboard
        </p>
        <p className="mt-1 text-xs text-foreground-600 flex items-center gap-1.5 flex-wrap">
          <span>Press</span>
          <KeyCap>{MOD}</KeyCap>
          <span className="text-foreground-300">+</span>
          <KeyCap>S</KeyCap>
          <span>to save in place,</span>
          <KeyCap>{"\u21e7"}</KeyCap>
          <span className="text-foreground-300">+</span>
          <KeyCap>{MOD}</KeyCap>
          <span className="text-foreground-300">+</span>
          <KeyCap>S</KeyCap>
          <span>to save as a new version, and</span>
          <KeyCap>{MOD}</KeyCap>
          <span className="text-foreground-300">+</span>
          <KeyCap>F</KeyCap>
          <span>to open Find &amp; Replace, and</span>
          <KeyCap>{ALT}</KeyCap>
          <span className="text-foreground-300">+</span>
          <KeyCap>I</KeyCap>
          <span>to jump straight to the &ldquo;Ask AI to change it&rdquo; box.</span>
          <span className="text-foreground-500">
            Every key is also listed in the Shortcuts panel.
          </span>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        title="Dismiss this tip"
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 bg-background-50 border border-primary-200 hover:bg-background-100 px-2.5 py-1 rounded-full transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
      >
        <i className="ri-check-line"></i>
        Got it
      </button>
    </div>
  );
}