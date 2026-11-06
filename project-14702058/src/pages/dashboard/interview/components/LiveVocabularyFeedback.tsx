import { useState } from "react";
import type { VocabularyKind, VocabularyResult, VocabularySuggestion } from "@/lib/interview";
import {
  highlightTranscript,
  liveVocabularyVisible,
  type HighlightSegment,
} from "@/lib/liveVocabulary";
import {
  fillerChipClass,
  paceMeta,
  scoreRole,
  wordsPerMinuteLabel,
} from "@/pages/dashboard/interview/components/vocabTone";

const UNDERLINE: Record<VocabularyKind, string> = {
  filler: "underline decoration-red-500 decoration-2 underline-offset-2",
  weak: "underline decoration-amber-500 decoration-2 underline-offset-2",
  overused: "underline decoration-dotted decoration-foreground-400 underline-offset-2",
};

function StrengthDial({ score }: { score: number }) {
  const value = Math.max(0, Math.min(100, score));
  const role = scoreRole(value);
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-12 h-12 rounded-full flex-shrink-0"
        style={{
          background: `conic-gradient(oklch(var(--${role}-500)) 0 ${value}%, oklch(var(--background-200)) ${value}% 100%)`,
        }}
        role="img"
        aria-label={`Vocabulary strength ${Math.round(value)} out of 100`}
      >
        <div className="absolute inset-[4px] rounded-full bg-background-50 flex items-center justify-center">
          <span className="font-heading text-sm font-semibold text-foreground-950">
            {Math.round(value)}
          </span>
        </div>
      </div>
      <div className="leading-tight">
        <div className="text-[11px] font-semibold text-foreground-600">Strength</div>
        <div className="text-[11px] text-foreground-400">out of 100</div>
      </div>
    </div>
  );
}

function SuggestionChip({
  suggestion,
  onSwap,
}: {
  suggestion: VocabularySuggestion;
  onSwap?: (original: string, replacement: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { original, kind, count, suggestions, note } = suggestion;
  const alternatives = suggestions ?? [];

  if (kind === "filler") {
    return (
      <span
        title={note}
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 bg-red-50 border-red-200 text-red-800 whitespace-nowrap"
      >
        <i className="ri-scissors-cut-line text-sm"></i>
        cut &ldquo;{original}&rdquo;
        {typeof count === "number" && count > 1 ? <span className="opacity-70">×{count}</span> : null}
      </span>
    );
  }

  if (kind === "overused") {
    return (
      <span
        title={note}
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 bg-secondary-100 border-secondary-200 text-secondary-900 whitespace-nowrap"
      >
        <i className="ri-repeat-2-line text-sm"></i>
        &ldquo;{original}&rdquo;{typeof count === "number" ? ` ×${count}` : ""} — vary it
      </span>
    );
  }

  // weak — tap swaps in the best alternative; the caret reveals every option.
  const best = alternatives[0];
  const swap = (replacement: string) => onSwap?.(original, replacement);
  return (
    <span
      title={note}
      className="inline-flex items-center gap-1 flex-wrap text-xs font-semibold rounded-lg border px-2.5 py-1.5 bg-amber-50 border-amber-200 text-amber-900 whitespace-nowrap"
    >
      <button
        type="button"
        onClick={() => (best && onSwap ? swap(best) : setOpen((v) => !v))}
        title={onSwap && best ? `Swap in “${best}”` : note}
        className="inline-flex items-center gap-1.5 cursor-pointer transition-colors hover:text-amber-700"
      >
        <i className="ri-magic-line text-sm"></i>
        <span>&ldquo;{original}&rdquo;</span>
        {best ? (
          <>
            <span className="text-amber-500">→</span>
            <span>{best}</span>
          </>
        ) : null}
        {onSwap && best ? <i className="ri-corner-down-left-line text-sm ml-0.5"></i> : null}
      </button>
      {alternatives.length > 1 ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Show all alternatives"
          className="inline-flex items-center justify-center cursor-pointer"
        >
          <i className={`ri-arrow-down-s-line text-sm transition-transform ${open ? "rotate-180" : ""}`}></i>
        </button>
      ) : null}
      {open && alternatives.length > 0 ? (
        <span className="ml-1 inline-flex items-center gap-1 flex-wrap">
          {alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => swap(alt)}
              disabled={!onSwap}
              title={onSwap ? `Replace “${original}” with “${alt}”` : note}
              className={`inline-flex items-center gap-1 rounded-md bg-background-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 ${onSwap ? "cursor-pointer hover:bg-amber-100" : ""}`}
            >
              {alt}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function HighlightedTranscript({ segments }: { segments: HighlightSegment[] }) {
  if (!segments.length) return null;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
          Live transcript
        </span>
        <span className="flex items-center gap-2 text-[10px] text-foreground-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-4 border-b-2 border-red-500"></span> filler
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 border-b-2 border-amber-500"></span> weak
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 border-b-2 border-dotted border-foreground-400"></span> overused
          </span>
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-foreground-800 whitespace-pre-wrap max-h-40 overflow-y-auto">
        {segments.map((seg, i) =>
          seg.kind ? (
            <span key={i} className={`${UNDERLINE[seg.kind]} text-foreground-950`}>
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </p>
    </div>
  );
}

/**
 * Live, glanceable vocabulary feedback shown beside the transcript while the
 * candidate is answering. Purely advisory — it never blocks the mic.
 */
export default function LiveVocabularyFeedback({
  transcript,
  result,
  analyzing,
  onSwap,
}: {
  transcript: string;
  result: VocabularyResult | null;
  analyzing: boolean;
  /** Swap a flagged phrase in the live transcript (weak-word chips). */
  onSwap?: (original: string, replacement: string) => void;
}) {
  const visible = liveVocabularyVisible(result);

  return (
    <section className="rounded-2xl bg-background-50 border border-background-200 p-4 space-y-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground-950 inline-flex items-center gap-2">
          <i className="ri-sparkling-2-line text-primary-600"></i>
          Live vocabulary
        </h3>
        {analyzing && (
          <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
            <i className="ri-loader-4-line animate-spin"></i>
            Listening…
          </span>
        )}
      </div>

      {visible && result ? (
        <>
          {/* Meters */}
          <div className="flex items-center gap-4 flex-wrap">
            <StrengthDial score={typeof result.score === "number" ? result.score : 0} />
            <span
              title={wordsPerMinuteLabel(result.words_per_minute)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${paceMeta(result.pace).className}`}
            >
              <i className={`${paceMeta(result.pace).icon} text-sm`}></i>
              {paceMeta(result.pace).label}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${fillerChipClass(typeof result.filler_count === "number" ? result.filler_count : 0)}`}
            >
              <i className="ri-chat-delete-line text-sm"></i>
              {typeof result.filler_count === "number" ? result.filler_count : 0} filler
              {(typeof result.filler_count === "number" ? result.filler_count : 0) === 1 ? "" : "s"}
            </span>
          </div>

          {/* Suggestion chips */}
          {(result.suggestions ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(result.suggestions ?? []).slice(0, 4).map((s, i) => (
                <SuggestionChip
                  key={`${s.kind}-${s.original}-${i}`}
                  suggestion={s}
                  onSwap={onSwap}
                />
              ))}
            </div>
          )}

          {/* One-line coach */}
          {result.summary ? (
            <p className="text-xs text-foreground-600 leading-relaxed">{result.summary}</p>
          ) : null}

          <HighlightedTranscript segments={highlightTranscript(transcript, result.suggestions)} />
        </>
      ) : (
        <div className="py-6 text-center">
          <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg bg-background-100 text-foreground-400 mb-2">
            <i className="ri-mic-line"></i>
          </div>
          <p className="text-sm text-foreground-600">Listening as you speak…</p>
          <p className="text-xs text-foreground-400 mt-1">
            Live phrasing tips appear here once you&rsquo;ve said a few sentences.
          </p>
        </div>
      )}
    </section>
  );
}