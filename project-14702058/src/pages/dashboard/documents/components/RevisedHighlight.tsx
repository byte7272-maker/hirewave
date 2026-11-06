import { useEffect, useRef, type ReactNode } from "react";
import { escapeRegExp } from "@/pages/dashboard/documents/templates/metricFlags";

/** Class applied to each highlighted passage (styled in `index.css`). */
const MARK_CLASS = "hw-revision-mark";

/** Remove every highlight wrapper this component added, restoring plain text. */
function unwrapMarks(root: HTMLElement): void {
  root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

interface RevisedHighlightProps {
  /** When false the content renders untouched (the "normal view"). */
  enabled: boolean;
  /** Passages the AI revised — matched against the rendered text and highlighted. */
  terms: string[];
  children: ReactNode;
}

/**
 * Highlights the passages an AI revision changed, wherever they land in the
 * rendered result.
 *
 * The improvement renders through whichever template the document uses, and the
 * templates don't know about diffs — so rather than thread a "changed field" flag
 * through all of them, this walks the rendered text nodes and wraps exact matches
 * of the revised wording. That keeps it generic: résumés, cover letters and every
 * template get the same highlight with nothing to change in the layout code.
 *
 * The wrapper is disabled the moment `enabled` is false (or the terms change),
 * unwinding every mark so the "normal view" is byte-for-byte the original render.
 */
export default function RevisedHighlight({
  enabled,
  terms,
  children,
}: RevisedHighlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const termsKey = terms.join("\u0001");

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    unwrapMarks(root);
    if (!enabled) return;

    const clean = Array.from(
      new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 4))
    ).sort((a, b) => b.length - a.length);
    if (clean.length === 0) return;

    const pattern = new RegExp(`(${clean.map(escapeRegExp).join("|")})`, "g");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const matches: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      const text = node as Text;
      const value = text.nodeValue ?? "";
      // Reset from any previous `test` before reusing the global regex.
      pattern.lastIndex = 0;
      if (value.length >= 4 && pattern.test(value)) matches.push(text);
      node = walker.nextNode();
    }

    for (const textNode of matches) {
      const value = textNode.nodeValue ?? "";
      pattern.lastIndex = 0;
      const parts = value.split(pattern);
      if (parts.length <= 1) continue;
      const fragment = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (clean.includes(part)) {
          const mark = document.createElement("mark");
          mark.className = MARK_CLASS;
          mark.textContent = part;
          fragment.appendChild(mark);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      }
      textNode.parentNode?.replaceChild(fragment, textNode);
    }

    return () => unwrapMarks(root);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, termsKey]);

  return <div ref={ref}>{children}</div>;
}