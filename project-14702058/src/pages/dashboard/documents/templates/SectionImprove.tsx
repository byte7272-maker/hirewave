interface SectionImproveProps {
  /** Focused instruction sent to the structured improve endpoint. */
  instruction: string;
  /** Human label for the section, used in the tooltip. */
  label: string;
  /**
   * Omitted in read-only contexts (the AI preview, the non-editable view) — the
   * button renders nothing when absent, so the paper is untouched there.
   */
  onImprove?: (instruction: string, label: string) => void;
}

/**
 * A per-section "Improve" affordance for a single paper section. The host
 * section must carry the Tailwind `group` class (and `position: relative`); the
 * button fades in on hover/focus and is hidden from print, so the saved/printed
 * template stays clean.
 *
 * The `hw-hover-reveal` class keeps it permanently visible on touch devices and
 * small screens (see index.css) — field-level improve is never hover-only.
 */
export default function SectionImprove({
  instruction,
  label,
  onImprove,
}: SectionImproveProps) {
  if (!onImprove) return null;
  return (
    <button
      type="button"
      onClick={() => onImprove(instruction, label)}
      title={`Improve “${label}” with AI`}
      className="hw-print-hide hw-hover-reveal absolute -top-2 right-0 z-20 inline-flex items-center gap-1 text-[10px] font-semibold text-primary-800 bg-primary-100 border border-primary-300 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer whitespace-nowrap"
    >
      <i className="ri-sparkling-line"></i>
      Improve
    </button>
  );
}