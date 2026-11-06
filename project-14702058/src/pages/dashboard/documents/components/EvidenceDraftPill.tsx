import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { evidenceStepLabel, clearEvidenceDraft } from "@/lib/evidenceDraft";
import { evidenceResumeHref } from "@/lib/evidenceResumeTarget";

interface EvidenceDraftPillProps {
  /** The résumé this draft belongs to (used for the resume link). */
  resumeId: string | number;
  /** The wizard step the draft is paused on. */
  step: number;
  /** A one-line "what's waiting" summary, e.g. "6 facts to review". */
  summary: string;
  /** Called after the draft is discarded, so the host can refresh its list. */
  onDiscard?: () => void;
}

/**
 * The "In progress" pill on a résumé row. It names the paused step at rest and
 * expands, on click, to a one-line summary of what's waiting plus a one-click
 * jump back into the wizard. Closes on outside click or Escape.
 */
export default function EvidenceDraftPill({
  resumeId,
  step,
  summary,
  onDiscard,
}: EvidenceDraftPillProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const stepLabel = evidenceStepLabel(step);

  /** Clear the stalled wizard without ever opening it, then refresh the host. */
  function handleDiscard() {
    clearEvidenceDraft(resumeId);
    setOpen(false);
    onDiscard?.();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`Unfinished “My Work Highlights” wizard — paused on ${stepLabel}. Click for details.`}
        className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap hover:bg-accent-200 transition-colors cursor-pointer"
      >
        <span className="w-3.5 h-3.5 flex items-center justify-center animate-pulse">
          <i className="ri-loader-4-line"></i>
        </span>
        {stepLabel}
        <i
          className={`ri-arrow-down-s-line transition-transform ${open ? "rotate-180" : ""}`}
        ></i>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-64 rounded-lg bg-background-50 border border-background-200 p-3 text-left">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground-950">
            <i className="ri-sparkling-2-line text-accent-700"></i>
            My Work Highlights
          </p>
          <p className="mt-1.5 text-xs text-foreground-700 leading-relaxed">{summary}</p>
          <p className="mt-1 text-[11px] text-foreground-500">Paused on {stepLabel}</p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <Link
              to={evidenceResumeHref(resumeId)}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent-900 hover:text-accent-700 cursor-pointer whitespace-nowrap"
            >
              Resume wizard
              <i className="ri-arrow-right-line"></i>
            </Link>
            <button
              type="button"
              onClick={handleDiscard}
              title="Clear this unfinished wizard without opening it"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground-500 hover:text-accent-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-line"></i>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}