import { useState } from "react";
import type { RecapTurn } from "@/lib/practiceRecap";
import { scoreRole } from "@/pages/dashboard/interview/components/vocabTone";
import TurnDetailPopover from "@/pages/dashboard/interview/components/TurnDetailPopover";

const SCORE_BAR: Record<"primary" | "secondary" | "accent", string> = {
  primary: "bg-primary-500",
  secondary: "bg-secondary-500",
  accent: "bg-accent-500",
};

function fillerBarClass(count: number): string {
  if (count >= 3) return "bg-red-500";
  if (count === 0) return "bg-background-300";
  return "bg-amber-400";
}

/**
 * Compact vocabulary trend across a practice session: strength (score) and
 * filler count turn by turn, so users can see the read move as they settle in.
 * Bars are tappable — each opens that turn's full answer + final read.
 * Only rendered when at least one turn carried a vocabulary read.
 */
export default function VocabTrend({ turns }: { turns: RecapTurn[] }) {
  const [detail, setDetail] = useState<number | null>(null);
  const items = (turns ?? [])
    .map((turn, i) => ({ turn, q: i + 1 }))
    .filter(
      ({ turn }) => typeof turn.vocabScore === "number" || typeof turn.fillerCount === "number"
    );
  if (items.length === 0) return null;

  const scores = items
    .map(({ turn }) => (typeof turn.vocabScore === "number" ? turn.vocabScore : null))
    .filter((s): s is number => s !== null);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const first = scores.length ? scores[0] : null;
  const last = scores.length ? scores[scores.length - 1] : null;
  const delta = first !== null && last !== null ? last - first : null;
  const totalFillers = items.reduce(
    (sum, { turn }) => sum + (typeof turn.fillerCount === "number" ? turn.fillerCount : 0),
    0
  );
  const maxFillers = Math.max(
    1,
    ...items.map(({ turn }) => (typeof turn.fillerCount === "number" ? turn.fillerCount : 0))
  );

  const trendCls =
    delta === null
      ? "text-foreground-500"
      : delta >= 3
        ? "text-primary-700"
        : delta <= -3
          ? "text-accent-700"
          : "text-foreground-500";
  const trendIcon =
    delta === null
      ? "ri-subtract-line"
      : delta > 0
        ? "ri-arrow-up-line"
        : delta < 0
          ? "ri-arrow-down-line"
          : "ri-subtract-line";
  const trendLabel =
    delta === null || Math.abs(delta) < 3
      ? "Holding steady"
      : `${delta > 0 ? "+" : ""}${delta} across turns`;

  return (
    <div className="rounded-xl bg-background-50 border border-background-200 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 flex items-center justify-center rounded-lg bg-accent-100 text-accent-700">
            <i className="ri-sparkling-2-line text-sm"></i>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground-950">Vocabulary trend</h3>
            <p className="text-[11px] text-foreground-500">
              Tap a bar for the full answer &amp; read · each answer&rsquo;s final read
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-foreground-900">
            {avg !== null ? `avg ${avg}/100` : `${totalFillers} fillers`}
          </div>
          <div className={`text-[11px] inline-flex items-center gap-1 ${trendCls}`}>
            <i className={trendIcon}></i>
            {trendLabel}
          </div>
        </div>
      </div>

      {/* Strength */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-foreground-600 mb-1.5">
          <span>Strength</span>
          <span className="text-foreground-400">0&ndash;100</span>
        </div>
        <div className="flex items-end gap-1.5 h-14" role="group" aria-label="Vocabulary strength, turn by turn">
          {items.map(({ turn, q }, index) => {
            const score = typeof turn.vocabScore === "number" ? turn.vocabScore : null;
            return (
              <button
                key={index}
                type="button"
                onClick={() => setDetail(index)}
                aria-label={
                  score !== null
                    ? `Q${q}: strength ${Math.round(score)} out of 100 — open details`
                    : `Q${q}: no strength read — open details`
                }
                title={score !== null ? `Q${q}: strength ${Math.round(score)}/100` : `Q${q}: no strength read`}
                className="group relative flex-1 h-full flex items-end rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                {score !== null ? (
                  <span
                    className={`w-full rounded-t-md transition-all duration-500 group-hover:opacity-80 ${SCORE_BAR[scoreRole(score)]}`}
                    style={{ height: `${Math.max(6, Math.min(100, score))}%` }}
                  ></span>
                ) : (
                  <span className="w-full h-1 rounded-full bg-background-200 group-hover:bg-background-300"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fillers */}
      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-foreground-600 mb-1.5">
          <span>Fillers</span>
          <span className="text-foreground-400">{totalFillers} total</span>
        </div>
        <div className="flex items-end gap-1.5 h-9" role="group" aria-label="Filler count, turn by turn">
          {items.map(({ turn, q }, index) => {
            const fillers = typeof turn.fillerCount === "number" ? turn.fillerCount : 0;
            const heightPct =
              fillers === 0 ? 4 : Math.max(12, Math.round((fillers / maxFillers) * 100));
            return (
              <button
                key={index}
                type="button"
                onClick={() => setDetail(index)}
                aria-label={`Q${q}: ${fillers} filler${fillers === 1 ? "" : "s"} — open details`}
                title={`Q${q}: ${fillers} filler${fillers === 1 ? "" : "s"}`}
                className="group relative flex-1 h-full flex items-end rounded-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <span
                  className={`w-full rounded-t-sm transition-all duration-500 group-hover:opacity-80 ${fillerBarClass(fillers)}`}
                  style={{ height: `${heightPct}%` }}
                ></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-600 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary-500"></span>
          strong (80+)
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-600 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-sm bg-secondary-500"></span>
          fair (60+)
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-600 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-sm bg-accent-500"></span>
          needs work
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-foreground-600 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400"></span>
          filler spike
        </span>
      </div>

      {detail !== null && items[detail] && (
        <TurnDetailPopover
          turn={items[detail].turn}
          q={items[detail].q}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}