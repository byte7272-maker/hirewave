/**
 * Drag-to-reorder for sections inside the rendered document iframe.
 *
 * A "section" is a heading element plus every sibling up to the next heading, so
 * dragging a section header moves that whole block. Handles only appear when at
 * least two headings share one parent (the common case for a résumé: Summary,
 * Experience, Education, Skills…), so reordering is always well-defined;
 * otherwise nothing is injected and the viewer behaves exactly as before.
 *
 * This module is DOM-only (no React) and self-contained: it decorates the
 * already-loaded iframe document and reports a completed reorder through
 * `onReorder`, letting the caller persist the reordered text down the same
 * inline-edit path. Nothing is written to the network here.
 */

const GRIP_ATTR = "data-hw-grip";
const RULE_ATTR = "data-hw-reorder-rule";
const STYLE_ID = "hw-reorder-style";
const HEADING_SELECTOR = "h1,h2,h3,h4,[role='heading']";
/** Headings longer than this are almost certainly a paragraph, not a section title. */
const MAX_HEADING_LENGTH = 90;

interface Section {
  heading: HTMLElement;
  /** The heading plus its following siblings — moved together as one block. */
  nodes: HTMLElement[];
}

interface Structure {
  parent: HTMLElement;
  sections: Section[];
  /** Siblings before the first heading (e.g. a name block) — left in place. */
  preamble: HTMLElement[];
}

export interface SectionReorderOptions {
  /** Gate the drag (e.g. return false while an inline edit is in progress). */
  canReorder?: () => boolean;
  /**
   * Called after a drop actually changed the DOM order. It receives the document
   * text as it was *before* the move, so the caller can offer a one-click undo
   * without the user having to switch versions manually.
   */
  onReorder: (beforeText: string) => void;
}

/** Find the reorderable headings + their section blocks, or null when not possible. */
function collect(doc: Document): Structure | null {
  const body = doc.body;
  if (!body) return null;
  const headings = Array.from(
    body.querySelectorAll<HTMLElement>(HEADING_SELECTOR)
  ).filter((h) => {
    const text = (h.textContent ?? "").trim();
    return text.length > 0 && text.length <= MAX_HEADING_LENGTH;
  });
  if (headings.length < 2) return null;
  const parent = headings[0].parentElement;
  if (!parent) return null;
  // Every heading must share one parent, otherwise "reorder" is undefined.
  if (!headings.every((h) => h.parentElement === parent)) return null;
  const children = Array.from(parent.children) as HTMLElement[];
  const sections: Section[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const start = children.indexOf(heading);
    if (start < 0) return null;
    const next = headings[i + 1];
    const end = next ? children.indexOf(next) : children.length;
    sections.push({ heading, nodes: children.slice(start, end) });
  }
  const preamble = children.slice(0, children.indexOf(sections[0].nodes[0]));
  return { parent, sections, preamble };
}

function injectStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
[${GRIP_ATTR}] {
  position: absolute; left: -22px; top: 50%; transform: translateY(-50%);
  width: 18px; height: 18px; display: inline-flex; align-items: center;
  justify-content: center; border-radius: 4px; background: rgba(15,23,42,0.06);
  cursor: grab; opacity: 0; transition: opacity .15s ease, background .15s ease;
  z-index: 2147483000; user-select: none; -webkit-user-select: none;
}
[${GRIP_ATTR}]::before {
  content: ""; width: 10px; height: 10px;
  background-image: linear-gradient(#64748b 1.5px, transparent 1.5px),
    linear-gradient(90deg, #64748b 1.5px, transparent 1.5px);
  background-size: 4px 4px; background-position: 0 0;
}
h1:hover > [${GRIP_ATTR}], h2:hover > [${GRIP_ATTR}],
h3:hover > [${GRIP_ATTR}], h4:hover > [${GRIP_ATTR}],
[role='heading']:hover > [${GRIP_ATTR}] { opacity: 1; }
[${GRIP_ATTR}]:hover { background: rgba(15,23,42,0.14); }
[${GRIP_ATTR}].hw-active { opacity: 1; cursor: grabbing; background: #0f172a; }
[${GRIP_ATTR}].hw-active::before {
  background-image: linear-gradient(#f8fafc 1.5px, transparent 1.5px),
    linear-gradient(90deg, #f8fafc 1.5px, transparent 1.5px);
}
[data-hw-reorder-source] { outline: 2px dashed #f59e0b; outline-offset: 4px; border-radius: 4px; }
[${RULE_ATTR}] {
  position: fixed; height: 3px; left: 8px; right: 8px; border-radius: 3px;
  background: #f59e0b; box-shadow: 0 0 0 3px rgba(245,158,11,0.25);
  z-index: 2147483001; pointer-events: none;
}
`;
  doc.head.appendChild(style);
}

/** Apply a new order by reinserting the section blocks under their shared parent. */
function applyOrder(structure: Structure, from: number, insertAt: number): void {
  const { parent, sections, preamble } = structure;
  const order = sections.map((_, i) => i);
  const [moved] = order.splice(from, 1);
  const adjusted = insertAt > from ? insertAt - 1 : insertAt;
  order.splice(adjusted, 0, moved);

  const anchor = preamble.length ? preamble[preamble.length - 1] : null;
  for (const section of sections) {
    for (const node of section.nodes) {
      if (node.parentElement === parent) parent.removeChild(node);
    }
  }
  const ref: Node | null = anchor ? anchor.nextSibling : parent.firstChild;
  for (const idx of order) {
    for (const node of sections[idx].nodes) parent.insertBefore(node, ref);
  }
}

/**
 * Decorate a loaded iframe document with section drag handles. Returns a cleanup
 * function that removes every handle / listener / injected style it added.
 */
export function enableSectionReorder(
  doc: Document,
  options: SectionReorderOptions
): () => void {
  const win = doc.defaultView;
  const body = doc.body;
  if (!win || !body) return () => {};

  let structure = collect(doc);
  if (!structure) return () => {};

  injectStyle(doc);

  const cleanupFns: Array<() => void> = [];

  structure.sections.forEach((section) => {
    const heading = section.heading;

    // Give the heading a positioning context for the absolutely-placed grip.
    if (win.getComputedStyle(heading).position === "static") {
      const previous = heading.style.position;
      heading.style.position = "relative";
      cleanupFns.push(() => {
        heading.style.position = previous;
      });
    }

    const grip = doc.createElement("span");
    grip.setAttribute(GRIP_ATTR, "");
    grip.setAttribute("contenteditable", "false");
    grip.setAttribute("aria-hidden", "true");
    grip.title = "Drag to reorder this section";
    heading.insertBefore(grip, heading.firstChild);
    cleanupFns.push(() => grip.remove());

    let dragging = false;
    let fromIndex = -1;
    let insertAt = -1;
    let rule: HTMLElement | null = null;

    const boundaryY = (index: number, fallback: number): number => {
      if (!structure) return fallback;
      const secs = structure.sections;
      if (index < secs.length) {
        return secs[index].heading.getBoundingClientRect().top;
      }
      const lastNodes = secs[secs.length - 1].nodes;
      const last = lastNodes[lastNodes.length - 1];
      return last ? last.getBoundingClientRect().bottom : fallback;
    };

    const onMove = (event: PointerEvent) => {
      if (!dragging || !structure) return;
      const tops = structure.sections.map(
        (s) => s.heading.getBoundingClientRect().top
      );
      let next = 0;
      for (const top of tops) if (top < event.clientY) next += 1;
      insertAt = next;
      if (!rule) {
        rule = doc.createElement("div");
        rule.setAttribute(RULE_ATTR, "");
        body.appendChild(rule);
      }
      rule.style.top = `${boundaryY(next, event.clientY)}px`;
    };

    const onUp = () => {
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onUp);
      win.removeEventListener("pointercancel", onUp);
      if (!dragging) return;
      dragging = false;
      grip.classList.remove("hw-active");
      if (rule) {
        rule.remove();
        rule = null;
      }
      const structureNow = structure;
      const landedIndex = insertAt;
      if (
        structureNow &&
        fromIndex >= 0 &&
        landedIndex >= 0 &&
        landedIndex !== fromIndex &&
        landedIndex !== fromIndex + 1
      ) {
        // Capture the pre-move text so a misplaced drag can be undone in one click.
        const beforeText = doc.body?.innerText ?? "";
        applyOrder(structureNow, fromIndex, landedIndex);
        options.onReorder(beforeText);
      }
      fromIndex = -1;
      insertAt = -1;
    };

    const onDown = (event: Event) => {
      const ev = event as PointerEvent;
      if (options.canReorder && !options.canReorder()) return;
      const fresh = collect(doc);
      if (!fresh) return;
      structure = fresh;
      fromIndex = fresh.sections.findIndex((s) => s.heading === heading);
      if (fromIndex < 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      try {
        grip.setPointerCapture(ev.pointerId);
      } catch {
        /* pointer capture is best-effort */
      }
      dragging = true;
      insertAt = fromIndex;
      grip.classList.add("hw-active");
      win.addEventListener("pointermove", onMove);
      win.addEventListener("pointerup", onUp);
      win.addEventListener("pointercancel", onUp);
    };

    grip.addEventListener("pointerdown", onDown);
    cleanupFns.push(() => {
      grip.removeEventListener("pointerdown", onDown);
      win.removeEventListener("pointermove", onMove);
      win.removeEventListener("pointerup", onUp);
      win.removeEventListener("pointercancel", onUp);
      if (rule) rule.remove();
    });
  });

  return () => {
    for (const fn of cleanupFns) {
      try {
        fn();
      } catch {
        /* cleanup must never throw */
      }
    }
    doc.getElementById(STYLE_ID)?.remove();
  };
}