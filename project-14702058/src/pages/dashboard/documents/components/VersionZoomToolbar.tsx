import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ViewerZoomMode } from "@/lib/viewerZoomMemory";
import { ZOOM_PRESETS } from "./useVersionZoom";

interface VersionZoomToolbarProps {
  /** The active zoom mode, so the right button reads as pressed. */
  mode: ViewerZoomMode;
  /** The honest percentage to show between − and +. */
  zoomPercent: number;
  /** True when zoomed out to the smallest stop (disables −). */
  atMin: boolean;
  /** True when zoomed in to the largest stop (disables +). */
  atMax: boolean;
  /** True when showing actual size, so the 100% button reads as pressed. */
  isActualSize: boolean;
  /** Step the zoom to the next / previous click-stop. */
  onStep: (dir: -1 | 1) => void;
  /** Switch directly to a fit mode (Fit page / Fit width). */
  onSetMode: (mode: ViewerZoomMode) => void;
  /** Snap to actual size (the 100% button). */
  onActualSize: () => void;
  /** Jump straight to an exact percentage (typed or picked from the preset menu). */
  onSetZoomPercent: (percent: number) => void;
  /** Optional dimmed hint line, right-aligned and hidden on small screens. */
  hint?: string;
  /** Optional trailing control (e.g. a Download button) at the right of the row. */
  trailing?: ReactNode;
}

/**
 * The date-free zoom bar shared by the MAIN document viewer and the full-size
 * lightbox: the − / % / + click-stops, a preset menu to jump straight to a common
 * scale, a typeable % for an exact value, plus Fit page, Fit width and 100% — so
 * both surfaces present exactly the same controls.
 */
export default function VersionZoomToolbar({
  mode,
  zoomPercent,
  atMin,
  atMax,
  isActualSize,
  onStep,
  onSetMode,
  onActualSize,
  onSetZoomPercent,
  hint,
  trailing,
}: VersionZoomToolbarProps) {
  /** Whether the % readout is currently an editable input. */
  const [editing, setEditing] = useState(false);
  /** The in-progress typed value (whole percent, no % sign). */
  const [draft, setDraft] = useState(String(zoomPercent));
  /** Whether the preset menu is open. */
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // When the reader starts typing, seed the field with the current % and focus it.
  useEffect(() => {
    if (!editing) return undefined;
    setDraft(String(zoomPercent));
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Close the preset menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** Apply the typed value and drop back to the readout. */
  function commitZoom() {
    const parsed = Number.parseInt(draft.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed > 0) onSetZoomPercent(parsed);
    setEditing(false);
  }

  const modeBtn =
    "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer whitespace-nowrap";
  const onCls =
    "bg-primary-500 text-background-50 dark:text-foreground-950 border-primary-500";
  const offCls =
    "bg-background-50 text-foreground-700 border-background-200 hover:bg-background-100";

  return (
    <div className="px-5 py-2 border-b border-background-200 flex items-center gap-2 flex-wrap bg-background-50">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-500 whitespace-nowrap">
        Zoom
      </span>
      <div className="inline-flex items-center">
        <div className="inline-flex items-center rounded-l-md border border-background-200 bg-background-50 overflow-hidden">
          <button
            type="button"
            onClick={() => onStep(-1)}
            disabled={atMin}
            title="Zoom out"
            aria-label="Zoom out"
            className="w-7 h-7 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i className="ri-subtract-line"></i>
          </button>
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitZoom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitZoom();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              inputMode="numeric"
              maxLength={4}
              aria-label="Type an exact zoom percentage"
              title="Type an exact zoom percentage, then press Enter"
              className="w-[52px] h-7 px-1 text-xs font-semibold text-center text-foreground-800 tabular-nums bg-background-50 focus:bg-primary-50 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Click to type an exact zoom percentage"
              className="h-7 min-w-[46px] px-1 text-xs font-semibold text-foreground-800 tabular-nums text-center hover:bg-background-100 cursor-pointer transition-colors"
            >
              {zoomPercent}%
            </button>
          )}
          <button
            type="button"
            onClick={() => onStep(1)}
            disabled={atMax}
            title="Zoom in"
            aria-label="Zoom in"
            className="w-7 h-7 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i className="ri-add-line"></i>
          </button>
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title="Preset zoom levels"
            aria-label="Preset zoom levels"
            className="w-6 h-7 flex items-center justify-center rounded-r-md border border-l-0 border-background-200 text-foreground-600 hover:bg-background-100 hover:text-foreground-950 cursor-pointer transition-colors"
          >
            <i className="ri-arrow-down-s-line"></i>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute left-0 z-30 mt-1.5 min-w-[132px] rounded-md border border-background-300 bg-background-50 py-1"
            >
              <span className="block px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-400">
                Presets
              </span>
              {ZOOM_PRESETS.map((preset) => {
                const percent = Math.round(preset * 100);
                const active = zoomPercent === percent;
                return (
                  <button
                    key={preset}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSetZoomPercent(percent);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? "text-primary-700 bg-primary-50"
                        : "text-foreground-700 hover:bg-background-100"
                    }`}
                  >
                    {percent}%
                    {active && <i className="ri-check-line text-primary-600"></i>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSetMode("page")}
        aria-pressed={mode === "page"}
        title="Scale the entire page into view (press F)"
        className={`${modeBtn} ${mode === "page" ? onCls : offCls}`}
      >
        <i className="ri-aspect-ratio-line"></i>
        Fit page
      </button>
      <button
        type="button"
        onClick={() => onSetMode("width")}
        aria-pressed={mode === "width"}
        title="Scale the page to fit the column width (press F)"
        className={`${modeBtn} ${mode === "width" ? onCls : offCls}`}
      >
        <i className="ri-fullscreen-line"></i>
        Fit width
      </button>
      <button
        type="button"
        onClick={onActualSize}
        aria-pressed={isActualSize}
        title="Show the page at its actual size"
        className={`${modeBtn} ${isActualSize ? onCls : offCls}`}
      >
        <i className="ri-percent-line"></i>
        100%
      </button>
      {trailing}
      {hint && (
        <span className="ml-auto text-[11px] text-foreground-400 hidden sm:inline whitespace-nowrap">
          {hint}
        </span>
      )}
    </div>
  );
}