import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { findMatchSegments } from "@/lib/findReplace";

interface HighlightedTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** The live Find query to highlight. Empty = no highlighting. */
  find: string;
  /** Whether the highlight matches case-sensitively. */
  matchCase: boolean;
  /** Which match is currently focused while stepping (0-based). */
  activeMatch?: number;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  rows?: number;
  placeholder?: string;
  /** Called on select / click / keyup / blur so the editor can remember the caret. */
  onCaret?: () => void;
}

/**
 * The editor's text surface. It renders the usual textarea, plus a transparent
 * "highlight layer" behind it that mirrors the exact text and draws a marker
 * over every occurrence of the live Find query — so as you type into the Find
 * field you can see each match in the document before replacing anything.
 *
 * The layer shares the textarea's font, padding and wrapping, and follows its
 * scroll position, so the highlights stay perfectly aligned with the characters.
 */
export default function HighlightedTextarea({
  value,
  onChange,
  find,
  matchCase,
  activeMatch = 0,
  textareaRef,
  rows = 22,
  placeholder = "Click to add…",
  onCaret,
}: HighlightedTextareaProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  const segments = findMatchSegments(value, find, matchCase);
  const totalMatches = segments.filter((seg) => seg.match).length;
  // Clamp the active index into range so a stale index never mis-highlights.
  const activeIndex = totalMatches
    ? ((activeMatch % totalMatches) + totalMatches) % totalMatches
    : -1;

  /** Keep the highlight layer aligned with the textarea's scroll position. */
  function syncScroll() {
    const ta = textareaRef?.current;
    const bd = backdropRef.current;
    if (!ta || !bd) return;
    bd.scrollTop = ta.scrollTop;
    bd.scrollLeft = ta.scrollLeft;
  }

  // Re-align after every render (a value change can change the scroll height).
  useEffect(syncScroll);

  // Scroll the active match into the middle of the editor as you step through.
  useEffect(() => {
    const ta = textareaRef?.current;
    const bd = backdropRef.current;
    if (!ta || !bd || activeIndex < 0) return;
    const mark = bd.querySelector<HTMLElement>("[data-hw-active]");
    if (mark) {
      const target = mark.offsetTop - ta.clientHeight / 2 + mark.offsetHeight / 2;
      ta.scrollTop = Math.max(0, target);
    }
    syncScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, find, matchCase, value]);

  return (
    <div className="relative rounded-xl border border-dashed border-secondary-300 bg-background-50 transition-colors focus-within:border-solid focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-400">
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-0 px-4 py-4 overflow-hidden whitespace-pre-wrap break-words text-sm leading-relaxed font-body text-transparent pointer-events-none"
      >
        {segments.map((seg, i) => {
          if (!seg.match) return <span key={i}>{seg.text}</span>;
          const index = segments.slice(0, i).filter((s) => s.match).length;
          const isActive = index === activeIndex;
          return (
            <mark
              key={i}
              data-hw-active={isActive ? "true" : undefined}
              className={`rounded-sm text-transparent ${
                isActive ? "bg-accent-500/80 ring-1 ring-accent-600" : "bg-accent-300/70"
              }`}
            >
              {seg.text}
            </mark>
          );
        })}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onSelect={onCaret}
        onBlur={onCaret}
        onKeyUp={onCaret}
        onClick={onCaret}
        rows={rows}
        placeholder={placeholder}
        className="relative w-full px-4 py-4 rounded-xl bg-transparent text-sm text-foreground-900 leading-relaxed font-body cursor-text focus:outline-none resize-y whitespace-pre-wrap break-words"
      />
    </div>
  );
}