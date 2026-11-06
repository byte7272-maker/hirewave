import {
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { tagSectionsInElement, type SectionStyle } from "@/lib/sectionStyles";

interface SectionStyleScopeProps {
  /** The per-section bold / italic overrides to apply inside this subtree. */
  styles: Record<string, SectionStyle>;
  children: ReactNode;
}

/** Scoped, `!important` CSS that overrides a template's inline font weights. */
function scopedCss(
  scopeId: string,
  styles: Record<string, SectionStyle>
): string {
  const rules: string[] = [];
  for (const [key, style] of Object.entries(styles)) {
    const sel = `#${scopeId} [data-hw-section="${key}"]`;
    if (!style.bold) {
      rules.push(`${sel},${sel} *{font-weight:400 !important;}`);
    }
    if (style.italic) {
      rules.push(`${sel},${sel} *{font-style:italic !important;}`);
    }
  }
  return rules.join("\n");
}

/**
 * Apply the per-section bold / italic overrides to a CLIENT-RENDERED theme paper
 * (a template component, not an iframe). The template sets its font weights with
 * inline styles, so this:
 *
 *  1. reads each section's name FROM ITS HEADING and adds the same
 *     `data-hw-section` markers the HTML injector writes (reusing
 *     {@link tagSectionsInElement}), then
 *  2. injects a scoped, `!important` stylesheet — an author `!important`
 *     declaration wins over a normal inline style — so the section repaints.
 *
 * This is what makes the Templates tab's "Live preview" honor the section bold /
 * italic setting, exactly like the main (server-rendered) preview does. Tagging
 * re-runs after every render and on DOM mutations, so a re-rendered theme (e.g.
 * after a bullet edit) keeps its markers. The wrapper uses `display: contents`,
 * so it never affects the paper's layout.
 */
export default function SectionStyleScope({
  styles,
  children,
}: SectionStyleScopeProps) {
  const rawId = useId();
  const scopeId = useMemo(
    () => `hw-section-scope-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );
  const ref = useRef<HTMLDivElement>(null);
  const css = useMemo(() => scopedCss(scopeId, styles), [scopeId, styles]);
  const hasRules = css.length > 0;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasRules) return undefined;
    const tag = () => tagSectionsInElement(el, styles);
    tag();
    // Only structural changes matter (we add attributes, not children), so
    // observing childList avoids a feedback loop while still catching a re-render
    // that swaps in new nodes without tags.
    const observer = new MutationObserver(() => tag());
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [css, hasRules, styles]);

  if (!hasRules) return <>{children}</>;

  return (
    <div
      id={scopeId}
      ref={ref}
      style={{ display: "contents" }}
    >
      <style>{css}</style>
      {children}
    </div>
  );
}