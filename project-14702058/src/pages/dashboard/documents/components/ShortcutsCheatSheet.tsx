import { useEffect, useRef, useState } from "react";
import { resetShortcutTips } from "@/lib/shortcutTipsMemory";

/**
 * A small "?" affordance for the editor header that reveals every inline-edit
 * and rephrase keyboard shortcut in one place. It can also be toggled from the
 * keyboard with "?" and closed with Esc, so the keys are discoverable without a
 * manual — and the hint mirrors the résumé and cover-letter editors' behavior.
 */

interface ShortcutRow {
  /** Key caps to show, or a single action hint like "Double-click". */
  keys: string[];
  /** True when `keys` are literal keys (rendered as key caps). */
  isKey?: boolean;
  label: string;
}

interface ShortcutGroup {
  title: string;
  icon: string;
  rows: ShortcutRow[];
}

/** Use the platform's modifier symbol so the hints read naturally everywhere. */
const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? "\u2318"
    : "Ctrl";

/** The Option/Alt key label for the "jump to Ask AI to change it" shortcut. */
const ALT =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? "\u2325"
    : "Alt";

const GROUPS: ShortcutGroup[] = [
  {
    title: "Edit the document",
    icon: "ri-edit-2-line",
    rows: [
      { keys: ["Double-click"], label: "Edit a word or line in place" },
      { keys: [MOD, "F"], isKey: true, label: "Open Find & replace" },
      { keys: ["Enter"], isKey: true, label: "Jump to the next match" },
      { keys: ["Shift", "Enter"], isKey: true, label: "Jump to the previous match" },
      { keys: ["Enter"], isKey: true, label: "Save the inline edit" },
      { keys: ["Esc"], isKey: true, label: "Cancel the edit" },
      { keys: [MOD, "S"], isKey: true, label: "Save the document" },
      { keys: [MOD, "\u21e7", "S"], isKey: true, label: "Save as a new version" },
      { keys: ["Drag a section header"], label: "Reorder a section" },
    ],
  },
  {
    title: "Rephrase with AI",
    icon: "ri-magic-line",
    rows: [
      { keys: ["Select text"], label: "Open the rephrase toolbar" },
      { keys: [MOD, "\u21e7", "C"], isKey: true, label: "Copy the selected text" },
      { keys: [MOD, "\u21e7", "R"], isKey: true, label: "Rephrase the selection" },
      { keys: [MOD, "\u21e7", "1"], isKey: true, label: "Concise" },
      { keys: [MOD, "\u21e7", "2"], isKey: true, label: "Stronger verb" },
      { keys: [MOD, "\u21e7", "3"], isKey: true, label: "Warmer" },
      { keys: [MOD, "\u21e7", "4"], isKey: true, label: "Fix grammar" },
    ],
  },
  {
    title: "Design & templates",
    icon: "ri-palette-line",
    rows: [
      { keys: [ALT, "D"], isKey: true, label: "Open the Design chooser" },
    ],
  },
  {
    title: "My Work Highlights",
    icon: "ri-sparkling-2-line",
    rows: [
      {
        keys: [ALT, "H"],
        isKey: true,
        label: "Open My Work Highlights",
      },
    ],
  },
  {
    title: "Resize the panes",
    icon: "ri-drag-move-2-line",
    rows: [
      { keys: ["Drag the gutter"], label: "Resize the document pane" },
      { keys: ["Double-click"], label: "Reset the split to Fit" },
      { keys: [ALT, "\u2190"], isKey: true, label: "Nudge the split left" },
      { keys: [ALT, "\u2192"], isKey: true, label: "Nudge the split right" },
    ],
  },
  {
    title: "This panel",
    icon: "ri-question-line",
    rows: [
      { keys: [ALT, "I"], isKey: true, label: "Jump to the \u201cAsk AI to change it\u201d box" },
      { keys: ["?"], isKey: true, label: "Show or hide this cheat sheet" },
      { keys: ["Esc"], isKey: true, label: "Close it" },
    ],
  },
];

/** Render a shortcut's right-hand side: key caps or a single action chip. */
function KeyCaps({ keys, isKey }: { keys: string[]; isKey?: boolean }) {
  if (!isKey) {
    return (
      <span className="inline-flex items-center text-[10px] font-semibold text-foreground-500 bg-background-100 border border-background-200 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
        {keys[0]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 flex-shrink-0">
      {keys.map((key, index) => (
        <span key={key} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-[10px] text-foreground-300">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded border border-background-300 bg-background-50 text-[10px] font-semibold text-foreground-700">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/** Storage key prefix for remembering whether the panel was left open per document. */
const OPEN_PREFIX = "hirewave_shortcuts_open_";

function readOpen(key?: string): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(OPEN_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

function writeOpen(key: string | undefined, open: boolean): void {
  if (!key) return;
  try {
    if (open) localStorage.setItem(OPEN_PREFIX + key, "1");
    else localStorage.removeItem(OPEN_PREFIX + key);
  } catch {
    /* storage may be unavailable — non-fatal */
  }
}

interface ShortcutsCheatSheetProps {
  className?: string;
  /**
   * Per-document key (e.g. `resume_42`). When set, the open / closed state is
   * remembered so reopening the editor restores the panel the way you left it.
   */
  storageKey?: string;
  /**
   * Show the "My Work Highlights" group (résumé editor only). Defaults to false
   * so the cover-letter editor, which has no such flow, never lists a dead key.
   */
  showWorkHighlights?: boolean;
}

/** The index of the "My Work Highlights" group, so it can be conditionally removed. */
const WORK_HIGHLIGHTS_INDEX = GROUPS.findIndex(
  (group) => group.title === "My Work Highlights"
);

export default function ShortcutsCheatSheet({
  className = "",
  storageKey,
  showWorkHighlights = false,
}: ShortcutsCheatSheetProps) {
  const [open, setOpen] = useState(() => readOpen(storageKey));
  const [tipsReset, setTipsReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Re-read the remembered state when the editor switches to another document.
  useEffect(() => {
    setOpen(readOpen(storageKey));
  }, [storageKey]);

  // Remember the open / closed choice for this document.
  useEffect(() => {
    writeOpen(storageKey, open);
  }, [storageKey, open]);

  // "?" toggles it, Esc closes it — but never while the user is typing in a field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if (event.key === "?") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Close when clicking anywhere outside the popover.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  /** Bring the first-run shortcut tips back (they stay hidden until re-dismissed). */
  function showTipsAgain() {
    resetShortcutTips();
    setTipsReset(true);
    window.setTimeout(() => setTipsReset(false), 2600);
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        title="Keyboard shortcuts (press ?)"
        className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
          open
            ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
            : "bg-background-50 text-foreground-900 border-background-200 hover:bg-background-100"
        }`}
      >
        <span className="w-4 h-4 flex items-center justify-center">
          <i className="ri-question-line"></i>
        </span>
        <span>Shortcuts</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-xl border border-background-200 bg-background-50 p-4 animate-fade-in-up">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="font-heading text-sm font-medium text-foreground-950 inline-flex items-center gap-1.5">
              <span className="w-5 h-5 flex items-center justify-center rounded-md bg-primary-100 text-primary-700">
                <i className="ri-keyboard-line text-xs"></i>
              </span>
              Keyboard shortcuts
            </span>
            <kbd className="inline-flex items-center justify-center w-6 h-6 rounded border border-background-300 bg-background-50 text-[11px] font-semibold text-foreground-700">
              ?
            </kbd>
          </div>

          <div className="space-y-3">
            {(showWorkHighlights
              ? GROUPS
              : GROUPS.filter((_, index) => index !== WORK_HIGHLIGHTS_INDEX)
            ).map((group) => (
              <div key={group.title}>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-500 mb-1.5">
                  <i className={group.icon}></i>
                  {group.title}
                </span>
                <ul className="space-y-0.5">
                  {group.rows.map((row) => (
                    <li
                      key={row.label}
                      className="flex items-center justify-between gap-3 py-1"
                    >
                      <span className="text-xs text-foreground-700 min-w-0">{row.label}</span>
                      <KeyCaps keys={row.keys} isKey={row.isKey} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-3 pt-2.5 border-t border-background-200 text-[10px] text-foreground-400 leading-relaxed">
            Shortcuts work while the editor has focus. Rephrase keys apply to a text
            selection inside the rendered document.
          </p>
          <button
            type="button"
            onClick={showTipsAgain}
            title="Bring back the first-run shortcut tip at the top of the editor"
            className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-primary-700 bg-primary-50 border border-primary-200 hover:bg-primary-100 px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className={tipsReset ? "ri-check-line" : "ri-restart-line"}></i>
            {tipsReset ? "Shortcut tips will show again" : "Show shortcut tips again"}
          </button>
        </div>
      )}
    </div>
  );
}