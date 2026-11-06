import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const MARGIN = 12;
const HIDE_DELAY = 140;
const FLIP_THRESHOLD = 150;

interface BubblePos {
  top: number;
  left: number;
  above: boolean;
}

interface DiffSectionsPopoverProps {
  /** The display names of the sections that differ. */
  sections: string[];
  /** Bold heading shown above the list. */
  title: string;
  /** The visible trigger (usually the "N sections changed" chip). */
  children: ReactNode;
  /** Bubble width in px (used for centering + clamping). */
  maxWidth?: number;
}

/**
 * A small hover / focus popover that reveals WHICH sections differ behind a
 * compact "N sections changed" chip. The bubble is portaled to <body> and
 * positioned from the trigger's rect, so it is never clipped by the marquee's
 * overflow. Hover and keyboard focus both reveal it, with a short travel delay
 * so the pointer can reach the bubble.
 */
export default function DiffSectionsPopover({
  sections,
  title,
  children,
  maxWidth = 260,
}: DiffSectionsPopoverProps) {
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
    if (sections.length === 0) return;
    cancelHide();
    place();
    setOpen(true);
  }, [cancelHide, place, sections.length]);

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
        className="inline-flex items-center"
      >
        {children}
      </span>
      {open && pos && sections.length > 0
        ? createPortal(
            <div
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: maxWidth,
                transform: pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
                zIndex: 96,
              }}
              className="animate-tooltip-in rounded-xl bg-foreground-950 px-3.5 py-2.5 text-left ring-1 ring-background-50/10"
            >
              <span
                className={`pointer-events-none absolute left-1/2 w-2.5 h-2.5 -translate-x-1/2 rotate-45 bg-foreground-950 ${
                  pos.above ? "-bottom-1" : "-top-1"
                }`}
                aria-hidden="true"
              ></span>
              <span className="block text-xs font-semibold text-background-50">{title}</span>
              <ul className="mt-1.5 space-y-1">
                {sections.map((name) => (
                  <li
                    key={name}
                    className="flex items-start gap-1.5 text-[11px] leading-relaxed text-background-100"
                  >
                    <i className="ri-arrow-right-s-line text-accent-300 mt-0.5 flex-shrink-0"></i>
                    <span className="break-words">{name}</span>
                  </li>
                ))}
              </ul>
            </div>,
            document.body
          )
        : null}
    </>
  );
}