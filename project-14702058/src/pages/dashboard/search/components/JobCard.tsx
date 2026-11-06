import { Link } from "react-router-dom";
import type { Job } from "@/lib/jobs";
import { useApplications } from "@/hooks/useApplicationsStore";
import { APPLICATION_STAGES } from "@/lib/applications";
import AuthenticityBadge from "@/components/feature/AuthenticityBadge";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import GradeBadge from "@/pages/dashboard/documents/components/GradeBadge";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip from "@/components/feature/SourceChip";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import SmartImage from "@/components/base/SmartImage";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import { fitTone, fitToneLabel, toneDot } from "@/pages/dashboard/components/tone";
import { jobCoverImage } from "@/pages/dashboard/search/components/jobCover";

function formatDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function JobCard({
  job,
  rank,
  score,
}: {
  job: Job;
  rank?: number;
  score?: number | null;
}) {
  const href = `/dashboard/jobs/${job.id}`;
  const cover = jobCoverImage(job);
  const { applications } = useApplications();
  const appliedApp = applications.find((a) => String(a.job_id) === String(job.id));
  const appliedStage = appliedApp
    ? APPLICATION_STAGES.find((s) => s.id === appliedApp.status)
    : undefined;
  const hasScore = score != null;

  return (
    <div className="group relative rounded-xl bg-background-50 border border-background-200 hover:border-foreground-300 transition-colors flex flex-col overflow-hidden">
      {hasScore && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 z-10"
          style={{ background: `oklch(var(--${fitTone(score as number)}-500))` }}
        ></span>
      )}
      <Link to={href} className="block cursor-pointer" aria-label={`View ${job.title}`}>
        <div className="relative h-24">
          <SmartImage
            src={cover}
            alt=""
            title={`${job.category ?? "Role"} — visual`}
            ariaHidden
            className="absolute inset-0 w-full h-full object-cover"
            fallbackClassName="bg-gradient-to-br from-secondary-100 via-background-100 to-accent-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground-950/55 via-foreground-950/10 to-transparent"></div>
          {(typeof rank === "number" || hasScore) && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              {typeof rank === "number" && <RankBadge rank={rank} size="sm" />}
              {hasScore && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-background-50/90 text-foreground-800 backdrop-blur-sm whitespace-nowrap">
                  <span className={`w-1.5 h-1.5 rounded-full ${toneDot[fitTone(score as number)]}`}></span>
                  {fitToneLabel(score as number)}
                </span>
              )}
            </div>
          )}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {job.remote && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background-50/90 text-foreground-800 backdrop-blur-sm whitespace-nowrap">
                Remote
              </span>
            )}
            {job.type && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background-50/90 text-foreground-800 backdrop-blur-sm whitespace-nowrap">
                {job.type}
              </span>
            )}
          </div>
          <div className="absolute -bottom-5 left-4">
            <CompanyAvatar
              company={job.company}
              logo={job.company_logo}
              size={44}
              className="ring-4 ring-background-50"
            />
          </div>
        </div>

        <div className="px-4 pt-7">
          <h3 className="text-base font-bold text-foreground-950 leading-snug truncate">
            {job.title}
          </h3>
          <p className="text-xs text-foreground-600 truncate mt-0.5">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
      </Link>

      <div className="px-4 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {appliedApp && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
              <i className="ri-check-double-line"></i>
              Applied{appliedStage ? ` · ${appliedStage.label}` : ""}
            </span>
          )}
          {job.category && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
              <i className="ri-price-tag-3-line"></i>
              {job.category}
            </span>
          )}
          {job.salary_display && (
            <span className="text-xs font-semibold text-foreground-900 whitespace-nowrap">
              {job.salary_display}
            </span>
          )}
          {job.authenticity_score !== undefined && (
            <AuthenticityBadge score={job.authenticity_score} />
          )}
          <GradeBadge grade={job.quality_grade} score={job.quality_score} />
          <CrossPostingBadge
            likely_duplicate={job.likely_duplicate}
            cross_postings={job.cross_postings}
            cross_posting_ids={job.cross_posting_ids}
            duplicate_group_id={job.duplicate_group_id}
            consolidated_count={job.consolidated_count}
            consolidated_sources={job.consolidated_sources}
          />
        </div>
      </div>

      <div className="mt-auto px-4 pb-4 pt-3">
        <div className="flex items-center justify-between gap-2 text-[11px] text-foreground-400">
          <div className="flex items-center gap-2 min-w-0">
            <SourceChip platform={job.source_platform} display={job.source_display} />
            <span className="truncate">{formatDate(job.posted_at ?? job.created_at)}</span>
          </div>
          <Link
            to={href}
            className="inline-flex items-center gap-1 text-foreground-600 font-medium whitespace-nowrap ml-2 cursor-pointer"
          >
            View
            <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
        <TailorResumeButton
          jobId={job.id}
          jobTitle={job.title}
          jobCompany={job.company}
          variant="button"
          className="mt-3 w-full justify-center"
        />
      </div>
    </div>
  );
}