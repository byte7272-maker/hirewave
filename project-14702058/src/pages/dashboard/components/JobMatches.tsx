import { useState } from "react";
import { Link } from "react-router-dom";
import type { JobMatch } from "@/lib/jobs";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip from "@/components/feature/SourceChip";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import FitDotChip from "@/pages/dashboard/components/FitDotChip";
import FitBandBar from "@/pages/dashboard/components/FitBandBar";
import { fitTone } from "@/pages/dashboard/components/tone";

interface JobMatchesProps {
  matches: JobMatch[];
  savedIds: Array<string | number>;
  onToggleSave: (job: JobMatch) => void;
  limit?: number;
  showViewAll?: boolean;
  title?: string;
  subtitle?: string;
  appliedIds?: Array<string | number>;
  onQuickApply?: (job: JobMatch) => void;
  applyingId?: string | number | null;
  /** Show the fit-band distribution summary above the list (home "Top matches"). */
  showQualityBar?: boolean;
}

export default function JobMatches({
  matches,
  savedIds,
  onToggleSave,
  limit,
  showViewAll = true,
  title = "Top matches",
  subtitle = "Ranked by fit",
  appliedIds = [],
  onQuickApply,
  applyingId,
  showQualityBar = false,
}: JobMatchesProps) {
  const [dismissed, setDismissed] = useState<Array<string | number>>([]);

  const visible = matches.filter(
    (m) => !dismissed.some((d) => String(d) === String(m.job_id))
  );
  const shown = limit ? visible.slice(0, limit) : visible;

  // Summarize the WHOLE ranked set (not just the limited rows) so the home screen
  // reads the shape of the matches at a glance.
  const bandCounts = {
    total: visible.length,
    strong: visible.filter((m) => m.score >= 90).length,
    good: visible.filter((m) => m.score >= 85 && m.score < 90).length,
    fair: visible.filter((m) => m.score < 85).length,
  };

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <PanelHeader
        icon="ri-focus-3-line"
        tone="primary"
        title={title}
        subtitle={subtitle}
        action={
          showViewAll ? (
            <Link
              to="/dashboard/matches"
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
            >
              View all
              <i className="ri-arrow-right-line"></i>
            </Link>
          ) : undefined
        }
      />

      {showQualityBar && visible.length > 0 && (
        <div className="px-5 pt-4">
          <FitBandBar counts={bandCounts} />
        </div>
      )}

      {shown.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3">
            <i className="ri-search-line text-xl"></i>
          </div>
          <p className="text-sm text-foreground-600">No matches found for that search.</p>
          <p className="text-xs text-foreground-400 mt-1">Try a broader keyword.</p>
        </div>
      ) : (
        <ul className="divide-y divide-background-200">
          {shown.map((m) => {
            const isSaved = savedIds.some((sid) => String(sid) === String(m.job_id));
            const tone = fitTone(m.score);
            return (
              <li
                key={m.job_id}
                className="px-5 py-4 flex flex-wrap items-center gap-4 hover:bg-background-100/40 transition-colors"
              >
                <CompanyAvatar company={m.company} logo={m.company_logo} size={44} />

                <div className="flex-1 min-w-[220px]">
                  <Link
                    to={`/dashboard/jobs/${m.job_id}`}
                    className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer truncate block"
                  >
                    {m.title}
                  </Link>
                  <p className="text-xs text-foreground-600 truncate mt-0.5">{m.company}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {m.salary_display && (
                      <span className="text-xs font-semibold text-foreground-900 whitespace-nowrap">
                        {m.salary_display}
                      </span>
                    )}
                    <FitDotChip score={m.score} />
                    <SourceChip platform={m.source_platform} display={m.source_display} />
                    {m.matching_skills.slice(0, 2).map((s) => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-background-200/70 text-foreground-600 whitespace-nowrap"
                      >
                        {s}
                      </span>
                    ))}
                    <CrossPostingBadge
                      likely_duplicate={m.likely_duplicate}
                      cross_postings={m.cross_postings}
                      cross_posting_ids={m.cross_posting_ids}
                      consolidated_count={m.consolidated_count}
                      consolidated_sources={m.consolidated_sources}
                    />
                  </div>
                </div>

                <div
                  className="relative w-12 h-12 rounded-full flex-shrink-0"
                  style={{
                    background: `conic-gradient(oklch(var(--${tone}-500)) ${m.score}%, oklch(var(--background-200)) ${m.score}% 100%)`,
                  }}
                  title={`${m.score}% fit`}
                >
                  <div className="absolute inset-[3px] rounded-full bg-background-50 flex items-center justify-center">
                    <span className="text-xs font-bold text-foreground-900">{m.score}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onToggleSave(m)}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg border cursor-pointer transition-colors ${
                      isSaved
                        ? "bg-primary-100 text-primary-700 border-primary-200"
                        : "text-foreground-400 border-background-300 hover:text-foreground-700 hover:border-foreground-300"
                    }`}
                    aria-label={isSaved ? "Unsave" : "Save"}
                  >
                    <i className={isSaved ? "ri-bookmark-fill" : "ri-bookmark-line"}></i>
                  </button>
                  <button
                    onClick={() => setDismissed((prev) => [...prev, m.job_id])}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border border-background-300 text-foreground-400 hover:text-foreground-700 hover:border-foreground-300 cursor-pointer transition-colors"
                    aria-label="Dismiss"
                  >
                    <i className="ri-close-line"></i>
                  </button>
                  <TailorResumeButton
                    jobId={m.job_id}
                    jobTitle={m.title}
                    jobCompany={m.company}
                  />
                  {onQuickApply && (
                    appliedIds.some((id) => String(id) === String(m.job_id)) ? (
                      <Link
                        to="/dashboard/applications"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-secondary-100 text-secondary-900 px-3.5 py-2 rounded-md hover:bg-secondary-200 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-check-double-line"></i>
                        In pipeline
                      </Link>
                    ) : (
                      <button
                        onClick={() => onQuickApply(m)}
                        disabled={applyingId === m.job_id}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        {applyingId === m.job_id ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className="ri-flashlight-line"></i>
                        )}
                        {applyingId === m.job_id ? "Applying…" : "Quick apply"}
                      </button>
                    )
                  )}
                  <Link
                    to={`/dashboard/jobs/${m.job_id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    View
                    <i className="ri-arrow-right-line text-xs"></i>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}