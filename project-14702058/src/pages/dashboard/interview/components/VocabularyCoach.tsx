import { useEffect, useRef, useState } from "react";
import {
  analyzeVocabulary,
  type VocabularyKind,
  type VocabularyResult,
  type VocabularySuggestion,
} from "@/lib/interview";

const DEBOUNCE_MS = 1500;

const KIND_ORDER: VocabularyKind[] = ["filler", "weak", "overused"];

function kindLabel(kind: VocabularyKind): string {
  if (kind === "filler") return "Fillers";
  if (kind === "weak") return "Weak words";
  return "Overused";
}

function scoreColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function scoreText(score: number): string {
  if (score >= 80) return "text-green-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-600";
}

function chipStyle(kind: VocabularyKind): string {
  if (kind === "filler") return "bg-amber-50 border-amber-200 text-amber-900";
  if (kind === "weak") return "bg-secondary-100 border-secondary-200 text-secondary-900";
  return "bg-accent-100 border-accent-200 text-accent-900";
}

export default function VocabularyCoach({
  transcript,
  onApply,
  onUsePolished,
  onResult,
  elapsedSeconds = 0,
}: {
  transcript: string;
  onApply: (original: string, replacement: string) => void;
  onUsePolished: (text: string) => void;
  onResult?: (result: VocabularyResult | null) => void;
  /** Seconds captured so far — enables pace + words-per-minute while answering. */
  elapsedSeconds?: number;
}) {
  const [result, setResult] = useState<VocabularyResult | null>(null);
  const [polished, setPolished] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polishUnavailable, setPolishUnavailable] = useState(false);

  const timerRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const latestRef = useRef(transcript);
  // Keep the latest elapsed seconds in a ref so debounced calls read fresh data.
  const elapsedRef = useRef(elapsedSeconds);
  elapsedRef.current = elapsedSeconds;

  function runAnalysis(text: string, rewrite: boolean) {
    const id = ++reqIdRef.current;
    const elapsed = Math.max(0, Math.round(elapsedRef.current));
    if (rewrite) {
      setPolishing(true);
    } else {
      setAnalyzing(true);
    }
    analyzeVocabulary({ text, rewrite, elapsed_seconds: elapsed })
      .then((r) => {
        if (id !== reqIdRef.current) return;
        setResult(r);
        onResult?.(r);
        if (rewrite) {
          const next = r.polished && r.polished.trim() ? r.polished : null;
          setPolished(next);
          setPolishUnavailable(!next);
        }
      })
      .catch(() => {
        // Non-blocking: vocabulary coaching never gates the interview flow.
        if (id === reqIdRef.current && rewrite) setPolished(null);
      })
      .finally(() => {
        if (id === reqIdRef.current) {
          setAnalyzing(false);
          setPolishing(false);
        }
      });
  }

  // Live/debounced analysis while the candidate types (or speaks via STT).
  useEffect(() => {
    latestRef.current = transcript;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (!transcript.trim()) {
      setResult(null);
      setPolished(null);
      onResult?.(null);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      runAnalysis(transcript, false);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  function handlePolish() {
    const text = latestRef.current.trim();
    if (!text || polishing) return;
    runAnalysis(text, true);
  }

  function handleUsePolished() {
    if (!polished) return;
    onUsePolished(polished);
    setPolished(null);
  }

  const score = result?.score;
  const suggestions = result?.suggestions ?? [];

  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: suggestions
      .filter((s) => s.kind === kind)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 flex flex-col">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground-950">Vocabulary coach</h3>
        {analyzing && (
          <span className="inline-flex items-center gap-1 text-xs text-foreground-500">
            <i className="ri-loader-4-line animate-spin"></i>
            Analyzing…
          </span>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {!result ? (
          <div className="py-6 text-center">
            <div className="w-10 h-10 mx-auto flex items-center justify-center rounded-lg bg-background-100 text-foreground-400 mb-2">
              <i className="ri-sparkling-2-line"></i>
            </div>
            <p className="text-sm text-foreground-600">Live vocabulary feedback.</p>
            <p className="text-xs text-foreground-400 mt-1">
              Start typing your answer to see coaching here.
            </p>
          </div>
        ) : (
          <>
            {/* Score meter */}
            <div>
              <div className="flex items-end justify-between">
                <span className={`text-2xl font-semibold ${scoreText(score ?? 0)}`}>
                  {score ?? 0}
                </span>
                <span className="text-xs text-foreground-500">/ 100 vocabulary</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-background-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${scoreColor(score ?? 0)}`}
                  style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }}
                ></div>
              </div>
              {result.summary ? (
                <p className="mt-2 text-xs text-foreground-700 leading-relaxed">{result.summary}</p>
              ) : null}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {typeof result.filler_count === "number" && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      result.filler_count > 0
                        ? "bg-amber-100 text-amber-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    <i className="ri-chat-delete-line"></i>
                    {result.filler_count} filler{result.filler_count === 1 ? "" : "s"}
                  </span>
                )}
                {typeof result.word_count === "number" && (
                  <span className="text-xs text-foreground-500 whitespace-nowrap">
                    {result.word_count} words
                  </span>
                )}
                {typeof result.unique_words === "number" && (
                  <span className="text-xs text-foreground-500 whitespace-nowrap">
                    {result.unique_words} unique
                  </span>
                )}
              </div>
            </div>

            {/* Suggestions grouped by kind */}
            {grouped.length > 0 && (
              <div className="space-y-4">
                {grouped.map((g) => (
                  <div key={g.kind}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 mb-2">
                      {kindLabel(g.kind)}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.items.map((s, i) => (
                        <SuggestionChip
                          key={`${s.kind}-${s.original}-${i}`}
                          suggestion={s}
                          onApply={onApply}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Polish action */}
            <button
              onClick={handlePolish}
              disabled={polishing || polishUnavailable}
              title={polishUnavailable ? "Polish not available" : undefined}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-secondary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className={polishing ? "ri-loader-4-line animate-spin" : "ri-magic-line"}></i>
              {polishing ? "Polishing…" : "Polish my answer"}
            </button>
          </>
        )}

        {/* Polished rewrite panel */}
        {polished && (
          <div className="rounded-xl bg-primary-100 border border-primary-200 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-900 mb-2">
              <i className="ri-sparkling-line"></i>
              Polished version
            </div>
            <p className="text-sm text-primary-900 leading-relaxed whitespace-pre-wrap">
              {polished}
            </p>
            <button
              onClick={handleUsePolished}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-900 bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-check-line"></i>
              Use this
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function SuggestionChip({
  suggestion,
  onApply,
}: {
  suggestion: VocabularySuggestion;
  onApply: (original: string, replacement: string) => void;
}) {
  const { original, kind, count, suggestions, note } = suggestion;

  if (kind === "filler") {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 ${chipStyle(kind)}`}
      >
        <span className="font-semibold whitespace-nowrap">cut &ldquo;{original}&rdquo;</span>
        {note ? <span className="opacity-80">· {note}</span> : null}
      </div>
    );
  }

  if (kind === "overused") {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 ${chipStyle(kind)}`}
      >
        <span className="whitespace-nowrap">
          &ldquo;{original}&rdquo; used {count ?? 0}&times; — vary it
        </span>
      </div>
    );
  }

  // weak — original → replacement suggestions, each tappable to swap.
  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-xs rounded-lg border px-2.5 py-1.5 ${chipStyle(kind)}`}
    >
      <span className="font-semibold whitespace-nowrap">&ldquo;{original}&rdquo;</span>
      <span className="text-foreground-400">→</span>
      {(suggestions ?? []).map((repl) => (
        <button
          key={repl}
          onClick={() => onApply(original, repl)}
          className="inline-flex items-center text-xs font-medium bg-background-50 text-foreground-900 border border-background-200 px-2 py-0.5 rounded-md hover:bg-background-200 hover:border-background-300 transition-colors cursor-pointer whitespace-nowrap"
        >
          {repl}
        </button>
      ))}
      {note ? <span className="opacity-70">{note}</span> : null}
    </div>
  );
}