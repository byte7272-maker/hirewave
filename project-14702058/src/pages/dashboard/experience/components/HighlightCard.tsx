import { useState } from "react";
import { ApiError } from "@/lib/api";
import { capitalizeKind, deleteExperience, type Experience } from "@/lib/experience";

const TRUNCATE = 240;

interface HighlightCardProps {
  item: Experience;
  onEdit: (item: Experience) => void;
  onDeleted: (id: string | number) => void;
}

export default function HighlightCard({ item, onEdit, onDeleted }: HighlightCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const content = item.content ?? "";
  const isLong = content.length > TRUNCATE;
  const shown = expanded || !isLong ? content : `${content.slice(0, TRUNCATE).trimEnd()}…`;
  const title = item.title?.trim() || capitalizeKind(item.kind);
  const meta = [item.company, item.period].filter(Boolean).join(" · ");
  const skills = item.skills ?? [];

  async function handleDelete() {
    setBusy(true);
    setFeedback("");
    try {
      await deleteExperience(item.id);
      onDeleted(item.id);
    } catch (err) {
      setFeedback(err instanceof ApiError ? err.message : "Could not delete highlight.");
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl bg-background-100/60 border border-background-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading text-base font-semibold text-foreground-950 leading-snug">
              {title}
            </h3>
            <span className="inline-flex items-center rounded-full bg-secondary-100 text-secondary-900 text-xs font-medium px-2.5 py-0.5 whitespace-nowrap">
              {capitalizeKind(item.kind)}
            </span>
            {item.source === "ai_generated" && item.source_tool && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-100 text-accent-900 text-xs font-medium px-2.5 py-0.5 whitespace-nowrap">
                ✨ {item.source_tool}
              </span>
            )}
          </div>
          {meta && <p className="text-xs text-foreground-500 mt-1.5">{meta}</p>}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(item)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer"
            aria-label="Edit highlight"
          >
            <i className="ri-edit-line"></i>
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-accent-100 hover:text-accent-900 disabled:opacity-50 cursor-pointer"
            aria-label="Delete highlight"
          >
            <i className={busy ? "ri-loader-4-line animate-spin" : "ri-delete-bin-line"}></i>
          </button>
        </div>
      </div>

      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <span
              key={s}
              className="inline-flex items-center rounded-full bg-background-200 text-foreground-700 text-xs font-medium px-2.5 py-1"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm text-foreground-700 leading-relaxed whitespace-pre-line">{shown}</p>

      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
        >
          {expanded ? "Show less" : "Show more"}
          <i className={expanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </button>
      )}

      {feedback && (
        <p className="text-xs text-accent-900 bg-accent-100 rounded-md px-3 py-2">{feedback}</p>
      )}
    </article>
  );
}