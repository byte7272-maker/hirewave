import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GlossaryEntry } from "@/lib/glossary";
import { useGlossary } from "./GlossaryProvider";

interface TermTooltipProps {
  /** The glossary entry that supplies the bubble copy. */
  entry: GlossaryEntry;
  /** The visible text to render as the term link. */
  label: string;
  /**
   * When false the trigger is hover-only (no tabIndex / role / click), so it can
   * safely live inside another interactive element such as a chip button.
   */
  interactive?: boolean;
}

const BUBBLE_WIDTH = 288;
const MARGIN = 12;
const FLIP_THRESHOLD = 170;
const HIDE_DELAY = 160;

interface BubblePos {
  top: number;
  left: number;
  above: boolean;
}

/**
 * Renders a term with a dotted underline; hovering (or focusing) shows a small
 * bubble with a plain-language definition. The bubble is clickable and its
 * "Learn more" opens the glossary side drawer. It is portaled to <body> and
 * positioned from the trigger's rect so it is never clipped by panel overflow.
 */
export default function TermTooltip({
  entry,
  label,
  interactive = true,
}: TermTooltipProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<BubblePos | null>(null);
  const { openTerm } = useGlossary();

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const half = BUBBLE_WIDTH / 2;
    const centered = rect.left + rect.width / 2;
    const left = Math.max(
      half + MARGIN,
      Math.min(window.innerWidth - half - MARGIN, centered)
    );
    const above = rect.top > FLIP_THRESHOLD;
    setPos({
      top: above ? rect.top - 10 : rect.bottom + 10,
      left,
      above,
    });
  }, []);

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

  // Delay the close so the pointer can travel the gap from the term onto the bubble.
  const hide = useCallback(() => {
    cancelHide();
    hideTimer.current = window.setTimeout(() => setOpen(false), HIDE_DELAY);
  }, [cancelHide]);

  const openDrawer = useCallback(() => {
    cancelHide();
    setOpen(false);
    openTerm(entry);
  }, [cancelHide, openTerm, entry]);

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
        onFocus={interactive ? show : undefined}
        onBlur={interactive ? hide : undefined}
        onClick={interactive ? openDrawer : undefined}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? "button" : undefined}
        aria-label={interactive ? `${entry.term}: ${entry.short}` : undefined}
        className="underline decoration-dotted decoration-from-font underline-offset-2 cursor-help"
      >
        {label}
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
                width: BUBBLE_WIDTH,
                transform: pos.above ? "translate(-50%, -100%)" : "translate(-50%, 0)",
                zIndex: 95,
              }}
              className="animate-tooltip-in rounded-xl bg-foreground-950 px-3.5 py-2.5 text-left"
            >
              <span className="block text-xs font-semibold text-background-50">
                {entry.term}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-background-100">
                {entry.short}
              </span>
              <button
                type="button"
                onClick={openDrawer}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-300 hover:text-accent-200 cursor-pointer whitespace-nowrap"
              >
                Learn more
                <i className="ri-arrow-right-line"></i>
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}