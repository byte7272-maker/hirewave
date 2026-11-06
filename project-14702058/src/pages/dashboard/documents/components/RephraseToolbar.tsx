import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  rephraseDocument,
  type RephraseMode,
  type RephraseOption,
} from "@/lib/documents";
import {
  clearRephraseInstruction,
  readRephraseInstruction,
  writeRephraseInstruction,
  type RememberedRephraseInstruction,
} from "@/lib/rephraseInstructionMemory";

/**
 * The floating "Ask AI to rephrase" toolbar shown next to a text selection in
 * the rendered document. It offers a plain Rephrase plus quick presets, then a
 * small pick-list of rewritten options. Choosing an option replaces the
 * selection; if that option contains an AI-invented figure it must be confirmed
 * first — the same invented-numbers safeguard the Improve flow uses.
 *
 * Rendered into a portal with fixed positioning, so it always floats above the
 * document regardless of the viewer's scroll / zoom / transform.
 */

const PRESETS = ["Concise", "Stronger verb", "Warmer", "Fix grammar"] as const;

/** Number key each preset maps to, for the Ctrl/⌘+Shift+N shortcut hint. */
const PRESET_KEY: Record<string, string> = {
  Concise: "1",
  "Stronger verb": "2",
  Warmer: "3",
  "Fix grammar": "4",
};

const MODE_LABEL: Record<RephraseMode, string> = {
  word: "word",
  sentence: "sentence",
  paragraph: "paragraph",
};

interface RephraseToolbarProps {
  anchor: { left: number; top: number };
  selectionText: string;
  context: string;
  mode: RephraseMode;
  /**
   * Per-document key so the last-used preset / custom instruction is remembered
   * and the toolbar opens with that choice pre-filled next time.
   */
  memoryKey?: string;
  onApply: (text: string, instruction?: string) => void;
  onClose: () => void;
  /**
   * Lets the toolbar expose its presets as keyboard shortcuts (Ctrl/⌘+Shift+R
   * for a plain rephrase, Ctrl/⌘+Shift+1–4 for the presets). Passes the runner
   * up and returns an unregister function.
   */
  onRegisterShortcut?: (handler: (instruction?: string) => void) => () => void;
  /**
   * Lets the toolbar expose copying the selection as a shortcut
   * (Ctrl/⌘+Shift+C). Passes the runner up and returns an unregister function.
   */
  onRegisterCopyShortcut?: (handler: () => void) => () => void;
}

export default function RephraseToolbar({
  anchor,
  selectionText,
  context,
  mode,
  memoryKey,
  onApply,
  onClose,
  onRegisterShortcut,
  onRegisterCopyShortcut,
}: RephraseToolbarProps) {
  // The last instruction used for this document, so the toolbar opens pre-filled.
  const [remembered, setRemembered] = useState<RememberedRephraseInstruction | null>(
    () => (memoryKey ? readRephraseInstruction(memoryKey) : null)
  );
  const [options, setOptions] = useState<RephraseOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [instruction, setInstruction] = useState(
    remembered?.kind === "custom" ? remembered.value : ""
  );
  const [showCustom, setShowCustom] = useState(remembered?.kind === "custom");
  /** The preset the user reached for last, so it can be shown pre-selected. */
  const [activePreset, setActivePreset] = useState<string | null>(
    remembered?.kind === "preset" &&
      (PRESETS as readonly string[]).includes(remembered.value)
      ? remembered.value
      : null
  );
  const [lastInstruction, setLastInstruction] = useState<string | undefined>(undefined);
  /** An option awaiting the flagged-figure confirmation before it can be inserted. */
  const [pending, setPending] = useState<RephraseOption | null>(null);
  /** Brief "Copied ✓" confirmation after the selection is copied. */
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  /** Copy the selected span (before it's rewritten) to the clipboard. */
  async function copySelection() {
    if (!selectionText) return;
    try {
      await navigator.clipboard.writeText(selectionText);
    } catch {
      // Fallback for browsers without the async clipboard API.
      try {
        const area = document.createElement("textarea");
        area.value = selectionText;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      } catch {
        return;
      }
    }
    setCopied(true);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1400);
  }

  const copyRef = useRef(copySelection);
  copyRef.current = copySelection;
  useEffect(() => {
    if (!onRegisterCopyShortcut) return;
    return onRegisterCopyShortcut(() => {
      void copyRef.current();
    });
  }, [onRegisterCopyShortcut]);

  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    []
  );

  async function run(nextInstruction?: string, count = 3) {
    if (loading) return;
    setLoading(true);
    setError("");
    setOptions(null);
    setPending(null);
    setLastInstruction(nextInstruction);
    // Remember the last-used instruction for this document so the toolbar opens
    // pre-filled next time (a plain rephrase leaves the memory untouched).
    if (nextInstruction) {
      const isPreset = (PRESETS as readonly string[]).includes(nextInstruction);
      setActivePreset(isPreset ? nextInstruction : null);
      const next: RememberedRephraseInstruction = {
        kind: isPreset ? "preset" : "custom",
        value: nextInstruction,
      };
      writeRephraseInstruction(memoryKey ?? "", next);
      setRemembered(next);
    }
    try {
      const res = await rephraseDocument({
        text: selectionText,
        mode,
        instruction: nextInstruction || undefined,
        context,
        count,
      });
      const target = selectionText.trim();
      setOptions(res.options.filter((o) => o.text.trim() && o.text.trim() !== target));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't rephrase right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // Keyboard shortcuts run the latest `run` without re-registering every render.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!onRegisterShortcut) return;
    return onRegisterShortcut((instruction) => {
      void runRef.current(instruction);
    });
  }, [onRegisterShortcut]);

  function choose(option: RephraseOption) {
    if (option.flagged_metrics.length > 0) {
      setPending(option);
      return;
    }
    onApply(option.text, lastInstruction);
    onClose();
  }

  /** Forget the remembered choice for this document and reset to defaults. */
  function clearRemembered() {
    if (memoryKey) clearRephraseInstruction(memoryKey);
    setRemembered(null);
    setActivePreset(null);
    setInstruction("");
    setShowCustom(false);
  }

  const truncated =
    selectionText.length > 90 ? `${selectionText.slice(0, 90).trimEnd()}…` : selectionText;

  return (
    <div
      data-rephrase-toolbar
      className="fixed z-[80] w-[22rem] max-w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-full"
      style={{ left: anchor.left, top: anchor.top }}
      // Keep the iframe selection alive while interacting with the toolbar.
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("input, textarea, select")) return;
        event.preventDefault();
      }}
    >
      <div className="rounded-xl border border-background-300 bg-background-50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-background-200 bg-background-100/70">
          <span className="w-5 h-5 flex items-center justify-center rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-magic-line text-xs"></i>
          </span>
          <span className="text-xs font-semibold text-foreground-900">Rephrase</span>
          <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-wide text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded whitespace-nowrap">
            {MODE_LABEL[mode]}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                void copySelection();
              }}
              title="Copy the selection (⌘/Ctrl + Shift + C)"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-200 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className={copied ? "ri-check-line" : "ri-file-copy-line"}></i>
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close rephrase"
              className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
            >
              <i className="ri-close-line text-sm"></i>
            </button>
          </div>
        </div>

        <div className="p-3 space-y-3">
          {/* The selected span */}
          <p className="text-xs text-foreground-600 leading-relaxed bg-background-100 rounded-md px-2.5 py-2 max-h-16 overflow-y-auto">
            <i className="ri-double-quotes-l text-foreground-400 mr-1"></i>
            {truncated}
          </p>

          {pending ? (
            /* Invented-numbers safeguard — confirm before inserting. */
            <div className="rounded-lg border border-accent-300 bg-accent-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground-900 flex items-center gap-1.5">
                <i className="ri-alert-line text-accent-600"></i>
                This option adds a figure that isn&apos;t in your document
              </p>
              <ul className="mt-1.5 space-y-1">
                {pending.flagged_metrics.map((flag, index) => (
                  <li key={`${flag.field}-${index}`} className="flex items-start gap-2">
                    <span
                      className="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0"
                      style={{
                        background: "#fef08a",
                        borderBottom: "2px solid #eab308",
                        color: "#713f12",
                      }}
                    >
                      {flag.value}
                    </span>
                    <span className="text-[11px] text-foreground-700 leading-relaxed">
                      {flag.text || "Added by AI — confirm it's real before inserting."}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-foreground-500">
                Only insert if this number is accurate — otherwise pick another option.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onApply(pending.text, lastInstruction);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-check-line"></i>
                  It&apos;s accurate — insert
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="text-xs font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Quick presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => run(undefined)}
                  disabled={loading}
                  title="Rephrase (⌘/Ctrl + Shift + R)"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-full hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line"></i>
                  Rephrase
                  <kbd className="hidden sm:inline-flex items-center px-1 py-0.5 rounded bg-background-50/25 text-[9px] font-semibold">
                    ⌘⇧R
                  </kbd>
                </button>
                {PRESETS.map((preset) => {
                  const active = activePreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => run(preset)}
                      disabled={loading}
                      title={`${preset} (⌘/Ctrl + Shift + ${PRESET_KEY[preset]})${
                        active ? " · your last choice" : ""
                      }`}
                      className={`inline-flex items-center gap-1 text-xs font-medium border px-2.5 py-1.5 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                        active
                          ? "bg-primary-100 text-primary-900 border-primary-300"
                          : "bg-secondary-100 text-secondary-900 border-secondary-200 hover:bg-secondary-200"
                      }`}
                    >
                      {active && <i className="ri-check-line text-[11px]"></i>}
                      {preset}
                      <kbd
                        className={`hidden sm:inline-flex items-center px-1 py-0.5 rounded border bg-background-50 text-[9px] font-semibold ${
                          active
                            ? "border-primary-200 text-primary-700"
                            : "border-secondary-200 text-foreground-500"
                        }`}
                      >
                        ⇧{PRESET_KEY[preset]}
                      </kbd>
                    </button>
                  );
                })}
              </div>

              {/* Shortcut legend */}
              <p className="hidden sm:flex items-center gap-1.5 text-[10px] text-foreground-400">
                <i className="ri-command-line"></i>
                ⌘/Ctrl + Shift + R rephrases · +1–4 runs the presets · +C copies
              </p>

              {/* Remembered choice — makes the pre-fill obvious, with a one-tap reset */}
              {(activePreset || remembered?.kind === "custom") && (
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-foreground-400">
                  <i className="ri-bookmark-line flex-shrink-0"></i>
                  <span className="truncate">
                    {activePreset
                      ? `Pre-selected: ${activePreset} (your last choice here)`
                      : "Your last custom instruction is pre-filled below"}
                  </span>
                  <button
                    type="button"
                    onClick={clearRemembered}
                    title="Forget this remembered choice"
                    className="ml-auto inline-flex items-center gap-0.5 font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer whitespace-nowrap flex-shrink-0 transition-colors"
                  >
                    <i className="ri-close-circle-line"></i>
                    Clear
                  </button>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-foreground-500 py-1">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Rephrasing…
                </div>
              )}

              {/* Options pick-list */}
              {!loading && options && options.length > 0 && (
                <div>
                  <span className="block text-[11px] font-medium text-foreground-500 mb-1.5">
                    Pick a rewrite
                  </span>
                  <ul className="space-y-1.5">
                    {options.map((option, index) => (
                      <li key={`${index}-${option.text.slice(0, 12)}`}>
                        <button
                          type="button"
                          onClick={() => choose(option)}
                          className="w-full text-left text-xs text-foreground-800 leading-relaxed bg-background-100 hover:bg-primary-100 border border-background-200 hover:border-primary-300 px-2.5 py-2 rounded-lg transition-colors cursor-pointer"
                        >
                          {option.text}
                          {option.flagged_metrics.length > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-medium text-accent-800">
                              <i className="ri-alert-line"></i>
                              adds {option.flagged_metrics.map((f) => f.value).join(", ")}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => run(lastInstruction, 5)}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-refresh-line"></i>
                    More options
                  </button>
                </div>
              )}

              {!loading && options && options.length === 0 && (
                <p className="text-xs text-foreground-500">
                  No suggestions came back — try a different instruction.
                </p>
              )}

              {/* Custom instruction */}
              {showCustom ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        run(instruction.trim() || undefined);
                      }
                    }}
                    placeholder="e.g. make it more senior"
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-md bg-background-50 border border-background-200 text-xs text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                  />
                  <button
                    type="button"
                    onClick={() => run(instruction.trim() || undefined)}
                    disabled={loading}
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 hover:bg-secondary-600 transition-colors disabled:opacity-60 cursor-pointer flex-shrink-0"
                    aria-label="Run custom instruction"
                  >
                    <i className="ri-arrow-right-line text-sm"></i>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-500 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-edit-2-line"></i>
                  Custom instruction
                </button>
              )}

              {error && (
                <p className="text-[11px] text-accent-800 flex items-start gap-1.5">
                  <i className="ri-error-warning-line mt-0.5"></i>
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}