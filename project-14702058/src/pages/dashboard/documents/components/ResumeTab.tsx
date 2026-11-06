import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, buildApiDiagnostics, classifyApiError, refreshSessionNow, type ApiErrorKind } from "@/lib/api";
import {
  deleteResume,
  listResumes,
  resolveResumeTitle,
  setResumeArchived,
  setResumeFlagged,
  uploadResume,
  type Resume,
} from "@/lib/documents";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import GradeBadge from "@/pages/dashboard/documents/components/GradeBadge";
import InlinePreview from "@/pages/dashboard/documents/components/InlinePreview";
import DocumentMarqueeButton from "@/pages/dashboard/documents/components/DocumentMarqueeButton";
import ReadableDocumentModal from "@/pages/dashboard/documents/components/ReadableDocumentModal";
import DocumentLoadError from "@/pages/dashboard/documents/components/DocumentLoadError";
import DocumentSyncStamp from "@/pages/dashboard/documents/components/DocumentSyncStamp";
import { openRevisionReview, revisionReviewKey } from "@/lib/revisionReview";
import RoleChip from "@/pages/dashboard/documents/components/RoleChip";
import DocumentListToolbar from "@/pages/dashboard/documents/components/DocumentListToolbar";
import DocumentRowMenu from "@/pages/dashboard/documents/components/DocumentRowMenu";
import { documentAttentionReason } from "@/pages/dashboard/documents/components/attentionReason";
import { readLatestTailoredTarget } from "@/lib/versionCoverage";
import { readEvidenceDraft, evidenceDraftSummary } from "@/lib/evidenceDraft";
import { readWorkHighlightsImported } from "@/lib/workHighlightsMemory";
import EvidenceDraftPill from "@/pages/dashboard/documents/components/EvidenceDraftPill";
import { rememberRecentDocument } from "@/lib/recentDocument";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { sortByRole } from "@/lib/documentListMemory";
import useDocumentListFilters from "@/hooks/useDocumentListFilters";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";

const ACCEPTED = ".pdf,.docx,.md,.markdown,.txt";

/** Durable, cross-device state for the résumé list (backend view "resumes"). */
interface ResumeViewState extends Record<string, unknown> {
  tab?: unknown;
  filters?: { role?: unknown; sort?: unknown };
  selectedId?: unknown;
  scrollY?: unknown;
}

interface ResumeTabProps {
  /** A document the parent wants opened (the "Jump back in" shortcut). */
  focusDocId?: string | number | null;
  /** Called once the focus request has been handled (found or not). */
  onFocusHandled?: () => void;
  /** Called whenever the user opens a document (preview). */
  onDocOpened?: () => void;
  /** Opens the "My Work Highlights" wizard from the résumé toolbar. */
  onWorkHighlights?: () => void;
}

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ResumeTab({
  focusDocId = null,
  onFocusHandled,
  onDocOpened,
  onWorkHighlights,
}: ResumeTabProps = {}) {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadErrorKind, setLoadErrorKind] = useState<ApiErrorKind | "">("");
  /** Plain-text diagnostics (path + status/timeout) for the load-error state. */
  const [loadDiagnostics, setLoadDiagnostics] = useState("");
  /** When the list was last loaded live, so the sync stamp can show recency. */
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  /** Whether that last load succeeded only after a retry. */
  const [lastSyncRetried, setLastSyncRetried] = useState(false);
  const [success, setSuccess] = useState("");
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);
  const [preview, setPreview] = useState<{ id: string | number; title: string; fileSize?: number } | null>(null);
  /** The document shown in the full-screen readable view. */
  const [readable, setReadable] = useState<{ id: string | number; title: string } | null>(null);

  const {
    status,
    setStatus,
    roleFilter,
    setRoleFilter,
    sort,
    setSort,
    statusParams,
  } = useDocumentListFilters("resumes");

  const fileRef = useRef<HTMLInputElement>(null);

  // Durable view state (tab, role/sort filters, open document) + scroll.
  const viewState = useViewState<ResumeViewState>("resumes");
  const restoredView = useRef(false);
  const [pendingSelected, setPendingSelected] = useState<string | number | null>(null);

  // Restore the saved tab + filters + selected document once the state loads.
  useEffect(() => {
    if (!viewState.loaded || restoredView.current) return;
    restoredView.current = true;
    const saved = viewState.saved ?? {};
    if (saved.tab === "active" || saved.tab === "flagged" || saved.tab === "archived") {
      setStatus(saved.tab);
    }
    const role = saved.filters?.role;
    if (typeof role === "string" && role) setRoleFilter(role);
    const savedSort = saved.filters?.sort;
    if (savedSort === "default" || savedSort === "role_asc" || savedSort === "role_desc") {
      setSort(savedSort);
    }
    const sel = saved.selectedId;
    if (sel !== null && sel !== undefined && sel !== "") {
      setPendingSelected(sel as string | number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewState.loaded]);

  // Reconcile a restored selection against the loaded list — if the document
  // no longer exists (deleted/archived out of view), drop it and stay on top.
  useEffect(() => {
    if (pendingSelected === null || loading) return;
    const match = resumes.find((r) => String(r.id) === String(pendingSelected));
    if (match) setPreview({ id: match.id, title: displayName(match) });
    setPendingSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelected, loading, resumes]);

  // Open a document requested by the parent ("Jump back in") once the list is ready.
  useEffect(() => {
    if (focusDocId === null || focusDocId === undefined || loading) return;
    const match = resumes.find((r) => String(r.id) === String(focusDocId));
    if (match) setPreview({ id: match.id, title: displayName(match) });
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDocId, loading, resumes]);

  // Remember the most-recently-opened document for the "Jump back in" shortcut,
  // and record the open on the cross-device recently-viewed rail (quick-preview too).
  useEffect(() => {
    if (!preview) return;
    const row = resumes.find((r) => String(r.id) === String(preview.id));
    rememberRecentDocument({
      kind: "resume",
      id: preview.id,
      title: preview.title,
      version: row?.active_version,
    });
    void recordRecentlyViewed({
      kind: "resume",
      ref_id: preview.id,
      title: preview.title,
      subtitle: row
        ? [row.target_role, row.quality_grade ? `Grade ${row.quality_grade}` : ""]
            .filter(Boolean)
            .join(" \u00b7 ")
        : "",
      view: "resumes",
    });
    onDocOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  // Persist meaningful state on every change (merge-saved, debounced).
  useEffect(() => {
    if (!viewState.loaded) return;
    viewState.save({
      tab: status,
      filters: { role: roleFilter, sort },
      selectedId: preview?.id ?? null,
      scrollY: Math.round(window.scrollY),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, roleFilter, sort, preview?.id, viewState.loaded]);

  useScrollRestore(
    "documents/resumes",
    viewState.loaded && !loading && pendingSelected === null,
    Number(viewState.saved?.scrollY) || 0,
  );

  /**
   * Best-effort count of flagged résumés, so the status control can show a
   * "Flagged · N" badge without switching states. Fetched independently of the
   * current list so it stays accurate on every tab.
   */
  async function loadFlaggedCount() {
    try {
      const all = await listResumes();
      setFlaggedCount((all ?? []).filter((r) => r.flagged).length);
    } catch {
      /* the badge is best-effort — never block the list on it */
    }
  }

  async function load(mode: "initial" | "retry" = "initial") {
    setLoading(true);
    setLoadError("");
    setLoadErrorKind("");
    setLoadDiagnostics("");
    void loadFlaggedCount();
    try {
      const list = await listResumes(statusParams);
      setResumes(list ?? []);
      setLastSyncedAt(Date.now());
      setLastSyncRetried(mode === "retry");
    } catch (err) {
      setLoadErrorKind(classifyApiError(err));
      setLoadError(err instanceof ApiError ? err.message : "Could not load your résumés.");
      setLoadDiagnostics(
        buildApiDiagnostics(err, {
          label: "résumé list",
          path: `GET /api/v1/resumes${statusParams ? "?…" : ""}`,
        })
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Reload whenever the Active/Flagged/Archived state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /**
   * One-tap session recovery for the "session expired" state: force a token
   * refresh, then reload the list. A definitive rejection tears the session down
   * and redirects to sign-in; an unreachable server returns a message to show
   * in place without losing the page.
   */
  async function handleRefreshSession(): Promise<string | null> {
    const result = await refreshSessionNow();
    if (result === "refreshed") {
      await load("retry");
      return null;
    }
    if (result === "unreachable") {
      return "Couldn't reach the server to refresh your session. Check your connection and try again.";
    }
    return "Your session has ended — taking you to sign in…";
  }

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError("");
    setSuccess("");
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const res = await uploadResume(file);
      setSuccess(`${file.name} uploaded successfully.`);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setPreview({
        id: res.id,
        title: resolveResumeTitle(res),
        fileSize: file.size,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string | number) {
    setConfirmDelete(null);
    setError("");
    setSuccess("");
    try {
      await deleteResume(id);
      setSuccess("Résumé deleted.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  async function handleToggleFlag(res: Resume) {
    const next = !res.flagged;
    setBusyId(res.id);
    setError("");
    setSuccess("");
    setResumes((cur) => cur.map((r) => (r.id === res.id ? { ...r, flagged: next } : r)));
    try {
      const updated = await setResumeFlagged(res.id, next);
      if (updated) {
        setResumes((cur) => cur.map((r) => (r.id === res.id ? { ...r, ...updated } : r)));
      }
      setSuccess(next ? "Marked as needs attention." : "Flag removed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the flag.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function handleArchiveAllFlagged() {
    setConfirmArchiveAll(false);
    setArchivingAll(true);
    setError("");
    setSuccess("");
    try {
      const flagged = (await listResumes({ flagged: true })) ?? [];
      const targets = flagged.filter((r) => r.flagged && !r.archived);
      if (targets.length === 0) {
        setSuccess("No flagged résumés left to archive.");
        await load();
        return;
      }
      const results = await Promise.allSettled(
        targets.map((r) => setResumeArchived(r.id, true))
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.length - ok;
      setSuccess(
        `${ok} flagged résumé${ok === 1 ? "" : "s"} archived${
          failedCount ? ` \u00b7 ${failedCount} failed` : ""
        }.`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not archive flagged résumés."
      );
    } finally {
      setArchivingAll(false);
    }
  }

  async function handleToggleArchive(res: Resume) {
    const next = !res.archived;
    setBusyId(res.id);
    setError("");
    setSuccess("");
    try {
      const updated = await setResumeArchived(res.id, next);
      if (updated) {
        setResumes((cur) => cur.map((r) => (r.id === res.id ? { ...r, ...updated } : r)));
      }
      setSuccess(next ? "Résumé archived." : "Résumé restored.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the archive.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  function displayName(res: Resume) {
    return resolveResumeTitle(res);
  }

  // Last-aimed-at role per résumé, plus the value the Templates shortcut should
  // pre-select (the job id when we have it, else the role label).
  const roleInfo = resumes.map((res) => {
    const target = readLatestTailoredTarget("resume", res.id);
    const label = (res.target_role || target?.label || "").trim();
    const value =
      target?.jobId !== null && target?.jobId !== undefined
        ? String(target.jobId)
        : label;
    return { res, label, value };
  });
  const roleCounts: Record<string, number> = {};
  for (const it of roleInfo) {
    if (it.label) roleCounts[it.label] = (roleCounts[it.label] ?? 0) + 1;
  }
  const roleOptions = Object.keys(roleCounts).map((role) => ({
    role,
    count: roleCounts[role],
  }));
  const filterActive =
    roleFilter !== "__all__" && roleCounts[roleFilter] !== undefined;
  const visibleItems = filterActive
    ? roleInfo.filter((it) => it.label === roleFilter)
    : roleInfo;
  const orderedItems = sortByRole(visibleItems, (it) => it.label, sort);

  function templatesHref(id: string | number, value: string, label: string) {
    const params = new URLSearchParams();
    params.set("role", value);
    if (label && label !== value) params.set("roleLabel", label);
    return `/dashboard/documents/resumes/${id}/templates?${params.toString()}`;
  }

  function renderEmpty() {
    const copy =
      status === "flagged"
        ? {
            icon: "ri-flag-line",
            title: "No flagged documents",
            detail: "Résumés you mark as \u201cneeds attention\u201d will show up here.",
          }
        : status === "archived"
          ? {
              icon: "ri-archive-line",
              title: "No archived documents",
              detail: "Résumés you archive will show up here — they still open and edit normally.",
            }
          : {
              icon: "ri-file-text-line",
              title: "No résumé yet",
              detail:
                "No résumé yet — upload one so your matches and interview questions are tailored to your experience.",
            };
    return (
      <div className="py-12 text-center">
        <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
          <i className={`${copy.icon} text-2xl`}></i>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground-900">{copy.title}</p>
        <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">{copy.detail}</p>
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200">
      <div className="px-5 py-4 border-b border-background-200">
        <h2 className="font-heading text-lg font-medium text-foreground-950">Résumés</h2>
        <p className="text-xs text-foreground-500 mt-0.5">
          Upload a PDF, DOCX, or Markdown file so your matches and interview questions are
          tailored to your experience.
        </p>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-xl bg-background-50 border border-background-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              onChange={handlePick}
              className="block w-full sm:flex-1 text-sm text-foreground-600 cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-md file:border file:border-background-200 file:bg-background-100 file:text-sm file:font-semibold file:text-foreground-900 file:cursor-pointer hover:file:bg-background-200 file:transition-colors"
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {uploading ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Uploading…
                </>
              ) : (
                <>
                  <i className="ri-upload-2-line"></i>
                  Upload résumé
                </>
              )}
            </button>
          </div>
          {file && (
            <p className="text-xs text-foreground-500 mt-2 truncate">Selected: {file.name}</p>
          )}
        </div>

        {preview && (
          <InlinePreview
            kind="resume"
            docId={preview.id}
            title={preview.title}
            onClose={() => setPreview(null)}
            fileSize={preview.fileSize}
          />
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
            <i className="ri-error-warning-line text-base mt-0.5"></i>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-2.5 rounded-lg bg-primary-100 text-primary-900 px-4 py-3 text-sm">
            <i className="ri-checkbox-circle-line text-base mt-0.5"></i>
            <span>{success}</span>
          </div>
        )}

        <DocumentListToolbar
          status={status}
          onStatusChange={setStatus}
          sort={sort}
          onSortChange={setSort}
          roleOptions={roleOptions}
          roleTotal={roleInfo.length}
          roleFilter={roleFilter}
          onRoleChange={setRoleFilter}
          counts={{ flagged: flaggedCount }}
          onArchiveAllFlagged={() => setConfirmArchiveAll(true)}
          archiveAllBusy={archivingAll}
          onWorkHighlights={onWorkHighlights}
          syncStatus={
            <DocumentSyncStamp
              lastSyncedAt={lastSyncedAt}
              retried={lastSyncRetried}
              loading={loading}
            />
          }
        />

        {loading ? (
          <div className="py-10 text-sm text-foreground-500 flex items-center gap-2">
            <i className="ri-loader-4-line animate-spin"></i>
            Loading your résumés…
          </div>
        ) : loadErrorKind ? (
          <DocumentLoadError
            kind={loadErrorKind}
            entity="résumés"
            message={loadError}
            diagnostics={loadDiagnostics}
            onRetry={() => void load("retry")}
            onRefreshSession={handleRefreshSession}
          />
        ) : resumes.length === 0 ? (
          renderEmpty()
        ) : (
          <ul className="space-y-3">
            {orderedItems.map(({ res, label, value }) => {
              const role = label;
              const isArchived = status === "archived";
              const evidenceDraft = readEvidenceDraft(res.id);
              const importedHighlights = readWorkHighlightsImported(res.id);
              const versionCount = res.versions?.length ?? 0;
              return (
              <li
                key={res.id}
                className={`rounded-xl bg-background-50 border border-background-200 p-4 flex items-center gap-3 ${
                  isArchived ? "opacity-75" : ""
                }`}
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700 flex-shrink-0">
                  <i className="ri-file-text-line text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="block text-sm font-medium text-foreground-950 truncate">
                      {displayName(res)}
                    </span>
                    {role && (
                      <RoleChip
                        role={role}
                        title={`Open Templates aimed at ${role}`}
                        to={templatesHref(res.id, value, role)}
                      />
                    )}
                    <GradeBadge grade={res.quality_grade} score={res.quality_score} />
                    {importedHighlights > 0 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                        title={`${importedHighlights} highlight${importedHighlights === 1 ? "" : "s"} imported from My Work Highlights`}
                      >
                        <i className="ri-sparkling-2-line"></i>
                        {importedHighlights} highlight{importedHighlights === 1 ? "" : "s"} imported
                      </span>
                    )}
                    {versionCount > 1 && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                        title={`${versionCount} saved versions — open to switch between them`}
                      >
                        <i className="ri-git-branch-line"></i>
                        {versionCount} versions
                      </span>
                    )}
                    {evidenceDraft && (
                      <EvidenceDraftPill
                        resumeId={res.id}
                        step={evidenceDraft.step}
                        summary={evidenceDraftSummary(evidenceDraft)}
                        onDiscard={() => void load()}
                      />
                    )}
                    {res.flagged && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-flag-line"></i>
                        Needs attention
                      </span>
                    )}
                    {isArchived && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-600 bg-background-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-archive-line"></i>
                        Archived
                      </span>
                    )}
                  </div>
                  {isArchived ? (
                    <span className="block text-xs text-foreground-500 mt-0.5 truncate">
                      Archived on {formatDate(res.archived_at ?? res.updated_at ?? res.created_at)}
                    </span>
                  ) : (
                    formatDate(res.created_at ?? res.updated_at) && (
                      <span className="block text-xs text-foreground-500 mt-0.5 truncate">
                        Uploaded {formatDate(res.created_at ?? res.updated_at)}
                      </span>
                    )
                  )}
                  {res.flagged && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-accent-800 truncate">
                      <i className="ri-alert-line flex-shrink-0"></i>
                      {documentAttentionReason("resume", res)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => {
                      // While this document has a pending improvement, the row's
                      // Preview opens the full review (highlight + compare).
                      if (openRevisionReview(revisionReviewKey("resume", res.id))) return;
                      setReadable({ id: res.id, title: displayName(res) });
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    title="Open full readable view"
                    aria-label={`Preview ${displayName(res)} full screen`}
                  >
                    <i className="ri-expand-diagonal-line"></i>
                    Preview
                  </button>
                  <Link
                    to={`/dashboard/documents/resumes/${res.id}/templates`}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                    title="Templates"
                    aria-label={`Templates for ${displayName(res)}`}
                  >
                    <i className="ri-layout-line"></i>
                  </Link>
                  <DocumentMarqueeButton
                    kind="resume"
                    compact
                    docId={res.id}
                    title={displayName(res)}
                    versions={res.versions ?? []}
                    activeVersion={res.active_version}
                    onChanged={() => void load()}
                  />
                  <button
                    onClick={() => setPreview({ id: res.id, title: displayName(res) })}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                    title="Quick preview"
                    aria-label={`Preview ${displayName(res)}`}
                  >
                    <i className="ri-eye-line"></i>
                  </button>
                  {confirmDelete === res.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(res.id)}
                        className="text-xs font-semibold text-accent-900 bg-accent-100 px-3 py-1.5 rounded-md hover:bg-accent-200 cursor-pointer whitespace-nowrap"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(res.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                      title="Delete"
                      aria-label={`Delete ${displayName(res)}`}
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  )}
                  {isArchived && (
                    <button
                      onClick={() => handleToggleArchive(res)}
                      disabled={busyId === res.id}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-100 px-3 py-1.5 rounded-md hover:bg-primary-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      title="Restore from archive"
                      aria-label={`Restore ${displayName(res)}`}
                    >
                      {busyId === res.id ? (
                        <i className="ri-loader-4-line animate-spin"></i>
                      ) : (
                        <i className="ri-inbox-unarchive-line"></i>
                      )}
                      Restore
                    </button>
                  )}
                  <DocumentRowMenu
                    flagged={res.flagged}
                    archived={res.archived}
                    busy={busyId === res.id}
                    onToggleFlag={() => handleToggleFlag(res)}
                    onToggleArchive={() => handleToggleArchive(res)}
                  />
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>

      {confirmArchiveAll && (
        <ConfirmDialog
          title="Archive all flagged résumés?"
          message={`This archives every résumé marked “needs attention” so it moves into your Archived view. You can restore any of them later.`}
          confirmLabel="Archive all"
          onConfirm={handleArchiveAllFlagged}
          onCancel={() => setConfirmArchiveAll(false)}
        />
      )}

      {readable && (
        <ReadableDocumentModal
          kind="resume"
          docId={readable.id}
          title={readable.title}
          onClose={() => setReadable(null)}
        />
      )}
    </section>
  );
}