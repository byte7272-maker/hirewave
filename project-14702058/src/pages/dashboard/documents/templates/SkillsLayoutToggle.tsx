import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import { SKILLS_LAYOUT_OPTIONS } from "@/lib/skillsLayoutMemory";

interface SkillsLayoutToggleProps {
  value: SkillsLayout;
  onChange: (layout: SkillsLayout) => void;
  disabled?: boolean;
}

/**
 * A compact segmented control for the Skills section's PRESENTATION — one
 * comma-separated line vs a bulleted list. It only re-renders the Skills section
 * locally (no AI call) and sits with the other template controls.
 */
export default function SkillsLayoutToggle({
  value,
  onChange,
  disabled = false,
}: SkillsLayoutToggleProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-600 whitespace-nowrap">
        <i className="ri-list-check-2"></i>
        Skills layout
      </span>
      <div
        role="group"
        aria-label="Skills layout"
        className="inline-flex items-center gap-1 p-1 rounded-full border border-background-200 bg-background-50"
      >
        {SKILLS_LAYOUT_OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              disabled={disabled}
              aria-pressed={selected}
              title={`Show your skills as a ${option.label.toLowerCase()}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed ${
                selected
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "text-foreground-600 hover:bg-background-100"
              }`}
            >
              <i className={option.icon}></i>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}