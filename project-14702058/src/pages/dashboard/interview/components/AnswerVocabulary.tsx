import { useState } from "react";
import { analyzeVocabulary, type VocabularyResult } from "@/lib/interview";
import {
  fillerChipClass,
  paceMeta,
  scoreRole,
  wordsPerMinuteLabel,
} from "@/pages/dashboard/interview/components/vocabTone";

/**
 * The final vocabulary read for one submitted answer, shown beside the
 * interviewer's own feedback. Offers an optional LLM polish of the answer.
 */
export default function AnswerVocabulary({
  answer,
  vocabulary,
}: {
  answer: string;
  vocabulary: VocabularyResult;
}) {
  const [polished, setPolished] = useState<string | null>(null);
  const [polishing, setPolishing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const score = typeof vocabulary.score === "number" ? vocabulary.score : 0;
  const fillers = typeof vocabulary.filler_count === "number" ? vocabulary.filler_count : 0;
  const meta = paceMeta(vocabulary.pace);
  const role = scoreRole(score);
  const suggestions = (vocabulary.suggestions ?? []).slice(0, 3);

  async function polish() {
    if (polishing) return;
    setPolishing(true);
    try {
      const r = await analyzeVocabulary({ text: answer, rewrite: true });
      const next = r.polished && r.polished.trim() ? r.polished : null;
      setPolished(next);
      setUnavailable(!next);
    } catch {
      setUnavailable(true);
    } finally {
      setPolishing(false);
    }
  }

  return (
    <div className="rounded-lg bg-background-50 border border-background-200 px-3 py-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground-600 whitespace-nowrap">
          <i className="ri-sparkling-2-line text-primary-600"></i>
          Vocabulary
        </span>
        <span
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: `oklch(var(--${role}-100))`, color: `oklch(var(--${role}-800))` }}
        >
          {Math.round(score)}/100
        </span>
        {vocabulary.pace ? (
          <span
            title={wordsPerMinuteLabel(vocabulary.words_per_minute)}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${meta.className}`}
          >
            <i className={meta.icon}></i>
            {meta.label}
          </span>
        ) : null}
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${fillerChipClass(fillers)}`}
        >
          <i className="ri-chat-delete-line"></i>
          {fillers} filler{fillers === 1 ? "" : "s"}
        </span>
      </div>

      {suggestions.length > 0 ? (
        <ul className="space-y-1">
          {suggestions.map((s, i) => (
            <li key={`${s.kind}-${s.original}-${i}`} className="text-[11px] text-foreground-600 leading-snug">
              {s.kind === "filler" ? (
                <>
                  Cut <span className="font-semibold text-foreground-800">&ldquo;{s.original}&rdquo;</span>
                  {typeof s.count === "number" && s.count > 1 ? ` (×${s.count})` : ""}
                </>
              ) : s.kind === "overused" ? (
                <>
                  <span className="font-semibold text-foreground-800">&ldquo;{s.original}&rdquo;</span> repeated
                  {typeof s.count === "number" ? ` ×${s.count}` : ""} — vary it
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground-800">&ldquo;{s.original}&rdquo;</span>
                  {s.suggestions && s.suggestions.length ? ` → ${s.suggestions.slice(0, 3).join(", ")}` : ""}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {vocabulary.summary ? (
        <p className="text-[11px] text-foreground-500 leading-relaxed">{vocabulary.summary}</p>
      ) : null}

      {polished ? (
        <div className="rounded-md bg-primary-100 border border-primary-200 p-2.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold text-primary-900 mb-1">
            <i className="ri-magic-line"></i>
            Polished version
          </div>
          <p className="text-xs text-primary-900 leading-relaxed whitespace-pre-wrap">{polished}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={polish}
          disabled={polishing || unavailable}
          title={unavailable ? "Polish isn't available right now" : "Rewrite this answer more strongly"}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-background-100 text-foreground-800 border border-background-200 hover:bg-background-200 px-2.5 py-1 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className={polishing ? "ri-loader-4-line animate-spin" : "ri-magic-line"}></i>
          {polishing ? "Polishing…" : unavailable ? "Polish unavailable" : "Polish my answer"}
        </button>
      )}
    </div>
  );
}