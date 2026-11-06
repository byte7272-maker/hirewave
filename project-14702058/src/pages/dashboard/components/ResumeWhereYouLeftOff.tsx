import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { evidenceDraftSummary, evidenceStepLabel } from "@/lib/evidenceDraft";
import {
  findPausedEvidenceTarget,
  type PausedEvidenceTarget,
} from "@/lib/evidenceResumeTarget";

/**
 * A dashboard-hero shortcut that drops the user straight back into the paused
 * "My Work Highlights" wizard on their default résumé (last picked, else
 * most recently edited). Renders nothing when there's no unfinished wizard, so
 * it only appears when it can actually resume something.
 */
export default function ResumeWhereYouLeftOff() {
  const [target, setTarget] = useState<PausedEvidenceTarget | null>(null);

  useEffect(() => {
    let active = true;
    void findPausedEvidenceTarget().then((found) => {
      if (active) setTarget(found);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!target) return null;

  return (
    <Link
      to={`${target.href}&from=dashboard`}
      title={`Resume the “My Work Highlights” wizard on ${target.name} — paused on ${evidenceStepLabel(
        target.draft.step
      )}`}
      className="group mt-4 inline-flex items-center gap-3 rounded-xl bg-accent-500 text-background-50 dark:text-foreground-950 pl-3 pr-4 py-2.5 hover:bg-accent-600 transition-colors cursor-pointer max-w-full"
    >
      <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-50/20 flex-shrink-0">
        <i className="ri-history-line text-lg"></i>
      </span>
      <span className="min-w-0 text-left">
        <span className="block text-sm font-semibold whitespace-nowrap">
          Resume where you left off
        </span>
        <span className="block text-xs text-background-50/90 dark:text-foreground-950/80 truncate max-w-[300px]">
          {target.name} · {evidenceDraftSummary(target.draft)}
        </span>
      </span>
      <i className="ri-arrow-right-line ml-1 flex-shrink-0 transition-transform group-hover:translate-x-0.5"></i>
    </Link>
  );
}