import { useEffect, useRef, useState } from "react";

interface DocumentRowMenuProps {
  /** Whether the document is currently flagged. */
  flagged?: boolean;
  /** Whether the document is currently archived. */
  archived?: boolean;
  /** Locks the menu while an action is in flight. */
  busy?: boolean;
  onToggleFlag: () => void;
  onToggleArchive: () => void;
}

/**
 * A per-document overflow menu holding the flag ("needs attention") and
 * archive/restore actions. Closes on outside click or Escape.
 */
export default function DocumentRowMenu({
  flagged,
  archived,
  busy,
  onToggleFlag,
  onToggleArchive,
}: DocumentRowMenuProps) {
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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title="More actions"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {busy ? (
          <i className="ri-loader-4-line animate-spin"></i>
        ) : (
          <i className="ri-more-2-line"></i>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg bg-background-50 border border-background-200 py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onToggleFlag();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-flag-line"></i>
            {flagged ? "Remove flag" : "Flag — needs attention"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onToggleArchive();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground-800 hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            <i className={archived ? "ri-inbox-unarchive-line" : "ri-archive-line"}></i>
            {archived ? "Restore from archive" : "Archive"}
          </button>
        </div>
      )}
    </div>
  );
}