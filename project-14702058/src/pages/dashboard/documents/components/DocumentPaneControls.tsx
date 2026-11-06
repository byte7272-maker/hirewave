import type { PaneMode } from "@/hooks/useDocumentPreviewLayout";

interface PanePresetOption {
  key: "fit" | "50" | "75";
  label: string;
  icon: string;
  hint: string;
}

const PRESETS: PanePresetOption[] = [
  { key: "fit", label: "Fit", icon: "ri-fullscreen-line", hint: "Balanced default pane width" },
  {
    key: "50",
    label: "50%",
    icon: "ri-layout-column-line",
    hint: "Document pane at 50% of the row",
  },
  {
    key: "75",
    label: "75%",
    icon: "ri-layout-row-line",
    hint: "Document pane at 75% of the row",
  },
];

interface DocumentPaneControlsProps {
  mode: PaneMode;
  onPreset: (preset: "fit" | "50" | "75") => void;
}

/** Quick pane-width presets that sit beside the drag-to-resize handle. */
export default function DocumentPaneControls({
  mode,
  onPreset,
}: DocumentPaneControlsProps) {
  return (
    <div
      className="hidden lg:inline-flex items-center gap-0.5 p-1 rounded-full bg-background-100 border border-background-200"
      role="group"
      aria-label="Document pane width"
    >
      <span className="hidden xl:inline-flex items-center gap-1 pl-2 pr-1 text-xs font-medium text-foreground-500 whitespace-nowrap">
        <i className="ri-drag-move-2-line"></i>
        Pane
      </span>
      {PRESETS.map((preset) => {
        const active = mode === preset.key;
        return (
          <button
            key={preset.key}
            type="button"
            onClick={() => onPreset(preset.key)}
            title={preset.hint}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? "bg-accent-500 text-background-50 dark:text-foreground-950"
                : "text-foreground-600 hover:text-foreground-950 hover:bg-background-200/60"
            }`}
          >
            <i className={preset.icon}></i>
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}