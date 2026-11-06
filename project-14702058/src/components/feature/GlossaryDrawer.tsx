import { useEffect } from "react";
import type { GlossaryEntry } from "@/lib/glossary";

interface GlossaryDrawerProps {
  /** The term to explain, or null when the drawer is closed. */
  entry: GlossaryEntry | null;
  onClose: () => void;
}

/**
 * A right-side drawer that opens when someone clicks a glossary term's
 * "Learn more". Shows the plain-language definition plus concrete examples.
 */
export default function GlossaryDrawer({ entry, onClose }: GlossaryDrawerProps) {
  useEffect(() => {
    if (!entry) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.term} — definition and examples`}
    >
      <div
        className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55 animate-fade-in-up"
        onClick={onClose}
      ></div>

      <aside className="absolute right-0 top-0 h-full w-full sm:max-w-md bg-background-50 border-l border-background-200 animate-drawer-in flex flex-col">
        <div className="px-5 py-4 border-b border-background-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 flex items-center justify-center rounded-xl bg-primary-100 text-primary-700 flex-shrink-0">
              <i className="ri-book-open-line text-lg"></i>
            </span>
            <div className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-foreground-400">
                Key term
              </span>
              <h3 className="font-heading text-lg font-medium text-foreground-950 truncate">
                {entry.term}
              </h3>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500 mb-2">
              What it means
            </h4>
            <p className="text-sm text-foreground-800 leading-relaxed">{entry.short}</p>
          </div>

          {entry.examples.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground-500 mb-2 flex items-center gap-1.5">
                <i className="ri-lightbulb-line text-accent-500"></i>
                Examples
              </h4>
              <ul className="space-y-2.5">
                {entry.examples.map((example, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-xl bg-background-100/70 border border-background-200 p-3"
                  >
                    <span className="w-6 h-6 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-900 text-xs font-semibold flex-shrink-0">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground-700 leading-relaxed">
                      {example}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-background-200">
          <button
            onClick={onClose}
            className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-check-line"></i>
            Got it
          </button>
        </div>
      </aside>
    </div>
  );
}