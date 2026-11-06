import { useEffect, useRef, useState } from "react";
import type { DocumentVersion } from "@/lib/documents";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import ReadAloudControl from "@/components/feature/ReadAloudControl";
import NarrationText from "@/components/feature/NarrationText";
import { ALL_ROLES, readVersionRoleFilter, writeVersionRoleFilter } from "@/lib/versionRoleFilter";
import type { RephraseDiffEntry } from "@/lib/rephraseDiffs";
import { Card, SectionHeader } from "@/components/base";

/** Trim a diff span to a compact one-line preview. */
function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max).trimEnd()}\u2026` : t;
}

interface VersionSwitcherProps {
  versions: DocumentVersion[];
  activeVersion: string | number | null | undefined;
  activating: string | number | null;
  onActivate: (version: string | number) => void;
  changeNote?: string | null;
  onDismissChangeNote?: () => void;
  error?: string;
  /** Per-version coverage (keyed by version) so each version can show its own badge. */
  coverageByVersion?: Record<
    string,
    { covered: number; total: number; note?: string | null; jobLabel?: string | null }
  >;
  /**
   * Per-version AI-figure tally (keyed by version). When a version carries AI
   * figures, shows how many still need verifying so unchecked versions stand out.
   */
  metricByVersion?: Record<string, { total: number; verified: number }>;
  /**
   * When provided, a "Reset all verifications" action appears (once any version
   * carries AI figures) that clears every version's figure tally for the document.
   */
  onResetMetrics?: () => void;
  /**
   * When provided, a per-version "Reset this version" action appears for the
   * active version once it carries AI figures, clearing just that version's tally.
   */
  onResetMetricsForVersion?: (version: string | number) => void;
  /**
   * Per-document key used to remember the role filter, so the narrowed view
   * survives a reload. Omit to keep the filter local to the session.
   */
  roleFilterKey?: string;
  /**
   * Per-version accepted inline-rephrase diffs, keyed by version. Shown as a
   * compact before → after list for the active version so a rewrite stays
   * traceable right where its version lives.
   */
  rephraseByVersion?: Record<string, RephraseDiffEntry[]>;
  /**
   * Per-version count of bullets changed by a bulk strengthen pass, keyed by
   * version. When a version carries one, its "N bullets strengthened" tally is
   * shown so whole-document AI runs are traceable.
   */
  bulletStrengthenByVersion?: Record<string, number>;
  /**
   * Per-version instruction that was applied DIRECTLY (skipping the review
   * preview), keyed by version. Shown as an "Applied: …" tag so directly-applied
   * versions stand out from the selectively-accepted ones.
   */
  appliedInstructionByVersion?: Record<string, string>;
  /**
   * When the last AI review completed (ISO). Any version saved after this is
   * flagged "· needs review" in the list so stale versions stand out at a glance.
   */
  lastReviewedAt?: string | null;
}

const selectCls =
  "w-full h-10 px-3 rounded-lg border text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300";

/** Render one accepted rephrase as a copyable before/after block. */
function diffToText(diff: RephraseDiffEntry): string {
  const lines = [`Before: ${diff.before}`, `After: ${diff.after}`];
  if (diff.instruction) lines.push(`Instruction: ${diff.instruction}`);
  else if (diff.mode) lines.push(`Mode: ${diff.mode}`);
  return lines.join("\n");
}

export default function VersionSwitcher({
  versions,
  activeVersion,
  activating,
  onActivate,
  changeNote,
  onDismissChangeNote,
  error,
  coverageByVersion,
  metricByVersion,
  onResetMetrics,
  onResetMetricsForVersion,
  roleFilterKey,
  rephraseByVersion,
  bulletStrengthenByVersion,
  appliedInstructionByVersion,
  lastReviewedAt,
}: VersionSwitcherProps) {
  const [flash, setFlash] = useState(false);
  const [resetMode, setResetMode] = useState<"all" | "active" | null>(null);
  /** Which copy target just copied (row key or "all"), so it can flash feedback. */
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>(() =>
    roleFilterKey ? readVersionRoleFilter(roleFilterKey) : ALL_ROLES
  );

  // Re-read the remembered filter when the document changes (e.g. switching
  // between a résumé and a cover letter without a full reload).
  useEffect(() => {
    setRoleFilter(roleFilterKey ? readVersionRoleFilter(roleFilterKey) : ALL_ROLES);
  }, [roleFilterKey]);

  /** Change the role filter and remember it for this document. */
  function selectRoleFilter(value: string) {
    setRoleFilter(value);
    if (roleFilterKey) writeVersionRoleFilter(roleFilterKey, value);
  }

  /** Copy a before/after block (or every one) to the clipboard with brief feedback. */
  async function copyDiffText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1600);
  }
  const prevActiveRef = useRef<string | number | null | undefined>(undefined);
  const activeCoverage =
    coverageByVersion?.[String(activeVersion ?? "")] ?? null;
  const activeMetric =
    metricByVersion?.[String(activeVersion ?? "")] ?? null;
  const activeVersionObj = versions.find(
    (v) => String(v.version) === String(activeVersion ?? "")
  );
  // Accepted inline-rephrase edits recorded against the active version.
  const activeRephrases = rephraseByVersion?.[String(activeVersion ?? "")] ?? [];
  // Which role this version was tailored to — its own recorded job, else the
  // label carried on the version's coverage memory.
  const activeRole = activeVersionObj?.job_title || activeCoverage?.jobLabel || "";
  const activeMetricUnchecked = activeMetric
    ? Math.max(0, activeMetric.total - activeMetric.verified)
    : 0;
  const hasAnyMetric = Boolean(
    metricByVersion && Object.keys(metricByVersion).length > 0
  );
  // Bullets a bulk strengthen pass changed on the active version (0 when none).
  const activeBulletsStrengthened =
    bulletStrengthenByVersion?.[String(activeVersion ?? "")] ?? 0;
  // The instruction that was applied directly to produce the active version.
  const activeAppliedInstruction =
    appliedInstructionByVersion?.[String(activeVersion ?? "")] ?? "";
  // Versions saved after the last completed AI review, so their labels can flag
  // them as \"needs review\" and the stale ones stand out at a glance.
  const reviewedMs = lastReviewedAt ? Date.parse(lastReviewedAt) : NaN;
  const versionNeedsReview = (v: DocumentVersion) => {
    if (!Number.isFinite(reviewedMs)) return false;
    const created = v.created_at ? Date.parse(v.created_at) : NaN;
    return Number.isFinite(created) && created > reviewedMs;
  };
  const staleVersionCount = versions.filter(versionNeedsReview).length;

  // Role each version was aimed at (its own recorded job, else the label on its
  // coverage memory). Powers both the per-option suffix and the filter chips.
  const versionRole = (v: DocumentVersion) =>
    (v.job_title || coverageByVersion?.[String(v.version)]?.jobLabel || "").trim();
  const roleCounts: Record<string, number> = {};
  for (const r of versions.map(versionRole)) {
    if (r) roleCounts[r] = (roleCounts[r] ?? 0) + 1;
  }
  const roleOptions = Object.keys(roleCounts);
  const showRoleFilter = roleOptions.length > 1;
  const filterActive = roleFilter !== "__all__" && roleOptions.includes(roleFilter);
  const baseVersions = filterActive
    ? versions.filter((v) => versionRole(v) === roleFilter)
    : versions;
  const activeIncluded =
    activeVersion != null &&
    baseVersions.some((v) => String(v.version) === String(activeVersion));
  // Keep the active version visible even when it sits outside the filtered role,
  // so the select's value always matches an option.
  const visibleVersions =
    filterActive && !activeIncluded
      ? [
          ...baseVersions,
          ...versions.filter((v) => String(v.version) === String(activeVersion)),
        ]
      : baseVersions;

  useEffect(() => {
    const key = activeVersion != null ? String(activeVersion) : null;
    const prev = prevActiveRef.current != null ? String(prevActiveRef.current) : null;
    prevActiveRef.current = activeVersion;
    if (prev !== null && key !== null && prev !== key) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 1600);
      return () => clearTimeout(timer);
    }
  }, [activeVersion]);

  useEffect(() => {
    if (!changeNote || !onDismissChangeNote) return;
    const timer = setTimeout(() => onDismissChangeNote(), 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeNote]);

  if (versions.length === 0 && !changeNote && !error) return null;

  return (
    <Card surface="tinted" className="overflow-hidden">
      <SectionHeader
        icon="ri-git-branch-line"
        tone="primary"
        title="Versions"
        subtitle="Switch between saved revisions of this document."
        action={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {activeMetric && onResetMetricsForVersion && (
              <button
                type="button"
                onClick={() => setResetMode("active")}
                title="Clear just this version's figure tally"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 hover:text-foreground-900 bg-background-50 border border-background-200 hover:border-background-300 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-eraser-line"></i>
                Reset this version
              </button>
            )}
            {hasAnyMetric && onResetMetrics && (
              <button
                type="button"
                onClick={() => setResetMode("all")}
                title="Clear every version's figure tally for this document"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 hover:text-foreground-900 bg-background-50 border border-background-200 hover:border-background-300 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-restart-line"></i>
                Reset all verifications
              </button>
            )}
          </div>
        }
      />

      <div className="p-5 space-y-3">
        {changeNote && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                <i className="ri-sparkling-2-line"></i>
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-accent-900 uppercase tracking-wide">
                  What changed
                </span>
                <p className="mt-1 text-sm text-foreground-800 leading-relaxed">
                  <NarrationText
                    id={`version-change-${roleFilterKey ?? "doc"}`}
                    text={changeNote}
                  />
                </p>
                <div className="mt-2">
                  <ReadAloudControl
                    id={`version-change-${roleFilterKey ?? "doc"}`}
                    text={changeNote}
                    label="change summary"
                  />
                </div>
              </div>
              {onDismissChangeNote && (
                <button
                  onClick={onDismissChangeNote}
                  className="w-6 h-6 flex items-center justify-center text-foreground-400 hover:text-foreground-700 cursor-pointer flex-shrink-0"
                  aria-label="Dismiss"
                >
                  <i className="ri-close-line"></i>
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
                <i className="ri-error-warning-line"></i>
              </span>
              <p className="min-w-0 flex-1 text-sm text-foreground-800 leading-relaxed">
                {error}
              </p>
            </div>
          </div>
        )}

        {versions.length > 0 && (
          <>
            {showRoleFilter && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
                  <i className="ri-filter-3-line"></i>
                  Filter by role
                </span>
                <button
                  type="button"
                  onClick={() => selectRoleFilter(ALL_ROLES)}
                  className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                    filterActive
                      ? "bg-background-50 text-foreground-700 border-background-200 hover:border-background-300"
                      : "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                  }`}
                >
                  All roles
                  <span className="opacity-70">· {versions.length}</span>
                </button>
                {roleOptions.map((role) => {
                  const selected = filterActive && roleFilter === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => selectRoleFilter(role)}
                      title={role}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full border transition-colors cursor-pointer whitespace-nowrap ${
                        selected
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                          : "bg-background-50 text-foreground-700 border-background-200 hover:border-background-300 hover:text-foreground-900"
                      }`}
                    >
                      <span className="max-w-[180px] truncate">{role}</span>
                      <span className="opacity-70">· {roleCounts[role]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <label className="block">
              <span className="flex items-center justify-between gap-2 text-xs font-medium text-foreground-600 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
                  Current version
                </span>
                <span className="flex items-center gap-1.5 flex-wrap justify-end">
                  {activeMetric && activeMetric.total > 0 && (
                    activeMetricUnchecked > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                        title={`${activeMetricUnchecked} of ${activeMetric.total} AI-added figures still need verifying`}
                      >
                        <i className="ri-alert-line"></i>
                        {activeMetricUnchecked} unchecked
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                        title={`All ${activeMetric.total} AI-added figures verified`}
                      >
                        <i className="ri-checkbox-circle-line"></i>
                        All {activeMetric.total} verified
                      </span>
                    )
                  )}
                  {activeCoverage && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                      <i className="ri-focus-2-line"></i>
                      {activeCoverage.covered} of {activeCoverage.total} covered
                    </span>
                  )}
                  {activeBulletsStrengthened > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
                      title="This version was produced by a bulk AI strengthen pass"
                    >
                      <i className="ri-rocket-2-line"></i>
                      {activeBulletsStrengthened} bullet
                      {activeBulletsStrengthened === 1 ? "" : "s"} strengthened
                    </span>
                  )}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 flex items-center justify-center rounded-md bg-accent-100 text-accent-700 flex-shrink-0">
                  <i className="ri-check-line text-sm"></i>
                </span>
                <select
                  value={String(activeVersion ?? "")}
                  onChange={(e) => {
                    if (onDismissChangeNote) onDismissChangeNote();
                    onActivate(e.target.value);
                  }}
                  disabled={activating !== null}
                  className={`${selectCls} transition-all duration-300 hover:ring-2 hover:ring-accent-300 hover:border-accent-300 ${
                    flash
                      ? "ring-2 ring-primary-400 border-primary-300 bg-background-50"
                      : "bg-accent-50/60 border-accent-200"
                  }`}
                >
                  {visibleVersions.map((v) => {
                    const cov = coverageByVersion?.[String(v.version)];
                    const met = metricByVersion?.[String(v.version)];
                    const roleLabel = v.job_title || cov?.jobLabel || "";
                    const roleSuffix = roleLabel ? ` \u00b7 ${roleLabel}` : "";
                    const reviewSuffix = versionNeedsReview(v)
                      ? " \u00b7 needs review"
                      : "";
                    const appliedSuffix = appliedInstructionByVersion?.[String(v.version)]
                      ? ` \u00b7 Applied: ${truncate(
                          appliedInstructionByVersion[String(v.version)],
                          40
                        )}`
                      : "";
                    const metricSuffix =
                      met && met.total > 0
                        ? met.verified >= met.total
                          ? " \u00b7 figures verified"
                          : ` \u00b7 ${met.total - met.verified} unchecked`
                        : "";
                    const noteSuffix = cov?.note
                      ? ` \u2014 ${cov.note.length > 52 ? `${cov.note.slice(0, 52)}\u2026` : cov.note}`
                      : "";
                    const bulletSuffix =
                      (bulletStrengthenByVersion?.[String(v.version)] ?? 0) > 0
                        ? ` \u00b7 ${bulletStrengthenByVersion?.[String(v.version)]} strengthened`
                        : "";
                    return (
                      <option key={String(v.version)} value={String(v.version)}>
                        {v.label}
                        {appliedSuffix}
                        {reviewSuffix}
                        {roleSuffix}
                        {cov ? ` \u00b7 ${cov.covered}/${cov.total} covered` : ""}
                        {metricSuffix}
                        {bulletSuffix}
                        {noteSuffix}
                      </option>
                    );
                  })}
                </select>
              </div>
              {staleVersionCount > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-600">
                  <i className="ri-refresh-line text-accent-600 mt-0.5"></i>
                  <span>
                    {staleVersionCount === 1
                      ? "1 version was"
                      : `${staleVersionCount} versions were`}{" "}
                    saved after the last AI review — marked{" "}
                    <span className="font-medium text-foreground-800">· needs review</span>.
                  </span>
                </p>
              )}
              {activeRole && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-600">
                  <i className="ri-focus-2-line text-secondary-600 mt-0.5"></i>
                  <span>
                    Tailored to <span className="font-medium text-foreground-800">{activeRole}</span>
                  </span>
                </p>
              )}
              {activeAppliedInstruction && (
                <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2">
                  <i className="ri-flashlight-line text-primary-600 mt-0.5"></i>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary-900">
                      Applied instruction
                    </span>
                    <span className="mt-0.5 block text-xs text-foreground-700 break-words">
                      {activeAppliedInstruction}
                    </span>
                  </div>
                </div>
              )}
              {activeCoverage?.note && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-foreground-600">
                  <i className="ri-sticky-note-line text-accent-600 mt-0.5"></i>
                  <span>{activeCoverage.note}</span>
                </p>
              )}
              {activeVersionObj?.change_summary && (
                <div className="mt-2 flex items-start justify-between gap-2 flex-wrap">
                  <p className="flex items-start gap-1.5 text-xs text-foreground-600 min-w-0">
                    <i className="ri-git-commit-line text-primary-600 mt-0.5"></i>
                    <NarrationText
                      className="min-w-0"
                      id={`version-active-summary-${roleFilterKey ?? "doc"}`}
                      text={activeVersionObj.change_summary}
                    />
                  </p>
                  <ReadAloudControl
                    id={`version-active-summary-${roleFilterKey ?? "doc"}`}
                    text={activeVersionObj.change_summary}
                    label="version changes"
                    compact
                  />
                </div>
              )}
              {activeRephrases.length > 0 && (
                <div className="mt-2 rounded-lg border border-secondary-200 bg-secondary-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-secondary-900">
                      <i className="ri-magic-line"></i>
                      Rephrase changes
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-foreground-500">
                        {activeRephrases.length}{" "}
                        {activeRephrases.length === 1 ? "edit" : "edits"}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          copyDiffText(
                            "all",
                            activeRephrases.map(diffToText).join("\n\n")
                          )
                        }
                        title="Copy every before/after in this version"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-secondary-900 bg-background-50 border border-secondary-200 hover:border-secondary-300 px-2 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i
                          className={
                            copiedKey === "all" ? "ri-check-line" : "ri-file-copy-line"
                          }
                        ></i>
                        {copiedKey === "all" ? "Copied" : "Copy all"}
                      </button>
                    </div>
                  </div>
                  <ul className="mt-1.5 space-y-1.5">
                    {activeRephrases
                      .slice(-3)
                      .reverse()
                      .map((diff, index) => {
                        const rowKey = `row-${index}`;
                        return (
                          <li
                            key={`${index}-${diff.after.slice(0, 12)}`}
                            className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground-700"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="text-foreground-400 line-through">
                                {truncate(diff.before, 64)}
                              </span>
                              <i className="ri-arrow-right-line mx-1 text-foreground-400"></i>
                              <span className="text-foreground-800">
                                {truncate(diff.after, 90)}
                              </span>
                              {diff.instruction && (
                                <span className="ml-1.5 inline-flex items-center text-[10px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded whitespace-nowrap align-middle">
                                  {diff.instruction}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyDiffText(rowKey, diffToText(diff))}
                              title="Copy this before/after"
                              aria-label="Copy this before/after"
                              className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-900 hover:bg-background-100 cursor-pointer flex-shrink-0"
                            >
                              <i
                                className={
                                  copiedKey === rowKey
                                    ? "ri-check-line text-primary-600"
                                    : "ri-file-copy-line"
                                }
                              ></i>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                  {activeRephrases.length > 3 && (
                    <p className="mt-1 text-[10px] text-foreground-400">
                      +{activeRephrases.length - 3} earlier
                    </p>
                  )}
                </div>
              )}
            </label>

            {activating !== null && (
              <div className="flex items-center gap-2 text-xs text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Activating version…
              </div>
            )}
          </>
        )}
      </div>

      {resetMode === "all" && onResetMetrics && (
        <ConfirmDialog
          title="Reset all verifications?"
          message="This clears the figure tally for every version of this document and forgets which AI-added figures you've already marked accurate. Saved content is untouched."
          confirmLabel="Reset all"
          onConfirm={() => {
            onResetMetrics();
            setResetMode(null);
          }}
          onCancel={() => setResetMode(null)}
        />
      )}
      {resetMode === "active" && onResetMetricsForVersion && (
        <ConfirmDialog
          title="Reset this version's verifications?"
          message="This clears the figure tally for this version only and forgets which AI-added figures you marked accurate here. Every other version is left untouched, and saved content is unchanged."
          confirmLabel="Reset version"
          onConfirm={() => {
            onResetMetricsForVersion(activeVersion ?? "");
            setResetMode(null);
          }}
          onCancel={() => setResetMode(null)}
        />
      )}
    </Card>
  );
}