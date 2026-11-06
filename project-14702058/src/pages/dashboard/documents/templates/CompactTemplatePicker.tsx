/**
 * A small, inline template switcher for compact contexts — most importantly the
 * quick preview, so the improved result's layout can be changed without opening
 * the full editor.
 *
 * It writes through the same shared style memory (`saveStyle`) as the editor's
 * full template gallery, so a pick made here is the exact same choice seen there.
 */

export interface CompactTemplateOption {
  id: string;
  name: string;
  /** Short hint shown on hover / as the accessible title. */
  description: string;
  /** Paper color for the tiny layout glyph. */
  paper: string;
}

interface CompactTemplatePickerProps {
  options: CompactTemplateOption[];
  value: string;
  onChange: (id: string) => void;
  /** Accent color used for the glyph's highlight bar (keeps the swatch on-brand). */
  accentValue?: string;
  disabled?: boolean;
  /** Leading label — defaults to "Layout". */
  label?: string;
}

/**
 * A pill-style segmented control: one chip per template, each with a tiny paper
 * glyph that hints at its layout. Selected chip takes the primary fill.
 */
export default function CompactTemplatePicker({
  options,
  value,
  onChange,
  accentValue = "#2563eb",
  disabled = false,
  label = "Layout",
}: CompactTemplatePickerProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">
        <i className="ri-layout-line"></i>
        {label}
      </span>
      <div
        role="group"
        aria-label="Template layout"
        className="inline-flex items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50"
      >
        {options.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              disabled={disabled}
              aria-pressed={selected}
              title={t.description}
              className={`inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                selected
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:bg-background-100"
              }`}
            >
              <span
                className="w-4 h-5 flex flex-col justify-center gap-[2px] rounded-[3px] border overflow-hidden px-[3px]"
                style={{ background: t.paper, borderColor: "rgba(0,0,0,0.14)" }}
              >
                <span
                  className="block h-[2px] w-3/4 rounded-full"
                  style={{ background: accentValue }}
                />
                <span className="block h-[2px] w-full rounded-full bg-black/15" />
                <span className="block h-[2px] w-2/3 rounded-full bg-black/15" />
              </span>
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}