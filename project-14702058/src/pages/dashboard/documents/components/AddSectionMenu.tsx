import { useEffect, useRef, useState } from "react";
import { DOC_SECTION_OPTIONS } from "@/lib/docSections";

interface AddSectionMenuProps {
  /** Insert a `## Heading` block with a placeholder line. */
  onPick: (heading: string, sample: string) => void;
  disabled?: boolean;
}

/**
 * The "+ Add section" control. Offers the common résumé sections plus a
 * "Custom…" entry that reveals a small heading input. Picking one inserts an
 * editable `## SECTION` block with a placeholder line at the caret.
 */
export default function AddSectionMenu({ onPick, disabled = false }: AddSectionMenuProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customHeading, setCustomHeading] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCustom(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setCustom(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (custom) inputRef.current?.focus();
  }, [custom]);

  function choose(heading: string, sample: string) {
    onPick(heading, sample);
    setOpen(false);
    setCustom(false);
    setCustomHeading("");
  }

  function submitCustom() {
    const heading = customHeading.trim();
    if (!heading) return;
    choose(heading, "- Add your first line here…");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 hover:border-background-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
      >
        <i className="ri-add-line"></i>
        Add section
        <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-background-200 bg-background-50 shadow-lg p-1.5 animate-fade-in-up"
        >
          {!custom ? (
            <>
              <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
                Add a section
              </p>
              {DOC_SECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  role="menuitem"
                  type="button"
                  onClick={() => choose(opt.heading, opt.sample)}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm text-foreground-800 hover:bg-background-100 transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-700 flex-shrink-0">
                    <i className={opt.icon}></i>
                  </span>
                  {opt.label}
                </button>
              ))}
              <div className="my-1 border-t border-background-200"></div>
              <button
                role="menuitem"
                type="button"
                onClick={() => setCustom(true)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-sm font-medium text-primary-800 hover:bg-primary-50 transition-colors cursor-pointer"
              >
                <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
                  <i className="ri-pencil-line"></i>
                </span>
                Custom…
              </button>
            </>
          ) : (
            <div className="p-1.5">
              <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
                Custom section name
              </p>
              <input
                ref={inputRef}
                value={customHeading}
                onChange={(e) => setCustomHeading(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCustom();
                }}
                placeholder="e.g. Publications"
                className="w-full px-2.5 py-2 rounded-lg bg-background-50 border border-background-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300"
              />
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={submitCustom}
                  disabled={!customHeading.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-add-line"></i>
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustom(false);
                    setCustomHeading("");
                  }}
                  className="text-sm font-medium text-foreground-600 hover:text-foreground-900 px-2 py-1.5 cursor-pointer whitespace-nowrap"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}