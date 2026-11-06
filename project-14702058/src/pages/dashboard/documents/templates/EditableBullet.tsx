import { useEffect, useRef, useState } from "react";
import type { FlaggedMetric } from "@/lib/documents";
import { renderMetricText } from "./metricText";

interface EditableBulletProps {
  /** The bullet's text. */
  text: string;
  /** Metric-flag field path, so AI-added figures stay highlighted. */
  fieldPrefix: string;
  flags?: FlaggedMetric[];
  /**
   * Replace this bullet's text VERBATIM. Throwing keeps the editor open so the
   * user can retry without losing what they typed.
   */
  onEdit?: (newText: string) => Promise<void> | void;
  /** Remove this bullet. */
  onRemove?: () => Promise<void> | void;
  /**
   * Move this bullet one slot earlier in its list. Omitted when it's already
   * first, so the control only appears when it can actually do something.
   */
  onMoveUp?: () => Promise<void> | void;
  /**
   * Move this bullet one slot later in its list. Omitted when it's already last.
   */
  onMoveDown?: () => Promise<void> | void;
  /** Opt-in AI polish for this bullet (runs improve-structured). */
  onPolish?: (text: string) => void;
  /**
   * Opt-in AI STRENGTHEN for this bullet — a punchier, outcome-first rewrite
   * (runs improve-structured). Separate from the general polish, which only
   * tightens wording.
   */
  onStrengthen?: (text: string) => void;
  /** True while the host is persisting a change for this row. */
  busy?: boolean;
  /** True while an AI polish launched elsewhere is in flight. */
  polishing?: boolean;
}

/**
 * A single bullet on the rendered paper. When the host passes actions it turns
 * into an editable row: on hover (or focus / touch) it reveals small controls to
 * edit the text inline, polish it with AI, or remove it. Editing swaps the text
 * for a one-line auto-growing input — Enter saves, Esc cancels.
 *
 * Purely presentational when no actions are passed, so read-only contexts (the
 * export paper, the AI preview) render the plain highlighted text.
 */
export default function EditableBullet({
  text,
  fieldPrefix,
  flags,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
  onPolish,
  onStrengthen,
  busy = false,
  polishing = false,
}: EditableBulletProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Keep the draft aligned with the source whenever we're not actively editing.
  useEffect(() => {
    if (!editing) setValue(text);
  }, [text, editing]);

  const locked = busy || saving || removing;

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function save() {
    const next = value.trim();
    if (!next || locked) return;
    if (next === text) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onEdit?.(next);
      setEditing(false);
    } catch {
      /* keep the editor open so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setValue(text);
    setEditing(false);
  }

  async function remove() {
    if (locked) return;
    setRemoving(true);
    try {
      await onRemove?.();
    } finally {
      setRemoving(false);
    }
  }

  if (editing) {
    return (
      <span className="hw-print-hide flex items-start gap-1.5 w-full">
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
              save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          className="flex-1 min-w-0 px-2 py-1 rounded-md bg-background-50 border border-background-200 text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none overflow-hidden"
          style={{ font: "inherit", fontSize: "inherit", lineHeight: "inherit" }}
        />
        <button
          type="button"
          onClick={save}
          disabled={locked || !value.trim()}
          title="Save this bullet"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-background-50 dark:text-foreground-950 bg-secondary-500 hover:bg-secondary-600 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-check-line"></i>}
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={locked}
          className="text-[11px] font-medium text-foreground-500 hover:text-foreground-900 px-1.5 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          Cancel
        </button>
      </span>
    );
  }

  const hasActions = Boolean(
    onEdit || onRemove || onPolish || onStrengthen || onMoveUp || onMoveDown
  );

  return (
    <span className="group/bullet flex items-start gap-2 w-full">
      <span className="flex-1 min-w-0">{renderMetricText(text, fieldPrefix, flags)}</span>
      {hasActions && (
        <span className="hw-print-hide hw-hover-reveal inline-flex items-center gap-1 flex-shrink-0 opacity-0 group-hover/bullet:opacity-100 group-focus-within/bullet:opacity-100 transition-opacity mt-0.5">
          {onMoveUp && (
            <button
              type="button"
              onClick={() => void onMoveUp()}
              disabled={locked}
              title="Move this bullet up"
              aria-label="Move this bullet up"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-arrow-up-line text-[11px]"></i>
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={() => void onMoveDown()}
              disabled={locked}
              title="Move this bullet down"
              aria-label="Move this bullet down"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-arrow-down-line text-[11px]"></i>
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Edit this bullet"
              aria-label="Edit this bullet"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-900 hover:bg-background-200 transition-colors cursor-pointer"
            >
              <i className="ri-pencil-line text-[11px]"></i>
            </button>
          )}
          {onPolish && (
            <button
              type="button"
              onClick={() => onPolish(text)}
              disabled={polishing}
              title="Polish this bullet with AI — rewrites for clarity, keeps every fact"
              aria-label="Polish this bullet with AI"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-secondary-500 text-background-50 dark:text-foreground-950 hover:bg-secondary-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={polishing ? "ri-loader-4-line animate-spin text-[11px]" : "ri-sparkling-line text-[11px]"}></i>
            </button>
          )}
          {onStrengthen && (
            <button
              type="button"
              onClick={() => onStrengthen(text)}
              disabled={polishing}
              title="Strengthen this bullet with AI — punchier verbs and clearer impact, no new facts"
              aria-label="Strengthen this bullet with AI"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 hover:bg-accent-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={polishing ? "ri-loader-4-line animate-spin text-[11px]" : "ri-rocket-2-line text-[11px]"}></i>
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={remove}
              disabled={locked}
              title="Remove this bullet"
              aria-label="Remove this bullet"
              className="w-5 h-5 inline-flex items-center justify-center rounded-md bg-background-100 border border-background-200 text-foreground-600 hover:text-accent-700 hover:bg-accent-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className={removing ? "ri-loader-4-line animate-spin text-[11px]" : "ri-delete-bin-line text-[11px]"}></i>
            </button>
          )}
        </span>
      )}
    </span>
  );
}