import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { isCreatedThisWeek, type Application } from "@/lib/applications";
import { useApplications } from "@/hooks/useApplicationsStore";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";
import ApplicationBoard from "@/pages/dashboard/applications/components/ApplicationBoard";
import AddApplicationModal from "@/pages/dashboard/applications/components/AddApplicationModal";
import PageHeader from "@/components/feature/PageHeader";
import ResetPageButton from "@/components/feature/ResetPageButton";
import StatCard from "@/pages/dashboard/components/StatCard";
import { Card, ErrorState, LoadingState } from "@/components/base";

/** Durable, cross-device state for the applications board (backend view "applications"). */
interface ApplicationsViewState extends Record<string, unknown> {
  filters?: Record<string, unknown>;
  scrollY?: unknown;
  selectedId?: unknown;
}

export default function Applications() {
  const {
    applications,
    refresh: refreshApplications,
    addApplication,
    updateApplication,
    removeApplication,
  } = useApplications();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [thisWeekOnly, setThisWeekOnly] = useState(false);
  const [focusAppId, setFocusAppId] = useState<string | number | null>(null);
  const viewState = useViewState<ApplicationsViewState>("applications");
  const restored = useRef(false);
  const location = useLocation();

  // A rail card that came from an expanded application routes in with the app id
  // in router state — focus (expand + scroll to) it right away.
  const navExpandId = (location.state as { expandApplicationId?: string | number } | null)
    ?.expandApplicationId;
  useEffect(() => {
    if (navExpandId != null) setFocusAppId(navExpandId);
  }, [navExpandId]);

  // Restore the "created this week" filter + any focused card once the durable state loads.
  useEffect(() => {
    if (!viewState.loaded || restored.current) return;
    restored.current = true;
    const f = (viewState.saved?.filters ?? {}) as Record<string, unknown>;
    if (typeof f.thisWeekOnly === "boolean") setThisWeekOnly(f.thisWeekOnly);
    const sid = viewState.saved?.selectedId;
    if (typeof sid === "string" || typeof sid === "number") setFocusAppId(sid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  // Persist the filter + focused card + scroll on change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      filters: { thisWeekOnly },
      selectedId: focusAppId,
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thisWeekOnly, focusAppId, viewState.loaded]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      await refreshApplications();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your pipeline.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useScrollRestore(
    "applications",
    viewState.loaded && !loading,
    Number(viewState.saved?.scrollY) || 0,
  );

  function handleMutate(updated: Application) {
    updateApplication(updated);
  }

  function handleDelete(id: string | number) {
    removeApplication(id);
  }

  function handleCreated(app: Application) {
    addApplication(app);
  }

  const visibleApplications = thisWeekOnly
    ? applications.filter(isCreatedThisWeek)
    : applications;

  const total = visibleApplications.length;
  const submitted = visibleApplications.filter((a) => a.status === "submitted").length;
  const interviewing = visibleApplications.filter((a) => a.status === "interviewing").length;
  const offers = visibleApplications.filter((a) => a.status === "offer").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Applications"
        subtitle="Track every role from draft to signed offer."
        icon="ri-send-plane-line"
        tone="accent"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20a%20person%20arranging%20colourful%20sticky%20notes%20across%20a%20bright%20office%20wall%20while%20holding%20a%20pen%2C%20sense%20of%20progress%20and%20organisation%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-applications-01&orientation=landscape"
        imageAlt="Someone organising applications on a bright office wall"
        actions={
          <>
            <ResetPageButton
              view="applications"
              routeKeys="applications"
              onReset={() => {
                setThisWeekOnly(false);
                setFocusAppId(null);
              }}
            />
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-add-line"></i>
              Add a role
            </button>
          </>
        }
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Tracked"
          value={total}
          caption="roles in your pipeline"
          icon="ri-folder-3-line"
          tone="primary"
        />
        <StatCard
          label="Submitted"
          value={submitted}
          caption="awaiting a reply"
          icon="ri-send-plane-line"
          tone="secondary"
          delay={0.06}
        />
        <StatCard
          label="Interviewing"
          value={interviewing}
          caption="in conversation"
          icon="ri-mic-line"
          tone="accent"
          delay={0.12}
        />
        <StatCard
          label="Offers"
          value={offers}
          caption="on the table"
          icon="ri-award-line"
          tone="primary"
          delay={0.18}
        />
      </section>

      <section
        className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-4 flex items-center gap-4 flex-wrap"
        style={{ animationDelay: "0.04s" }}
      >
        <label className="inline-flex items-center gap-2 text-sm text-foreground-700 cursor-pointer">
          <input
            type="checkbox"
            checked={thisWeekOnly}
            onChange={(e) => setThisWeekOnly(e.target.checked)}
            className="w-4 h-4 rounded border-background-300 accent-primary-500 cursor-pointer"
          />
          Created this week
        </label>
        <span className="text-xs text-foreground-500">
          {visibleApplications.length} of {applications.length} applications
        </span>
      </section>

      {error && (
        <Card surface="tinted" className="animate-fade-in-up">
          <ErrorState
            title="We couldn't load your pipeline"
            message={error}
            onRetry={load}
          />
        </Card>
      )}

      <div className="animate-fade-in-up" style={{ animationDelay: "0.06s" }}>
        {loading ? (
          <Card surface="tinted">
            <div className="p-4 md:p-5">
              <LoadingState label="Loading your pipeline…" rows={4} />
            </div>
          </Card>
        ) : (
          <ApplicationBoard
            applications={visibleApplications}
            onMutate={handleMutate}
            onDelete={handleDelete}
            onCreated={handleCreated}
            onAdd={() => setAddOpen(true)}
            focusAppId={focusAppId}
            onExpandedChange={setFocusAppId}
          />
        )}
      </div>

      {addOpen && (
        <AddApplicationModal onClose={() => setAddOpen(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}