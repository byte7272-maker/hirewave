import { useEffect, useRef, useState } from "react";

interface RoleAddBulletProps {
  /**
   * Called with the trimmed text — the caller inserts it verbatim (no AI, no
   * rewriting). Never called with empty/whitespace-only input. Return `false`
   * to signal the insert failed, so the "just added" row isn't shown.
   */
  onAdd: (text: string) => Promise<boolean | void> | boolean | void;
  /** Remove the just-added bullet (the inline "Undo"). */
  onUndo?: (text: string) => Promise<void> | void;
  /** Opt-in AI polish for the just-added bullet (runs improve-structured). */
  onPolish?: (text: string) => void;
  /**
   * Opt-in AI STRENGTHEN for the just-added bullet — a punchier, outcome-first
   * rewrite, separate from the general polish. Runs improve-structured.
   */
  onStrengthen?: (text: string) => void;
  /** True while an AI polish launched from the just-added row is in flight. */
  polishing?: boolean;
  /** True while the caller is persisting a change for this row, so it locks. */
  busy?: boolean;
  /** Button label — defaults to "Add bullet". */
  label?: string;
  /** Total bullets in this target — enables the bulk "Strengthen all" action. */
  strengthenAllCount?: number;
  /**
   * Strengthen EVERY bullet in this target at once with AI — a punchier,
   * outcome-first pass over the whole list, separate from the one-at-a-time
   * polish. Only shown when there's more than one bullet to strengthen.
   */
  onStrengthenAll?: () => void;
}

/**
 * A small "+ Add bullet" affordance shown under each Experience/role entry. This
 * is the companion to the AI guidance box: where guidance only *rewrites* what's
 * already on the page, this lets the user type a real accomplishment in their
 * own words and have it dropped in exactly as typed.
 *
 * Clicking reveals a single-line, auto-growing input with Add / Cancel. Enter
 * submits, Esc cancels (and Shift+Enter inserts a newline).
 *
 * After a bullet is added, the affordance turns into a tiny confirmation row —
 * an opt-in "Polish with AI" (runs improve-structured, facts preserved) and an
 * inline "Undo" to remove the bullet if it was mistyped.
 */
export default function RoleAddBullet({
  onAdd,
  onUndo,
  onPolish,
  onStrengthen,
  polishing = false,
  busy = false,
  label = "Add bullet",
  strengthenAllCount = 0,
  onStrengthenAll,
}: RoleAddBulletProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  /** The text of the bullet just added, so Undo / Polish can act on it. */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const locked = busy || adding;

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function submit() {
    const text = value.trim();
    if (!text || locked) return;
    setValue("");
    setOpen(false);
    setAdding(true);
    try {
      const result = await onAdd(text);
      if (result !== false) setJustAdded(text);
    } finally {
      setAdding(false);
    }
  }

  function cancel() {
    setValue("");
    setOpen(false);
  }

  function openInput() {
    setJustAdded(null);
    setOpen(true);
  }

  /** Remove the bullet we just added, then clear the confirmation row. */
  async function undo() {
    if (!justAdded || undoing) return;
    setUndoing(true);
    try {
      await onUndo?.(justAdded);
      setJustAdded(null);
    } finally {
      setUndoing(false);
    }
  }

  if (open) {
    return (
      <div className="hw-print-hide mt-2 flex items-start gap-1.5">
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          onChange={(e) => {
            setValue(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder="Add an accomplishment in your own words…"
          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-background-50 border border-background-200 text-xs text-foreground-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none overflow-hidden"
        />
        <button
          type="button"
          onClick={submit}
          disabled={locked || !value.trim()}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-background-50 dark:text-foreground-950 bg-secondary-500 hover:bg-secondary-600 px-2.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {locked ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-check-line"></i>
          )}
          Add
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={locked}
          className="inline-flex items-center text-[11px] font-medium text-foreground-500 hover:text-foreground-900 px-1.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (justAdded) {
    return (
      <div className="hw-print-hide mt-1.5 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-700">
          <i className="ri-check-line"></i>
          Added
        </span>
        {onPolish && (
          <button
            type="button"
            onClick={() => onPolish(justAdded)}
            disabled={polishing}
            title="Run the AI improve on this bullet — it rewrites for clarity and keeps every fact"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-background-50 dark:text-foreground-950 bg-secondary-500 hover:bg-secondary-600 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={polishing ? "ri-loader-4-line animate-spin" : "ri-sparkling-line"}></i>
            Polish with AI
          </button>
        )}
        {onStrengthen && (
          <button
            type="button"
            onClick={() => onStrengthen(justAdded)}
            disabled={polishing}
            title="Strengthen this bullet with AI — punchier verbs and clearer impact, no new facts"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={polishing ? "ri-loader-4-line animate-spin" : "ri-rocket-2-line"}></i>
            Strengthen with AI
          </button>
        )}
        {onUndo && (
          <button
            type="button"
            onClick={undo}
            disabled={undoing}
            title="Remove the bullet you just added"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-600 bg-background-100 hover:bg-background-200 border border-background-200 hover:text-foreground-900 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={undoing ? "ri-loader-4-line animate-spin" : "ri-arrow-go-back-line"}></i>
            Undo
          </button>
        )}
      </div>
    );
  }

  if (locked) {
    return (
      <span className="hw-print-hide mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground-500">
        <i className="ri-loader-4-line animate-spin"></i>
        Adding…
      </span>
    );
  }

  const canStrengthenAll = Boolean(onStrengthenAll) && strengthenAllCount > 1;

  return (
    <div className="hw-print-hide mt-1.5 flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        onClick={openInput}
        title="Add an accomplishment in your own words — inserted exactly as typed, no AI rewriting"
        className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 bg-background-100 hover:bg-background-200 border border-background-200 hover:text-foreground-900 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-add-line"></i>
        {label}
      </button>
      {canStrengthenAll && (
        <button
          type="button"
          onClick={() => onStrengthenAll?.()}
          disabled={locked || polishing}
          title={`Strengthen all ${strengthenAllCount} bullets here at once with AI — punchier verbs and clearer impact, no new facts`}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className={polishing ? "ri-loader-4-line animate-spin" : "ri-rocket-2-line"}></i>
          Strengthen all ({strengthenAllCount})
        </button>
      )}
    </div>
  );
}