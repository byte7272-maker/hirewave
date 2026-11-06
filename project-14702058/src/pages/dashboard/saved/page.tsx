import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  exportMatches,
  listSavedJobs,
  reorderSavedJobs,
  salaryMinAnnual,
  savedAgo,
  savedJobId,
  unsaveJob,
  type SavedJob,
} from "@/lib/jobs";
import { createAndAddApplication, useApplications } from "@/hooks/useApplicationsStore";
import { useToast } from "@/components/base/ToastProvider";
import { Card, EmptyState, ErrorState, LoadingState, Button } from "@/components/base";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";
import ResetPageButton from "@/components/feature/ResetPageButton";
import CompanyAvatar from "@/components/feature/CompanyAvatar";
import ResumeActionsMenu from "@/components/feature/ResumeActionsMenu";
import AdvanceStatusMenu from "@/components/feature/AdvanceStatusMenu";
import GradeBadge from "@/pages/dashboard/documents/components/GradeBadge";
import CrossPostingBadge from "@/components/feature/CrossPostingBadge";
import SourceChip, { BoardMark, getBoardMeta } from "@/components/feature/SourceChip";
import StageSelect from "@/pages/dashboard/components/StageSelect";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import SavedQualityBar from "@/pages/dashboard/saved/components/SavedQualityBar";
import { fitTone, fitToneLabel, fitSpine, toneBadge } from "@/pages/dashboard/components/tone";
import { getMatchScoreMap } from "@/lib/matchScores";

const SAVED_ORDER_KEY = "hirewave_saved_order";

function readSavedOrder(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function persistSavedOrder(ids: string[]) {
  try {
    localStorage.setItem(SAVED_ORDER_KEY, JSON.stringify(ids));
  } catch {
    // best-effort persistence
  }
}

const SAVED_FILTER_KEY = "hirewave_saved_filters";

interface SavedFilterPrefs {
  sortMode: "custom" | "newest" | "salary_desc" | "salary_asc";
  minSalary: number | "";
  sourceFilter: string;
  hideDuplicates: boolean;
}

function readSavedFilters(): Partial<SavedFilterPrefs> {
  try {
    const raw = localStorage.getItem(SAVED_FILTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistSavedFilters(prefs: SavedFilterPrefs) {
  try {
    localStorage.setItem(SAVED_FILTER_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort persistence
  }
}

/** Durable, cross-device state for the saved-jobs list (backend view "saved"). */
interface SavedViewState extends Record<string, unknown> {
  filters?: Record<string, unknown>;
  scrollY?: unknown;
}

export default function Saved() {
  const [jobs, setJobs] = useState<SavedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { applications, refresh } = useApplications();
  const [applyingId, setApplyingId] = useState<string | number | null>(null);
  const [storedFilters] = useState<Partial<SavedFilterPrefs>>(() => readSavedFilters());
  const [sortMode, setSortMode] = useState<"custom" | "newest" | "salary_desc" | "salary_asc">(
    storedFilters.sortMode ?? "custom",
  );
  const [hideDuplicates, setHideDuplicates] = useState(storedFilters.hideDuplicates ?? false);
  const [minSalary, setMinSalary] = useState<number | "">(storedFilters.minSalary ?? "");
  const [sourceFilter, setSourceFilter] = useState(storedFilters.sourceFilter ?? "");
  const viewState = useViewState<SavedViewState>("saved");
  const restored = useRef(false);
  const [scoreByJob, setScoreByJob] = useState<Map<string, number>>(new Map());

  // Restore the saved sort + filters once the durable state loads.
  useEffect(() => {
    if (!viewState.loaded || restored.current) return;
    restored.current = true;
    const f = (viewState.saved?.filters ?? {}) as Record<string, unknown>;
    if (
      f.sortMode === "custom" ||
      f.sortMode === "newest" ||
      f.sortMode === "salary_desc" ||
      f.sortMode === "salary_asc"
    ) {
      setSortMode(f.sortMode);
    }
    if (typeof f.minSalary === "number") setMinSalary(f.minSalary);
    else if (f.minSalary === "") setMinSalary("");
    if (typeof f.source === "string") setSourceFilter(f.source);
    if (typeof f.hideDuplicates === "boolean") setHideDuplicates(f.hideDuplicates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  // Cross-reference the matches pool so a saved role that also appears in Matches
  // wears the same fit band (spine + label) here.
  useEffect(() => {
    let alive = true;
    getMatchScoreMap().then((map) => {
      if (alive) setScoreByJob(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await listSavedJobs();
      const orderIndex = new Map(readSavedOrder().map((id, idx) => [id, idx]));
      const sorted = [...(list ?? [])].sort((a, b) => {
        const ai = orderIndex.get(String(savedJobId(a))) ?? Number.MAX_SAFE_INTEGER;
        const bi = orderIndex.get(String(savedJobId(b))) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
      setJobs(sorted);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your saved jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Keep the pipeline stage markers accurate when the page opens.
  useEffect(() => {
    refresh().catch(() => {
      /* non-fatal */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    persistSavedFilters({ sortMode, minSalary, sourceFilter, hideDuplicates });
  }, [sortMode, minSalary, sourceFilter, hideDuplicates]);

  // Persist the meaningful state on every change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      filters: {
        sortMode,
        minSalary,
        source: sourceFilter,
        hideDuplicates,
      },
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, minSalary, sourceFilter, hideDuplicates, viewState.loaded]);

  useScrollRestore(
    "saved",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  const hasActiveFilters = hideDuplicates || minSalary !== "" || sourceFilter !== "";

  function clearFilters() {
    setHideDuplicates(false);
    setMinSalary("");
    setSourceFilter("");
    setSortMode("custom");
  }

  async function handleUnsave(job: SavedJob) {
    const id = savedJobId(job);
    const prev = jobs;
    setJobs((cur) => cur.filter((j) => String(savedJobId(j)) !== String(id)));
    try {
      await unsaveJob(id);
      showToast(`Removed “${job.title}” from saved jobs`, "info");
    } catch (err) {
      setJobs(prev);
      showToast(err instanceof Error ? err.message : "Could not remove the job.", "error");
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      await exportMatches(
        jobs.map((j) => String(j.id ?? "")).filter(Boolean),
        "csv",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function quickApply(job: SavedJob) {
    const id = savedJobId(job);
    setApplyingId(id);
    try {
      await createAndAddApplication({
        title: job.title,
        company: job.company,
        job_id: id,
      });
      showToast(`Added "${job.title}" to your pipeline`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not quick apply.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  function resetDrag() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleDragStart(id: string) {
    setDraggingId(id);
  }

  function handleDragOver(e: DragEvent<HTMLLIElement>, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== id) setDragOverId(id);
  }

  function handleDrop(e: DragEvent<HTMLLIElement>, targetId: string) {
    e.preventDefault();
    const from = draggingId;
    if (!from || from === targetId) {
      resetDrag();
      return;
    }
    const fromIdx = jobs.findIndex((j) => String(savedJobId(j)) === from);
    const toIdx = jobs.findIndex((j) => String(savedJobId(j)) === targetId);
    if (fromIdx < 0 || toIdx < 0) {
      resetDrag();
      return;
    }
    const next = [...jobs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const nextIds = next.map((j) => String(savedJobId(j)));
    setJobs(next);
    persistSavedOrder(nextIds);
    reorderSavedJobs(nextIds).catch(() => {
      // Backend may not support reorder yet; localStorage already persisted.
    });
    resetDrag();
  }

  const displayJobs = useMemo(() => {
    if (sortMode === "newest") {
      return [...jobs].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
    }
    if (sortMode === "salary_desc") {
      return [...jobs].sort(
        (a, b) =>
          (salaryMinAnnual(b.salary_display) ?? -1) -
          (salaryMinAnnual(a.salary_display) ?? -1),
      );
    }
    if (sortMode === "salary_asc") {
      return [...jobs].sort(
        (a, b) =>
          (salaryMinAnnual(a.salary_display) ?? Number.MAX_SAFE_INTEGER) -
          (salaryMinAnnual(b.salary_display) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    return jobs;
  }, [jobs, sortMode]);

  const visibleJobs = useMemo(() => {
    let list = displayJobs;
    if (hideDuplicates) list = list.filter((j) => !j.likely_duplicate);
    if (minSalary !== "") {
      list = list.filter((j) => {
        const sal = salaryMinAnnual(j.salary_display);
        return sal != null && sal >= minSalary;
      });
    }
    if (sourceFilter) {
      list = list.filter((j) => {
        const k = j.source_platform?.toLowerCase();
        const d = j.source_display?.toLowerCase();
        return k === sourceFilter || d === sourceFilter;
      });
    }
    return list;
  }, [displayJobs, hideDuplicates, minSalary, sourceFilter]);

  // Cross-referenced fit score per visible saved role (null = not in the matches
  // pool), so the header distribution reads the same bands as Matches / Flagged.
  const savedFitScores = useMemo(
    () => visibleJobs.map((j) => scoreByJob.get(String(savedJobId(j))) ?? null),
    [visibleJobs, scoreByJob],
  );

  const boardOptions = useMemo(() => {
    const seen = new Map<string, { platform: string; display: string }>();
    for (const j of jobs) {
      const key = (j.source_platform || j.source_display || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, {
        platform: j.source_platform || key,
        display: j.source_display?.trim() || getBoardMeta(j.source_platform)?.label || key,
      });
    }
    return Array.from(seen.values());
  }, [jobs]);

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Saved jobs
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Roles you&apos;ve bookmarked for later. Drag to set your priority.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || jobs.length === 0}
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-background-50 text-foreground-900 border border-background-200 px-4 py-2.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            <i className={exporting ? "ri-loader-4-line animate-spin" : "ri-download-line"}></i>
            {exporting ? "Exporting…" : "Export saved"}
          </button>
          <ResetPageButton
            view="saved"
            routeKeys="saved"
            onReset={() => clearFilters()}
          />
          <Link
            to="/dashboard/matches"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-search-line"></i>
            Find jobs
          </Link>
        </div>
      </section>

      {!loading && jobs.length > 0 && <SavedQualityBar scores={savedFitScores} />}

      <section
        className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-4"
        style={{ animationDelay: "0.04s" }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[160px]">
            <label
              htmlFor="saved-sort-select"
              className="block text-xs font-semibold text-foreground-600 mb-1.5"
            >
              Sort by
            </label>
            <select
              id="saved-sort-select"
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value as "custom" | "newest" | "salary_desc" | "salary_asc")
              }
              className="w-full text-sm bg-background-50 text-foreground-900 border border-background-300 rounded-md px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
            >
              <option value="custom">My order</option>
              <option value="newest">Newest</option>
              <option value="salary_desc">Salary: high → low</option>
              <option value="salary_asc">Salary: low → high</option>
            </select>
          </div>

          <div className="min-w-[160px]">
            <label
              htmlFor="saved-min-salary-select"
              className="block text-xs font-semibold text-foreground-600 mb-1.5"
            >
              Min salary
            </label>
            <select
              id="saved-min-salary-select"
              value={String(minSalary)}
              onChange={(e) => setMinSalary(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full text-sm bg-background-50 text-foreground-900 border border-background-300 rounded-md px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-400 cursor-pointer"
            >
              <option value="">Any salary</option>
              <option value="140000">$140k+</option>
              <option value="160000">$160k+</option>
              <option value="180000">$180k+</option>
              <option value="200000">$200k+</option>
            </select>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={hideDuplicates}
              onChange={(e) => setHideDuplicates(e.target.checked)}
              className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            Hide duplicates
          </label>

          <span className="text-xs text-foreground-500 pb-2.5">
            {visibleJobs.length} of {jobs.length} jobs
          </span>
        </div>

        {boardOptions.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-foreground-600 mb-1.5">Source</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSourceFilter("")}
                className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                  sourceFilter === ""
                    ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                    : "bg-background-50 text-foreground-700 border-background-300 hover:border-foreground-300"
                }`}
              >
                All boards
              </button>
              {boardOptions.map((b) => {
                const active = sourceFilter === b.platform.toLowerCase();
                return (
                  <button
                    key={b.platform}
                    onClick={() => setSourceFilter(b.platform.toLowerCase())}
                    className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                        : "bg-background-50 text-foreground-700 border-background-300 hover:border-foreground-300"
                    }`}
                  >
                    <BoardMark platform={b.platform} />
                    {b.display}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load your saved jobs"
            message={error}
            onRetry={load}
          />
        </Card>
      )}

      <section className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
        {loading ? (
          <div className="p-4 md:p-5">
            <LoadingState label="Loading your saved jobs…" rows={5} />
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            icon="ri-bookmark-line"
            title="No saved jobs yet"
            description="Bookmark roles from your matches and they'll show up here."
            tone="primary"
            action={
              <Button variant="outline" icon="ri-search-line" to="/dashboard/matches">
                Find jobs
              </Button>
            }
          />
        ) : visibleJobs.length === 0 ? (
          <EmptyState
            icon="ri-filter-off-line"
            title="No results match your filters"
            description={
              hasActiveFilters
                ? "Try adjusting or clearing your filters to see your saved roles."
                : "You have no saved jobs to show."
            }
            tone="secondary"
            action={
              <Button variant="outline" icon="ri-refresh-line" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-background-200">
            {visibleJobs.map((job, rankIndex) => {
              const id = savedJobId(job);
              const sid = String(id);
              const appliedApp = applications.find((a) => String(a.job_id) === sid);
              const score = scoreByJob.get(sid) ?? null;
              const spine = fitSpine(score);
              return (
                <li
                  key={sid}
                  draggable={sortMode === "custom"}
                  onDragStart={() => sortMode === "custom" && handleDragStart(sid)}
                  onDragOver={(e) => sortMode === "custom" && handleDragOver(e, sid)}
                  onDrop={(e) => sortMode === "custom" && handleDrop(e, sid)}
                  onDragEnd={resetDrag}
                  className={`relative px-5 py-4 flex flex-wrap items-center gap-4 transition-colors ${
                    draggingId === sid ? "opacity-50" : "hover:bg-background-100/40"
                  } ${dragOverId === sid ? "bg-primary-100/60 ring-1 ring-primary-300" : ""}`}
                >
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 h-full w-1"
                    style={{ background: spine.color }}
                  ></span>
                  <RankBadge rank={rankIndex + 1} />
                  <span
                    className={`w-6 h-6 flex items-center justify-center flex-shrink-0 ${
                      sortMode === "custom"
                        ? "text-foreground-400 cursor-grab"
                        : "text-foreground-300 cursor-default"
                    }`}
                  >
                    <i className="ri-drag-move-2-line text-lg"></i>
                  </span>
                  <div className="w-11 h-11 flex items-center justify-center rounded-xl bg-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
                    {(job.company || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/dashboard/jobs/${id}`}
                        className="text-sm font-semibold text-foreground-950 hover:text-primary-700 transition-colors cursor-pointer"
                      >
                        {job.title}
                      </Link>
                      {appliedApp && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap">
                          <i className="ri-check-double-line"></i>
                          Applied
                        </span>
                      )}
                      {score != null && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${toneBadge[fitTone(score)]}`}
                          title={`${score}% fit`}
                        >
                          <i className="ri-focus-3-line"></i>
                          {fitToneLabel(score)} · {score}
                        </span>
                      )}
                      <GradeBadge grade={job.quality_grade} score={job.quality_score} />
                      <CrossPostingBadge
                        likely_duplicate={job.likely_duplicate}
                        cross_postings={job.cross_postings}
                        cross_posting_ids={job.cross_posting_ids}
                        consolidated_count={job.consolidated_count}
                        consolidated_sources={job.consolidated_sources}
                      />
                    </div>
                    <p className="text-xs text-foreground-600 truncate mt-0.5">
                      {[job.company, job.location, job.type].filter(Boolean).join(" · ")}
                    </p>
                    {job.category && (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-secondary-100 text-secondary-900 whitespace-nowrap mt-1.5">
                        <i className="ri-price-tag-3-line"></i>
                        {job.category}
                      </span>
                    )}
                    <p className="text-xs text-foreground-700 mt-1.5 flex items-center gap-2 flex-wrap">
                      {job.salary_display && (
                        <span className="font-semibold whitespace-nowrap">{job.salary_display}</span>
                      )}
                      <SourceChip platform={job.source_platform} display={job.source_display} />
                    </p>
                    <p className="text-[11px] text-foreground-400 mt-1 flex items-center gap-1">
                      <i className="ri-time-line"></i>
                      {savedAgo(job.created_at)}
                    </p>
                  </div>

                  {appliedApp ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <AdvanceStatusMenu app={appliedApp} title={job.title} />
                      <StageSelect
                        app={appliedApp}
                        ariaLabel={`Move ${job.title} to another stage`}
                      />
                      <Link
                        to="/dashboard/applications"
                        aria-label="Open in pipeline board"
                        className="w-9 h-9 flex items-center justify-center rounded-md text-foreground-500 hover:text-primary-700 hover:bg-primary-100 transition-colors cursor-pointer"
                      >
                        <i className="ri-layout-column-line text-lg"></i>
                      </Link>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => quickApply(job)}
                        disabled={applyingId === id}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        {applyingId === id ? (
                          <i className="ri-loader-4-line animate-spin"></i>
                        ) : (
                          <i className="ri-flashlight-line"></i>
                        )}
                        {applyingId === id ? "Applying…" : "Quick apply"}
                      </button>
                      <AdvanceStatusMenu
                        title={job.title}
                        createInput={{ title: job.title, company: job.company, job_id: id }}
                      />
                    </div>
                  )}
                  <ResumeActionsMenu
                    jobId={id}
                    jobTitle={job.title}
                    jobCompany={job.company}
                  />
                  <button
                    onClick={() => handleUnsave(job)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-100 text-primary-700 px-3.5 py-2 rounded-md hover:bg-primary-200 transition-colors cursor-pointer whitespace-nowrap"
                    aria-label={`Unsave ${job.title}`}
                  >
                    <i className="ri-bookmark-fill text-sm"></i>
                    Unsave
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}