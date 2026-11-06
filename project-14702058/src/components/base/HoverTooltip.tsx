import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

const MARGIN = 12;
const FLIP_THRESHOLD = 120;
const HIDE_DELAY = 120;

interface BubblePos {
  top: number;
  left: number;
  above: boolean;
}

interface HoverTooltipProps {
  /** The full text revealed inside the bubble. */
  label: string;
  /** Optional bold heading shown above the text. */
  title?: string;
  /** Bubble width in px (used for centering + clamping). */
  maxWidth?: number;
  /** Optional one-click action rendered inside the bubble (e.g. "Re-run this instruction"). */
  actionLabel?: string;
  /** Remix icon class for the action button. */
  actionIcon?: string;
  /** Handler for the action button — the bubble closes after it fires. */
  onAction?: () => void;
  /** The visible trigger content. */
  children: ReactNode;
}

/**
 * A lightweight hover/focus tooltip that shows text too long to display inline
 * (e.g. a truncated instruction). The bubble is portaled to <body> and
 * positioned from the trigger's rect, so it is never clipped by panel overflow.
 * Hover and keyboard focus both reveal it.
 */
export default function HoverTooltip({
  label,
  title,
  maxWidth = 340,
  actionLabel,
  actionIcon = "ri-restart-line",
  onAction,
  children,
}: HoverTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<BubblePos | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const half = maxWidth / 2;
    const centered = rect.left + rect.width / 2;
    const left = Math.max(
      half + MARGIN,
      Math.min(window.innerWidth - half - MARGIN, centered)
    );
    const above = rect.top > FLIP_THRESHOLD;
    setPos({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left,
      above,
    });
  }, [maxWidth]);

  const cancelHide = useCallback(() => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    cancelHide();
    place();
    setOpen(true);
  }, [cancelHide, place]);

  // Small delay so the pointer can travel the gap onto the bubble.
  const hide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY);
  }, [cancelHide]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => place();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        className="inline-flex items-center outline-none"
      >
        {children}
      </span>
      {open && pos
        ? createPortal(
            <div
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: maxWidth,
                transform: pos.above
                  ? "translate(-50%, -100%)"
                  : "translate(-50%, 0)",
                zIndex: 95,
              }}
              className="animate-tooltip-in rounded-xl bg-foreground-950 px-3.5 py-2.5 text-left ring-1 ring-background-50/10"
            >
              <span
                className={`pointer-events-none absolute left-1/2 w-2.5 h-2.5 -translate-x-1/2 rotate-45 bg-foreground-950 ${
                  pos.above ? "-bottom-1" : "-top-1"
                }`}
                aria-hidden="true"
              ></span>
              {title && (
                <span className="block text-xs font-semibold text-background-50">
                  {title}
                </span>
              )}
              <span
                className={`block text-xs leading-relaxed text-background-100 whitespace-pre-wrap break-words ${
                  title ? "mt-1" : ""
                }`}
              >
                {label}
              </span>
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={() => {
                    cancelHide();
                    setOpen(false);
                    onAction();
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-accent-300 hover:text-accent-200 cursor-pointer whitespace-nowrap"
                >
                  <i className={actionIcon}></i>
                  {actionLabel}
                </button>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}