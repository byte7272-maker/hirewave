import { useState } from "react";

const ORIGINAL = [
  "Led design initiatives across multiple product teams",
  "Worked with engineers and PMs to ship features",
  "Responsible for improving user experience",
];

const TAILORED = [
  "Led design systems adoption across 3 product teams, cutting handoff time 40%",
  "Partnered with engineering + PM to ship a retention feature that lifted activation 18%",
  "Ran 30+ usability sessions; shipped redesign that raised task completion 22%",
];

const KEYWORDS = ["design systems", "retention", "usability testing", "cross-functional"];

export default function GenerationMock() {
  const [mode, setMode] = useState<"original" | "tailored">("tailored");
  const bullets = mode === "original" ? ORIGINAL : TAILORED;

  return (
    <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
        </div>
        <span className="text-xs font-mono text-foreground-500">
          resume tailor · Product Designer
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit mb-4">
          <button
            type="button"
            onClick={() => setMode("original")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              mode === "original"
                ? "bg-background-50 text-foreground-950 shadow-sm"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => setMode("tailored")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
              mode === "tailored"
                ? "bg-background-50 text-foreground-950 shadow-sm"
                : "text-foreground-600 hover:text-foreground-900"
            }`}
          >
            Tailored
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 flex items-center justify-center rounded-xl bg-background-100 border border-background-200 flex-shrink-0">
            <i className="ri-file-text-line text-2xl text-foreground-700"></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground-950">
              {mode === "tailored" ? "Tailored for Linear" : "Original resume"}
            </div>
            <div className="text-xs text-foreground-600">
              {mode === "tailored"
                ? "Keyword-matched to the job description"
                : "Generic · no role alignment"}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div
              className={`text-2xl font-heading font-semibold font-mono ${
                mode === "tailored" ? "text-primary-700" : "text-foreground-400"
              }`}
            >
              {mode === "tailored" ? 92 : 61}
            </div>
            <div className="text-[10px] text-foreground-500">ATS score</div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-background-200 bg-background-100/60 space-y-2">
          {bullets.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="w-1.5 h-1.5 flex items-center justify-center rounded-full bg-primary-500 mt-1.5 flex-shrink-0"></span>
              <span className="text-foreground-800 leading-relaxed">{b}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-foreground-500 font-semibold mr-1">
            Matched keywords
          </span>
          {KEYWORDS.map((k) => (
            <span
              key={k}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-100 text-accent-900"
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}