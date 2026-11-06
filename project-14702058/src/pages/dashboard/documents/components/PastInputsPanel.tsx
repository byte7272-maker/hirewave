import { useEffect, useState } from "react";
import type { IncorporateEntry } from "@/lib/incorporateHistory";
import { readImplementedOpen, writeImplementedOpen } from "@/lib/pastInputsMemory";

/** Which submissions the log is currently showing. */
type StatusFilter = "all" | "implemented" | "not-implemented";

interface PastInputsPanelProps {
  /** The submissions to list, oldest first. */
  entries: IncorporateEntry[];
  /** Locks the actions while a submission is in flight. */
  busy?: boolean;
  /** Re-send every not-yet-implemented submission through the AI. */
  onRerun: (entries: IncorporateEntry[]) => void;
  /** Re-send just one submission through the AI. */
  onRerunOne?: (entry: IncorporateEntry) => void;
  /** Open this entry's impact painted onto the rendered document. */
  onViewImpact?: (entry: IncorporateEntry) => void;
  /** Drop one entry from the history. */
  onRemove: (id: string) => void;
  /** Forget the whole history for this document. */
  onClear?: () => void;
  /** Optional heading override. */
  title?: string;
  /**
   * Display label of the role a re-run is nudged toward (the document's current
   * improve target), so the user knows re-running also steers toward that job.
   */
  rerunRoleLabel?: string | null;
  /**
   * Per-document key used to remember whether the "Implemented" group was left
   * open, so power users who like it expanded don't re-open it every visit.
   */
  memoryKey?: string;
}

/** The selectable views for the log. */
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "implemented", label: "Implemented" },
  { id: "not-implemented", label: "Not implemented" },
];

/** A compact "submitted on …" stamp; empty when the date is unparseable. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The "past inputs" log for the "Add your own points" panel.
 *
 * Each entry shows whether the notes / instructions the user wrote actually
 * landed in the document (Implemented), where the AI applied them (the impacted
 * sections, highlighted), and — for everything that never landed — a single
 * button to re-run those submissions in one go (nudged toward the current target
 * role).
 *
 * Implemented entries — which need no further action — are tucked into a single
 * collapsible "Implemented (N)" group, closed by default, so the log stays
 * focused on what still needs attention. A status filter can open them back up
 * (or isolate implemented / not-implemented).
 */
export default function PastInputsPanel({
  entries,
  busy = false,
  onRerun,
  onRerunOne,
  onViewImpact,
  onRemove,
  onClear,
  title = "Your past inputs",
  rerunRoleLabel = null,
  memoryKey,
}: PastInputsPanelProps) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  // Implemented entries live in one collapsible group, closed by default — but
  // the open/closed choice is remembered per document.
  const [implementedOpen, setImplementedOpen] = useState(() =>
    readImplementedOpen(memoryKey)
  );

  // Follow the remembered choice when the document (memory key) changes.
  useEffect(() => {
    setImplementedOpen(readImplementedOpen(memoryKey));
  }, [memoryKey]);

  /** Toggle the "Implemented" group and remember the choice for this document. */
  const toggleImplemented = () => {
    setImplementedOpen((open) => {
      const next = !open;
      writeImplementedOpen(memoryKey, next);
      return next;
    });
  };

  if (entries.length === 0) return null;

  const implemented = entries.filter((e) => e.status === "implemented");
  const notImplemented = entries.filter((e) => e.status !== "implemented");
  const counts: Record<StatusFilter, number> = {
    all: entries.length,
    implemented: implemented.length,
    "not-implemented": notImplemented.length,
  };

  /** One submission card — shared by the inline list and the collapsed group. */
  const renderEntry = (entry: IncorporateEntry) => {
    const done = entry.status === "implemented";
    return (
      <li
        key={entry.id}
        className="rounded-lg border border-background-200 bg-background-50 px-3 py-2.5"
      >
        <div className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 w-5 h-5 flex items-center justify-center rounded-md flex-shrink-0 ${
              done ? "bg-primary-100 text-primary-700" : "bg-accent-100 text-accent-700"
            }`}
          >
            <i className={done ? "ri-check-line" : "ri-time-line"}></i>
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  done ? "bg-primary-100 text-primary-900" : "bg-accent-100 text-accent-900"
                }`}
              >
                <i className={done ? "ri-check-double-line" : "ri-close-circle-line"}></i>
                {done ? "Implemented" : "Not implemented"}
              </span>
              {formatWhen(entry.submittedAt) && (
                <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                  {formatWhen(entry.submittedAt)}
                </span>
              )}
            </div>

            {entry.text && (
              <p className="mt-1.5 text-sm text-foreground-800 leading-relaxed whitespace-pre-wrap">
                {entry.text}
              </p>
            )}

            {entry.ideas.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {entry.ideas.map((idea, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full max-w-full"
                    title={idea}
                  >
                    <i className="ri-price-tag-3-line flex-shrink-0"></i>
                    <span className="truncate">{idea}</span>
                  </span>
                ))}
              </div>
            )}

            {done && entry.impacted.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 whitespace-nowrap">
                  <i className="ri-map-pin-2-line"></i>
                  Landed in
                </span>
                {entry.impacted.map((section, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-200 px-2 py-0.5 rounded-full whitespace-nowrap"
                  >
                    <i className="ri-check-line"></i>
                    {section}
                  </span>
                ))}
              </div>
            )}
          </div>

          {(onRerunOne || onViewImpact) && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {!done && onRerunOne && (
                <button
                  type="button"
                  onClick={() => onRerunOne(entry)}
                  disabled={busy}
                  title={`Send just this input through the AI again${
                    rerunRoleLabel ? `, targeting ${rerunRoleLabel}` : ""
                  }`}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-700 bg-primary-100 hover:bg-primary-200 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className="ri-refresh-line"></i>
                  Re-run just this one
                </button>
              )}
              {done &&
                onViewImpact &&
                (entry.impacted.length > 0 || (entry.passages?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => onViewImpact(entry)}
                    title="Open your résumé with the parts this input changed highlighted"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-100 hover:bg-accent-200 px-2 py-0.5 rounded-full transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-eye-line"></i>
                    View on paper
                  </button>
                )}
            </div>
          )}

          <button
            type="button"
            onClick={() => onRemove(entry.id)}
            disabled={busy}
            title="Remove from history"
            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-900 hover:bg-background-100 flex-shrink-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      </li>
    );
  };

  const emptyState = (label: string) => (
    <div className="rounded-lg border border-dashed border-background-300 bg-background-50 py-6 text-center">
      <i className="ri-filter-off-line text-lg text-foreground-400"></i>
      <p className="mt-1.5 text-xs text-foreground-500">No {label} inputs yet.</p>
    </div>
  );

  return (
    <div className="pt-5 border-t border-background-200">
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-heading font-medium text-foreground-900 flex items-center gap-2">
          <i className="ri-history-line text-primary-600"></i>
          {title}
          <span className="text-xs font-normal text-foreground-500">({entries.length})</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {notImplemented.length > 0 && (
            <button
              type="button"
              onClick={() => onRerun(notImplemented)}
              disabled={busy}
              title={`Send the notes that never landed through the AI again${
                rerunRoleLabel ? `, targeting ${rerunRoleLabel}` : ""
              }`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-primary-500 hover:bg-primary-600 border border-primary-500 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className={busy ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
              Re-run {notImplemented.length} not implemented
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              title="Forget this document's past inputs"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground-500 hover:text-foreground-900 px-2 py-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <i className="ri-delete-bin-6-line"></i>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Status filter — All / Implemented / Not implemented. */}
      <div className="mb-3 inline-flex items-center gap-1 p-1 rounded-full bg-background-100 border border-background-200">
        {FILTERS.map((opt) => {
          const on = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                on
                  ? "bg-background-50 text-foreground-950 border border-background-300"
                  : "text-foreground-600 hover:text-foreground-950"
              }`}
            >
              {opt.label}
              <span className={on ? "text-foreground-500" : "text-foreground-400"}>
                {counts[opt.id]}
              </span>
            </button>
          );
        })}
      </div>

      {notImplemented.length > 0 && rerunRoleLabel && (
        <p className="mb-2 text-[11px] text-foreground-500 flex items-center gap-1.5">
          <i className="ri-focus-2-line"></i>
          Re-runs also tailor toward{" "}
          <span className="font-medium text-foreground-700">{rerunRoleLabel}</span>.
        </p>
      )}

      {/* Explicit "Implemented" view — everything expanded for inspection. */}
      {filter === "implemented" &&
        (implemented.length === 0 ? (
          emptyState("implemented")
        ) : (
          <ul className="space-y-2">{implemented.map(renderEntry)}</ul>
        ))}

      {/* Explicit "Not implemented" view. */}
      {filter === "not-implemented" &&
        (notImplemented.length === 0 ? (
          emptyState("not-implemented")
        ) : (
          <ul className="space-y-2">{notImplemented.map(renderEntry)}</ul>
        ))}

      {/* "All" view — not-implemented inline, implemented tucked into one group. */}
      {filter === "all" && (
        <>
          {notImplemented.length > 0 && (
            <ul className="space-y-2">{notImplemented.map(renderEntry)}</ul>
          )}

          {implemented.length > 0 && (
            <div
              className={`rounded-lg border border-background-200 bg-background-100/60 overflow-hidden ${
                notImplemented.length > 0 ? "mt-2" : ""
              }`}
            >
              <button
                type="button"
                onClick={toggleImplemented}
                aria-expanded={implementedOpen}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-background-200/60 transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
                  <i className="ri-check-double-line"></i>
                </span>
                <span className="text-xs font-semibold text-foreground-900 whitespace-nowrap">
                  Implemented
                </span>
                <span className="inline-flex items-center text-[11px] font-semibold text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {implemented.length}
                </span>
                <span className="ml-auto text-[11px] text-foreground-500 whitespace-nowrap hidden sm:inline">
                  {implementedOpen ? "Hide what landed" : "Show what landed"}
                </span>
                <i
                  className={`ri-arrow-down-s-line text-foreground-500 transition-transform ${
                    implementedOpen ? "rotate-180" : ""
                  }`}
                ></i>
              </button>
              {implementedOpen && (
                <ul className="space-y-2 p-2">{implemented.map(renderEntry)}</ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}