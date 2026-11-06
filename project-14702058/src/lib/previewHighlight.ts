import { escapeRegExp } from "@/lib/findReplace";

/**
 * Live Find highlighting INSIDE the rendered document preview (the iframe), so
 * matches are visible on the formatted page — not just in the editor text box.
 *
 * It uses the CSS Custom Highlight API, which paints highlights over text ranges
 * WITHOUT mutating the document DOM. That matters here because the preview also
 * hosts inline editing and drag-to-reorder: wrapping text nodes in `<mark>` would
 * corrupt those features, but a highlight registry never touches the nodes.
 * When the browser doesn't support the API, the helpers simply no-op.
 */

const STYLE_ID = "hw-find-highlight-style";
const REGISTRY_ALL = "hw-find-all";
const REGISTRY_ACTIVE = "hw-find-active";

type HighlightCtor = new (...ranges: Range[]) => unknown;

interface HighlightSupport {
  highlights: {
    set(name: string, value: unknown): void;
    delete(name: string): void;
  };
  Highlight: HighlightCtor;
}

/** The iframe document's highlight registry, or null when unsupported. */
function getSupport(doc: Document): HighlightSupport | null {
  const win = doc.defaultView as
    | (Window & {
        CSS?: { highlights?: HighlightSupport["highlights"] };
        Highlight?: HighlightCtor;
      })
    | null;
  if (!win || !win.CSS || !win.CSS.highlights || typeof win.Highlight !== "function") {
    return null;
  }
  return { highlights: win.CSS.highlights, Highlight: win.Highlight };
}

/** Make sure the highlight colors live in the iframe's own stylesheet. */
function injectStyle(doc: Document, allColor: string, activeColor: string): void {
  if (!doc.head) return;
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = STYLE_ID;
    doc.head.appendChild(style);
  }
  style.textContent =
    `::highlight(${REGISTRY_ALL}){background-color:${allColor};color:inherit;}` +
    `::highlight(${REGISTRY_ACTIVE}){background-color:${activeColor};color:inherit;}`;
}

/**
 * Walk the rendered document's text nodes and build a Range for every literal
 * occurrence of `find`. Matches that span multiple nodes are intentionally
 * skipped (a résumé rarely splits a word across tags, and ranges must stay
 * within a single text node).
 */
export function collectMatchRanges(
  root: Node,
  find: string,
  caseSensitive: boolean
): Range[] {
  const ranges: Range[] = [];
  if (!find || !root) return ranges;
  const doc = root.ownerDocument;
  if (!doc) return ranges;
  const re = new RegExp(escapeRegExp(find), caseSensitive ? "g" : "gi");
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        return NodeFilter.FILTER_REJECT;
      }
      return (node as Text).data.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.data;
    re.lastIndex = 0;
    let m = re.exec(text);
    while (m !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
      } else {
        const range = doc.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        ranges.push(range);
      }
      m = re.exec(text);
    }
    node = walker.nextNode() as Text | null;
  }
  return ranges;
}

/**
 * Paint every match, emphasise the active one, and hand the ranges back so the
 * caller can scroll the active match into view. Passing an empty `find` clears
 * the highlights. Returns [] when the browser can't do highlight ranges.
 */
export function applyPreviewHighlights(
  doc: Document,
  find: string,
  caseSensitive: boolean,
  activeIndex: number,
  allColor: string,
  activeColor: string
): Range[] {
  const support = getSupport(doc);
  if (!support) return [];
  if (!find.trim()) {
    support.highlights.delete(REGISTRY_ALL);
    support.highlights.delete(REGISTRY_ACTIVE);
    return [];
  }
  injectStyle(doc, allColor, activeColor);
  const ranges = collectMatchRanges(doc.body, find, caseSensitive);
  support.highlights.set(REGISTRY_ALL, new support.Highlight(...ranges));
  if (ranges.length) {
    const idx = ((activeIndex % ranges.length) + ranges.length) % ranges.length;
    support.highlights.set(REGISTRY_ACTIVE, new support.Highlight(ranges[idx]));
  } else {
    support.highlights.delete(REGISTRY_ACTIVE);
  }
  return ranges;
}

/** Remove the live Find highlights from the rendered page. */
export function clearPreviewHighlights(doc: Document): void {
  const support = getSupport(doc);
  if (!support) return;
  support.highlights.delete(REGISTRY_ALL);
  support.highlights.delete(REGISTRY_ACTIVE);
}