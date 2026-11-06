import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { ApiError } from "@/lib/api";
import {
  exportMatches,
  listMatches,
  listCategories,
  listSavedJobs,
  saveJob,
  unsaveJob,
  savedJobId,
  salaryMinAnnual,
  type JobMatch,
  type SavedJob,
} from "@/lib/jobs";
import { listResumes, type Resume } from "@/lib/documents";
import { getCoverageByJob, type JobCoverage } from "@/lib/versionCoverage";
import { getPreferences, updatePreferences } from "@/lib/profile";
import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationStatus,
} from "@/lib/applications";
import { createAndAddApplication, useApplications } from "@/hooks/useApplicationsStore";
import { BoardMark, getBoardMeta } from "@/components/feature/SourceChip";
import { useToast } from "@/components/base/ToastProvider";
import PageHeader from "@/components/feature/PageHeader";
import EmptyState from "@/components/feature/EmptyState";
import ResetPageButton from "@/components/feature/ResetPageButton";
import { Badge, Button, Card, ErrorState, LoadingState, SectionHeader, SelectField } from "@/components/base";
import MatchRow from "@/pages/dashboard/matches/components/MatchRow";
import MatchQualityBar from "@/pages/dashboard/matches/components/MatchQualityBar";
import BandFilterNotice from "@/pages/dashboard/components/BandFilterNotice";
import type { FitBand } from "@/pages/dashboard/components/FitBandBar";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";

/** Best coverage a saved tailored version has for this match (by job id, then by label). */
function findJobCoverage(
  map: Record<string, JobCoverage>,
  m: JobMatch,
): JobCoverage | null {
  return map[String(m.job_id)] ?? map[`${m.title} · ${m.company}`] ?? null;
}

const MATCHES_FILTER_KEY = "hirewave_matches_filters";

interface MatchesFilterPrefs {
  sortBy: "fit" | "salary_desc" | "salary_asc" | "coverage";
  minSalary: number | "";
  sourceFilter: string;
  verifiedOnly: boolean;
  hideDuplicates: boolean;
  appliedOnly: boolean;
  stageFilter: ApplicationStatus | "";
}

function readMatchesFilters(): Partial<MatchesFilterPrefs> {
  try {
    const raw = localStorage.getItem(MATCHES_FILTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistMatchesFilters(prefs: MatchesFilterPrefs) {
  try {
    localStorage.setItem(MATCHES_FILTER_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort persistence
  }
}

/** Bucket a match's fit score into the shared band vocabulary. */
function matchBand(score: number): FitBand {
  if (score >= 90) return "strong";
  if (score >= 85) return "good";
  return "fair";
}

/** Durable, cross-device state for the matches list (backend view "matches"). */
interface MatchesViewState extends Record<string, unknown> {
  filters?: Record<string, unknown>;
  selectedId?: unknown;
  scrollY?: unknown;
}

export default function Matches() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();
  const navigate = useNavigate();

  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | number>("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [savingCategories, setSavingCategories] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [storedFilters] = useState<Partial<MatchesFilterPrefs>>(() => readMatchesFilters());
  const [verifiedOnly, setVerifiedOnly] = useState(storedFilters.verifiedOnly ?? false);
  const [hideDuplicates, setHideDuplicates] = useState(storedFilters.hideDuplicates ?? false);
  const [appliedOnly, setAppliedOnly] = useState(storedFilters.appliedOnly ?? false);
  const [stageFilter, setStageFilter] = useState<ApplicationStatus | "">(
    storedFilters.stageFilter ?? "",
  );
  const [sortBy, setSortBy] = useState<"fit" | "salary_desc" | "salary_asc" | "coverage">(
    storedFilters.sortBy ?? "fit",
  );
  const [minSalary, setMinSalary] = useState<number | "">(storedFilters.minSalary ?? "");
  const [sourceFilter, setSourceFilter] = useState(storedFilters.sourceFilter ?? "");
  const [coverageByJob, setCoverageByJob] = useState<Record<string, JobCoverage>>({});
  const [lastViewedId, setLastViewedId] = useState<string | number | null>(null);
  const viewState = useViewState<MatchesViewState>("matches");
  const { showToast } = useToast();
  const { applications, refresh } = useApplications();
  const [applyingId, setApplyingId] = useState<string | number | null>(null);
  const [tailoringId, setTailoringId] = useState<string | number | null>(null);
  // The active fit-band filter narrowing the ranked list (null = all bands).
  const [band, setBand] = useState<FitBand | null>(null);

  // Keep the "already in your pipeline" markers accurate on first load.
  useEffect(() => {
    refresh().catch(() => {
      /* non-fatal */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [list, saved] = await Promise.all([
        listMatches({ resumeId: selectedResumeId, categories: selectedCategories }),
        listSavedJobs(),
      ]);
      setMatches(list ?? []);
      setSavedJobs(saved ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your matches.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResumeId, selectedCategories]);

  useEffect(() => {
    setCoverageByJob(getCoverageByJob());
  }, []);

  useEffect(() => {
    if (!viewState.loaded) return;
    let cancelled = false;
    const saved = viewState.saved ?? {};
    const f = (saved.filters ?? {}) as Record<string, unknown>;
    async function bootstrap() {
      const [res, cats, prefs] = await Promise.all([
        listResumes().catch(() => [] as Resume[]),
        listCategories().catch(() => [] as string[]),
        getPreferences().catch(() => null),
      ]);
      if (cancelled) return;
      setResumes(res);
      setCategories(cats);
      // Restore the durable filters, falling back to sensible first-load defaults.
      const savedResume = f.resumeId;
      if (savedResume !== undefined && savedResume !== null && savedResume !== "") {
        setSelectedResumeId(savedResume as string | number);
      } else if (res.length) {
        setSelectedResumeId(res[0].id);
      }
      if (Array.isArray(f.categories)) {
        setSelectedCategories(f.categories as string[]);
      } else if (prefs?.job_categories?.length) {
        setSelectedCategories(prefs.job_categories);
      }
      const sortVal = f.sortBy;
      if (
        sortVal === "fit" ||
        sortVal === "salary_desc" ||
        sortVal === "salary_asc" ||
        sortVal === "coverage"
      ) {
        setSortBy(sortVal);
      }
      if (typeof f.minSalary === "number") setMinSalary(f.minSalary);
      else if (f.minSalary === "") setMinSalary("");
      if (typeof f.source === "string") setSourceFilter(f.source);
      if (typeof f.verified === "boolean") setVerifiedOnly(f.verified);
      if (typeof f.hideDuplicates === "boolean") setHideDuplicates(f.hideDuplicates);
      if (typeof f.applied === "boolean") setAppliedOnly(f.applied);
      const stageVal = f.stage;
      if (
        stageVal === "draft" ||
        stageVal === "submitted" ||
        stageVal === "interviewing" ||
        stageVal === "offer"
      ) {
        setStageFilter(stageVal);
      }
      const sel = saved.selectedId;
      if (sel !== null && sel !== undefined && sel !== "") {
        setLastViewedId(sel as string | number);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  useEffect(() => {
    persistMatchesFilters({
      sortBy,
      minSalary,
      sourceFilter,
      verifiedOnly,
      hideDuplicates,
      appliedOnly,
      stageFilter,
    });
  }, [sortBy, minSalary, sourceFilter, verifiedOnly, hideDuplicates, appliedOnly, stageFilter]);

  // Persist the meaningful state on every change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      filters: {
        sortBy,
        minSalary,
        source: sourceFilter,
        verified: verifiedOnly,
        hideDuplicates,
        applied: appliedOnly,
        stage: stageFilter,
        resumeId: selectedResumeId,
        categories: selectedCategories,
      },
      selectedId: lastViewedId,
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sortBy,
    minSalary,
    sourceFilter,
    verifiedOnly,
    hideDuplicates,
    appliedOnly,
    stageFilter,
    selectedResumeId,
    selectedCategories,
    lastViewedId,
    viewState.loaded,
  ]);

  useScrollRestore(
    "matches",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  const hasActiveFilters =
    verifiedOnly ||
    hideDuplicates ||
    appliedOnly ||
    stageFilter !== "" ||
    minSalary !== "" ||
    sourceFilter !== "";

  function clearFilters() {
    setVerifiedOnly(false);
    setHideDuplicates(false);
    setAppliedOnly(false);
    setStageFilter("");
    setMinSalary("");
    setSourceFilter("");
    setSortBy("fit");
    setBand(null);
  }

  function toggleCategory(cat: string) {
    const next = selectedCategories.includes(cat)
      ? selectedCategories.filter((c) => c !== cat)
      : [...selectedCategories, cat];
    setSelectedCategories(next);
    setSavingCategories(true);
    updatePreferences({ job_categories: next })
      .catch(() => {
        /* non-fatal */
      })
      .finally(() => setSavingCategories(false));
  }

  const savedIds = useMemo(() => savedJobs.map(savedJobId), [savedJobs]);

  /** Map of job_id → the caller's application, so we can show pipeline stage inline. */
  const applicationByJob = useMemo(() => {
    const map = new Map<string, Application>();
    for (const a of applications) {
      if (a.job_id === undefined || a.job_id === null) continue;
      const key = String(a.job_id);
      if (!map.has(key)) map.set(key, a);
    }
    return map;
  }, [applications]);

  /** How many of the current matches are already somewhere in the pipeline. */
  const pipelineCount = useMemo(
    () => matches.filter((m) => applicationByJob.has(String(m.job_id))).length,
    [matches, applicationByJob],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = matches.filter((m) => {
      const haystack = `${m.title} ${m.company} ${m.matching_skills.join(" ")} ${m.gap_skills.join(" ")}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (verifiedOnly && (m.authenticity_score ?? 0) < 80) return false;
      if (hideDuplicates && m.likely_duplicate) return false;
      if (appliedOnly && !applicationByJob.has(String(m.job_id))) return false;
      if (stageFilter) {
        const app = applicationByJob.get(String(m.job_id));
        if (!app || app.status !== stageFilter) return false;
      }
      if (minSalary !== "") {
        const sal = salaryMinAnnual(m.salary_display);
        if (sal == null || sal < minSalary) return false;
      }
      if (sourceFilter) {
        const k = m.source_platform?.toLowerCase();
        const d = m.source_display?.toLowerCase();
        if (k !== sourceFilter && d !== sourceFilter) return false;
      }
      return true;
    });
    if (sortBy === "salary_desc") {
      return [...list].sort(
        (a, b) => (salaryMinAnnual(b.salary_display) ?? -1) - (salaryMinAnnual(a.salary_display) ?? -1),
      );
    }
    if (sortBy === "salary_asc") {
      return [...list].sort(
        (a, b) =>
          (salaryMinAnnual(a.salary_display) ?? Number.MAX_SAFE_INTEGER) -
          (salaryMinAnnual(b.salary_display) ?? Number.MAX_SAFE_INTEGER),
      );
    }
    if (sortBy === "coverage") {
      return [...list].sort((a, b) => {
        const ca = findJobCoverage(coverageByJob, a);
        const cb = findJobCoverage(coverageByJob, b);
        const ra = ca ? ca.covered / (ca.total || 1) : -1;
        const rb = cb ? cb.covered / (cb.total || 1) : -1;
        if (rb !== ra) return rb - ra;
        if ((cb?.covered ?? 0) !== (ca?.covered ?? 0)) return (cb?.covered ?? 0) - (ca?.covered ?? 0);
        return b.score - a.score;
      });
    }
    return list;
  }, [matches, searchQuery, verifiedOnly, hideDuplicates, appliedOnly, stageFilter, applicationByJob, minSalary, sortBy, sourceFilter, coverageByJob]);

  // Apply the active fit-band filter on top of the refine filters. The quality
  // bar reads from `filtered` (not this) so the distribution never collapses on
  // itself while a band is selected.
  const bandFiltered = useMemo(() => {
    if (!band) return filtered;
    return filtered.filter((m) => matchBand(m.score) === band);
  }, [filtered, band]);

  const boardOptions = useMemo(() => {
    const seen = new Map<string, { platform: string; display: string }>();
    for (const m of matches) {
      const key = (m.source_platform || m.source_display || "").trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, {
        platform: m.source_platform || key,
        display: m.source_display?.trim() || getBoardMeta(m.source_platform)?.label || key,
      });
    }
    return Array.from(seen.values());
  }, [matches]);

  async function toggleSave(m: JobMatch) {
    const id = m.job_id;
    const isSaved = savedIds.some((sid) => String(sid) === String(id));
    if (isSaved) {
      const prev = savedJobs;
      setSavedJobs((cur) => cur.filter((j) => String(savedJobId(j)) !== String(id)));
      try {
        await unsaveJob(id);
        showToast(`Removed “${m.title}” from saved jobs`, "info");
      } catch (err) {
        setSavedJobs(prev);
        showToast(err instanceof Error ? err.message : "Could not remove the job.", "error");
      }
    } else {
      try {
        await saveJob(id);
        showToast(`Saved “${m.title}”`, "success");
        const list = await listSavedJobs();
        setSavedJobs(list ?? []);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not save the job.", "error");
      }
    }
  }

  async function quickApply(m: JobMatch) {
    setApplyingId(m.job_id);
    try {
      await createAndAddApplication({
        title: m.title,
        company: m.company,
        job_id: m.job_id,
      });
      showToast(`Added “${m.title}” to your pipeline`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not quick apply.", "error");
    } finally {
      setApplyingId(null);
    }
  }

  /** Add to the pipeline (if needed), then open the résumé tailoring flow for this role. */
  async function applyAndTailor(m: JobMatch) {
    setTailoringId(m.job_id);
    try {
      if (!applicationByJob.has(String(m.job_id))) {
        await createAndAddApplication({
          title: m.title,
          company: m.company,
          job_id: m.job_id,
        });
        showToast(`Added “${m.title}” to your pipeline`, "success");
      }
      const resumes = await listResumes().catch(() => [] as Resume[]);
      if (!resumes.length) {
        showToast("Upload a résumé first, then tailor it to this job.", "info");
        navigate("/dashboard/documents");
        return;
      }
      const resume = resumes[0];
      const params = new URLSearchParams();
      params.set("tailorJob", String(m.job_id));
      params.set("tailorTitle", m.title);
      params.set("tailorCompany", m.company);
      navigate(`/dashboard/documents/resumes/${resume.id}?${params.toString()}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start tailoring.", "error");
    } finally {
      setTailoringId(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    setError("");
    try {
      await exportMatches(undefined, "csv");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job matches"
        subtitle="AI-ranked by fit across skills, salary, and location."
        icon="ri-focus-3-line"
        tone="primary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20person%20reviewing%20job%20listings%20on%20a%20laptop%20at%20a%20tidy%20sunlit%20desk%20with%20a%20notebook%20and%20cup%20of%20coffee%2C%20focused%20optimistic%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-matches-01&orientation=landscape"
        imageAlt="Someone reviewing job listings on a laptop at a sunlit desk"
        actions={
          <>
            <Badge
              tone="secondary"
              icon="ri-check-double-line"
              className="whitespace-nowrap"
            >
              {pipelineCount} in your pipeline
            </Badge>
            <Button
              variant="outline"
              icon="ri-download-line"
              loading={exporting}
              disabled={exporting || matches.length === 0}
              onClick={handleExport}
            >
              {exporting ? "Exporting…" : "Export shortlist"}
            </Button>
            <ResetPageButton
              view="matches"
              routeKeys="matches"
              onReset={() => {
                clearFilters();
                setLastViewedId(null);
              }}
            />
            <Button to="/dashboard/search" icon="ri-radar-line">
              Run new search
            </Button>
          </>
        }
      />

      <Card
        surface="tinted"
        className="animate-fade-in-up"
        style={{ animationDelay: "0.04s" }}
      >
        <SectionHeader
          icon="ri-equalizer-2-line"
          tone="primary"
          title="Refine your matches"
          subtitle={`${bandFiltered.length} of ${matches.length} roles shown`}
          action={
            hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                icon="ri-close-circle-line"
                onClick={clearFilters}
              >
                Clear all
              </Button>
            ) : undefined
          }
        />
        <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <SelectField
              id="resume-select"
              label="Rank by résumé"
              value={String(selectedResumeId)}
              onChange={(v) => setSelectedResumeId(v)}
            >
              <option value="">Default ranking</option>
              {resumes.map((r) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {r.title || r.filename || r.original_filename || `Résumé ${r.id}`}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="min-w-[160px]">
            <SelectField
              id="sort-select"
              label="Sort by"
              value={sortBy}
              onChange={(v) => setSortBy(v as "fit" | "salary_desc" | "salary_asc" | "coverage")}
            >
              <option value="fit">Best fit</option>
              <option value="coverage">Most gaps covered</option>
              <option value="salary_desc">Salary: high → low</option>
              <option value="salary_asc">Salary: low → high</option>
            </SelectField>
          </div>

          <div className="min-w-[160px]">
            <SelectField
              id="min-salary-select"
              label="Min salary"
              value={String(minSalary)}
              onChange={(v) => setMinSalary(v === "" ? "" : Number(v))}
            >
              <option value="">Any salary</option>
              <option value="140000">$140k+</option>
              <option value="160000">$160k+</option>
              <option value="180000">$180k+</option>
              <option value="200000">$200k+</option>
            </SelectField>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            Verified postings only
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={hideDuplicates}
              onChange={(e) => setHideDuplicates(e.target.checked)}
              className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            Hide duplicates
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer pb-2.5">
            <input
              type="checkbox"
              checked={appliedOnly}
              onChange={(e) => setAppliedOnly(e.target.checked)}
              className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
            />
            Applied only
          </label>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-600 mb-1.5">
            <i className="ri-flow-chart"></i>
            Pipeline stage
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStageFilter("")}
              className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                stageFilter === ""
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                  : "bg-background-50 text-foreground-700 border-background-300 hover:border-foreground-300"
              }`}
            >
              Any stage
            </button>
            {APPLICATION_STAGES.map((s) => {
              const active = stageFilter === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setStageFilter(active ? "" : s.id)}
                  className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                    active
                      ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                      : "bg-background-50 text-foreground-700 border-background-300 hover:border-foreground-300"
                  }`}
                >
                  {active && <i className="ri-check-line"></i>}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {boardOptions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-600 mb-1.5">
              <i className="ri-global-line"></i>
              Source
            </div>
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

        {categories.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground-600">
                <i className="ri-price-tag-3-line"></i>
                Categories
              </div>
              {savingCategories && (
                <span className="inline-flex items-center gap-1 text-[11px] text-foreground-400">
                  <i className="ri-loader-4-line animate-spin"></i>
                  Saving categories…
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap transition-colors ${
                      active
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                        : "bg-background-50 text-foreground-700 border-background-300 hover:border-foreground-300"
                    }`}
                  >
                    {active && <i className="ri-check-line"></i>}
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </Card>

      {!loading && filtered.length > 0 && (
        <MatchQualityBar matches={filtered} activeBand={band} onBandChange={setBand} />
      )}

      {!loading && band && bandFiltered.length > 0 && (
        <BandFilterNotice
          band={band}
          shown={bandFiltered.length}
          total={filtered.length}
          onClear={() => setBand(null)}
          className="animate-fade-in-up px-1"
        />
      )}

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState title="We couldn't load your matches" message={error} onRetry={load} />
        </Card>
      )}

      <Card
        surface="tinted"
        className="animate-fade-in-up overflow-hidden"
        style={{ animationDelay: "0.08s" }}
      >
        {loading ? (
          <div className="p-4 md:p-5">
            <LoadingState label="Ranking your matches…" rows={4} />
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            icon="ri-focus-3-line"
            title="No matches found"
            description="Run a new search and we'll rank every role by how well it fits your profile."
            tone="primary"
            action={
              <Button to="/dashboard/search" icon="ri-radar-line">
                Run new search
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="ri-filter-off-line"
            title="No results match your filters"
            description={
              hasActiveFilters
                ? "Try adjusting or clearing your filters to see more matches."
                : "Try adjusting your search."
            }
            tone="secondary"
            action={
              <Button icon="ri-refresh-line" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : bandFiltered.length === 0 ? (
          <EmptyState
            icon="ri-focus-3-line"
            title="No roles in this band"
            description="None of your matches land in the selected fit band. Reset the band to see them all."
            tone="secondary"
            action={
              <Button icon="ri-refresh-line" onClick={() => setBand(null)}>
                Reset band
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-background-200">
            {bandFiltered.map((m, i) => {
              const coverage = findJobCoverage(coverageByJob, m);
              const appliedApp = applicationByJob.get(String(m.job_id));
              const appliedStage = appliedApp
                ? APPLICATION_STAGES.find((s) => s.id === appliedApp.status)
                : undefined;
              return (
                <MatchRow
                  key={m.job_id}
                  match={m}
                  index={i}
                  coverage={coverage}
                  isSaved={savedIds.some((sid) => String(sid) === String(m.job_id))}
                  appliedApp={appliedApp}
                  appliedStageLabel={appliedStage?.label}
                  isLastViewed={
                    lastViewedId !== null && String(lastViewedId) === String(m.job_id)
                  }
                  applying={applyingId === m.job_id}
                  tailoring={tailoringId === m.job_id}
                  onToggleSave={toggleSave}
                  onQuickApply={quickApply}
                  onApplyAndTailor={applyAndTailor}
                  onView={(job) => setLastViewedId(job.job_id)}
                />
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}