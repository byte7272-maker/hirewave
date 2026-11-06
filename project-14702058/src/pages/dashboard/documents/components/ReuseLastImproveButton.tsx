import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface LastImproveCombo {
  prompts: string[];
  instruction: string;
  findings: string[];
}

interface ReuseLastImproveButtonProps {
  /** The exact combo captured from the previous improve run. */
  lastImprove: LastImproveCombo;
  /** True while a rewrite is in flight — the button is disabled. */
  revising: boolean;
  /**
   * The review findings currently offered on the page. Only findings that still
   * exist are reused, so the tooltip tells the truth about what will re-run.
   */
  availableFindings: string[];
  /** Launch the reuse with the resolved combo. */
  onReuse: (prompts: string[], instruction: string, findings: string[]) => void;
  /**
   * Re-run a single improvement when its chip is tapped in the card. When this
   * is omitted the chips render as read-only labels.
   */
  onReuseOne?: (prompt: string) => void;
}

const CARD_WIDTH = 300;
const MARGIN = 12;
const HIDE_DELAY = 160;

interface CardPos {
  top: number;
  left: number;
}

/**
 * The one-click "Reuse last improve" action. Hovering (or focusing) it opens a
 * small card that spells out exactly what will be re-applied — the chips, the
 * custom instruction, and the review findings — instead of a plain browser
 * tooltip. The card is portaled to <body> so panel overflow can never clip it.
 */
export default function ReuseLastImproveButton({
  lastImprove,
  revising,
  availableFindings,
  onReuse,
  onReuseOne,
}: ReuseLastImproveButtonProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CardPos | null>(null);

  const reuseFindings = lastImprove.findings.filter((f) => availableFindings.includes(f));
  const instruction = lastImprove.instruction.trim();
  const promptCount = lastImprove.prompts.length;

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const left = Math.max(
      MARGIN,
      Math.min(window.innerWidth - CARD_WIDTH - MARGIN, rect.right - CARD_WIDTH)
    );
    setPos({ top: rect.bottom + 8, left });
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

  function handleClick() {
    if (revising) return;
    setOpen(false);
    onReuse(lastImprove.prompts, instruction, reuseFindings);
  }

  function handleChip(prompt: string) {
    if (revising || !onReuseOne) return;
    setOpen(false);
    onReuseOne(prompt);
  }

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="inline-flex"
      >
        <button
          type="button"
          onClick={handleClick}
          disabled={revising}
          aria-label="Reuse the combo from your last improve run"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-primary-500 hover:bg-primary-600 border border-primary-500 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
        >
          <i className="ri-repeat-line"></i>
          Reuse last improve
        </button>
      </span>
      {open && pos
        ? createPortal(
            <div
              role="tooltip"
              onMouseEnter={cancelHide}
              onMouseLeave={hide}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: CARD_WIDTH,
                zIndex: 95,
              }}
              className="animate-tooltip-in rounded-xl bg-foreground-950 px-3.5 py-3 text-left"
            >
              <span className="block text-xs font-semibold text-background-50">
                Reuse last improve
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-background-300">
                Re-runs the exact combo from your last improvement.
              </span>

              {promptCount > 0 && (
                <span className="mt-2.5 block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-background-400">
                    Improvements &middot; {promptCount}
                  </span>
                  {onReuseOne && (
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-background-300">
                      Tap one to re-run just that improvement.
                    </span>
                  )}
                  <span className="mt-1 flex flex-wrap gap-1">
                    {lastImprove.prompts.map((p) =>
                      onReuseOne ? (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleChip(p)}
                          className="inline-flex items-center gap-1 rounded-full bg-background-50/15 hover:bg-background-50/25 px-2 py-0.5 text-[11px] leading-tight text-background-50 whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <i className="ri-play-mini-line"></i>
                          {p}
                        </button>
                      ) : (
                        <span
                          key={p}
                          className="inline-flex items-center rounded-full bg-background-50/15 px-2 py-0.5 text-[11px] leading-tight text-background-50 whitespace-nowrap"
                        >
                          {p}
                        </span>
                      )
                    )}
                  </span>
                </span>
              )}

              {instruction && (
                <span className="mt-2.5 block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-background-400">
                    Instruction
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-background-100">
                    &ldquo;{instruction}&rdquo;
                  </span>
                </span>
              )}

              {reuseFindings.length > 0 && (
                <span className="mt-2.5 block text-[11px] leading-relaxed text-background-200">
                  + {reuseFindings.length} review{" "}
                  {reuseFindings.length === 1 ? "finding" : "findings"} re-targeted
                </span>
              )}

              {promptCount === 0 && !instruction && reuseFindings.length === 0 && (
                <span className="mt-2.5 block text-[11px] leading-relaxed text-background-200">
                  This re-runs a general improve pass — no chips or instruction were set.
                </span>
              )}
            </div>,
            document.body
          )
        : null}
    </>
  );
}