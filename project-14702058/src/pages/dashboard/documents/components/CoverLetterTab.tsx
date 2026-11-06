import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { jobMatches } from "@/mocks/dashboard";
import { ApiError, buildApiDiagnostics, classifyApiError, refreshSessionNow, type ApiErrorKind } from "@/lib/api";
import {
  deleteCoverLetter,
  downloadCoverLetter,
  generateCoverLetter,
  listCoverLetters,
  listResumes,
  setCoverLetterArchived,
  setCoverLetterFlagged,
  updateCoverLetter,
  uploadCoverLetter,
  type CoverLetter,
  type Resume,
} from "@/lib/documents";
import Modal from "@/components/base/Modal";
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
import { rememberRecentDocument } from "@/lib/recentDocument";
import { recordRecentlyViewed } from "@/lib/recentlyViewed";
import { sortByRole } from "@/lib/documentListMemory";
import useDocumentListFilters from "@/hooks/useDocumentListFilters";
import useViewState from "@/hooks/useViewState";
import useScrollRestore from "@/hooks/useScrollRestore";

const TONES = ["Professional", "Friendly", "Concise", "Enthusiastic", "Direct"];
const ACCEPTED = ".pdf,.docx,.md,.markdown,.txt";

/** Durable, cross-device state for the cover-letter list (backend view "cover-letters"). */
interface CoverLetterViewState extends Record<string, unknown> {
  tab?: unknown;
  filters?: { role?: unknown; sort?: unknown };
  selectedId?: unknown;
  scrollY?: unknown;
}

interface CoverLetterTabProps {
  /** A document the parent wants opened (the "Jump back in" shortcut). */
  focusDocId?: string | number | null;
  /** Called once the focus request has been handled (found or not). */
  onFocusHandled?: () => void;
  /** Called whenever the user opens a document (preview). */
  onDocOpened?: () => void;
}

const selectCls =
  "w-full h-10 px-3 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

function jobLabel(id: string | number | undefined) {
  const job = jobMatches.find((j) => String(j.id) === String(id));
  return job ? `${job.title} · ${job.company}` : "Job posting";
}

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function CoverLetterTab({
  focusDocId = null,
  onFocusHandled,
  onDocOpened,
}: CoverLetterTabProps = {}) {
  const [letters, setLetters] = useState<CoverLetter[]>([]);
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
  const [uploadJob, setUploadJob] = useState("");
  const [uploadResume, setUploadResume] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genJob, setGenJob] = useState("");
  const [genResume, setGenResume] = useState("");
  const [genTone, setGenTone] = useState("Professional");

  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [confirmArchiveAll, setConfirmArchiveAll] = useState(false);
  const [archivingAll, setArchivingAll] = useState(false);
  const {
    status,
    setStatus,
    roleFilter,
    setRoleFilter,
    sort,
    setSort,
    statusParams,
  } = useDocumentListFilters("cover-letters");
  const [preview, setPreview] = useState<{ id: string | number; title: string; fileSize?: number } | null>(null);
  /** The document shown in the full-screen readable view. */
  const [readable, setReadable] = useState<{ id: string | number; title: string } | null>(null);

  // Durable view state (tab, role/sort filters, open letter) + scroll.
  const viewState = useViewState<CoverLetterViewState>("cover-letters");
  const restoredView = useRef(false);
  const [pendingSelected, setPendingSelected] = useState<string | number | null>(null);

  // Restore the saved tab + filters + selected letter once the state loads.
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

  // Reconcile a restored selection against the loaded list — a letter that no
  // longer exists is dropped so the user lands cleanly on the list top.
  useEffect(() => {
    if (pendingSelected === null || loading) return;
    const match = letters.find((l) => String(l.id) === String(pendingSelected));
    if (match) setPreview({ id: match.id, title: displayName(match) });
    setPendingSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelected, loading, letters]);

  // Open a document requested by the parent ("Jump back in") once the list is ready.
  useEffect(() => {
    if (focusDocId === null || focusDocId === undefined || loading) return;
    const match = letters.find((l) => String(l.id) === String(focusDocId));
    if (match) setPreview({ id: match.id, title: displayName(match) });
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusDocId, loading, letters]);

  // Remember the most-recently-opened document for the "Jump back in" shortcut,
  // and record the open on the cross-device recently-viewed rail (quick-preview too).
  useEffect(() => {
    if (!preview) return;
    const row = letters.find((l) => String(l.id) === String(preview.id));
    rememberRecentDocument({
      kind: "cover-letter",
      id: preview.id,
      title: preview.title,
      version: row?.active_version,
    });
    void recordRecentlyViewed({
      kind: "cover_letter",
      ref_id: preview.id,
      title: preview.title,
      subtitle: row?.job_posting_id ? jobLabel(row.job_posting_id) : "Generic cover letter",
      view: "cover-letters",
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
    "documents/cover-letters",
    viewState.loaded && !loading && pendingSelected === null,
    Number(viewState.saved?.scrollY) || 0,
  );

  async function load(mode: "initial" | "retry" = "initial") {
    setLoading(true);
    setLoadError("");
    setLoadErrorKind("");
    setLoadDiagnostics("");
    void loadFlaggedCount();
    try {
      const list = await listCoverLetters(statusParams);
      setLetters(list ?? []);
      setLastSyncedAt(Date.now());
      setLastSyncRetried(mode === "retry");
    } catch (err) {
      setLoadErrorKind(classifyApiError(err));
      setLoadError(err instanceof ApiError ? err.message : "Could not load your cover letters.");
      setLoadDiagnostics(
        buildApiDiagnostics(err, {
          label: "cover letter list",
          path: `GET /api/v1/cover-letters${statusParams ? "?…" : ""}`,
        })
      );
    } finally {
      setLoading(false);
    }
  }

  /**
   * Best-effort count of flagged cover letters, so the status control can show
   * a "Flagged · N" badge without switching states.
   */
  async function loadFlaggedCount() {
    try {
      const all = await listCoverLetters();
      setFlaggedCount((all ?? []).filter((l) => l.flagged).length);
    } catch {
      /* the badge is best-effort — never block the list on it */
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

  useEffect(() => {
    listResumes({ archived: false })
      .then((list) => setResumes(list ?? []))
      .catch(() => {
        // resume selector is optional; ignore failures
      });
  }, []);

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError("");
    setSuccess("");
    setConfirmOverwrite(false);
  }

  function cancelUpload() {
    setFile(null);
    setUploadJob("");
    setUploadResume("");
    setConfirmOverwrite(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function doUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const letter = await uploadCoverLetter(file, {
        job_posting_id: uploadJob || undefined,
        resume_id: uploadResume || undefined,
      });
      setSuccess(`${file.name} uploaded successfully.`);
      cancelUpload();
      await load();
      setPreview({
        id: letter.id,
        title: letter.original_filename || `Cover letter ${letter.id}`,
        fileSize: file.size,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleUpload() {
    if (!file) return;
    setError("");
    setSuccess("");
    const duplicate = letters.some((l) => l.original_filename === file.name);
    if (duplicate && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    doUpload();
  }

  async function handleDelete(id: string | number) {
    setConfirmDelete(null);
    setError("");
    setSuccess("");
    try {
      await deleteCoverLetter(id);
      setSuccess("Cover letter deleted.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  async function handleArchiveAllFlagged() {
    setConfirmArchiveAll(false);
    setArchivingAll(true);
    setError("");
    setSuccess("");
    try {
      const flagged = (await listCoverLetters({ flagged: true })) ?? [];
      const targets = flagged.filter((l) => l.flagged && !l.archived);
      if (targets.length === 0) {
        setSuccess("No flagged cover letters left to archive.");
        await load();
        return;
      }
      const results = await Promise.allSettled(
        targets.map((l) => setCoverLetterArchived(l.id, true))
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.length - ok;
      setSuccess(
        `${ok} flagged cover letter${ok === 1 ? "" : "s"} archived${
          failedCount ? ` \u00b7 ${failedCount} failed` : ""
        }.`
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not archive flagged cover letters."
      );
    } finally {
      setArchivingAll(false);
    }
  }

  async function handleToggleFlag(letter: CoverLetter) {
    const next = !letter.flagged;
    setBusyId(letter.id);
    setError("");
    setSuccess("");
    setLetters((cur) => cur.map((l) => (l.id === letter.id ? { ...l, flagged: next } : l)));
    try {
      const updated = await setCoverLetterFlagged(letter.id, next);
      if (updated) {
        setLetters((cur) => cur.map((l) => (l.id === letter.id ? { ...l, ...updated } : l)));
      }
      setSuccess(next ? "Marked as needs attention." : "Flag removed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the flag.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function handleToggleArchive(letter: CoverLetter) {
    const next = !letter.archived;
    setBusyId(letter.id);
    setError("");
    setSuccess("");
    try {
      const updated = await setCoverLetterArchived(letter.id, next);
      if (updated) {
        setLetters((cur) => cur.map((l) => (l.id === letter.id ? { ...l, ...updated } : l)));
      }
      setSuccess(next ? "Cover letter archived." : "Cover letter restored.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the archive.");
    } finally {
      setBusyId(null);
      await load();
    }
  }

  async function handleDownload(letter: CoverLetter) {
    setError("");
    try {
      await downloadCoverLetter(letter.id, letter.original_filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Download failed.");
    }
  }

  function openGenerate() {
    setGenJob(jobMatches[0] ? String(jobMatches[0].id) : "");
    setGenResume("");
    setGenTone("Professional");
    setShowGenerate(true);
  }

  async function handleGenerate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!genJob) return;
    setGenerating(true);
    setError("");
    try {
      const letter = await generateCoverLetter({
        job_posting_id: genJob,
        resume_id: genResume || undefined,
        tone: genTone,
      });
      setLetters((prev) => [letter, ...prev]);
      setShowGenerate(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function startEdit(letter: CoverLetter) {
    setEditingId(letter.id);
    setEditContent(letter.content ?? "");
  }

  async function saveEdit(letter: CoverLetter) {
    setSaving(true);
    setError("");
    try {
      const updated = await updateCoverLetter(letter.id, { content: editContent });
      setLetters((prev) => prev.map((l) => (l.id === letter.id ? updated : l)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the letter.");
    } finally {
      setSaving(false);
    }
  }

  function displayName(letter: CoverLetter) {
    if (letter.source !== "uploaded") return "Generated cover letter";
    return letter.original_filename || `Cover letter ${letter.id}`;
  }

  function letterDate(letter: CoverLetter) {
    return letter.created_at ?? letter.generated_at;
  }

  // Last-aimed-at role per cover letter, plus the value the Templates shortcut
  // should pre-select (the job id when we have it, else the role label).
  const roleInfo = letters.map((letter) => {
    const target = readLatestTailoredTarget("cover-letter", letter.id);
    const linkedJob = letter.job_posting_id
      ? jobMatches.find((j) => String(j.id) === String(letter.job_posting_id))
      : undefined;
    const label = (target?.label || linkedJob?.title || "").trim();
    const value =
      target?.jobId !== null && target?.jobId !== undefined
        ? String(target.jobId)
        : label;
    return { letter, label, value };
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
    return `/dashboard/documents/cover-letters/${id}/templates?${params.toString()}`;
  }

  function renderEmpty() {
    if (status !== "active") {
      const copy =
        status === "flagged"
          ? {
              icon: "ri-flag-line",
              title: "No flagged documents",
              detail: "Cover letters you mark as \u201cneeds attention\u201d will show up here.",
            }
          : {
              icon: "ri-archive-line",
              title: "No archived documents",
              detail:
                "Cover letters you archive will show up here \u2014 they still open and edit normally.",
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
      <div className="py-12 text-center">
        <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
          <i className="ri-mail-send-line text-2xl"></i>
        </div>
        <p className="mt-4 text-sm font-medium text-foreground-900">No cover letters yet</p>
        <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">
          Upload one you already wrote, or generate a tailored letter for a job posting.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-upload-2-line"></i>
            Upload cover letter
          </button>
          <button
            onClick={openGenerate}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-sparkling-line"></i>
            Generate
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200">
      <div className="px-5 py-4 border-b border-background-200">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-heading text-lg font-medium text-foreground-950">Cover letters</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-upload-2-line"></i>
              Upload cover letter
            </button>
            <button
              onClick={openGenerate}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-sparkling-line"></i>
              Generate cover letter
            </button>
          </div>
        </div>
        <p className="text-xs text-foreground-500 mt-1.5 leading-relaxed">
          Upload one you wrote, or generate one tailored to a job
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          onChange={handlePick}
          className="hidden"
        />
      </div>

      <div className="p-5 space-y-4">
        {file && (
          <div className="rounded-xl bg-background-50 border border-background-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <i className="ri-file-text-line text-foreground-500"></i>
                <span className="text-sm text-foreground-700 truncate">{file.name}</span>
                {file.size > 0 && (
                  <span className="text-xs text-foreground-400 whitespace-nowrap">
                    {formatBytes(file.size)}
                  </span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
              >
                Choose a different file
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                  Job posting <span className="text-foreground-400 font-normal">(optional)</span>
                </span>
                <select
                  value={uploadJob}
                  onChange={(e) => setUploadJob(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Generic letter</option>
                  {jobMatches.map((j) => (
                    <option key={j.id} value={String(j.id)}>
                      {j.title} · {j.company}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                  Résumé <span className="text-foreground-400 font-normal">(optional)</span>
                </span>
                <select
                  value={uploadResume}
                  onChange={(e) => setUploadResume(e.target.value)}
                  className={selectCls}
                >
                  <option value="">None</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.title || r.filename || `Résumé ${r.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {confirmOverwrite && (
              <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3">
                <i className="ri-error-warning-line text-base mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-medium">
                    A cover letter named “{file.name}” already exists in your list.
                  </p>
                  <p className="text-xs mt-0.5">
                    Uploading will add it again as a separate letter — your existing one stays.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={doUpload}
                      disabled={uploading}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-900 bg-accent-200 px-3 py-1.5 rounded-md hover:bg-accent-300 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                    >
                      {uploading ? (
                        <i className="ri-loader-4-line animate-spin"></i>
                      ) : (
                        <i className="ri-upload-2-line"></i>
                      )}
                      Upload anyway
                    </button>
                    <button
                      onClick={() => setConfirmOverwrite(false)}
                      className="text-xs font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleUpload}
                disabled={uploading || confirmOverwrite}
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
                    Upload file
                  </>
                )}
              </button>
              <button
                onClick={cancelUpload}
                className="text-sm font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {preview && (
          <InlinePreview
            kind="cover-letter"
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
            Loading your cover letters…
          </div>
        ) : loadError ? (
          <DocumentLoadError
            kind={loadErrorKind}
            entity="cover letters"
            message={loadError}
            diagnostics={loadDiagnostics}
            onRetry={() => void load("retry")}
            onRefreshSession={handleRefreshSession}
          />
        ) : letters.length === 0 ? (
          renderEmpty()
        ) : (
          <>
            <ul className="space-y-3">
            {orderedItems.map(({ letter, label, value }) => {
              const isUploaded = letter.source === "uploaded";
              const isArchived = status === "archived";
              const date = letterDate(letter);
              const roleChip = label;
              const versionCount = letter.versions?.length ?? 0;
              return (
                <li
                  key={letter.id}
                  className={`rounded-xl bg-background-50 border border-background-200 p-4 ${
                    isArchived ? "opacity-75" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${
                        isUploaded
                          ? "bg-primary-100 text-primary-700"
                          : "bg-accent-100 text-accent-700"
                      }`}
                    >
                      <i className={`${isUploaded ? "ri-file-text-line" : "ri-sparkling-line"} text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground-950 truncate">
                          {displayName(letter)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                            isUploaded
                              ? "text-secondary-900 bg-secondary-100"
                              : "text-accent-900 bg-accent-100"
                          }`}
                        >
                          {isUploaded ? "Uploaded" : "AI-generated"}
                        </span>
                        {letter.tone && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {letter.tone}
                          </span>
                        )}
                        {roleChip && (
                          <RoleChip
                            role={roleChip}
                            title={`Open Templates aimed at ${roleChip}`}
                            to={templatesHref(letter.id, value, roleChip)}
                          />
                        )}
                        <GradeBadge grade={letter.quality_grade} score={letter.quality_score} />
                        {versionCount > 1 && (
                          <span
                            className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                            title={`${versionCount} saved versions — open to switch between them`}
                          >
                            <i className="ri-git-branch-line"></i>
                            {versionCount} versions
                          </span>
                        )}
                        {letter.flagged && (
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
                      <p className="text-xs text-foreground-500 mt-0.5 truncate">
                        {letter.job_posting_id
                          ? jobLabel(letter.job_posting_id)
                          : "Generic cover letter"}
                        {isArchived
                          ? ` · Archived on ${formatDate(letter.archived_at ?? date)}`
                          : date &&
                            ` · ${isUploaded ? "Uploaded" : "Generated"} ${formatDate(date)}`}
                      </p>
                      {letter.flagged && (
                        <span className="mt-0.5 flex items-center gap-1 text-xs text-accent-800 truncate">
                          <i className="ri-alert-line flex-shrink-0"></i>
                          {documentAttentionReason("cover-letter", letter)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          // While this letter has a pending improvement, the row's
                          // Preview opens the full review (highlight + compare).
                          if (openRevisionReview(revisionReviewKey("cover-letter", letter.id))) return;
                          setReadable({ id: letter.id, title: displayName(letter) });
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-700 bg-background-50 border border-background-200 hover:border-background-300 hover:text-foreground-950 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                        title="Open full readable view"
                        aria-label={`Preview ${displayName(letter)} full screen`}
                      >
                        <i className="ri-expand-diagonal-line"></i>
                        Preview
                      </button>
                      <Link
                        to={`/dashboard/documents/cover-letters/${letter.id}/templates`}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                        title="Templates"
                        aria-label={`Templates for ${displayName(letter)}`}
                      >
                        <i className="ri-layout-line"></i>
                      </Link>
                      <DocumentMarqueeButton
                        kind="cover-letter"
                        compact
                        docId={letter.id}
                        title={displayName(letter)}
                        versions={letter.versions ?? []}
                        activeVersion={letter.active_version}
                        onChanged={() => void load()}
                      />
                      <button
                        onClick={() => setPreview({ id: letter.id, title: displayName(letter) })}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                        title="Quick preview"
                        aria-label={`Preview ${displayName(letter)}`}
                      >
                        <i className="ri-eye-line"></i>
                      </button>
                      {letter.file_url && (
                        <button
                          onClick={() => handleDownload(letter)}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                          title="Download"
                          aria-label={`Download ${displayName(letter)}`}
                        >
                          <i className="ri-download-2-line"></i>
                        </button>
                      )}
                      {!isUploaded && (
                        <button
                          onClick={() =>
                            editingId === letter.id ? setEditingId(null) : startEdit(letter)
                          }
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                        >
                          <i className={editingId === letter.id ? "ri-close-line" : "ri-edit-line"}></i>
                          {editingId === letter.id ? "Close" : "Edit"}
                        </button>
                      )}
                      {confirmDelete === letter.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDelete(letter.id)}
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
                          onClick={() => setConfirmDelete(letter.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
                          title="Delete"
                          aria-label={`Delete ${displayName(letter)}`}
                        >
                          <i className="ri-delete-bin-line"></i>
                        </button>
                      )}
                      {isArchived && (
                        <button
                          onClick={() => handleToggleArchive(letter)}
                          disabled={busyId === letter.id}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-100 px-3 py-1.5 rounded-md hover:bg-primary-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                          title="Restore from archive"
                          aria-label={`Restore ${displayName(letter)}`}
                        >
                          {busyId === letter.id ? (
                            <i className="ri-loader-4-line animate-spin"></i>
                          ) : (
                            <i className="ri-inbox-unarchive-line"></i>
                          )}
                          Restore
                        </button>
                      )}
                      <DocumentRowMenu
                        flagged={letter.flagged}
                        archived={letter.archived}
                        busy={busyId === letter.id}
                        onToggleFlag={() => handleToggleFlag(letter)}
                        onToggleArchive={() => handleToggleArchive(letter)}
                      />
                    </div>
                  </div>

                  {editingId === letter.id && (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        maxLength={500}
                        rows={10}
                        className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(letter)}
                          disabled={saving}
                          className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                        >
                          {saving ? (
                            <i className="ri-loader-4-line animate-spin"></i>
                          ) : (
                            <i className="ri-save-line"></i>
                          )}
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sm font-medium text-foreground-600 hover:text-foreground-900 cursor-pointer whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </div>

      {confirmArchiveAll && (
        <ConfirmDialog
          title="Archive all flagged cover letters?"
          message={`This archives every cover letter marked “needs attention” so it moves into your Archived view. You can restore any of them later.`}
          confirmLabel="Archive all"
          onConfirm={handleArchiveAllFlagged}
          onCancel={() => setConfirmArchiveAll(false)}
        />
      )}

      {showGenerate && (
        <Modal title="Generate cover letter" onClose={() => setShowGenerate(false)}>
          <form onSubmit={handleGenerate} className="space-y-4">
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Job posting</span>
              <select value={genJob} onChange={(e) => setGenJob(e.target.value)} className={selectCls}>
                {jobMatches.map((j) => (
                  <option key={j.id} value={String(j.id)}>
                    {j.title} · {j.company}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">
                Résumé <span className="text-foreground-400 font-normal">(optional)</span>
              </span>
              <select value={genResume} onChange={(e) => setGenResume(e.target.value)} className={selectCls}>
                <option value="">Use my profile only</option>
                {resumes.map((r) => (
                  <option key={r.id} value={String(r.id)}>
                    {r.title || r.filename || `Résumé ${r.id}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-foreground-600 mb-1.5">Tone</span>
              <select value={genTone} onChange={(e) => setGenTone(e.target.value)} className={selectCls}>
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={generating || !genJob}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {generating ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Generating…
                </>
              ) : (
                <>
                  <i className="ri-sparkling-line"></i>
                  Generate letter
                </>
              )}
            </button>
          </form>
        </Modal>
      )}

      {readable && (
        <ReadableDocumentModal
          kind="cover-letter"
          docId={readable.id}
          title={readable.title}
          onClose={() => setReadable(null)}
        />
      )}
    </section>
  );
}