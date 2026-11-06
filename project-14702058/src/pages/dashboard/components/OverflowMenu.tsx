import { useEffect, useRef, useState } from "react";

export interface OverflowMenuItem {
  key: string;
  /** Remix Icon class. */
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Accessible label + tooltip for the trigger. */
  label?: string;
  align?: "left" | "right";
  className?: string;
}

/**
 * A small "…" overflow menu that tucks a row's secondary actions away so the
 * primary actions stay uncluttered. Closes on outside click or Escape. Used by
 * the Matches rows (and available to any other dense row).
 */
export default function OverflowMenu({
  items,
  label = "More actions",
  align = "right",
  className = "",
}: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`w-9 h-9 flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
          open
            ? "border-primary-300 text-primary-700 bg-primary-100"
            : "border-background-300 text-foreground-500 hover:text-foreground-900 hover:border-foreground-300"
        }`}
      >
        <i className="ri-more-2-line"></i>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-2 w-56 rounded-xl bg-background-50 border border-background-200 p-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              disabled={item.disabled}
              className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-background-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0 ${
                  item.danger
                    ? "bg-accent-100 text-accent-700"
                    : "bg-background-100 text-foreground-700"
                }`}
              >
                <i className={item.icon}></i>
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-medium truncate ${
                    item.danger ? "text-accent-800" : "text-foreground-950"
                  }`}
                >
                  {item.label}
                </span>
                {item.hint && (
                  <span className="block text-[11px] text-foreground-500 truncate">
                    {item.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}