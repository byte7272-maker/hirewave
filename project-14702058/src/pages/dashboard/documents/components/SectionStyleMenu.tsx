import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_SECTION_STYLE,
  SECTION_STYLE_SECTIONS,
  setSectionStyle,
  useSectionStyles,
} from "@/lib/sectionStyles";

interface SectionStyleMenuProps {
  /** The document whose section styles this control edits. */
  docId: string | number;
  /** The version whose own section styles this control edits (document-level when omitted). */
  version?: string | number | null;
}

/**
 * A small "Section styles" dropdown that toggles **bold** and **italic** per
 * section. It is the manual twin of the AI command — an instruction like "remove
 * bold from the education section" flips the same state — and the change paints
 * the rendered document immediately (the viewers subscribe to the style store).
 *
 * Styles are remembered PER VERSION, so switching versions restores each one's
 * own section styling.
 */
export default function SectionStyleMenu({ docId, version }: SectionStyleMenuProps) {
  const styles = useSectionStyles(docId, version);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const changedCount = Object.values(styles).filter((s) => !s.bold || s.italic).length;

  const chip =
    "w-6 h-6 flex items-center justify-center rounded-md border text-xs transition-colors cursor-pointer";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Make a section bold or italic"
        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-700 hover:text-foreground-950 hover:border-background-300 px-3 py-2 rounded-md transition-colors cursor-pointer whitespace-nowrap"
      >
        <i className="ri-text"></i>
        Section styles
        {changedCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-accent-100 text-accent-900 text-[10px] font-bold">
            {changedCount}
          </span>
        )}
        <i className="ri-arrow-down-s-line text-sm"></i>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-[256px] rounded-lg border border-background-300 bg-background-50 p-2"
        >
          <p className="px-1.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
            Bold / italic per section
          </p>
          <div className="space-y-0.5">
            {SECTION_STYLE_SECTIONS.map(({ key, label }) => {
              const style = styles[key] ?? DEFAULT_SECTION_STYLE;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 px-1.5 py-1 rounded-md hover:bg-background-100"
                >
                  <span className="text-xs text-foreground-700">{label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSectionStyle(docId, version, key, { bold: !style.bold })}
                      aria-pressed={style.bold}
                      aria-label={`${style.bold ? "Remove bold from" : "Bold"} ${label}`}
                      title={`${style.bold ? "Remove bold from" : "Bold"} ${label}`}
                      className={`${chip} ${
                        style.bold
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                          : "bg-background-50 text-foreground-500 border-background-200 hover:text-foreground-900"
                      }`}
                    >
                      <i className="ri-bold"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSectionStyle(docId, version, key, { italic: !style.italic })}
                      aria-pressed={style.italic}
                      aria-label={`${style.italic ? "Remove italic from" : "Italicize"} ${label}`}
                      title={`${style.italic ? "Remove italic from" : "Italicize"} ${label}`}
                      className={`${chip} ${
                        style.italic
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500"
                          : "bg-background-50 text-foreground-500 border-background-200 hover:text-foreground-900"
                      }`}
                    >
                      <i className="ri-italic"></i>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="px-1.5 pt-2 text-[11px] leading-relaxed text-foreground-500">
            Or just ask: &ldquo;remove bold from the education section&rdquo;.
          </p>
        </div>
      )}
    </div>
  );
}