/**
 * Spotlight one SECTION of a rendered document preview, inside the preview's own
 * document (the scaled `srcDoc` iframe the document viewer paints).
 *
 * The workspace viewer shows the whole page shrunk into a small frame, so "jump
 * to a section" is expressed as a visual spotlight — a marked heading band —
 * rather than a scroll (the shrunk frame has no scrollbar of its own). The mark
 * is applied directly to the iframe's DOM: these preview surfaces are read-only
 * (they never host inline editing), and the iframe reloads from `srcDoc` on any
 * real content change, so a stray style can never survive into a stale paint.
 *
 * Matching is by heading text: `## Experience` in the markdown becomes an <h2> in
 * the rendered page, so the section name a review card carries ("Experience",
 * "Summary", …) lines up with the heading it points at. Matching is deliberately
 * forgiving — an exact heading match first, then a case-insensitive "contains" —
 * so a section the API names slightly differently still lands somewhere sensible.
 */

const SPOTLIGHT_ATTR = "data-hw-section-spotlight";
const SPOTLIGHT_STYLE_ID = "hw-section-spotlight-style";

/** Inject the spotlight styling into the preview document once (idempotent). */
function ensureSpotlightStyle(doc: Document): void {
  if (!doc.head || doc.getElementById(SPOTLIGHT_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = SPOTLIGHT_STYLE_ID;
  style.textContent =
    `@keyframes hwSectionSpot{0%,100%{background-color:#fde68a;}50%{background-color:#fcd34d;}}` +
    `[${SPOTLIGHT_ATTR}]{background-color:#fde68a;box-shadow:inset 4px 0 0 #d97706;` +
    `border-radius:3px;padding-left:6px;animation:hwSectionSpot 1.6s ease-in-out 2;}`;
  doc.head.appendChild(style);
}

/** Remove any section spotlight currently painted on the preview document. */
export function clearSectionSpotlight(doc: Document | null | undefined): void {
  if (!doc) return;
  doc.querySelectorAll(`[${SPOTLIGHT_ATTR}]`).forEach((el) => {
    el.removeAttribute(SPOTLIGHT_ATTR);
  });
}

/**
 * Spotlight the section whose heading text matches `section`. Returns true when a
 * heading was found (and marked), false otherwise — so a caller can tell whether
 * the section actually exists in the rendered page.
 */
export function applySectionSpotlight(
  doc: Document | null | undefined,
  section: string
): boolean {
  if (!doc || !section || !section.trim()) return false;
  const wanted = section.trim().toLowerCase();
  const heads = Array.from(
    doc.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")
  );
  const heading =
    heads.find((h) => (h.textContent ?? "").trim().toLowerCase() === wanted) ??
    heads.find((h) => (h.textContent ?? "").trim().toLowerCase().includes(wanted));
  if (!heading) return false;
  ensureSpotlightStyle(doc);
  heading.setAttribute(SPOTLIGHT_ATTR, "");
  // Best-effort: nudge the heading toward the middle of the frame when the
  // preview hosts its own scroller (the full-size reader). A shrunk thumb simply
  // ignores this.
  try {
    heading.scrollIntoView({ block: "center" });
  } catch {
    /* scrollIntoView is best-effort */
  }
  return true;
}