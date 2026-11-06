import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { activateResumeVersion, getResume, listResumes, type EvidencePrompt, type HighlightSuggestion, type Resume } from "@/lib/documents";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import { useToast } from "@/components/base/ToastProvider";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import {
  readLastEvidenceResume,
  writeLastEvidenceResume,
} from "@/lib/evidenceLauncherMemory";
import {
  clearEvidenceDraft,
  readEvidenceDraft,
  writeEvidenceDraft,
} from "@/lib/evidenceDraft";
import { readPromptCopied, clearPromptCopied } from "@/lib/evidencePromptMemory";
import {
  adjustWorkHighlightsImported,
  clearLastWorkHighlightsImport,
  readLastWorkHighlightsImport,
  readWorkHighlightsImported,
  recordLastWorkHighlightsImport,
  recordWorkHighlightsImported,
  type LastWorkHighlightsImport,
} from "@/lib/workHighlightsMemory";
import { formatPromptsClipboard, resumeEditorHref, toEditableSuggestions, type EditableSuggestion } from "@/lib/highlightsWorkspace";
import { resolveVersionPreviewStyle, type VersionPreviewStyle } from "@/pages/dashboard/documents/components/useVersionPreview";
import HighlightsDocumentViewer from "@/pages/dashboard/experience/components/HighlightsDocumentViewer";
import HighlightsProgress from "@/pages/dashboard/experience/components/HighlightsProgress";
import HighlightsTargetRole from "@/pages/dashboard/experience/components/HighlightsTargetRole";
import HighlightsZoneNav from "@/pages/dashboard/experience/components/HighlightsZoneNav";
import ResumeHighlightsContext from "@/pages/dashboard/experience/components/ResumeHighlightsContext";
import ZonePrompts from "@/pages/dashboard/experience/components/ZonePrompts";
import ZonePaste from "@/pages/dashboard/experience/components/ZonePaste";
import ZoneSuggestEdits from "@/pages/dashboard/experience/components/ZoneSuggestEdits";
import SavedHighlightsLibrary from "@/pages/dashboard/experience/components/SavedHighlightsLibrary";

/** Newest-edited first, so the default pick sits on top. */
function byRecency(list: Resume[]): Resume[] {
  return [...list].sort((a, b) => {
    const at = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
    const bt = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
    return bt - at;
  });
}

/** Resolve a résumé's display name, resilient to null metadata. */
function displayName(res: Resume): string {
  return res.original_filename || res.target_role || res.filename || `Résumé ${res.id}`;
}

/**
 * My Work Highlights — the single consolidated workspace.
 *
 * One page, three always-visible zones (generate prompts → paste & extract →
 * review & add) plus a live document viewer of the résumé being improved: switch
 * or rename a version inline, pop a large readable view, and jump straight into
 * the full editor on that exact version. Everything is on one page — no
 * modal-hopping, no step-by-step — and every entry point across the app lands
 * here. The persistent saved-highlights library lives below.
 */
export default function WorkHighlights() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [resumes, setResumes] = useState<Resume[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [resumesError, setResumesError] = useState("");

  const [selectedId, setSelectedId] = useState<string>("");
  const [resume, setResume] = useState<Resume | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState("");

  const [jobs, setJobs] = useState<TailorableJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobPostingId, setJobPostingId] = useState("");

  const [pasted, setPasted] = useState("");
  // The suggested edits awaiting review — the editable form of the API's
  // add / remove / reword proposals. Replaces the old extracted-fact rows.
  const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);
  // Whether a prompt has been copied for this résumé — the "Prompts" zone's
  // done-signal for the sticky zone nav.
  const [promptsCopied, setPromptsCopied] = useState(false);
  // The prompts Zone A loaded for the selected résumé — held here so the one-tap
  // "Copy all + Clear draft" shortcut can reuse them without re-fetching.
  const [promptsForCopy, setPromptsForCopy] = useState<EvidencePrompt[]>([]);

  // Progress read-out for the header: the imported-highlights total + the last
  // accepted import (so an accidental "Add to résumé" can be rolled back).
  const [importedCount, setImportedCount] = useState(0);
  const [lastImport, setLastImport] = useState<LastWorkHighlightsImport | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Whether the "Reset this run" confirm dialog is open.
  const [resetOpen, setResetOpen] = useState(false);

  const reviewWrapRef = useRef<HTMLDivElement>(null);
  // The left column (document viewer) — scrolled into view when a review card
  // jumps to its target section.
  const viewerColumnRef = useRef<HTMLDivElement>(null);
  // The section a review card asked to spotlight in the left viewer, if any.
  const [sectionSpotlight, setSectionSpotlight] = useState<{
    section: string;
    nonce: number;
  } | null>(null);

  // ---- Load the résumé list, then choose a default (deep link → last pick → newest).
  const loadResumes = useCallback(async () => {
    setResumesLoading(true);
    setResumesError("");
    try {
      const list = byRecency((await listResumes({ archived: false })) ?? []);
      setResumes(list);
      const param = searchParams.get("resume");
      const remembered = readLastEvidenceResume();
      const chosen =
        (param ? list.find((r) => String(r.id) === param) : undefined) ??
        (remembered ? list.find((r) => String(r.id) === remembered) : undefined) ??
        list[0];
      if (chosen) {
        setSelectedId(String(chosen.id));
        writeLastEvidenceResume(chosen.id);
      }
    } catch (err) {
      setResumesError(
        err instanceof ApiError ? err.message : "Could not load your résumés."
      );
    } finally {
      setResumesLoading(false);
    }
    // searchParams only read on first load; selection changes use selectResume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadResumes();
  }, [loadResumes]);

  // ---- Load the target-role choices for the selector (best-effort).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await listTailorableJobs();
        if (alive) setJobs(list);
      } catch {
        if (alive) setJobs([]);
      } finally {
        if (alive) setJobsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- Load the selected résumé's full record (versions, active version, text).
  useEffect(() => {
    if (!selectedId) {
      setResume(null);
      return;
    }
    let alive = true;
    setResumeLoading(true);
    setResumeError("");
    (async () => {
      try {
        const full = await getResume(selectedId);
        if (alive) setResume(full);
      } catch (err) {
        if (alive) {
          setResumeError(
            err instanceof ApiError ? err.message : "Could not load that résumé."
          );
        }
      } finally {
        if (alive) setResumeLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [selectedId]);

  // ---- Restore any in-progress paste + selections for the selected résumé.
  useEffect(() => {
    // Drop the previous résumé's prompts until Zone A reloads them for this one.
    setPromptsForCopy([]);
    // A differing document has different sections — drop any spotlight.
    setSectionSpotlight(null);
    if (!selectedId) {
      setPasted("");
      setSuggestions([]);
      setPromptsCopied(false);
      return;
    }
    const draft = readEvidenceDraft(selectedId);
    setPasted(draft?.pasted ?? "");
    setPromptsCopied(readPromptCopied(selectedId));
    setSuggestions(draft?.suggestions ?? []);
  }, [selectedId]);

  // ---- Persist the paste + selections while on the page (keeps the sidebar badge alive).
  useEffect(() => {
    if (!selectedId) return;
    const step: 1 | 2 | 3 = suggestions.length > 0 ? 3 : pasted.trim() ? 2 : 1;
    writeEvidenceDraft(selectedId, { step, pasted, points: [], suggestions });
  }, [selectedId, pasted, suggestions]);

  // ---- Read this résumé's import progress (total + the undoable last import).
  const refreshProgress = useCallback((id: string) => {
    if (!id) {
      setImportedCount(0);
      setLastImport(null);
      return;
    }
    setImportedCount(readWorkHighlightsImported(id));
    setLastImport(readLastWorkHighlightsImport(id));
  }, []);

  useEffect(() => {
    refreshProgress(selectedId);
  }, [selectedId, refreshProgress]);

  // Re-sync when the user returns to the tab (e.g. after importing elsewhere).
  useRefreshOnFocus(() => refreshProgress(selectedId));

  // ---- Deep link: jump to Zone C when asked (e.g. the review remedy).
  useEffect(() => {
    if (searchParams.get("zone") !== "review") return;
    if (!resume) return;
    const el = reviewWrapRef.current ?? document.getElementById("my-work-highlights-review");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [resume, searchParams]);

  const selectResume = useCallback(
    (id: string) => {
      if (!id) return;
      setSelectedId(id);
      writeLastEvidenceResume(id);
      const next = new URLSearchParams(searchParams);
      next.set("resume", id);
      next.delete("zone");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  /** A version switch / rename / delete returns the full résumé — adopt it. */
  const handleResumeChange = useCallback((updated: Resume) => {
    setResume(updated);
    setResumes((prev) =>
      prev.map((r) => (String(r.id) === String(updated.id) ? { ...r, ...updated } : r))
    );
  }, []);

  /**
   * Roll back the most recent accepted import for a résumé, in one click:
   * re-activate the version that was active before it, un-count the highlights
   * it added, and forget the snapshot. Safe to call from the header button or the
   * post-import toast — it only re-adopts the document when it's still selected.
   */
  const runUndo = useCallback(
    async (resumeId: string | number) => {
      const snapshot = readLastWorkHighlightsImport(resumeId);
      if (
        !snapshot ||
        snapshot.previousVersion === null ||
        snapshot.previousVersion === undefined
      ) {
        return;
      }
      setUndoing(true);
      try {
        const updated = await activateResumeVersion(resumeId, snapshot.previousVersion);
        adjustWorkHighlightsImported(resumeId, -snapshot.count);
        clearLastWorkHighlightsImport(resumeId);
        if (String(resumeId) === String(selectedId)) handleResumeChange(updated);
        refreshProgress(selectedId);
        showToast("Rolled back to your previous version.", "success");
      } catch (err) {
        showToast(
          err instanceof ApiError ? err.message : "Could not undo the last import.",
          "error"
        );
      } finally {
        setUndoing(false);
      }
    },
    [selectedId, handleResumeChange, refreshProgress, showToast]
  );

  const handleUndo = useCallback(() => {
    if (!resume || undoing) return;
    void runUndo(resume.id);
  }, [resume, undoing, runUndo]);

  /**
   * Cmd/Ctrl+Z rolls back the most recent accepted import — but only when an
   * import is genuinely the latest change AND focus isn't in a text field, so we
   * never hijack the native undo a user expects while editing the paste box or a
   * highlight row. This makes a slipped "Add to résumé" reversible from muscle
   * memory, matching the header button and the post-import toast.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      if (!resume || undoing) return;
      const snapshot = readLastWorkHighlightsImport(resume.id);
      if (
        !snapshot ||
        snapshot.previousVersion === null ||
        snapshot.previousVersion === undefined ||
        String(snapshot.previousVersion) === String(resume.active_version ?? "")
      ) {
        return;
      }
      event.preventDefault();
      void runUndo(resume.id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resume, undoing, runUndo]);

  /**
   * An accepted incorporate run — adopt the new version, count it, remember the
   * snapshot so it can be undone, clear the facts, and offer a one-click undo.
   */
  const handleAccepted = useCallback(
    (updated: Resume, count: number) => {
      const previousVersion = resume?.active_version ?? null;
      recordWorkHighlightsImported(updated.id, count);
      recordLastWorkHighlightsImport(updated.id, {
        previousVersion,
        importedVersion: updated.active_version ?? null,
        count,
      });
      handleResumeChange(updated);
      setImportedCount(readWorkHighlightsImported(updated.id));
      setLastImport(readLastWorkHighlightsImport(updated.id));
      setSuggestions([]);
      clearEvidenceDraft(updated.id);
      showToast(
        `Saved ${count} edit${count === 1 ? "" : "s"} to your résumé.`,
        "success",
        { label: "Undo", onUndo: () => runUndo(updated.id) }
      );
    },
    [resume, handleResumeChange, runUndo, showToast]
  );

  /**
   * Wipe this run's scratch state for the selected résumé — the paste, the
   * extracted/edited selections, and the "prompt copied" flag. Shared by
   * "Reset this run" and the one-tap "Copy all + Clear draft" shortcut. The résumé
   * document, its versions, and the imported-highlights total are left untouched.
   */
  const clearRunState = useCallback(() => {
    if (!selectedId) return;
    setPasted("");
    setSuggestions([]);
    setPromptsCopied(false);
    clearEvidenceDraft(selectedId);
    clearPromptCopied(selectedId);
  }, [selectedId]);

  /**
   * "Reset this run" — clear the paste, the extracted/edited selections, and the
   * zone progress dots for the selected résumé, so the three zones start fresh.
   * It only touches this run's scratch state (the draft + the prompt-copied flag);
   * the résumé document itself, its versions, and its imported-highlights total
   * are left untouched.
   */
  const handleResetRun = useCallback(() => {
    if (!selectedId) return;
    clearRunState();
    setResetOpen(false);
    showToast("Cleared this run — ready to start fresh.", "success");
  }, [selectedId, clearRunState, showToast]);

  /**
   * One-tap "Copy all + Clear draft" — puts every prompt on the clipboard (so it
   * can be reused on the next résumé) and then clears this run in a single click.
   * Finishing a run and resetting for the next one no longer takes two steps.
   */
  const handleCopyAllAndClear = useCallback(async () => {
    if (!selectedId) return;
    const text = formatPromptsClipboard(promptsForCopy);
    let copied = false;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        /* clipboard may be blocked — the run still clears */
      }
    }
    clearRunState();
    showToast(
      copied
        ? "Copied all prompts and cleared this run — ready for the next résumé."
        : "Cleared this run — ready for the next résumé.",
      "success"
    );
  }, [selectedId, promptsForCopy, clearRunState, showToast]);

  const fallbackStyle = useMemo(
    () =>
      resolveVersionPreviewStyle(
        "resume",
        selectedId || "0",
        resume?.active_version ?? 1,
        // Prefer the ACTIVE version's own design (per-version designs), then the
        // résumé's — matching exactly how the viewer and marquee resolve it.
        resume?.versions?.find(
          (v) => String(v.version) === String(resume?.active_version)
        )?.template_id || resume?.template_id
      ),
    [selectedId, resume?.active_version, resume?.template_id, resume?.versions]
  );

  // The style the viewer actually painted with (server-authoritative for the
  // selected version). Shared with Zone C's accept preview so the review shows
  // the SAME template as the viewer, never a different, page-guessed one.
  const [viewerStyle, setViewerStyle] = useState<VersionPreviewStyle | null>(null);
  useEffect(() => {
    setViewerStyle(null);
  }, [selectedId]);
  const handleStyleResolved = useCallback((next: VersionPreviewStyle) => {
    setViewerStyle((prev) =>
      prev &&
      prev.themeId === next.themeId &&
      prev.accentId === next.accentId &&
      prev.fontId === next.fontId &&
      prev.resolved === next.resolved
        ? prev
        : next
    );
  }, []);
  const style = viewerStyle ?? fallbackStyle;

  // Which zones have content, for the sticky nav's at-a-glance progress dots.
  const zoneStatus = useMemo(
    () => ({
      prompts: promptsCopied,
      paste: pasted.trim().length > 0,
      review: suggestions.some((s) => s.accepted),
    }),
    [promptsCopied, pasted, suggestions]
  );

  // Show "Reset this run" only when there's actually a run in progress to clear.
  const hasRunProgress =
    pasted.trim().length > 0 || suggestions.length > 0 || promptsCopied;

  const openEditor = useCallback(
    (version?: string | number) => {
      if (!resume) return;
      navigate(resumeEditorHref(resume.id, version));
    },
    [resume, navigate]
  );

  /**
   * Spotlight a suggested edit's target section in the left document viewer and
   * scroll it into view — so the user can see the text an edit applies to before
   * deciding to keep it. On desktop the viewer is already sticky, so the scroll
   * is a no-op there; on mobile it brings the viewer up into sight.
   */
  const jumpToSection = useCallback((section: string) => {
    const name = section.trim();
    if (!name) return;
    setSectionSpotlight({ section: name, nonce: Date.now() });
    requestAnimationFrame(() =>
      viewerColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, []);

  return (
    <div className="space-y-6">
      <header className="animate-fade-in-up flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl md:text-3xl font-medium text-foreground-950">
            My Work Highlights
          </h1>
          <p className="text-sm text-foreground-600 mt-1 max-w-3xl">
            Turn real accomplishments from your work email &amp; chat into polished résumé bullets —
            generate a prompt, run it in your company AI, paste the answer, review the suggested
            edits, and save the ones you want. It all happens on this page, next to your live résumé.
          </p>
        </div>
        {resume && (
          <HighlightsProgress
            resume={resume}
            importedCount={importedCount}
            lastImport={lastImport}
            undoing={undoing}
            onUndo={handleUndo}
          />
        )}
      </header>

      {/* Résumé + target-role controls */}
      <section
        className="rounded-2xl bg-background-50 border border-background-200 px-5 py-4 flex flex-col lg:flex-row lg:items-center gap-4 animate-fade-in-up"
        style={{ animationDelay: "0.03s" }}
      >
        <label className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-700 whitespace-nowrap">
            <i className="ri-file-text-line text-primary-600"></i>
            Résumé
          </span>
          <span className="relative inline-flex items-center min-w-0 flex-1 sm:flex-none">
            <select
              value={selectedId}
              onChange={(e) => selectResume(e.target.value)}
              disabled={resumesLoading || resumes.length === 0}
              className="appearance-none w-full sm:w-80 max-w-full pl-3 pr-8 py-2 rounded-md border border-background-200 bg-background-50 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {resumes.map((r) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {displayName(r)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 w-4 h-4 flex items-center justify-center text-foreground-400">
              {resumesLoading ? (
                <i className="ri-loader-4-line animate-spin text-sm"></i>
              ) : (
                <i className="ri-arrow-down-s-line"></i>
              )}
            </span>
          </span>
        </label>

        <HighlightsTargetRole
          jobs={jobs}
          loading={jobsLoading}
          value={jobPostingId}
          onChange={setJobPostingId}
        />

        {hasRunProgress && (
          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            <button
              type="button"
              onClick={() => void handleCopyAllAndClear()}
              title="Copy every prompt for reuse, then clear this run for the next résumé"
              className="inline-flex items-center gap-1.5 text-sm font-semibold border border-primary-200 bg-primary-50 text-primary-800 px-3.5 py-2 rounded-md hover:bg-primary-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-file-copy-2-line"></i>
              Copy all + Clear draft
            </button>
            <button
              type="button"
              onClick={() => setResetOpen(true)}
              title="Clear this run's paste, selections, and zone progress for this résumé"
              className="inline-flex items-center gap-1.5 text-sm font-semibold border border-background-200 bg-background-50 text-foreground-700 px-3.5 py-2 rounded-md hover:bg-background-100 hover:text-foreground-950 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-restart-line"></i>
              Reset this run
            </button>
          </div>
        )}
      </section>

      {resumesError ? (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <div className="flex-1">{resumesError}</div>
          <button
            type="button"
            onClick={loadResumes}
            className="inline-flex items-center gap-1 text-sm font-semibold hover:text-accent-900/80 cursor-pointer whitespace-nowrap"
          >
            Retry
          </button>
        </div>
      ) : resumesLoading ? (
        <div className="py-16 text-sm text-foreground-500 flex items-center justify-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i>
          Loading your résumés…
        </div>
      ) : resumes.length === 0 ? (
        <section className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-14 text-center">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl bg-background-200 text-foreground-500 mb-3">
            <i className="ri-file-text-line text-xl"></i>
          </div>
          <p className="text-sm font-medium text-foreground-900">You don&rsquo;t have a résumé yet.</p>
          <p className="text-xs text-foreground-500 mt-1 max-w-sm mx-auto">
            Upload a résumé first, then come back here to pull in your work highlights.
          </p>
          <Link
            to="/dashboard/documents"
            className="mt-4 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-upload-2-line"></i>
            Go to Documents
          </Link>
        </section>
      ) : (
        <>
          {resume && <HighlightsZoneNav status={zoneStatus} />}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-6 items-start animate-fade-in-up">
            {/* Left: the live document + its current highlights */}
            <div ref={viewerColumnRef} className="space-y-6 lg:sticky lg:top-32 lg:self-start scroll-mt-28">
              {resumeLoading && !resume ? (
                <section className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-16 flex flex-col items-center gap-2 text-foreground-400">
                  <i className="ri-loader-4-line text-2xl animate-spin"></i>
                  <span className="text-sm">Loading your résumé…</span>
                </section>
              ) : resumeError ? (
                <section className="rounded-2xl bg-accent-50 border border-accent-200 px-5 py-10 text-center">
                  <i className="ri-error-warning-line text-2xl text-accent-600"></i>
                  <p className="mt-2 text-sm text-foreground-800">{resumeError}</p>
                </section>
              ) : resume ? (
                <>
                  <HighlightsDocumentViewer
                    resume={resume}
                    onResumeChange={handleResumeChange}
                    onOpenEditor={openEditor}
                    onStyleResolved={handleStyleResolved}
                    spotlight={sectionSpotlight}
                    onClearSpotlight={() => setSectionSpotlight(null)}
                  />
                  <ResumeHighlightsContext resume={resume} />
                </>
              ) : null}
            </div>

            {/* Right: the three always-visible zones */}
            <div className="space-y-6 min-w-0">
              {resume ? (
                <>
                  <ZonePrompts
                    resumeId={resume.id}
                    jobPostingId={jobPostingId || undefined}
                    onCopied={() => setPromptsCopied(true)}
                    onPromptsLoaded={setPromptsForCopy}
                  />
                  <ZonePaste
                    resumeId={resume.id}
                    jobPostingId={jobPostingId || undefined}
                    pasted={pasted}
                    onPastedChange={setPasted}
                    onSuggested={(list: HighlightSuggestion[]) => {
                      setSuggestions(toEditableSuggestions(list));
                      requestAnimationFrame(() =>
                        reviewWrapRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      );
                    }}
                  />
                  <div ref={reviewWrapRef} className="scroll-mt-32">
                    <ZoneSuggestEdits
                      resumeId={resume.id}
                      suggestions={suggestions}
                      onSuggestionsChange={setSuggestions}
                      style={style}
                      onSaved={handleAccepted}
                      onFinishAndReset={() => void handleCopyAllAndClear()}
                      onJumpToSection={jumpToSection}
                    />
                  </div>
                </>
              ) : (
                <section className="rounded-2xl bg-background-100/60 border border-background-200 px-5 py-16 text-center text-sm text-foreground-500">
                  Pick a résumé to start.
                </section>
              )}
            </div>
          </div>
        </>
      )}

      <div className="pt-2">
        <SavedHighlightsLibrary />
      </div>

      {resetOpen && (
        <ConfirmDialog
          title="Reset this run?"
          message="This clears the pasted text, your selected highlights, and the zone progress for this résumé so you can start fresh. Your résumé, its versions, and anything you've already imported stay untouched."
          confirmLabel="Reset this run"
          onConfirm={handleResetRun}
          onCancel={() => setResetOpen(false)}
        />
      )}
    </div>
  );
}