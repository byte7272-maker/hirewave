import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { PreviewChange, PreviewSegment } from "@/lib/diffHighlight";

interface PreviewDiffBodyProps {
  segments: PreviewSegment[];
  changes: PreviewChange[];
  /** Ids of changes the user has reverted (not accepted). */
  discarded: ReadonlySet<number>;
  onToggle: (id: number) => void;
  /** Called when the user clicks a change's text (used to mark it reviewed). */
  onFocusChange?: (id: number) => void;
  /** A change id to scroll into view (external "review next" navigation). */
  jumpTarget?: number | null;
  className?: string;
}

/**
 * Center a change inside its nearest scroll pane without yanking the whole page.
 * The scrollable element is marked with `data-preview-scroll`.
 */
function scrollChangeIntoView(el: HTMLElement) {
  const container = el.closest<HTMLElement>("[data-preview-scroll]");
  if (!container) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const containerRect = container.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const offset = elRect.top - containerRect.top;
  const target =
    container.scrollTop + offset - (container.clientHeight - elRect.height) / 2;
  container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
}

/**
 * Renders a preview as flowing text where every change is a small, inline
 * keep/revert toggle. Kept changes show the new words highlighted; reverted
 * changes fall back to the original wording (struck through) or, for a pure
 * insertion, a quiet "reverted" marker — so the sentence still reads naturally.
 *
 * The change text itself is also clickable: clicking it focuses (centers) the
 * change in the pane so a long diff can be scanned change by change.
 */
export default function PreviewDiffBody({
  segments,
  changes,
  discarded,
  onToggle,
  onFocusChange,
  jumpTarget = null,
  className = "",
}: PreviewDiffBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (jumpTarget === null || jumpTarget === undefined) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(
      `[data-change-id="${jumpTarget}"]`
    );
    if (el) scrollChangeIntoView(el);
  }, [jumpTarget]);

  return (
    <div ref={bodyRef} data-preview-scroll="" className={className}>
      {segments.map((seg, index) => {
        if (seg.kind === "equal") {
          return <span key={index}>{seg.text}</span>;
        }
        const change = changes[seg.changeId];
        if (!change) return null;
        return (
          <ChangeSpan
            key={index}
            change={change}
            discarded={discarded.has(change.id)}
            onToggle={onToggle}
            onFocusChange={onFocusChange}
          />
        );
      })}
    </div>
  );
}

interface ChangeSpanProps {
  change: PreviewChange;
  discarded: boolean;
  onToggle: (id: number) => void;
  onFocusChange?: (id: number) => void;
}

function ChangeSpan({ change, discarded, onToggle, onFocusChange }: ChangeSpanProps) {
  function handleFocus(event: ReactMouseEvent<HTMLSpanElement>) {
    scrollChangeIntoView(event.currentTarget);
    onFocusChange?.(change.id);
  }

  return (
    <span data-change-id={change.id} className="inline">
      {discarded ? (
        change.originalText ? (
          <span
            onClick={handleFocus}
            title="Click to focus this change"
            className="bg-background-200/70 text-foreground-500 rounded-sm px-0.5 line-through decoration-foreground-400/70 cursor-pointer"
          >
            {change.originalText}
          </span>
        ) : (
          <span
            onClick={handleFocus}
            title="Click to focus this change"
            className="align-middle text-[10px] font-medium text-foreground-400 italic cursor-pointer"
          >
            (reverted)
          </span>
        )
      ) : (
        <mark
          onClick={handleFocus}
          title="Click to focus this change"
          className="bg-accent-200 text-accent-900 rounded-sm px-0.5 cursor-pointer"
        >
          {change.previewText}
        </mark>
      )}
      <button
        type="button"
        onClick={() => onToggle(change.id)}
        title={discarded ? "Keep this change" : "Discard this change"}
        aria-label={discarded ? "Keep this change" : "Discard this change"}
        aria-pressed={!discarded}
        className={`ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full border align-middle cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary-400 ${
          discarded
            ? "border-primary-300 bg-primary-100 text-primary-700 hover:bg-primary-200"
            : "border-background-300 bg-background-50 text-foreground-500 hover:bg-background-100 hover:text-accent-700"
        }`}
      >
        <i className={`text-[10px] ${discarded ? "ri-add-line" : "ri-close-line"}`}></i>
      </button>
    </span>
  );
}