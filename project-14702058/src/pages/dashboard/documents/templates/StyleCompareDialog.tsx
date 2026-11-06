import type { JsonResume } from "@/lib/jsonResume";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { LibraryStyle, LibraryStyleKind } from "@/lib/styleLibrary";
import { getFont } from "./styleFonts";
import StyleThumbnail from "./StyleThumbnail";

interface StyleCompareDialogProps {
  kind: LibraryStyleKind;
  a: LibraryStyle;
  b: LibraryStyle;
  /** Live document data — fills both previews with the real content. */
  data: JsonResume | CoverLetterStructured | null;
  defaultFontId: string;
  accentLabel: (id: string) => string;
  /** Whether a given saved style matches what's currently previewed on the paper. */
  isPreviewing: (style: LibraryStyle) => boolean;
  /** Apply one of the two looks (previews it; "Use this template" persists). */
  onApply: (style: LibraryStyle) => void;
  onClose: () => void;
}

interface CompareColumnProps {
  kind: LibraryStyleKind;
  style: LibraryStyle;
  data: JsonResume | CoverLetterStructured | null;
  defaultFontId: string;
  accentLabel: (id: string) => string;
  previewing: boolean;
  onApply: () => void;
}

function CompareColumn({
  kind,
  style,
  data,
  defaultFontId,
  accentLabel,
  previewing,
  onApply,
}: CompareColumnProps) {
  const fontName = getFont(style.fontId ?? defaultFontId).name;
  return (
    <div
      className={`flex flex-col rounded-xl border overflow-hidden ${
        previewing ? "border-primary-300 bg-primary-100/30" : "border-background-200 bg-background-50"
      }`}
    >
      <div className="px-3 py-2.5 border-b border-background-200 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground-950 truncate">{style.name}</p>
        {previewing && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-800 bg-primary-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            <i className="ri-eye-line"></i>
            Previewing
          </span>
        )}
      </div>

      <div className="p-3 flex justify-center bg-background-100/40">
        <StyleThumbnail
          kind={kind}
          themeId={style.themeId}
          accentId={style.accentId}
          fontId={style.fontId ?? defaultFontId}
          data={data}
          width={230}
          height={325}
        />
      </div>

      <div className="p-3 space-y-2 mt-auto">
        <div className="flex items-center gap-3 text-[11px] text-foreground-600">
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-palette-line"></i>
            {accentLabel(style.accentId)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="ri-font-size"></i>
            {fontName}
          </span>
        </div>
        {style.roleLabel && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full">
            <i className="ri-briefcase-line"></i>
            {style.roleLabel}
          </span>
        )}
        {style.note && <p className="text-[11px] text-foreground-400">{style.note}</p>}
        <button
          type="button"
          onClick={onApply}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-magic-line"></i>
          Use “{style.name}”
        </button>
      </div>
    </div>
  );
}

/**
 * Side-by-side comparison of two saved variations built on the same layout, so
 * the differences (accent, typeface) and their real rendered result can be
 * judged together before committing to one.
 */
export default function StyleCompareDialog({
  kind,
  a,
  b,
  data,
  defaultFontId,
  accentLabel,
  isPreviewing,
  onApply,
  onClose,
}: StyleCompareDialogProps) {
  const fontA = a.fontId ?? defaultFontId;
  const fontB = b.fontId ?? defaultFontId;
  const differences = [
    a.accentId !== b.accentId ? "accent" : null,
    fontA !== fontB ? "typeface" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
      <div className="relative w-full max-w-3xl bg-background-50 rounded-2xl border border-background-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-medium text-foreground-950 flex items-center gap-2">
              <i className="ri-layout-grid-line text-primary-600"></i>
              Compare variations
            </h3>
            <p className="text-xs text-foreground-500 mt-0.5">
              {differences.length
                ? `Differ by ${differences.join(" and ")}.`
                : "Same accent and typeface — pick the one you prefer."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-4 md:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompareColumn
            kind={kind}
            style={a}
            data={data}
            defaultFontId={defaultFontId}
            accentLabel={accentLabel}
            previewing={isPreviewing(a)}
            onApply={() => onApply(a)}
          />
          <CompareColumn
            kind={kind}
            style={b}
            data={data}
            defaultFontId={defaultFontId}
            accentLabel={accentLabel}
            previewing={isPreviewing(b)}
            onApply={() => onApply(b)}
          />
        </div>

        <div className="px-5 py-3 border-t border-background-200 flex items-center justify-between gap-2">
          <span className="text-[11px] text-foreground-400">
            Applying previews the look — use “Use this template” on the right to keep it.
          </span>
          <button
            onClick={onClose}
            className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}