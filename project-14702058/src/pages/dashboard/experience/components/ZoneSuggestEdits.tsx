import { useState } from "react";
import { ApiError } from "@/lib/api";
import {
  applyResumeEdits,
  createResumeVersion,
  getResume,
  type HighlightSuggestion,
  type Resume,
} from "@/lib/documents";
import {
  acceptedSuggestionPayload,
  HIGHLIGHT_ACTION_LABELS,
  type EditableSuggestion,
} from "@/lib/highlightsWorkspace";
import VersionMarkdownPreview from "@/pages/dashboard/documents/templates/VersionMarkdownPreview";
import {
  PAPER_WIDTH,
  PAPER_MIN_HEIGHT,
} from "@/pages/dashboard/documents/templates/themes/paper";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";

interface ZoneSuggestEditsProps {
  resumeId: string | number;
  jobPostingId?: string;
  suggestions: EditableSuggestion[];
  onSuggestionsChange: (next: EditableSuggestion[]) => void;
  /** The style the viewer painted with, so the preview matches the document. */
  style: { themeId: string; accentId: string; fontId: string };
  /** Called after an accepted save — carries the new résumé + the number applied. */
  onSaved: (updated: Resume, count: number) => void;
  /** One-tap "Copy prompts + Clear run" shortcut, shared with the page header. */
  onFinishAndReset?: () => void;
  /**
   * Jump to a suggestion's target section in the document viewer on the left —
   * spotlights that section so the user can see the text an edit applies to.
   */
  onJumpToSection?: (section: string) => void;
}

/** Tone + icon per edit action, so each review card reads at a glance. */
const ACTION_TONE: Record<EditableSuggestion["action"], string> = {
  add: "bg-primary-100 text-primary-900",
  reword: "bg-secondary-100 text-secondary-900",
  remove: "bg-accent-100 text-accent-900",
};

const ACTION_ICON: Record<EditableSuggestion["action"], string> = {
  add: "ri-add-line",
  reword: "ri-edit-2-line",
  remove: "ri-delete-bin-line",
};

/** The whole-résumé preview produced by apply-edits, held until the user saves. */
interface EditPreview {
  renderedText: string;
  applied: number;
  skipped: HighlightSuggestion[];
}

/**
 * Zone C — Review the proposed edits, then approve. Each suggestion is a card
 * carrying its action badge, target section, and rationale; reword / remove show
 * a before → after diff, add shows the new bullet. Every card is accepted by
 * default and can be rejected individually, and an `after` can be edited inline.
 *
 * "Preview changes" runs apply-edits and opens a preview of the WHOLE résumé,
 * where an explicit "Accept & Save" writes the new active version. Nothing is
 * saved before that click — the résumé view stays untouched until then.
 */
export default function ZoneSuggestEdits({
  resumeId,
  jobPostingId,
  suggestions,
  onSuggestionsChange,
  style,
  onSaved,
  onFinishAndReset,
  onJumpToSection,
}: ZoneSuggestEditsProps) {
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<EditPreview | null>(null);

  const acceptedCount = suggestions.filter((s) => s.accepted).length;

  function setAccepted(id: string, accepted: boolean) {
    onSuggestionsChange(
      suggestions.map((s) => (s.id === id ? { ...s, accepted } : s))
    );
  }

  function editAfter(id: string, after: string) {
    onSuggestionsChange(
      suggestions.map((s) => (s.id === id ? { ...s, after } : s))
    );
  }

  function removeCard(id: string) {
    onSuggestionsChange(suggestions.filter((s) => s.id !== id));
  }

  /**
   * Ask the backend to apply ONLY the accepted edits and hand back a preview of
   * the whole résumé. Nothing is saved — the preview modal owns the save.
   */
  async function runPreview() {
    if (previewing || acceptedCount === 0) return;
    setPreviewing(true);
    setError("");
    try {
      const result = await applyResumeEdits(
        resumeId,
        acceptedSuggestionPayload(suggestions)
      );
      setPreview({
        renderedText: result.rendered_text,
        applied: result.applied,
        skipped: result.skipped,
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not build the preview. Please try again."
      );
    } finally {
      setPreviewing(false);
    }
  }

  /** The explicit save: post the previewed text as a NEW active version. */
  async function acceptAndSave() {
    if (!preview || saving) return;
    setSaving(true);
    setError("");
    try {
      const updated = await createResumeVersion(resumeId, {
        content: preview.renderedText,
        instruction: "Applied from My Work Highlights",
      });
      // Re-fetch the doc so the viewer + version marquee read the backend's
      // authoritative state (its previews are no-store, so they reload on the
      // new active version). Fall back to the save response if the re-read fails.
      let fresh = updated;
      try {
        fresh = await getResume(resumeId);
      } catch {
        /* keep the save response — it already carries the new version */
      }
      onSaved(fresh, preview.applied);
      setPreview(null);
    } catch (err) {
      // Keep the preview (and the user's edits) so a Retry is a single click.
      setError(
        err instanceof ApiError ? err.message : "Could not save your changes."
      );
      setSaving(false);
    }
  }

  const skippedNote =
    preview && preview.skipped.length > 0 ? (
      <div className="rounded-md bg-accent-100 border border-accent-200 px-2.5 py-1.5 flex items-start gap-2">
        <i className="ri-alert-line text-accent-700 mt-0.5 flex-shrink-0"></i>
        <span className="text-[11px] text-accent-900 leading-relaxed">
          {preview.skipped.length} edit{preview.skipped.length === 1 ? "" : "s"} skipped
          — the text they targeted was no longer found in your résumé, so {preview.skipped.length === 1 ? "it was" : "they were"} left
          out.
          {preview.skipped.some((s) => s.before) && (
            <span className="block mt-1 text-accent-900/80">
              Looked for:{" "}
              {preview.skipped
                .map((s) => (s.before ?? "").trim())
                .filter(Boolean)
                .map((b) => `“${b.length > 60 ? `${b.slice(0, 60)}…` : b}”`)
                .join(", ")}
            </span>
          )}
        </span>
      </div>
    ) : null;

  return (
    <section
      id="my-work-highlights-review"
      className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden scroll-mt-32"
    >
      <div className="flex items-start gap-3 px-5 py-4 border-b border-background-200">
        <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-secondary-100 text-secondary-700 flex-shrink-0">
          <i className="ri-check-double-line text-lg"></i>
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
            Zone C
          </span>
          <h2 className="font-heading text-base font-medium text-foreground-950">
            Review your suggested edits
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Accept the edits you want, reject the rest, and tweak the wording inline. Nothing is
            saved until you preview and accept.
          </p>
        </div>
        {suggestions.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-secondary-900 bg-secondary-100 px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
            <i className="ri-check-double-line"></i>
            {acceptedCount} of {suggestions.length} accepted
          </span>
        )}
      </div>

      <div className="p-5 space-y-4">
        {suggestions.length === 0 ? (
          <div className="rounded-lg bg-background-50 border border-dashed border-background-200 py-10 text-center">
            <i className="ri-file-search-line text-2xl text-foreground-400"></i>
            <p className="mt-2 text-sm text-foreground-600">
              No edits yet — run Zone A, paste the answer in Zone B, then turn it into edits.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  onSuggestionsChange(suggestions.map((s) => ({ ...s, accepted: true })))
                }
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-950 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-check-double-line"></i>
                Accept all
              </button>
              <button
                type="button"
                onClick={() =>
                  onSuggestionsChange(suggestions.map((s) => ({ ...s, accepted: false })))
                }
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 hover:text-foreground-950 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-close-line"></i>
                Reject all
              </button>
            </div>

            <ul className="space-y-2.5">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-xl border px-3.5 py-3 transition-colors ${
                    s.accepted
                      ? "border-secondary-200 bg-secondary-50"
                      : "border-background-200 bg-background-100/60 opacity-80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${ACTION_TONE[s.action]}`}
                      >
                        <i className={ACTION_ICON[s.action]}></i>
                        {HIGHLIGHT_ACTION_LABELS[s.action]}
                      </span>
                      {s.section &&
                        (onJumpToSection ? (
                          <button
                            type="button"
                            onClick={() => onJumpToSection(s.section)}
                            title={`Spotlight the “${s.section}” section in the document on the left`}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-800 bg-primary-50 border border-primary-200 px-2 py-0.5 rounded-full whitespace-nowrap hover:bg-primary-100 transition-colors cursor-pointer"
                          >
                            <i className="ri-focus-3-line"></i>
                            Jump to {s.section}
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-600 bg-background-100 border border-background-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                            <i className="ri-price-tag-3-line"></i>
                            {s.section}
                          </span>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <div className="inline-flex items-center rounded-full border border-background-200 bg-background-50 p-1">
                        <button
                          type="button"
                          onClick={() => setAccepted(s.id, true)}
                          aria-pressed={s.accepted}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            s.accepted
                              ? "bg-secondary-500 text-background-50 dark:text-foreground-950"
                              : "text-foreground-500 hover:text-foreground-900"
                          }`}
                        >
                          <i className="ri-check-line"></i>
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => setAccepted(s.id, false)}
                          aria-pressed={!s.accepted}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                            !s.accepted
                              ? "bg-foreground-800 text-background-50"
                              : "text-foreground-500 hover:text-foreground-900"
                          }`}
                        >
                          <i className="ri-close-line"></i>
                          Reject
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCard(s.id)}
                        aria-label="Remove this suggested edit"
                        title="Remove this edit from the list"
                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-accent-700 hover:bg-background-100 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>

                  {/* The diff: before → after (add shows just the new bullet). */}
                  <div className="mt-2.5 space-y-1.5">
                    {s.action !== "add" && s.before && (
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded bg-accent-100 text-accent-700 flex-shrink-0 mt-0.5">
                          <i className="ri-subtract-line text-xs"></i>
                        </span>
                        <span
                          className={`min-w-0 text-sm leading-relaxed ${
                            s.action === "remove"
                              ? "line-through text-foreground-500"
                              : "text-foreground-600"
                          }`}
                        >
                          {s.before}
                        </span>
                      </div>
                    )}
                    {s.action !== "remove" ? (
                      <div className="flex items-start gap-2">
                        <span className="w-5 h-5 flex items-center justify-center rounded bg-primary-100 text-primary-700 flex-shrink-0 mt-0.5">
                          <i className="ri-add-line text-xs"></i>
                        </span>
                        <textarea
                          value={s.after}
                          onChange={(e) => editAfter(s.id, e.target.value)}
                          rows={2}
                          aria-label="Edit the new wording"
                          className="flex-1 min-w-0 px-2.5 py-2 rounded-md border border-background-200 bg-background-50 text-sm leading-relaxed text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
                        />
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-accent-700 pl-7">
                        <i className="ri-arrow-right-line"></i>
                        This line will be removed from your résumé.
                      </p>
                    )}
                  </div>

                  {s.rationale && (
                    <p className="mt-2 text-xs text-foreground-500 flex items-start gap-1.5">
                      <i className="ri-information-line mt-0.5 flex-shrink-0"></i>
                      <span className="min-w-0">{s.rationale}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {error && (
          <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 flex items-start gap-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-error-warning-line"></i>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground-800">{error}</p>
              {suggestions.length > 0 && acceptedCount > 0 && (
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={previewing}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <i className={previewing ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 flex-wrap">
          {suggestions.length > 0 && onFinishAndReset && (
            <button
              type="button"
              onClick={onFinishAndReset}
              title="Copy every prompt for reuse, then clear this run for the next résumé"
              className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-background-200 bg-background-50 text-foreground-800 px-3.5 py-2.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-file-copy-2-line"></i>
              Copy prompts + Clear run
            </button>
          )}
          <button
            type="button"
            onClick={runPreview}
            disabled={previewing || saving || acceptedCount === 0}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-secondary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {previewing ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Preparing preview…
              </>
            ) : (
              <>
                <i className="ri-eye-line"></i>
                Preview changes{acceptedCount > 0 ? ` (${acceptedCount})` : ""}
              </>
            )}
          </button>
        </div>
      </div>

      {preview && (
        <ReadablePreviewModal
          title="Preview your résumé"
          subtitle="Preview — nothing is saved until you accept"
          meta={
            <div className="mt-1.5 space-y-1.5 max-w-[640px]">
              {error && (
                <span className="block text-[11px] font-medium text-accent-700">{error}</span>
              )}
              {skippedNote}
              {!error && preview.skipped.length === 0 && (
                <span className="block text-[11px] text-foreground-400">
                  Preview only — {preview.applied} edit
                  {preview.applied === 1 ? "" : "s"} ready. Nothing is saved until you accept.
                </span>
              )}
            </div>
          }
          onClose={() => {
            if (saving) return;
            setPreview(null);
            setError("");
          }}
          revision={
            <VersionMarkdownPreview
              markdown={preview.renderedText}
              themeId={style.themeId}
              accentId={style.accentId}
              fontId={style.fontId}
              width={PAPER_WIDTH}
              height={PAPER_MIN_HEIGHT}
            />
          }
          revisionWidth={PAPER_WIDTH}
          actions={
            <div className="flex items-center gap-2 flex-wrap w-full">
              <button
                type="button"
                onClick={acceptAndSave}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {saving ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-check-line"></i>
                )}
                Accept &amp; Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setError("");
                }}
                disabled={saving}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold border border-background-200 bg-background-50 text-foreground-800 px-3.5 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <i className="ri-arrow-left-line"></i>
                Back to edits
              </button>
            </div>
          }
          hint="Esc to close · scroll inside this view to read · nothing is saved until you accept"
        />
      )}
    </section>
  );
}