import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { savedAgo, savedJobId, type SavedJob } from "@/lib/jobs";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip from "@/components/feature/SourceChip";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import PanelHeader from "@/pages/dashboard/components/PanelHeader";
import FitDotChip from "@/pages/dashboard/components/FitDotChip";
import { getMatchScoreMap } from "@/lib/matchScores";
import { Badge, Button, Card } from "@/components/base";

interface SavedJobsProps {
  jobs: SavedJob[];
  savedCount?: number;
  savedSearchesCount?: number;
}

export default function SavedJobs({ jobs, savedCount, savedSearchesCount = 0 }: SavedJobsProps) {
  const preview = jobs.slice(0, 3);
  const [scoreByJob, setScoreByJob] = useState<Map<string, number>>(new Map());

  // Cross-reference the matches pool so a saved role that also appears in
  // Matches wears its real fit band here on the home screen.
  useEffect(() => {
    let alive = true;
    getMatchScoreMap().then((map) => {
      if (alive) setScoreByJob(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      id="saved-jobs"
      surface="tinted"
      className="overflow-hidden"
    >
      <PanelHeader
        icon="ri-bookmark-line"
        tone="secondary"
        title="Saved jobs"
        subtitle="Roles you bookmarked"
        count={savedCount ?? jobs.length}
        countLabel="saved"
        action={
          savedSearchesCount > 0 ? (
            <Badge tone="secondary" icon="ri-search-line">
              {savedSearchesCount} search{savedSearchesCount === 1 ? "" : "es"}
            </Badge>
          ) : undefined
        }
      />

      {preview.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-2">
            <i className="ri-bookmark-line text-lg"></i>
          </div>
          <p className="text-sm text-foreground-600">No saved jobs yet.</p>
          <p className="text-xs text-foreground-400 mt-1">Bookmark roles to see them here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-background-200">
          {preview.map((job) => (
            <li key={String(savedJobId(job))} className="flex items-start gap-3 px-5 py-3">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
                {(job.company || "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/dashboard/jobs/${savedJobId(job)}`}
                  className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer truncate block"
                >
                  {job.title}
                </Link>
                <p className="text-xs text-foreground-600 truncate mt-0.5">{job.company}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                  {job.salary_display && (
                    <span className="text-xs font-semibold text-foreground-900 whitespace-nowrap">
                      {job.salary_display}
                    </span>
                  )}
                  <FitDotChip score={scoreByJob.get(String(savedJobId(job))) ?? null} />
                  <SourceChip platform={job.source_platform} display={job.source_display} />
                  <CrossPostingBadge
                    likely_duplicate={job.likely_duplicate}
                    cross_postings={job.cross_postings}
                    cross_posting_ids={job.cross_posting_ids}
                    consolidated_count={job.consolidated_count}
                    consolidated_sources={job.consolidated_sources}
                  />
                </div>
              </div>
              <TailorResumeButton
                jobId={savedJobId(job)}
                jobTitle={job.title}
                jobCompany={job.company}
              />
              <span className="text-[11px] text-foreground-400 whitespace-nowrap flex-shrink-0 flex items-center gap-1">
                <i className="ri-time-line"></i>
                {savedAgo(job.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="px-5 py-3 border-t border-background-200">
        <Button variant="ghost" fullWidth to="/dashboard/saved" trailingIcon="ri-arrow-right-line">
          View saved jobs
        </Button>
      </div>
    </Card>
  );
}