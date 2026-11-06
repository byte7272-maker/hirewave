import { useState } from "react";

const JOBS = [
  {
    role: "Senior Product Designer",
    co: "Linear",
    loc: "Remote · US",
    salary: "$185k – $220k",
    score: 96,
    type: "remote",
    chips: ["Skill overlap 92%", "Remote"],
  },
  {
    role: "Staff Frontend Engineer",
    co: "Vercel",
    loc: "SF · Hybrid",
    salary: "$210k – $260k",
    score: 91,
    type: "hybrid",
    chips: ["Stack match", "Hybrid"],
  },
  {
    role: "Design Systems Lead",
    co: "Figma",
    loc: "Remote · Global",
    salary: "$175k – $205k",
    score: 88,
    type: "remote",
    chips: ["Salary match", "Remote"],
  },
  {
    role: "Product Designer II",
    co: "Notion",
    loc: "Remote · US",
    salary: "$160k – $190k",
    score: 84,
    type: "remote",
    chips: ["Skill overlap 78%"],
  },
];

const FILTERS = ["All", "Remote", "Best match"];

export default function MatchingMock() {
  const [filter, setFilter] = useState("All");
  const [saved, setSaved] = useState<string[]>(["Design Systems Lead"]);

  const filtered = JOBS.filter((j) => {
    if (filter === "Remote") return j.type === "remote";
    if (filter === "Best match") return j.score >= 90;
    return true;
  });

  const toggleSave = (role: string) => {
    setSaved((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="bg-background-50 border border-background-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
          <span className="w-2.5 h-2.5 flex items-center justify-center rounded-full bg-background-300"></span>
        </div>
        <span className="text-xs font-mono text-foreground-500">
          matches · refreshed 2 min ago
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1 bg-background-100 rounded-full p-1 w-fit mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                filter === f
                  ? "bg-background-50 text-foreground-950 shadow-sm"
                  : "text-foreground-600 hover:text-foreground-900"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.map((j) => {
            const isSaved = saved.includes(j.role);
            return (
              <div
                key={j.role}
                className="flex items-start gap-3 p-3 rounded-xl bg-background-100/60 border border-background-200 transition-colors"
              >
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-background-50 border border-background-200 font-heading font-semibold text-foreground-900 flex-shrink-0">
                  {j.co[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground-950 truncate">
                      {j.role}
                    </span>
                    <span className="text-xs text-foreground-500 truncate">
                      · {j.co}
                    </span>
                  </div>
                  <div className="text-xs text-foreground-600 mt-0.5 truncate">
                    {j.loc} · {j.salary}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {j.chips.map((c) => (
                      <span
                        key={c}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary-100 text-secondary-900"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-semibold text-primary-700">
                      {j.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleSave(j.role)}
                      aria-label={isSaved ? "Unsave" : "Save"}
                      className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                        isSaved
                          ? "bg-accent-500 text-background-50 border-accent-500"
                          : "bg-background-50 text-foreground-500 border-background-300 hover:border-accent-400"
                      }`}
                    >
                      <i
                        className={`${
                          isSaved ? "ri-bookmark-fill" : "ri-bookmark-line"
                        } text-sm`}
                      ></i>
                    </button>
                  </div>
                  <div className="w-16 h-1.5 bg-background-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full"
                      style={{ width: `${j.score}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}