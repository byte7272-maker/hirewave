import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PAPER_WIDTH } from "@/pages/dashboard/documents/templates/themes/paper";
import {
  NICKNAME_COUNTER_FROM,
  NICKNAME_MAX,
  type BusyAction,
  type VersionKind,
} from "./versionMeta";
import NicknameCharCounter from "./NicknameCharCounter";
import ReadablePreviewModal from "./ReadablePreviewModal";
import VersionMarkdownPreview from "@/pages/dashboard/documents/templates/VersionMarkdownPreview";
import VersionFullSizeReader from "./VersionFullSizeReader";
import { printVersionHtml } from "./printVersionHtml";
import type { VersionPreviewStyle } from "./useVersionPreview";
import type { VersionHtmlStatus } from "./useVersionPreviewHtml";

interface VersionFullPreviewProps {
  kind: VersionKind;
  /** The document id — used for this version's per-section styles. */
  docId?: string | number;
  /** The version's own number — the key for its per-section bold / italic styles. */
  version?: string | number | null;
  /** The version's display title (its label or "Version N"). */
  title: string;
  /** The version's FULL raw text (markdown), or null when it truly has no content. */
  markdown: string | null;
  /** True while a metadata-only version's text is still being fetched. */
  isLoading?: boolean;
  /**
   * The template/accent/font this version is remembered on. Kept for callers and
   * future use, but the full-size view deliberately renders the version as the
   * plain document page rather than through its design template.
   */
  style: VersionPreviewStyle;
  /**
   * The version's rendered HTML page (`preview.html`), when available — the
   * full-size read is the crisp, reflowable, selectable document page rather than
   * a rasterised image or a mounted document DOM.
   */
  previewHtml?: string | null;
  /** Load state of the HTML page, so loading / empty / error read honestly. */
  previewHtmlStatus?: VersionHtmlStatus;
  /** Source chip glyph + colours (Saved / Generated / Original…). */
  sourceLabel: string;
  sourceIcon: string;
  sourceCls: string;
  date: string;
  /** The version's own "what changed" note, shown in the header. */
  changeSummary?: string;
  isActive: boolean;
  /** True on the dashboard, where the primary action opens the version in the editor. */
  openMode: boolean;
  busy: boolean;
  busyAction: BusyAction | null;
  singleVersion: boolean;
  canCompare: boolean;
  /** Flip to the neighbouring version without closing the view. */
  hasPrev: boolean;
  hasNext: boolean;
  prevLabel?: string;
  nextLabel?: string;
  /** Where this version sits in the strip, e.g. "2 of 5". */
  position: string;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** The primary action: open in the editor (openMode) or make current in place. */
  onSelect: () => void;
  /**
   * Optional "Open in full editor" action — opens this version in the full
   * document editor. Shown when the host provides it (e.g. the My Work
   * Highlights marquee).
   */
  onOpenInEditor?: () => void;
  /** The version's current nickname (its raw label), pre-filled when editing. */
  label?: string;
  /** Save a new nickname inline; resolves true on success so the editor closes. */
  onRenameSubmit: (label: string) => Promise<boolean>;
  onCompare: () => void;
  onRestore: () => void;
  onDelete: () => void;
  /**
   * Reset this version to the document's own design — dropping the version's own
   * design so it inherits the résumé / cover letter again. Shown only when the
   * version actually carries its own design (`canResetDesign`).
   */
  onResetDesign?: () => void;
  /** True when this version has its own design that can be reset. */
  canResetDesign?: boolean;
}

const actionBtn =
  "w-9 h-9 flex items-center justify-center rounded-md border border-background-200 text-foreground-500 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const navBtn =
  "w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors";

/**
 * Full-screen, fully readable view of ONE saved version — opened by
 * double-clicking a version card. The version is rendered as the PLAIN document
 * page (the same ink-on-paper reading the editor's readable view gives a
 * document, NOT the design template) at the natural A4 paper width and
 * auto-fitted to the frame, so the wording is genuinely readable.
 *
 * It reuses the shared readable-view modal (Esc / backdrop / ✕ close, focus
 * trap, download-as-PDF) and adds a footer action bar so the same view is also
 * where you SELECT the version — open it in the editor or make it current —
 * alongside rename, compare, restore and delete.
 *
 * The header carries the version's DATE and its change summary so you always
 * know what you're reading, and ← / → flip to the previous / next version in
 * place — no need to close and reopen.
 */
export default function VersionFullPreview({
  docId,
  version,
  title,
  markdown,
  isLoading = false,
  style,
  previewHtml,
  previewHtmlStatus,
  sourceLabel,
  sourceIcon,
  sourceCls,
  date,
  changeSummary,
  isActive,
  openMode,
  busy,
  busyAction,
  singleVersion,
  canCompare,
  hasPrev,
  hasNext,
  prevLabel,
  nextLabel,
  position,
  onPrev,
  onNext,
  onClose,
  onSelect,
  onOpenInEditor,
  label,
  onRenameSubmit,
  onCompare,
  onRestore,
  onDelete,
  onResetDesign,
  canResetDesign,
}: VersionFullPreviewProps) {
  // ← / → flip to the neighbouring version, without closing. Ignored while the
  // caret is in a field (there normally isn't one here, but stay safe).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const t = event.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowLeft" && hasPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, onPrev, onNext]);

  /** True once the version's page HTML has loaded, so a real PDF can be exported. */
  const htmlReady = Boolean(previewHtml && previewHtmlStatus === "ready");

  /**
   * Export exactly the version on screen. The readable surface is an iframe, so
   * the browser can't print its contents from the parent DOM — we print the
   * version's own `preview.html` instead (its real design, text and pagination).
   */
  function handleDownloadPdf() {
    if (previewHtml && previewHtmlStatus === "ready") {
      printVersionHtml(previewHtml, title);
    }
  }

  // The version reads as its own rendered HTML PAGE when one is available — a
  // single crisp iframe shown in the full-size reader, which carries the same
  // Fit page / Fit width / 100% toolbar as the main viewer. It falls back to the
  // client-rendered markdown only while the page is still loading, and to an
  // honest loading / empty state when there simply is nothing to show.
  const revision: ReactNode = htmlReady ? (
    <VersionFullSizeReader
      html={previewHtml ?? null}
      status={previewHtmlStatus ?? "ready"}
      title={title}
      docId={docId}
      version={version}
      trailing={
        <button
          type="button"
          onClick={handleDownloadPdf}
          title="Save this version as a PDF"
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-download-2-line"></i>
          Download PDF
        </button>
      }
    />
  ) : previewHtmlStatus === "loading" ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-background-50 text-foreground-400 py-24">
        <i className="ri-loader-4-line text-2xl animate-spin"></i>
        <span className="text-sm">Rendering this version…</span>
      </div>
    ) : markdown ? (
      <VersionMarkdownPreview
        markdown={markdown}
        themeId={style.themeId}
        accentId={style.accentId}
        fontId={style.fontId}
      />
    ) : previewHtmlStatus === "error" ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-background-50 text-foreground-400 py-24 text-center px-4">
        <i className="ri-error-warning-line text-2xl"></i>
        <span className="text-sm">Couldn&apos;t load this version.</span>
      </div>
    ) : isLoading ? (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-background-50 text-foreground-400 py-24">
        <i className="ri-loader-4-line text-2xl animate-spin"></i>
        <span className="text-sm">Loading this version…</span>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-background-200 bg-background-50 text-foreground-400 py-24">
        <i className="ri-file-forbid-line text-2xl"></i>
        <span className="text-sm">This version has no content yet</span>
      </div>
    );

  const renaming = busy && busyAction === "rename";
  const restoring = busy && busyAction === "restore";
  const deleting = busy && busyAction === "delete";
  const reseting = busy && busyAction === "reset";
  const canSelect = !isActive || openMode;

  /**
   * Inline nickname editing, right in the header of this full-size view. Enter /
   * blur saves, Esc cancels, an empty value clears the name, and the same inline
   * character counter warns as the draft nears the API's 80-char cap.
   */
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [editing]);

  function startEdit() {
    if (busy) return;
    setDraft(String(label ?? "").trim());
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function commitEdit() {
    if (!editing) return;
    const next = draft.trim().slice(0, NICKNAME_MAX);
    const current = String(label ?? "").trim();
    if (next === current) {
      setEditing(false);
      return;
    }
    const ok = await onRenameSubmit(next);
    if (ok) setEditing(false);
  }

  const titleNode = editing ? (
    <div className="w-[min(60vw,420px)] min-w-0">
      <input
        ref={inputRef}
        value={draft}
        maxLength={NICKNAME_MAX}
        disabled={busy}
        placeholder={title}
        aria-label="Nickname this version"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            void commitEdit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        }}
        onBlur={() => void commitEdit()}
        className="w-full font-heading text-base font-medium px-2 py-1 rounded-md bg-background-50 border border-primary-300 text-foreground-950 placeholder:text-foreground-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-primary-400"
      />
      {draft.length >= NICKNAME_COUNTER_FROM && (
        <div className="mt-1 flex justify-end">
          <NicknameCharCounter length={draft.length} />
        </div>
      )}
    </div>
  ) : undefined;

  const subtitle = `${sourceLabel}${isActive ? " · Current version" : ""}`;

  // Date + change summary live in the header, so the reader always has context
  // for the version on screen.
  const meta = (
    <div className="mt-1 flex items-center gap-3 flex-wrap">
      {date && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-500 whitespace-nowrap">
          <i className="ri-calendar-line"></i>
          {date}
        </span>
      )}
      {changeSummary ? (
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground-600 min-w-0">
          <i className="ri-sparkling-line flex-shrink-0"></i>
          <span className="truncate max-w-[640px]" title={changeSummary}>
            {changeSummary}
          </span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-foreground-400 whitespace-nowrap">
          <i className="ri-sparkling-line"></i>
          No change note for this version
        </span>
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2 flex-wrap w-full">
      {(hasPrev || hasNext) && (
        <div className="inline-flex items-center rounded-md border border-background-200 bg-background-50 overflow-hidden">
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            title={hasPrev && prevLabel ? `Previous: ${prevLabel}` : "Previous version"}
            aria-label={hasPrev && prevLabel ? `Previous version: ${prevLabel}` : "Previous version"}
            className={navBtn}
          >
            <i className="ri-arrow-left-s-line text-lg"></i>
          </button>
          <span
            className="px-2 text-[11px] font-semibold text-foreground-700 tabular-nums whitespace-nowrap"
            aria-live="polite"
          >
            {position}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            title={hasNext && nextLabel ? `Next: ${nextLabel}` : "Next version"}
            aria-label={hasNext && nextLabel ? `Next version: ${nextLabel}` : "Next version"}
            className={navBtn}
          >
            <i className="ri-arrow-right-s-line text-lg"></i>
          </button>
        </div>
      )}
      {canSelect && (
        <button
          type="button"
          disabled={busy}
          onClick={onSelect}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <i className={openMode ? "ri-external-link-line" : "ri-check-line"}></i>
          {openMode ? "Open this version" : "Select this version"}
        </button>
      )}
      {onOpenInEditor && (
        <button
          type="button"
          disabled={busy}
          onClick={onOpenInEditor}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-background-200 bg-background-50 text-foreground-800 px-4 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <i className="ri-edit-box-line"></i>
          Open in full editor
        </button>
      )}
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full whitespace-nowrap ${sourceCls}`}
      >
        <i className={sourceIcon}></i>
        {sourceLabel}
      </span>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          title="Rename this version"
          aria-label={`Rename ${title}`}
          disabled={busy}
          onClick={() => (editing ? cancelEdit() : startEdit())}
          className={actionBtn}
        >
          {renaming ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-pencil-line"></i>}
        </button>
        {canCompare && (
          <button
            type="button"
            title="Compare with another version"
            aria-label={`Compare ${title} with another version`}
            disabled={busy}
            onClick={onCompare}
            className={actionBtn}
          >
            <i className="ri-arrow-left-right-line"></i>
          </button>
        )}
        <button
          type="button"
          title="Restore as a copy — branch this version into a new one"
          aria-label={`Restore ${title} as a copy`}
          disabled={busy}
          onClick={onRestore}
          className={actionBtn}
        >
          {restoring ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-git-branch-line"></i>}
        </button>
        {!singleVersion && (
          <button
            type="button"
            title="Delete this version"
            aria-label="Delete this version"
            disabled={busy}
            onClick={onDelete}
            className={actionBtn}
          >
            {deleting ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-delete-bin-line"></i>}
          </button>
        )}
        {canResetDesign && onResetDesign && (
          <button
            type="button"
            title="Reset this version to the document's own design"
            aria-label={`Reset ${title} to the document's own design`}
            disabled={busy}
            onClick={onResetDesign}
            className={actionBtn}
          >
            {reseting ? (
              <i className="ri-loader-4-line animate-spin"></i>
            ) : (
              <i className="ri-restart-line"></i>
            )}
          </button>
        )}
      </div>
    </div>
  );

  const hint =
    hasPrev || hasNext
      ? "Esc to close · ← / → to flip versions · scroll inside this view to keep reading"
      : "Esc to close · scroll inside this view to keep reading";

  return createPortal(
    <ReadablePreviewModal
      title={title}
      titleNode={titleNode}
      subtitle={subtitle}
      meta={meta}
      onClose={onClose}
      revision={revision}
      revisionWidth={PAPER_WIDTH}
      fitRevision={!htmlReady}
      hideToolbar={htmlReady}
      actions={actions}
      hint={hint}
      onDownloadPdf={htmlReady ? handleDownloadPdf : undefined}
      downloadTitle="Save this version as a PDF"
    />,
    document.body
  );
}