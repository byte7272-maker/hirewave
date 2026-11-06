import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, isAuthError } from "@/lib/api";
import {
  getCoverLetterVersion,
  getResumeVersion,
  versionContentText,
  versionEmbeddedText,
  type DocumentVersion,
  type VersionContent,
} from "@/lib/documents";
import { buildPreviewDiff, type PreviewChange, type PreviewSegment } from "@/lib/diffHighlight";
import {
  SOURCE_META,
  formatDate,
  isCustomLabel,
  sourceKind,
  versionTitle,
  type VersionKind,
} from "./versionMeta";
import { countChangedSections } from "./versionDiffCount";

interface VersionsCompareDialogProps {
  kind: VersionKind;
  docId: string | number;
  /** Every saved version, used to label each side and populate the pickers. */
  versions: DocumentVersion[];
  /** The version currently active — the default "after" side of the diff. */
  activeVersion: string | number | null | undefined;
  /** The version whose card opened this dialog — the default "before" side. */
  baseVersion: string | number;
  /** True while another version action (activate / restore) is in flight. */
  busy: boolean;
  onClose: () => void;
  onActivate: (version: string | number) => void;
  onRestoreAsCopy: (version: string | number) => void;
}

function fetchVersion(
  kind: VersionKind,
  docId: string | number,
  version: DocumentVersion
): Promise<VersionContent> {
  // Prefer text the version record already carries — no extra request.
  const embedded = versionEmbeddedText(version);
  if (embedded) return Promise.resolve({ version: version.version, content: embedded });
  const fetcher = kind === "cover-letter" ? getCoverLetterVersion : getResumeVersion;
  return fetcher(docId, version.version);
}

/** Oldest → newest, numeric version order when it is available. */
function orderVersions(versions: DocumentVersion[]): DocumentVersion[] {
  return [...versions].sort((a, b) => {
    const na = Number(a.version);
    const nb = Number(b.version);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return 0;
  });
}

/** Render one side of the diff: equal text plain, changes highlighted. */
function DiffPane({
  segments,
  changes,
  side,
}: {
  segments: PreviewSegment[];
  changes: PreviewChange[];
  side: "before" | "after";
}) {
  return (
    <div className="whitespace-pre-wrap text-[13px] leading-[1.7] text-foreground-800">
      {segments.map((seg, i) => {
        if (seg.kind === "equal") return <span key={i}>{seg.text}</span>;
        const change = changes[seg.changeId];
        if (!change) return null;
        const raw = side === "before" ? change.originalText : change.previewText;
        if (!raw) return null;
        const highlighted =
          side === "before" ? change.removedWords > 0 : change.addedWords > 0;
        if (!highlighted) return <span key={i}>{raw}</span>;
        const cls =
          side === "before"
            ? "bg-accent-100 text-accent-900 rounded-sm px-0.5 line-through decoration-accent-400"
            : "bg-primary-100 text-primary-900 rounded-sm px-0.5";
        return (
          <mark key={i} className={cls}>
            {raw}
          </mark>
        );
      })}
    </div>
  );
}

/** The compact label / date / chip header for one side. */
function PaneHeader({
  version,
  fallbackVersion,
  current,
}: {
  version?: DocumentVersion;
  fallbackVersion: string | number;
  current?: boolean;
}) {
  const title = version ? versionTitle(version) : `Version ${fallbackVersion}`;
  const date = formatDate(version?.created_at);
  const meta = version ? SOURCE_META[sourceKind(version)] : null;
  return (
    <div className="flex items-start justify-between gap-2 flex-wrap">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground-950 truncate">{title}</span>
          {meta && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full whitespace-nowrap ${meta.cls}`}
            >
              <i className={meta.icon}></i>
              {meta.label}
            </span>
          )}
          {version && isCustomLabel(version) && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap"
              title={`Nickname: ${String(version.label ?? "").trim()}`}
            >
              <i className="ri-price-tag-3-line"></i>
              Nicknamed
            </span>
          )}
        </div>
        <span className="text-[11px] text-foreground-400">
          {`v${fallbackVersion}`}
          {date ? ` · ${date}` : ""}
        </span>
      </div>
      {current && (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          <i className="ri-check-line"></i>
          Current
        </span>
      )}
    </div>
  );
}

/** A compact dropdown that picks one side of the comparison. */
function VersionSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: DocumentVersion[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className="max-w-[240px] bg-background-50 border border-background-200 rounded-md text-xs font-medium text-foreground-900 px-2 py-1.5 pr-7 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 cursor-pointer"
    >
      {options.map((v) => (
        <option key={String(v.version)} value={String(v.version)}>
          {versionTitle(v)} · v{v.version}
        </option>
      ))}
    </select>
  );
}

/**
 * A read-only comparison of TWO saved versions — any pair, picked from the
 * dropdowns, defaulting to the version you opened against the current one. Text
 * is word-diffed locally: removals are struck through on the left, additions are
 * highlighted on the right. Both sides come straight from the API, and the two
 * panes scroll in lockstep so a long document stays line-aligned. The footer
 * actions (make current / restore as a copy) apply to the LEFT selection.
 */
export default function VersionsCompareDialog({
  kind,
  docId,
  versions,
  activeVersion,
  baseVersion,
  busy,
  onClose,
  onActivate,
  onRestoreAsCopy,
}: VersionsCompareDialogProps) {
  const activeSide =
    activeVersion !== null && activeVersion !== undefined && String(activeVersion) !== ""
      ? String(activeVersion)
      : "";
  const ordered = useMemo(() => orderVersions(versions), [versions]);

  const [leftVersion, setLeftVersion] = useState<string>(String(baseVersion));
  const [rightVersion, setRightVersion] = useState<string>(activeSide || String(baseVersion));

  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const beforeRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const leftMeta = versions.find((v) => String(v.version) === leftVersion);
  const rightMeta = versions.find((v) => String(v.version) === rightVersion);
  const leftIsCurrent = activeSide !== "" && leftVersion === activeSide;
  const rightIsCurrent = activeSide !== "" && rightVersion === activeSide;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [b, a] = await Promise.all([
        fetchVersion(kind, docId, leftMeta ?? { version: leftVersion, label: "" }),
        rightVersion === ""
          ? Promise.resolve<VersionContent>({ version: "", content: "" })
          : fetchVersion(kind, docId, rightMeta ?? { version: rightVersion, label: "" }),
      ]);
      setBefore(versionContentText(b));
      setAfter(versionContentText(a));
    } catch (err) {
      // A dead session is already being torn down + redirected by the guard.
      if (isAuthError(err)) {
        setError("Your session ended — please sign in again to compare versions.");
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not load these versions to compare. Please try again."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, docId, leftVersion, rightVersion]);

  // Keep the two panes' scroll positions locked together (proportional, so the
  // alignment survives panes of slightly different rendered height).
  function syncScroll(from: HTMLDivElement | null, to: HTMLDivElement | null) {
    if (!from || !to || syncingRef.current) return;
    syncingRef.current = true;
    const fromRange = Math.max(1, from.scrollHeight - from.clientHeight);
    const toRange = Math.max(1, to.scrollHeight - to.clientHeight);
    to.scrollTop = (from.scrollTop / fromRange) * toRange;
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  const diff = useMemo(() => buildPreviewDiff(before, after), [before, after]);
  const sectionDiff = useMemo(
    () => countChangedSections(before, after),
    [before, after]
  );
  const noText = !loading && !error && !before.trim() && !after.trim();
  const identical = !loading && !error && before === after && !noText;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-background-50 border border-background-200 rounded-2xl overflow-hidden animate-fade-in-up">
          <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-900 flex-shrink-0">
                <i className="ri-arrow-left-right-line"></i>
              </span>
              <div className="min-w-0">
                <h3 className="font-heading text-lg font-medium text-foreground-950">
                  Compare versions
                </h3>
                <p className="text-xs text-foreground-500">
                  {loading
                    ? "Loading both versions…"
                    : error
                      ? "—"
                      : `${versionTitle(leftMeta ?? { version: leftVersion, label: "" })} vs. ${versionTitle(
                          rightMeta ?? { version: rightVersion, label: "" }
                        )}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer flex-shrink-0"
              aria-label="Close compare"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-background-200 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-foreground-500 whitespace-nowrap">
              Compare
            </span>
            <VersionSelect
              value={leftVersion}
              options={ordered}
              onChange={setLeftVersion}
              ariaLabel="First version to compare"
            />
            <span className="text-xs text-foreground-400 whitespace-nowrap">against</span>
            <VersionSelect
              value={rightVersion}
              options={ordered}
              onChange={setRightVersion}
              ariaLabel="Second version to compare"
            />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 h-[280px] text-sm text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Loading both versions…
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center gap-3 h-[280px] text-center">
                <i className="ri-error-warning-line text-2xl text-foreground-400"></i>
                <p className="text-sm text-foreground-600 max-w-sm">{error}</p>
                <button
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-refresh-line"></i>
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {identical && (
                  <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
                    <i className="ri-information-line text-base mt-0.5"></i>
                    <span>These two versions have identical text — nothing to change.</span>
                  </div>
                )}

                {!identical && !noText && sectionDiff.changed > 0 && (
                  <div className="rounded-xl border border-accent-200 bg-accent-50/60 px-4 py-3">
                    <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-900 whitespace-nowrap">
                        <i className="ri-arrow-left-right-line"></i>
                        {sectionDiff.changed}{" "}
                        {sectionDiff.changed === 1 ? "section" : "sections"} changed
                      </span>
                      <span className="text-[11px] text-foreground-500">
                        of {sectionDiff.total} · lines up with the highlighted text below
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sectionDiff.changedSections.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center text-[11px] font-medium text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <section className="rounded-xl border border-background-200 bg-background-100/40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-background-200 bg-background-50">
                      <PaneHeader
                        version={leftMeta}
                        fallbackVersion={leftVersion}
                        current={leftIsCurrent}
                      />
                    </div>
                    <div
                      ref={beforeRef}
                      onScroll={() => syncScroll(beforeRef.current, afterRef.current)}
                      className="p-4 max-h-[52vh] overflow-y-auto"
                    >
                      {noText ? (
                        <p className="text-xs text-foreground-400">
                          No text was captured for this version.
                        </p>
                      ) : (
                        <DiffPane
                          segments={diff.segments}
                          changes={diff.changes}
                          side="before"
                        />
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-primary-200 bg-primary-50/40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-primary-200 bg-background-50">
                      <PaneHeader
                        version={rightMeta}
                        fallbackVersion={rightVersion || "—"}
                        current={rightIsCurrent}
                      />
                    </div>
                    <div
                      ref={afterRef}
                      onScroll={() => syncScroll(afterRef.current, beforeRef.current)}
                      className="p-4 max-h-[52vh] overflow-y-auto"
                    >
                      {noText ? (
                        <p className="text-xs text-foreground-400">
                          No text was captured for this version.
                        </p>
                      ) : (
                        <DiffPane
                          segments={diff.segments}
                          changes={diff.changes}
                          side="after"
                        />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-background-200 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-xs text-foreground-500 whitespace-nowrap">
              {loading || error ? (
                "—"
              ) : (
                <>
                  <span className="text-primary-700 font-semibold">+{diff.addedWords}</span> added ·{" "}
                  <span className="text-accent-700 font-semibold">−{diff.removedWords}</span> removed
                </>
              )}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
              >
                Close
              </button>
              <button
                type="button"
                disabled={busy || loading || Boolean(error) || leftIsCurrent}
                onClick={() => onRestoreAsCopy(leftVersion)}
                title="Branch this version into a brand-new version"
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-git-branch-line"></i>
                Restore as a copy
              </button>
              <button
                type="button"
                disabled={busy || loading || Boolean(error) || leftIsCurrent}
                onClick={() => onActivate(leftVersion)}
                title={leftIsCurrent ? "This version is already current" : "Make this version current"}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="ri-check-line"></i>
                Make current
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}