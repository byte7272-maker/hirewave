/**
 * Render a saved version's FULL raw text (canonical markdown) straight to styled
 * HTML.
 *
 * A version preview must show the résumé even when the structured `data` is
 * sparse — a plainly-formatted or docx-extracted résumé yields almost no
 * structured fields, but its raw text is always present. So instead of
 * reconstructing a JSON Resume and filling a theme with it, the previews paint
 * the markdown text itself, styled with the template's font family, accent color
 * and heading treatment. Nothing is ever blank when the backend returns content.
 *
 * It is deliberately forgiving: real markdown (`#`/`##`/`###`, `-` bullets,
 * `**bold**`, links) renders as intended, and text that carries no markdown
 * structure at all is shown as-is with its line breaks preserved (`pre-wrap`).
 */

import { sectionKeyForHeading } from "@/lib/sectionStyles";

/** The paper ink, shared with the theme renderers so text reads identically. */
const INK = "#111827";

/** A template's heading treatment — mirrors the resume-template catalog. */
export type VersionHeadingStyle = "underline" | "bar" | "plain" | "caps";

/** The style a markdown-preview paper is drawn with. */
export interface VersionDocStyle {
  /** Full font-family stack (from the saved font choice). */
  fontStack: string;
  /** Primary accent color (rules, letterspaced labels, links). */
  accent: string;
  /** Very light accent tint (inline code background). */
  accentSoft: string;
  /** Darker accent for accent text on the light tint. */
  accentDark: string;
  /** How section headings (`## …`) are treated. */
  headingStyle: VersionHeadingStyle;
}

/**
 * Each built-in layout's heading treatment, matching the template catalog. An
 * unknown id falls back to the Modern underline — the same default the theme
 * registry uses — so a preview never renders unstyled.
 */
export const HEADING_STYLE_BY_THEME: Record<string, VersionHeadingStyle> = {
  modern: "underline",
  minimal: "plain",
  sidebar: "bar",
  timeline: "bar",
  classic: "caps",
  elegant: "caps",
};

/** Resolve a heading treatment for a template id. */
export function resolveHeadingStyle(themeId: string): VersionHeadingStyle {
  return HEADING_STYLE_BY_THEME[themeId] ?? "underline";
}

/** Escape a string for safe insertion into HTML text / attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Apply inline markdown (links, bold, italic, inline code) to escaped text. */
function inline(raw: string): string {
  let out = escapeHtml(raw);
  // Links first, so their label/url aren't mistaken for emphasis.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  // Bold (**text** or __text__).
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  // Italic (*text* or _text_), without eating bold markers.
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");
  // Inline code (`text`).
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

/** True when the text carries markdown structure worth parsing. */
export function isMarkdown(text: string): boolean {
  return (
    /^\s{0,3}#{1,6}\s/m.test(text) ||
    /^\s*[-*+]\s+\S/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /\[[^\]]+\]\([^)]+\)/.test(text)
  );
}

/**
 * Convert a version's raw text to HTML. Markdown is parsed into semantic tags;
 * plain text (no markdown structure) is emitted verbatim inside a `pre-wrap`
 * block so its line breaks survive. Returns "" only for genuinely empty input.
 */
export function markdownToHtml(markdown: string): string {
  const text = (markdown ?? "").replace(/\r\n/g, "\n");
  if (!text.trim()) return "";
  // Plain text (e.g. text extracted from a PDF/DOCX): keep the line breaks.
  if (!isMarkdown(text)) {
    return `<div class="vd-plain">${escapeHtml(text.trim())}</div>`;
  }

  const out: string[] = [];
  let para: string[] = [];
  let listOpen = false;
  // True while a `## …` section's <section data-hw-section> wrapper is open.
  let sectionOpen = false;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const closeList = () => {
    if (listOpen) {
      out.push("</ul>");
      listOpen = false;
    }
  };
  const openList = () => {
    if (!listOpen) {
      out.push("<ul>");
      listOpen = true;
    }
  };
  const openSection = (key: string) => {
    flushPara();
    closeList();
    out.push(`<section data-hw-section="${key}">`);
    sectionOpen = true;
  };
  const closeSection = () => {
    if (!sectionOpen) return;
    flushPara();
    closeList();
    out.push("</section>");
    sectionOpen = false;
  };

  for (const raw of text.split("\n")) {
    const trimmed = raw.replace(/\s+$/, "").trim();
    if (!trimmed) {
      flushPara();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1].length;
      const label = heading[2];
      // A `##` heading opens an addressable section (wrapped so a per-section
      // bold / italic override can be scoped to it). `#` (the name) stays bare.
      if (level <= 2) closeSection();
      const headingHtml = `<h${level}>${inline(label)}</h${level}>`;
      if (level === 2) {
        openSection(sectionKeyForHeading(label));
        out.push(headingHtml);
      } else {
        out.push(headingHtml);
      }
      continue;
    }

    if (/^([-*_])\1{2,}$/.test(trimmed)) {
      flushPara();
      closeList();
      out.push("<hr />");
      continue;
    }

    const bullet = /^([-*+])\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara();
      openList();
      out.push(`<li>${inline(bullet[2])}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (numbered) {
      flushPara();
      openList();
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    // Anything else is paragraph copy — close any open list, then accumulate.
    flushPara();
    closeList();
    para.push(trimmed);
  }

  closeSection();
  flushPara();
  closeList();
  return out.join("\n");
}

/** The scoped CSS that styles the rendered markdown with the template's look. */
export function buildDocumentCss(scope: string, style: VersionDocStyle): string {
  const s = `.${scope}`;
  const heading = (() => {
    switch (style.headingStyle) {
      case "bar":
        return `${s} h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:${INK};border-left:4px solid ${style.accent};padding-left:9px;margin:24px 0 10px;}`;
      case "plain":
        return `${s} h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:${style.accent};margin:24px 0 10px;}`;
      case "caps":
        return `${s} h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.16em;color:${INK};border-bottom:1px solid ${style.accent};padding-bottom:5px;margin:24px 0 10px;}`;
      default:
        return `${s} h2{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${INK};border-bottom:2px solid ${style.accent};padding-bottom:6px;margin:24px 0 12px;}`;
    }
  })();

  return [
    `${s}{color:${INK};}`,
    `${s} h1{font-size:30px;font-weight:800;letter-spacing:-0.01em;line-height:1.15;color:${INK};margin:0 0 4px;}`,
    heading,
    `${s} h3{font-size:13.5px;font-weight:700;color:${INK};margin:16px 0 4px;}`,
    `${s} p{font-size:13px;line-height:1.65;color:${INK};margin:0 0 9px;}`,
    `${s} ul{margin:0 0 9px;padding-left:18px;list-style:disc;}`,
    `${s} li{font-size:13px;line-height:1.6;color:${INK};margin:0 0 3px;}`,
    `${s} strong{font-weight:700;color:${INK};}`,
    `${s} em{font-style:italic;}`,
    `${s} a{color:${style.accent};text-decoration:none;}`,
    `${s} hr{border:none;border-top:1px solid ${style.accent};margin:18px 0;}`,
    `${s} code{font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:12px;background:${style.accentSoft};color:${style.accentDark};padding:1px 4px;border-radius:3px;}`,
    `${s} .vd-plain{white-space:pre-wrap;font-size:13px;line-height:1.65;color:${INK};}`,
  ].join("\n");
}