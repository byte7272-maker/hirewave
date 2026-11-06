import { useMemo, useState } from "react";
import type { Resume } from "@/lib/documents";
import { parseResumeMarkdown } from "@/lib/resumeMarkdown";
import { asString } from "@/pages/dashboard/documents/components/versionMeta";

/**
 * A collapsed "what's already in your résumé" reference for the workspace — the
 * existing Experience bullets, so the user can see what they have versus the
 * gaps they're filling while adding highlights. Read-only, collapsible, and
 * hidden entirely when the résumé has no experience bullets to show.
 */
export default function ResumeHighlightsContext({ resume }: { resume: Resume }) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const text = resume.rendered_text ?? "";
    if (!text.trim()) return [];
    try {
      const parsed = parseResumeMarkdown(text);
      const out: { role: string; lines: string[] }[] = [];
      for (const w of parsed.work ?? []) {
        const lines = (w.highlights ?? []).map((h) => asString(h).trim()).filter(Boolean);
        if (lines.length) {
          out.push({
            role: [w.position, w.name].filter(Boolean).join(" · "),
            lines,
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  }, [resume.rendered_text]);

  if (groups.length === 0) return null;

  const total = groups.reduce((n, g) => n + g.lines.length, 0);

  return (
    <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left cursor-pointer hover:bg-background-100 transition-colors"
      >
        <span className="w-8 h-8 flex items-center justify-center rounded-lg bg-background-200 text-foreground-600 flex-shrink-0">
          <i className="ri-list-check text-base"></i>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground-950">
            What&rsquo;s already in your résumé
          </span>
          <span className="block text-xs text-foreground-500 mt-0.5">
            {total} {total === 1 ? "bullet" : "bullets"} — compare against the gaps you&rsquo;re filling
          </span>
        </span>
        <span className="w-5 h-5 flex items-center justify-center text-foreground-400 flex-shrink-0">
          <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
        </span>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3 border-t border-background-200 pt-3">
          {groups.map((g, i) => (
            <div key={i}>
              {g.role && (
                <p className="text-xs font-semibold text-foreground-700 mb-1">{g.role}</p>
              )}
              <ul className="space-y-1">
                {g.lines.map((line, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs text-foreground-600 leading-relaxed">
                    <i className="ri-subtract-line mt-1 flex-shrink-0 text-foreground-300"></i>
                    <span className="min-w-0">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}