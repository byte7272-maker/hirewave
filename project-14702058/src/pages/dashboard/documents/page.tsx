import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ResumeTab from "@/pages/dashboard/documents/components/ResumeTab";
import CoverLetterTab from "@/pages/dashboard/documents/components/CoverLetterTab";
import PageHeader from "@/components/feature/PageHeader";
import ResetPageButton from "@/components/feature/ResetPageButton";
import DocumentVersionsRails from "@/pages/dashboard/components/DocumentVersionsRails";
import useViewState from "@/hooks/useViewState";
import { listResumes } from "@/lib/documents";
import { countEvidenceDrafts, EVIDENCE_DRAFTS_EVENT } from "@/lib/evidenceDraft";
import { readRecentDocument, resolveRecentDocument, type RecentDocument } from "@/lib/recentDocument";

type Tab = "resumes" | "letters";

interface DocumentsViewState extends Record<string, unknown> {
  tab?: unknown;
}

function relativeTime(ts: number): string {
  if (!ts) return "recently";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function Documents() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "letters" ? "letters" : "resumes",
  );
  const viewState = useViewState<DocumentsViewState>("documents");
  const restored = useRef(false);

  // "Jump back in" pointer — the last document the user opened.
  const [recent, setRecent] = useState<RecentDocument | null>(null);
  const [dismissedRecent, setDismissedRecent] = useState(false);
  // Bumping this remounts the tabs so a reset starts them from a clean slate.
  const [resetKey, setResetKey] = useState(0);
  /** Résumés with a half-finished "My Work Highlights" wizard (tab badge). */
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    // Resolve the remembered document — if it was deleted, this transparently
    // falls back to the newest document on the recently-viewed rail.
    let alive = true;
    void resolveRecentDocument().then((doc) => {
      if (alive) setRecent(doc);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Count résumés that still have a saved wizard draft, so the Résumés tab can
   * carry an "In progress" badge even while the cover-letter tab is open.
   * Best-effort — a failure just hides the badge.
   */
  const refreshDraftCount = useCallback(async () => {
    try {
      const list = await listResumes({ archived: false });
      setDraftCount(countEvidenceDrafts((list ?? []).map((r) => r.id)));
    } catch {
      /* the tab badge is best-effort — never block the page on it */
    }
  }, []);

  // Restore the sub-tab once the durable state has loaded.
  useEffect(() => {
    if (!viewState.loaded || restored.current) return;
    restored.current = true;
    // An explicit ?tab= in the URL wins over the last-used sub-tab.
    if (searchParams.get("tab")) return;
    const saved = viewState.saved?.tab;
    if (saved === "resumes" || saved === "letters") setTab(saved);
  }, [viewState.loaded, viewState.saved, searchParams]);

  // Persist the sub-tab on every change (after the initial restore).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({ tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, viewState.loaded]);

  // Refresh on mount (a wizard run may have created, changed, or cleared a draft).
  useEffect(() => {
    void refreshDraftCount();
  }, [refreshDraftCount]);

  // The first-run checklist's "Add your work highlights" step deep-links here
  // with ?highlights=1 — hand off to the consolidated workspace page.
  useEffect(() => {
    if (searchParams.get("highlights") === "1") {
      navigate("/dashboard/experience", { replace: true });
    }
  }, [searchParams, navigate]);

  // React instantly when a draft is discarded from a résumé row, so the tab
  // badge never lingers out of date.
  useEffect(() => {
    function onChange() {
      void refreshDraftCount();
    }
    window.addEventListener(EVIDENCE_DRAFTS_EVENT, onChange);
    return () => window.removeEventListener(EVIDENCE_DRAFTS_EVENT, onChange);
  }, [refreshDraftCount]);

  /**
   * Open the remembered document. We route straight to the document's own page
   * (carrying the version it was last on) instead of relying on it being in the
   * current list — that way it always opens, even if it's archived, filtered
   * out, or was opened on another device, and it lands on the version in
   * progress rather than the very latest.
   */
  function openRecent(doc: RecentDocument) {
    const base =
      doc.kind === "resume"
        ? `/dashboard/documents/resumes/${doc.id}`
        : `/dashboard/documents/cover-letters/${doc.id}`;
    const version = doc.version;
    const hasVersion = version !== undefined && version !== null && version !== "";
    navigate(hasVersion ? `${base}?version=${encodeURIComponent(String(version))}` : base);
  }

  function resetPage() {
    setTab("resumes");
    setDismissedRecent(false);
    setResetKey((k) => k + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Upload, generate, and manage the résumés and cover letters that get you hired."
        icon="ri-folder-3-line"
        tone="secondary"
        image="https://readdy.ai/api/search-image?query=Warm%20editorial%20photograph%20of%20neatly%20stacked%20printed%20resumes%20and%20a%20cover%20letter%20on%20a%20warm%20wooden%20desk%20beside%20a%20fountain%20pen%20and%20small%20green%20plant%2C%20calm%20prepared%20mood%2C%20warm%20neutral%20cream%20tones%20with%20muted%20emerald%20and%20coral%20colour%20accents%2C%20soft%20natural%20window%20light%2C%20shallow%20depth%20of%20field%2C%20premium%20editorial%20magazine%20aesthetic%2C%20darker%20left%20side%20for%20overlay%20text%2C%20high%20detail&width=1600&height=460&seq=header-documents-01&orientation=landscape"
        imageAlt="Printed resumes and a cover letter on a warm wooden desk"
      />

      {__IS_PREVIEW__ && (
        <div
          className="animate-fade-in-up flex items-center gap-2.5 rounded-xl bg-secondary-100/60 border border-secondary-200 px-4 py-2.5 text-sm text-secondary-900"
          style={{ animationDelay: "0.02s" }}
        >
          <span className="w-5 h-5 flex items-center justify-center text-secondary-700 flex-shrink-0">
            <i className="ri-information-line"></i>
          </span>
          <span>
            You&rsquo;re viewing <span className="font-semibold">sample data</span> until your
            backend connects — changes here are just for the demo.
          </span>
        </div>
      )}

      {recent && !dismissedRecent && (
        <div
          className="animate-fade-in-up rounded-2xl bg-background-100/60 border border-background-200 p-4 flex items-center gap-3"
          style={{ animationDelay: "0.03s" }}
        >
          <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700 flex-shrink-0">
            <i
              className={`text-lg ${
                recent.kind === "resume" ? "ri-file-text-line" : "ri-mail-send-line"
              }`}
            ></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground-950 flex items-center gap-2">
              <i className="ri-history-line text-accent-600"></i>
              Jump back in
            </p>
            <p className="text-xs text-foreground-600 truncate">
              <span className="text-foreground-800">
                {recent.title || (recent.kind === "resume" ? "Your résumé" : "Your cover letter")}
              </span>
              {" · "}
              {relativeTime(recent.ts)}
            </p>
          </div>
          <button
            onClick={() => openRecent(recent)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-arrow-right-up-line"></i>
            Open
          </button>
          <button
            onClick={() => setDismissedRecent(true)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
            title="Dismiss"
            aria-label="Dismiss jump back in"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>
      )}

      <DocumentVersionsRails />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1 animate-fade-in-up"
          style={{ animationDelay: "0.04s" }}
        >
          <button
            onClick={() => setTab("resumes")}
            title={
              draftCount > 0
                ? `${draftCount} résumé${draftCount === 1 ? "" : "s"} with an unfinished “My Work Highlights” wizard`
                : undefined
            }
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              tab === "resumes"
                ? "bg-background-50 text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            Résumés
            {draftCount > 0 && (
              <span
                aria-label={`${draftCount} in progress`}
                className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-semibold leading-none bg-accent-500 text-background-50 dark:text-foreground-950"
              >
                {draftCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("letters")}
            className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              tab === "letters"
                ? "bg-background-50 text-foreground-950"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            Cover letters
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {tab === "letters" && (
            <button
              type="button"
              onClick={() => navigate("/dashboard/experience")}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3.5 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap animate-fade-in-up"
            >
              <i className="ri-sparkling-2-line"></i>
              My Work Highlights
            </button>
          )}
          <ResetPageButton
            view={["documents", "resumes", "cover-letters"]}
            routeKeys={["documents/resumes*", "documents/cover-letters*"]}
            onReset={resetPage}
            className="animate-fade-in-up"
          />
        </div>
      </div>

      <div className="animate-fade-in-up" style={{ animationDelay: "0.08s" }}>
        {tab === "resumes" ? (
          <ResumeTab
            key={`resumes-${resetKey}`}
            onDocOpened={() => setRecent(readRecentDocument())}
            onWorkHighlights={() => navigate("/dashboard/experience")}
          />
        ) : (
          <CoverLetterTab
            key={`letters-${resetKey}`}
            onDocOpened={() => setRecent(readRecentDocument())}
          />
        )}
      </div>
    </div>
  );
}