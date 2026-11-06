import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";

interface PaneResizerProps {
  /** The document pane whose width is being adjusted. */
  targetRef: RefObject<HTMLElement | null>;
  /** Called continuously during the drag with the new pane width in px. */
  onResize: (width: number) => void;
  /** Snap back to the balanced "Fit" split (used on double-click). */
  onReset?: () => void;
  /** Render nothing interactive (e.g. when the document pane is collapsed). */
  disabled?: boolean;
  /** How many px Alt + Left/Right nudges the split by. */
  step?: number;
}

/**
 * A draggable gutter between the document pane and the controls column that
 * resizes the split. It sits outside the document pane's own scroll container,
 * so it stays grabbable no matter how tall the document is, and it works in
 * both Preview and Edit modes.
 *
 * Extras: double-click snaps back to the balanced "Fit" split, Alt + Left/Right
 * nudges the split for keyboard users, and a small live readout shows the pane's
 * share of the row while you drag.
 */
export default function PaneResizer({
  targetRef,
  onResize,
  onReset,
  disabled = false,
  step = 48,
}: PaneResizerProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  /** Live share of the row the document pane occupies, shown while dragging. */
  const [livePct, setLivePct] = useState<number | null>(null);

  /** Width of the row that holds both panes (the pane's flex parent). */
  const rowWidth = useCallback(
    () => targetRef.current?.parentElement?.offsetWidth ?? 0,
    [targetRef]
  );

  const handleMove = useCallback(
    (e: MouseEvent) => {
      if (!drag.current) return;
      const { startX, startWidth } = drag.current;
      const raw = startWidth + (e.clientX - startX);
      onResize(raw);
      const cw = rowWidth();
      if (cw > 0) {
        const clamped = Math.min(cw, Math.max(0, raw));
        setLivePct(Math.round((clamped / cw) * 100));
      }
    },
    [onResize, rowWidth]
  );

  const handleUp = useCallback(() => {
    drag.current = null;
    setLivePct(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  }, [handleMove]);

  function handleDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    const startWidth = targetRef.current?.offsetWidth ?? 0;
    drag.current = { startX: e.clientX, startWidth };
    const cw = rowWidth();
    if (cw > 0) setLivePct(Math.round((startWidth / cw) * 100));
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function handleDoubleClick() {
    if (disabled) return;
    onReset?.();
  }

  // Alt + Left/Right nudges the split by a fixed step for keyboard users.
  useEffect(() => {
    if (disabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const current = targetRef.current?.offsetWidth ?? 0;
      if (!current) return;
      event.preventDefault();
      onResize(current + (event.key === "ArrowRight" ? step : -step));
      const cw = rowWidth();
      if (cw > 0) {
        const target = current + (event.key === "ArrowRight" ? step : -step);
        const clamped = Math.min(cw, Math.max(0, target));
        setLivePct(Math.round((clamped / cw) * 100));
        window.setTimeout(() => setLivePct(null), 900);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onResize, rowWidth, step, targetRef]);

  return (
    <div
      onMouseDown={handleDown}
      onDoubleClick={handleDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize document pane"
      aria-disabled={disabled}
      title="Drag to resize · double-click to reset to Fit · or use the pane presets in the header"
      className="relative hidden lg:flex flex-shrink-0 self-stretch items-center justify-center w-3 -mx-4 min-h-[240px] cursor-col-resize group select-none"
    >
      <span className="w-0.5 h-full rounded-full bg-background-200 group-hover:bg-accent-400 group-active:bg-accent-500 transition-colors" />
      <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-12 rounded-full bg-background-50 border border-background-200 group-hover:border-accent-400 group-hover:bg-accent-100 flex items-center justify-center transition-colors">
        <i className="ri-drag-move-2-line text-foreground-400 group-hover:text-accent-700 text-sm"></i>
      </span>

      {livePct !== null && (
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 mt-10 px-2 py-1 rounded-md bg-foreground-950 text-background-50 text-[11px] font-semibold tabular-nums whitespace-nowrap pointer-events-none z-10 animate-fade-in-up">
          {livePct}%
        </span>
      )}
    </div>
  );
}