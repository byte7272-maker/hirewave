import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { listFlagged, type FlaggedJob } from "@/lib/jobs";
import { getMatchScoreMap } from "@/lib/matchScores";
import AuthenticityBadge from "@/components/feature/AuthenticityBadge";
import TailorResumeButton from "@/components/feature/TailorResumeButton";
import ResetPageButton from "@/components/feature/ResetPageButton";
import RankBadge from "@/pages/dashboard/components/RankBadge";
import FitDotChip from "@/pages/dashboard/components/FitDotChip";
import { fitSpine } from "@/pages/dashboard/components/tone";
import { Card, EmptyState, ErrorState, LoadingState, Button } from "@/components/base";
import FlaggedQualityBar from "@/pages/dashboard/flagged/components/FlaggedQualityBar";
import BandFilterNotice from "@/pages/dashboard/components/BandFilterNotice";
import type { FitBand } from "@/pages/dashboard/components/FitBandBar";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";
import type { DashboardOutletContext } from "@/pages/dashboard/DashboardLayout";

/** Durable, cross-device state for the flagged list (backend view "flagged"). */
interface FlaggedViewState extends Record<string, unknown> {
  scrollY?: unknown;
}

/** Bucket a (possibly missing) fit score into the shared band vocabulary. */
function bandOf(score: number | null): FitBand {
  if (score == null || Number.isNaN(score)) return "unscored";
  if (score >= 90) return "strong";
  if (score >= 85) return "good";
  return "fair";
}

function formatDate(v?: string) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function Flagged() {
  const { searchQuery } = useOutletContext<DashboardOutletContext>();

  const [flagged, setFlagged] = useState<FlaggedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const viewState = useViewState<FlaggedViewState>("flagged");
  const [scoreMap, setScoreMap] = useState<Map<string, number>>(new Map());
  const [band, setBand] = useState<FitBand | null>(null);

  // Cross-reference the matches pool so a flagged role that's also a ranked match
  // still wears its real fit band (spine + dot) here, like every other job surface.
  useEffect(() => {
    let alive = true;
    getMatchScoreMap().then((map) => {
      if (alive) setScoreMap(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const list = await listFlagged();
      setFlagged(list ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load flagged jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Persist the scroll position so a fresh device can resume where you were.
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({ scrollY: Math.round(window.scrollY) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  useScrollRestore(
    "flagged",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  const searchFiltered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return flagged.filter(
      (f) =>
        q === "" || `${f.title} ${f.company} ${f.reason ?? ""}`.toLowerCase().includes(q)
    );
  }, [flagged, searchQuery]);

  // Pair each posting with its cross-referenced fit score + band, so the list and
  // the distribution bar read from exactly the same source.
  const scoredRows = useMemo(
    () =>
      searchFiltered.map((f) => {
        const jobId = f.job_id ?? f.id;
        const score = jobId != null ? scoreMap.get(String(jobId)) ?? null : null;
        return { f, score, band: bandOf(score) };
      }),
    [searchFiltered, scoreMap],
  );

  const fitScores = useMemo(() => scoredRows.map((r) => r.score), [scoredRows]);

  // Apply the selected band filter on top of the search filter.
  const visibleRows = useMemo(
    () => (band ? scoredRows.filter((r) => r.band === band) : scoredRows),
    [scoredRows, band],
  );

  return (
    <div className="space-y-6">
      <section className="animate-fade-in-up flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            Flagged jobs
          </h1>
          <p className="text-sm text-foreground-600 mt-1">
            Community-reported postings that look fake or dubious. Reported before you apply.
          </p>
        </div>
        <ResetPageButton
          view="flagged"
          routeKeys="flagged"
        />
      </section>

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load flagged jobs"
            message={error}
            onRetry={load}
          />
        </Card>
      )}

      {!loading && scoredRows.length > 0 && (
        <FlaggedQualityBar scores={fitScores} activeBand={band} onBandChange={setBand} />
      )}

      {!loading && band && visibleRows.length > 0 && (
        <BandFilterNotice
          band={band}
          shown={visibleRows.length}
          total={scoredRows.length}
          onClear={() => setBand(null)}
          className="animate-fade-in-up px-1"
        />
      )}

      {loading ? (
        <Card surface="tinted" className="animate-fade-in-up">
          <div className="p-4 md:p-5">
            <LoadingState label="Loading flagged jobs…" rows={4} />
          </div>
        </Card>
      ) : scoredRows.length === 0 ? (
        <Card surface="tinted" className="animate-fade-in-up">
          <EmptyState
            icon="ri-shield-check-line"
            title="No flagged jobs right now"
            description="The community hasn't flagged anything recently — nice and clean."
            tone="secondary"
          />
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card surface="tinted" className="animate-fade-in-up">
          <EmptyState
            icon="ri-filter-off-line"
            title="No postings in this band"
            description="None of the flagged postings land in the selected fit band. Clear the filter to see them all."
            tone="secondary"
            action={
              <Button variant="outline" icon="ri-refresh-line" onClick={() => setBand(null)}>
                Clear band filter
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3 animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
          {visibleRows.map(({ f, score: fitScore }, index) => {
            const jobId = f.job_id ?? f.id;
            const spine = fitSpine(fitScore);
            return (
              <li key={f.job_id ?? f.id}>
                <Card surface="tinted" padded spine={spine.color}>
                  <div className="flex items-start gap-4 flex-wrap">
                    <RankBadge rank={index + 1} className="mt-0.5" />
                    <div className="w-11 h-11 flex items-center justify-center rounded-tile bg-accent-100 text-accent-700 flex-shrink-0">
                      <i className="ri-alert-line text-xl"></i>
                    </div>
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-sm font-semibold text-foreground-950">{f.title}</h2>
                        {f.score !== undefined && <AuthenticityBadge score={f.score} />}
                        <FitDotChip score={fitScore} />
                      </div>
                      <p className="text-xs text-foreground-600 mt-0.5">{f.company}</p>
                      {f.reason && (
                        <p className="text-sm text-foreground-700 mt-2 leading-relaxed">{f.reason}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-foreground-400">
                        <span>Flagged {formatDate(f.flagged_at)}</span>
                        {typeof f.reports === "number" && (
                          <span className="inline-flex items-center gap-1">
                            <i className="ri-flag-line"></i>
                            {f.reports} report{f.reports === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                    </div>
                    {jobId !== undefined && (
                      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                        <TailorResumeButton
                          jobId={jobId}
                          jobTitle={f.title}
                          jobCompany={f.company}
                          variant="button"
                        />
                        <Link
                          to={`/dashboard/jobs/${jobId}`}
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                        >
                          View
                          <i className="ri-arrow-right-line text-xs"></i>
                        </Link>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}