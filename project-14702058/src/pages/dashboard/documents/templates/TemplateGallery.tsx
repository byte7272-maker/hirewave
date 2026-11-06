import { useMemo, useState, type ReactNode } from "react";
import type { AccentColor } from "./accent";
import type { DocFont } from "./styleFonts";
import { Card, SectionHeader } from "@/components/base";

/**
 * The left-hand chooser of the two-pane Templates layout: a compact thumbnail
 * grid with a category filter, the accent swatches, and a collapsed "Advanced"
 * disclosure. Selecting a template only previews it — the preview pane's "Use
 * this template" action persists the choice.
 */

export interface GalleryTheme {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Paper color for the tiny layout glyph. */
  paper: string;
}

interface TemplateGalleryProps {
  themes: GalleryTheme[];
  /** Currently previewed template id. */
  value: string;
  /** The template actually applied to the document — shown with an "Applied" badge. */
  appliedId?: string;
  onSelect: (id: string) => void;
  accents: AccentColor[];
  accentValue: string;
  onAccentSelect: (id: string) => void;
  /** Optional typeface row — enables the font dimension of style variations. */
  fonts?: DocFont[];
  fontValue?: string;
  onFontSelect?: (id: string) => void;
  /** Secondary controls rendered inside the collapsed "Advanced" disclosure. */
  advanced?: ReactNode;
  /** Header copy for the collapsed advanced disclosure. Defaults to "Advanced". */
  advancedLabel?: string;
}

export default function TemplateGallery({
  themes,
  value,
  appliedId,
  onSelect,
  accents,
  accentValue,
  onAccentSelect,
  fonts,
  fontValue,
  onFontSelect,
  advanced,
  advancedLabel = "Advanced",
}: TemplateGalleryProps) {
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const t of themes) if (!seen.includes(t.category)) seen.push(t.category);
    return seen.length > 1 ? ["All", ...seen] : [];
  }, [themes]);

  const [category, setCategory] = useState("All");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const visible =
    category === "All" ? themes : themes.filter((t) => t.category === category);
  const accentName = accents.find((a) => a.id === accentValue)?.name ?? "";
  const fontName = fonts?.find((f) => f.id === fontValue)?.name ?? "";

  return (
    <Card surface="tinted" className="overflow-hidden">
      <SectionHeader
        icon="ri-layout-masonry-line"
        tone="primary"
        title="Templates"
        subtitle={`${themes.length} layouts — your data fills in automatically.`}
        action={
          categories.length > 0 ? (
            <div className="inline-flex items-center gap-0.5 p-1 rounded-full border border-background-200 bg-background-50">
              {categories.map((c) => {
                const on = c === category;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    aria-pressed={on}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      on
                        ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                        : "text-foreground-600 hover:bg-background-100"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {visible.map((t) => {
            const selected = t.id === value;
            const applied = appliedId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                aria-pressed={selected}
                title={t.description}
                className={`group text-left rounded-xl border overflow-hidden transition-colors cursor-pointer ${
                  selected
                    ? "border-primary-400 ring-1 ring-primary-300"
                    : "border-background-200 hover:border-background-300"
                }`}
              >
                <span
                  className="relative block h-24"
                  style={{ background: t.paper }}
                >
                  <span className="flex flex-col h-full p-3 gap-1.5">
                    <span
                      className="block h-1.5 w-2/3 rounded-full"
                      style={{ background: accentValue }}
                    />
                    <span className="block h-1 w-full rounded-full bg-black/10" />
                    <span className="block h-1 w-5/6 rounded-full bg-black/10" />
                    <span
                      className="block h-1 w-full rounded-full"
                      style={{ background: accentValue, opacity: 0.5 }}
                    />
                    <span className="block h-1 w-4/6 rounded-full bg-black/10" />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] leading-snug text-white bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
                    {t.description}
                  </span>
                  {applied && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-900 bg-primary-100 px-1.5 py-0.5 rounded">
                      <i className="ri-check-line"></i>
                      Applied
                    </span>
                  )}
                  {selected && !applied && (
                    <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-primary-500 text-background-50">
                      <i className="ri-check-line text-[10px]"></i>
                    </span>
                  )}
                </span>
                <span className="flex items-center justify-between gap-1 px-2.5 py-2 bg-background-50">
                  <span className="text-xs font-semibold text-foreground-950 truncate">
                    {t.name}
                  </span>
                  <span className="text-[10px] text-foreground-400 truncate">{t.category}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-foreground-600">Accent color</span>
            <span className="text-xs text-foreground-400">{accentName}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {accents.map((a) => {
              const selected = a.id === accentValue;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onAccentSelect(a.id)}
                  title={a.name}
                  aria-label={`${a.name} accent`}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                    selected
                      ? "ring-2 ring-offset-2 ring-foreground-400 scale-105"
                      : "hover:scale-105"
                  }`}
                  style={{ background: a.value }}
                >
                  {selected && <i className="ri-check-line text-white text-xs"></i>}
                </button>
              );
            })}
          </div>
        </div>

        {fonts && fonts.length > 0 && onFontSelect && (
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-foreground-600">Typeface</span>
              <span className="text-xs text-foreground-400">{fontName}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {fonts.map((f) => {
                const selected = f.id === fontValue;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onFontSelect(f.id)}
                    title={f.description}
                    aria-pressed={selected}
                    className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors cursor-pointer whitespace-nowrap ${
                      selected
                        ? "border-primary-400 bg-primary-100/50 text-primary-900 font-semibold"
                        : "border-background-200 text-foreground-600 hover:bg-background-100"
                    }`}
                    style={{ fontFamily: f.stack }}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {advanced && (
          <div className="pt-3 border-t border-background-200">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-foreground-600 hover:text-foreground-900 cursor-pointer"
            >
              <span className="inline-flex items-center gap-1.5">
                <i className="ri-equalizer-line"></i>
                {advancedLabel}
              </span>
              <i
                className={`ri-arrow-down-s-line transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
              ></i>
            </button>
            {showAdvanced && <div className="mt-3 space-y-3">{advanced}</div>}
          </div>
        )}
      </div>
    </Card>
  );
}