import { Link, useNavigate } from "react-router-dom";
import type { JobMatch } from "@/lib/jobs";
import type { JobCoverage } from "@/lib/versionCoverage";
import type { Application } from "@/lib/applications";
import { useToast } from "@/components/base/ToastProvider";
import { openTailorResume } from "@/lib/tailorResume";
import AuthenticityBadge from "@/components/feature/AuthenticityBadge";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip from "@/components/feature/SourceChip";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import OverflowMenu, { type OverflowMenuItem } from "@/pages/dashboard/components/OverflowMenu";
import { fitTone, fitToneLabel } from "@/pages/dashboard/components/tone";

interface MatchRowProps {
  match: JobMatch;
  index: number;
  coverage: JobCoverage | null;
  isSaved: boolean;
  appliedApp?: Application;
  appliedStageLabel?: string;
  isLastViewed: boolean;
  applying: boolean;
  tailoring: boolean;
  onToggleSave: (m: JobMatch) => void;
  onQuickApply: (m: JobMatch) => void;
  onApplyAndTailor: (m: JobMatch) => void;
  onView: (m: JobMatch) => void;
}

/**
 * A single ranked job-match row. Carries a colored "fit spine" down its left
 * edge, a medal-style rank badge for the top three, the fit label beneath the
 * score ring, and an entrance that staggers down the list.
 *
 * The row keeps only its two primary actions visible — the apply action and
 * View — with every secondary action tucked into the overflow menu.
 */
export default function MatchRow({
  match: m,
  index,
  coverage,
  isSaved,
  appliedApp,
  appliedStageLabel,
  isLastViewed,
  applying,
  tailoring,
  onToggleSave,
  onQuickApply,
  onApplyAndTailor,
  onView,
}: MatchRowProps) {
  const tone = fitTone(m.score);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const menuItems: OverflowMenuItem[] = [
    {
      key: "save",
      icon: isSaved ? "ri-bookmark-fill" : "ri-bookmark-line",
      label: isSaved ? "Saved" : "Save for later",
      hint: isSaved ? "Remove from saved jobs" : "Keep it in saved jobs",
      onClick: () => onToggleSave(m),
    },
    {
      key: "tailor",
      icon: "ri-sparkling-line",
      label: "Tailor résumé",
      hint: "Open your résumé for this role",
      onClick: () => {
        void openTailorResume(
          { jobId: m.job_id, jobTitle: m.title, jobCompany: m.company },
          navigate,
          () => {
            showToast("Upload a résumé first, then tailor it to this job.", "info");
            navigate("/dashboard/documents");
          },
        );
      },
    },
  ];

  if (!appliedApp) {
    menuItems.push({
      key: "applyTailor",
      icon: "ri-magic-line",
      label: "Apply and tailor",
      hint: "Add to pipeline + start a résumé",
      disabled: tailoring,
      onClick: () => onApplyAndTailor(m),
    });
  }

  if (m.url) {
    menuItems.push({
      key: "posting",
      icon: "ri-external-link-line",
      label: "View original posting",
      hint: "Opens on the source site",
      onClick: () => window.open(m.url, "_blank", "noopener,noreferrer"),
    });
  }

  return (
    <li
      className={`relative px-5 py-4 flex flex-wrap items-center gap-4 transition-colors animate-fade-in-up ${
        isLastViewed
          ? "bg-primary-50/40 ring-1 ring-inset ring-primary-200"
          : "hover:bg-background-100/40"
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: `oklch(var(--${tone}-500) / 0.85)` }}
      ></span>

      <RankBadge rank={index + 1} />

      <CompanyAvatar company={m.company} logo={m.company_logo} size={44} />

      <div className="flex-1 min-w-[240px]">
        <Link
          to={`/dashboard/jobs/${m.job_id}`}
          onClick={() => onView(m)}
          className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer"
        >
          {m.title}
        </Link>
        <p className="text-xs text-foreground-600 mt-0.5">{m.company}</p>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {appliedApp && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
              <i className="ri-check-double-line"></i>
              Applied{appliedStageLabel ? ` · ${appliedStageLabel}` : ""}
            </span>
          )}
          {coverage && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 whitespace-nowrap"
              title={`Your tailored version covers ${coverage.covered} of ${coverage.total} gaps for this role`}
            >
              <i className="ri-focus-2-line"></i>
              {coverage.covered}/{coverage.total} gaps covered
            </span>
          )}
          {m.category && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
              <i className="ri-price-tag-3-line"></i>
              {m.category}
            </span>
          )}
          {m.salary_display && (
            <span className="text-xs font-semibold text-foreground-900 whitespace-nowrap">
              {m.salary_display}
            </span>
          )}
          <SourceChip platform={m.source_platform} display={m.source_display} />
          {m.matching_skills.slice(0, 4).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 whitespace-nowrap"
            >
              <i className="ri-check-line"></i>
              {s}
            </span>
          ))}
          {m.gap_skills.slice(0, 3).map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap"
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

      {m.authenticity_score !== undefined && (
        <div className="flex-shrink-0">
          <AuthenticityBadge score={m.authenticity_score} />
        </div>
      )}

      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div
          className="relative w-12 h-12 rounded-full"
          style={{
            background: `conic-gradient(oklch(var(--${tone}-500)) ${m.score}%, oklch(var(--background-200)) ${m.score}% 100%)`,
          }}
          title={`${m.score}% fit`}
        >
          <div className="absolute inset-[3px] rounded-full bg-background-50 flex items-center justify-center">
            <span className="text-xs font-bold text-foreground-900">{m.score}</span>
          </div>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground-400 whitespace-nowrap">
          {fitToneLabel(m.score)}
        </span>
      </div>

      {appliedApp ? (
        <Link
          to="/dashboard/applications"
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-secondary-100 text-secondary-900 px-3.5 py-2 rounded-md hover:bg-secondary-200 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
        >
          <i className="ri-check-double-line"></i>
          In pipeline
        </Link>
      ) : (
        <button
          onClick={() => onQuickApply(m)}
          disabled={applying}
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex-shrink-0"
        >
          {applying ? (
            <i className="ri-loader-4-line animate-spin"></i>
          ) : (
            <i className="ri-flashlight-line"></i>
          )}
          {applying ? "Applying…" : "Quick apply"}
        </button>
      )}

      <Link
        to={`/dashboard/jobs/${m.job_id}`}
        onClick={() => onView(m)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
      >
        View
        <i className="ri-arrow-right-line text-xs"></i>
      </Link>

      <OverflowMenu items={menuItems} label={`More actions for ${m.title}`} />
    </li>
  );
}