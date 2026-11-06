import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  APPLICATION_STAGES,
  type ApplicationStatus,
} from "@/lib/applications";
import { listMatches, type JobMatch } from "@/lib/jobs";
import { listResumes } from "@/lib/documents";
import {
  getTailoredResumeByJob,
  type TailoredResumeInfo,
} from "@/lib/versionCoverage";
import {
  createAndAddApplication,
  useApplications,
} from "@/hooks/useApplicationsStore";
import { useToast } from "@/components/base/ToastProvider";
import { toneDot } from "@/pages/dashboard/components/tone";
import StageSelect from "@/pages/dashboard/components/StageSelect";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import ResumeActionsMenu from "@/components/feature/ResumeActionsMenu";
import AdvanceStatusMenu from "@/components/feature/AdvanceStatusMenu";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import EmptyState from "@/components/feature/EmptyState";
import PipelineRowBadges from "@/pages/dashboard/autoapply/components/PipelineRowBadges";

type StageFilter = "all" | ApplicationStatus;

/** Compact relative time for a pipeline row. */
function timeAgo(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function stageMeta(status: ApplicationStatus) {
  return APPLICATION_STAGES.find((s) => s.id === status) ?? APPLICATION_STAGES[0];
}

/** How many top matches the empty-state quick apply pulls in at once. */
const QUICK_APPLY_COUNT = 3;
/** How many top matches the "top up" strip surfaces at once. */
const TOPUP_COUNT = 4;

/**
 * The applied-roles view that lives inside the auto-apply hub, so a quick apply
 * from anywhere lands somewhere users actually look. Mirrors the full board's
 * stage language, lets you move a role's stage inline, surfaces fresh top
 * matches to top up the pipeline, and links out to the full board when a deeper
 * pass is needed.
 */
export default function PipelineTab() {
  const { applications, refresh } = useApplications();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [applyingTop, setApplyingTop] = useState(false);
  const [topMatches, setTopMatches] = useState<JobMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | number | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [tailoredByJob, setTailoredByJob] = useState<Record<string, TailoredResumeInfo>>({});
  const [atsByDocId, setAtsByDocId] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    setError("");
    try {
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load your pipeline right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadMatches() {
    setMatchesLoading(true);
    try {
      const list = await listMatches();
      setTopMatches(list ?? []);
    } catch {
      setTopMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }

  /** Resolve which roles already have a tailored résumé version (and its ATS score). */
  async function loadTailored() {
    setTailoredByJob(getTailoredResumeByJob());
    const resumes = await listResumes().catch(() => []);
    const map: Record<string, number> = {};
    for (const r of resumes ?? []) {
      if (typeof r.ats_score === "number") map[String(r.id)] = r.ats_score;
    }
    setAtsByDocId(map);
  }

  useEffect(() => {
    load();
    loadMatches();
    loadTailored();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = applications.length;
  const stageCounts = APPLICATION_STAGES.map((stage) => ({
    ...stage,
    count: applications.filter((a) => a.status === stage.id).length,
  }));

  const visible =
    stageFilter === "all"
      ? applications
      : applications.filter((a) => a.status === stageFilter);

  const filterChips: { id: StageFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: total },
    ...APPLICATION_STAGES.map((s) => ({
      id: s.id as StageFilter,
      label: s.label,
      count: applications.filter((a) => a.status === s.id).length,
    })),
  ];

  // Full matches keyed by job id, so each row can surface its keyword gaps.
  const matchByJob = new Map(topMatches.map((m) => [String(m.job_id), m]));

  // Strongest fits that aren't already tracked — recomputed from the shared
  // cache, so adding one (or quick-applying anywhere) drops it from the strip.
  const inPipeline = new Set(applications.map((a) => String(a.job_id)));
  const candidates = [...topMatches]
    .sort((a, b) => b.score - a.score)
    .filter((m) => m.job_id != null && !inPipeline.has(String(m.job_id)));

  /** Add a single top match to the pipeline. */
  async function addMatch(m: JobMatch) {
    if (addingId != null || addingAll) return;
    setAddingId(m.job_id);
    try {
      await createAndAddApplication({
        title: m.title,
        company: m.company,
        job_id: m.job_id,
      });
      showToast(`Added "${m.title}" to your pipeline.`, "success");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not add the role.",
        "error",
      );
    } finally {
      setAddingId(null);
    }
  }

  /** Add every match currently shown in the "top up" strip. */
  async function addAllCandidates() {
    if (addingAll || addingId != null) return;
    const top = candidates.slice(0, TOPUP_COUNT);
    if (top.length === 0) {
      showToast("Your top matches are already in the pipeline.", "info");
      return;
    }
    setAddingAll(true);
    try {
      for (const m of top) {
        await createAndAddApplication({
          title: m.title,
          company: m.company,
          job_id: m.job_id,
        });
      }
      showToast(
        `Added ${top.length} top match${top.length > 1 ? "es" : ""} to your pipeline.`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not add the matches.",
        "error",
      );
    } finally {
      setAddingAll(false);
    }
  }

  /**
   * Empty-state action: pull today's strongest matches and drop them into the
   * pipeline so there's something to work with immediately.
   */
  async function quickApplyTopMatches() {
    setApplyingTop(true);
    try {
      const top = candidates.slice(0, QUICK_APPLY_COUNT);
      if (top.length === 0) {
        showToast("Your top matches are already in the pipeline.", "info");
        return;
      }
      for (const m of top) {
        await createAndAddApplication({
          title: m.title,
          company: m.company,
          job_id: m.job_id,
        });
      }
      showToast(
        `Added ${top.length} top match${top.length > 1 ? "es" : ""} to your pipeline.`,
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not quick apply matches.",
        "error",
      );
    } finally {
      setApplyingTop(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-foreground-600 max-w-xl">
          Every role you&apos;ve pushed into your pipeline — including quick applies — in one
          place. Move a role&apos;s stage right here, or open the full board for a deeper pass.
        </p>
        <Link
          to="/dashboard/applications"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
        >
          Open full board
          <i className="ri-arrow-right-line"></i>
        </Link>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="rounded-xl bg-background-100/60 border border-background-200 px-4 py-3">
            <p className="font-heading text-2xl font-medium text-foreground-950">{total}</p>
            <p className="text-xs text-foreground-600 whitespace-nowrap">In your pipeline</p>
          </div>
          {stageCounts.map((stage) => (
            <div
              key={stage.id}
              className="rounded-xl bg-background-100/60 border border-background-200 px-4 py-3"
            >
              <p className="font-heading text-2xl font-medium text-foreground-950">
                {stage.count}
              </p>
              <p className="text-xs text-foreground-600 flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={`w-2 h-2 flex-shrink-0 rounded-full ${toneDot[stage.tone]}`}
                ></span>
                {stage.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1 flex-wrap">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              onClick={() => setStageFilter(chip.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                stageFilter === chip.id
                  ? "bg-background-50 text-foreground-950"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              {chip.label}
              <span className="text-[10px] font-semibold text-foreground-500">{chip.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{error}</div>
          <button
            onClick={load}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top-up strip — lets you grow the pipeline anytime, not just when empty. */}
      {total > 0 && (matchesLoading || candidates.length > 0) && (
        <section className="rounded-2xl bg-background-100/60 border border-background-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
                <i className="ri-sparkling-2-line"></i>
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground-950">Top matches to add</p>
                <p className="text-xs text-foreground-500">
                  Strongest fits not yet in your pipeline — top up anytime.
                </p>
              </div>
            </div>
            {!matchesLoading && candidates.length > 0 && (
              <button
                onClick={addAllCandidates}
                disabled={addingAll || addingId != null}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <i className={addingAll ? "ri-loader-4-line animate-spin" : "ri-add-line"}></i>
                {addingAll ? "Adding…" : "Add all"}
              </button>
            )}
          </div>

          {matchesLoading ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-[240px] flex-shrink-0 rounded-xl bg-background-50 border border-background-200 p-3 animate-pulse"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-background-200"></div>
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 rounded bg-background-200"></div>
                      <div className="h-2.5 w-1/2 rounded bg-background-200"></div>
                    </div>
                  </div>
                  <div className="h-7 mt-3 rounded-md bg-background-200"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {candidates.slice(0, TOPUP_COUNT).map((m) => {
                const adding = String(addingId) === String(m.job_id);
                return (
                  <div
                    key={String(m.job_id)}
                    className="w-[240px] flex-shrink-0 rounded-xl bg-background-50 border border-background-200 p-3 flex flex-col transition-colors hover:border-background-300"
                  >
                    <div className="flex items-center gap-2">
                      <CompanyAvatar company={m.company} logo={m.company_logo} size={32} />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/dashboard/jobs/${m.job_id}`}
                          className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer truncate block"
                        >
                          {m.title}
                        </Link>
                        <p className="text-xs text-foreground-500 truncate">{m.company}</p>
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent-100 text-accent-900 whitespace-nowrap">
                        {Math.round(m.score)}%
                      </span>
                    </div>
                    {m.salary_display && (
                      <p className="text-xs text-foreground-700 mt-2 whitespace-nowrap truncate">
                        {m.salary_display}
                      </p>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        onClick={() => addMatch(m)}
                        disabled={adding || addingAll}
                        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        <i className={adding ? "ri-loader-4-line animate-spin" : "ri-add-line"}></i>
                        {adding ? "Adding…" : "Add to pipeline"}
                      </button>
                      <TailorResumeButton
                        jobId={m.job_id}
                        jobTitle={m.title}
                        jobCompany={m.company}
                        variant="compact"
                        className="w-full justify-center"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {loading ? (
        <div className="py-14 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading your pipeline…
        </div>
      ) : total === 0 ? (
        <section className="rounded-2xl bg-background-100/60 border border-background-200">
          <EmptyState
            icon="ri-flow-chart"
            title="Nothing in your pipeline yet"
            description="Quick apply to today's top matches and they'll land here instantly, or browse Matches to pick your own — everything shows up grouped by stage."
            tone="primary"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={quickApplyTopMatches}
                  disabled={applyingTop}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className={applyingTop ? "ri-loader-4-line animate-spin" : "ri-flashlight-line"}></i>
                  {applyingTop ? "Applying…" : "Quick apply top matches"}
                </button>
                <Link
                  to="/dashboard/matches"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-focus-3-line"></i>
                  Browse matches
                </Link>
              </div>
            }
          />
        </section>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 border-dashed py-14 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-background-200 text-foreground-500">
            <i className="ri-inbox-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900 mt-3">
            No roles in {stageMeta(stageFilter as ApplicationStatus).label}
          </p>
          <p className="text-sm text-foreground-500 mt-1">
            Try another stage, or pick &ldquo;All&rdquo; to see everything.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((app) => {
            const job = app.job ?? null;
            const company = job?.company ?? app.company;
            const title = job?.title ?? app.title;
            const updated = timeAgo(app.updated_at ?? app.created_at);
            const jobLink = app.job_id != null ? `/dashboard/jobs/${app.job_id}` : null;
            const match =
              app.job_id != null ? matchByJob.get(String(app.job_id)) : undefined;
            const tailored =
              app.job_id != null ? tailoredByJob[String(app.job_id)] : undefined;
            const ats =
              tailored != null
                ? tailored.atsScore ?? atsByDocId[tailored.docId] ?? null
                : null;
            const gaps = match?.gap_skills ?? [];

            return (
              <div
                key={app.id}
                className="flex items-center gap-3 flex-wrap rounded-2xl bg-background-100/60 border border-background-200 p-4 transition-colors hover:border-background-300"
              >
                <CompanyAvatar company={company} logo={job?.company_logo} size={36} />
                <div className="flex-1 min-w-[200px]">
                  {jobLink ? (
                    <Link
                      to={jobLink}
                      className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer truncate block"
                    >
                      {title}
                    </Link>
                  ) : (
                    <p className="text-sm font-semibold text-foreground-950 truncate">{title}</p>
                  )}
                  <p className="text-xs text-foreground-500 mt-0.5 truncate">
                    {[company, app.location].filter(Boolean).join(" · ") || "No details"}
                  </p>
                  <PipelineRowBadges
                    docId={tailored?.docId}
                    version={tailored?.version}
                    atsScore={ats}
                    covered={tailored?.covered}
                    total={tailored?.total}
                    gaps={gaps}
                    matched={Boolean(match)}
                  />
                </div>

                <AdvanceStatusMenu app={app} title={title} />

                <StageSelect app={app} ariaLabel={`Move ${title} to another stage`} />

                {app.job_id != null ? (
                  <ResumeActionsMenu
                    jobId={app.job_id}
                    jobTitle={title}
                    jobCompany={company}
                  />
                ) : (
                  <Link
                    to="/dashboard/documents"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-100 hover:bg-background-200 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-text-line"></i>
                    Résumé
                  </Link>
                )}

                {updated && (
                  <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                    {updated}
                  </span>
                )}

                {jobLink && (
                  <Link
                    to={jobLink}
                    aria-label={`Open ${title}`}
                    className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-md text-foreground-400 hover:text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer"
                  >
                    <i className="ri-arrow-right-s-line text-lg"></i>
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}