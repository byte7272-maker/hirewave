import { useState } from "react";
import { ApiError } from "@/lib/api";
import { createExperience } from "@/lib/experience";
import {
  buildResumeBullets,
  paceOf,
  type PaceBand,
  type RecapTurn,
} from "@/lib/practiceRecap";
import { formatCountdown } from "@/lib/interviewPractice";
import { useToast } from "@/components/base/ToastProvider";

const PACE_LABEL: Record<PaceBand, string> = {
  short: "Brief",
  on: "On pace",
  long: "Long",
};

const PACE_CLASS: Record<PaceBand, string> = {
  short: "bg-secondary-100 text-secondary-900",
  on: "bg-primary-100 text-primary-800",
  long: "bg-accent-100 text-accent-900",
};

interface EditableBullet {
  question: string;
  category?: string;
  strong: boolean;
  targetSeconds: number;
  responseSeconds: number;
  title: string;
  text: string;
  include: boolean;
}

function draftTitle(question: string, category?: string): string {
  const base = (question ?? "").replace(/\s+/g, " ").trim();
  const clipped = base.length > 64 ? `${base.slice(0, 61).trim()}…` : base;
  if (category && clipped) return `${category}: ${clipped}`;
  return clipped || category || "Interview answer";
}

interface RecapToResumeModalProps {
  turns: RecapTurn[];
  onClose: () => void;
  onSaved?: (count: number) => void;
  /** Pre-select every bullet regardless of strength (used for a single turn). */
  includeAll?: boolean;
}

/**
 * Turns a practice recap into résumé-ready highlight bullets. Drafts are seeded
 * from the condensed answers (strong turns pre-selected) and stay fully editable
 * before anything is saved to Work Highlights.
 */
export default function RecapToResumeModal({ turns, onClose, onSaved, includeAll }: RecapToResumeModalProps) {
  const { showToast } = useToast();
  const drafts = buildResumeBullets(turns);
  const anyStrong = drafts.some((d) => d.strong);
  const [items, setItems] = useState<EditableBullet[]>(() =>
    drafts.map((d) => ({
      question: d.question,
      category: d.category,
      strong: d.strong,
      targetSeconds: d.targetSeconds,
      responseSeconds: d.responseSeconds,
      title: draftTitle(d.question, d.category),
      text: d.bullet,
      include: includeAll ? true : anyStrong ? d.strong : true,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = items.filter((it) => it.include && it.text.trim().length >= 10);

  function patch(index: number, next: Partial<EditableBullet>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...next } : it)));
  }

  function toggleAll(next: boolean) {
    setItems((prev) => prev.map((it) => ({ ...it, include: next })));
  }

  async function handleSave() {
    if (selected.length === 0) {
      setError("Select at least one bullet with 10+ characters of content.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let saved = 0;
      for (const item of selected) {
        await createExperience({
          content: item.text.trim(),
          title: item.title.trim() || undefined,
          kind: "achievement",
          source: "self_written",
        });
        saved += 1;
      }
      showToast(`${saved} highlight${saved === 1 ? "" : "s"} added to your résumé`, "success");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your highlights.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
      <div className="relative w-full max-w-2xl bg-background-50 rounded-2xl border border-background-200 animate-fade-in-up flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-background-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <i className="ri-file-text-line text-lg"></i>
            </span>
            <div>
              <h3 className="font-heading text-lg font-medium text-foreground-950">
                Recap to résumé
              </h3>
              <p className="text-xs text-foreground-500">
                Drafted from your answers — strong turns are pre-selected. Edit before saving.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer flex-shrink-0"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-foreground-600">
            {selected.length} of {items.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleAll(true)}
              className="text-xs font-semibold text-foreground-700 hover:text-foreground-950 cursor-pointer whitespace-nowrap"
            >
              Select all
            </button>
            <span className="text-foreground-300">·</span>
            <button
              type="button"
              onClick={() => toggleAll(false)}
              className="text-xs font-semibold text-foreground-700 hover:text-foreground-950 cursor-pointer whitespace-nowrap"
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          <p className="flex items-start gap-2 text-xs text-foreground-500 leading-relaxed">
            <i className="ri-information-line text-sm mt-0.5 flex-shrink-0"></i>
            These drafts are condensed mechanically from what you said — tighten them into real
            accomplishment lines (action + result) for the best résumé material.
          </p>

          {items.map((item, index) => {
            const band = paceOf(item);
            return (
              <div
                key={index}
                className={`rounded-xl border p-3.5 transition-colors ${
                  item.include
                    ? "bg-background-100/60 border-primary-200"
                    : "bg-background-50 border-background-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <label className="flex items-center gap-2 cursor-pointer flex-shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={item.include}
                      onChange={(e) => patch(index, { include: e.target.checked })}
                      className="w-4 h-4 rounded border-background-300 text-primary-500 focus:ring-primary-400 cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-foreground-400">
                        Q{index + 1}
                      </span>
                      {item.strong && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 whitespace-nowrap">
                          <i className="ri-sparkling-2-line"></i>
                          Strong
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PACE_CLASS[band]}`}
                      >
                        {PACE_LABEL[band]}
                      </span>
                      <span className="text-[11px] text-foreground-400 whitespace-nowrap">
                        {formatCountdown(item.responseSeconds)} / {formatCountdown(item.targetSeconds)}
                      </span>
                    </div>

                    <p className="text-xs text-foreground-500 leading-snug line-clamp-2">
                      {item.question}
                    </p>

                    <input
                      value={item.title}
                      onChange={(e) => patch(index, { title: e.target.value })}
                      placeholder="Title"
                      className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-xs font-medium text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
                    />
                    <textarea
                      value={item.text}
                      onChange={(e) => patch(index, { text: e.target.value })}
                      rows={2}
                      placeholder="Write your achievement bullet…"
                      className="w-full px-3 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-none"
                    ></textarea>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="px-5 pt-3">
            <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
              <i className="ri-error-warning-line text-base mt-0.5"></i>
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="px-5 py-4 border-t border-background-200 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2.5 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selected.length === 0}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-5 py-2.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {saving ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Saving…
              </>
            ) : (
              <>
                <i className="ri-add-line"></i>
                Save {selected.length || ""} highlight{selected.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}