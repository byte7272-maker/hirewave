import type { DocSection } from "@/lib/docSections";

interface SectionNavigatorProps {
  sections: DocSection[];
  /** Move the caret to the given char index in the text (focuses the editor). */
  onFocusSection: (start: number) => void;
  /** Move a section one slot up (-1) or down (+1). */
  onMoveSection: (index: number, direction: -1 | 1) => void;
  /** Delete a section. */
  onDeleteSection: (index: number) => void;
  /** Open the add-section menu (used by the empty state). */
  onAddSection: () => void;
}

/**
 * A compact map of the document's `## Heading` sections with click-to-focus,
 * reorder and delete controls. Empty sections read "Click to add…" so a
 * placeholder heading is never mistaken for finished content.
 */
export default function SectionNavigator({
  sections,
  onFocusSection,
  onMoveSection,
  onDeleteSection,
  onAddSection,
}: SectionNavigatorProps) {
  return (
    <div className="rounded-xl border border-background-200 bg-background-50 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-500">
          <i className="ri-list-check-2"></i>
          Sections
          {sections.length > 0 && (
            <span className="text-foreground-400 normal-case">· {sections.length}</span>
          )}
        </span>
        <span className="text-[11px] text-foreground-400 hidden sm:inline">
          Reorder or remove sections — saved with your edits
        </span>
      </div>

      {sections.length === 0 ? (
        <button
          type="button"
          onClick={onAddSection}
          className="mt-2.5 w-full flex items-center gap-2.5 rounded-lg border border-dashed border-secondary-300 bg-secondary-50 px-3 py-2.5 text-left text-sm text-secondary-900 hover:border-secondary-400 transition-colors cursor-pointer"
        >
          <span className="w-7 h-7 flex items-center justify-center rounded-md bg-secondary-100 text-secondary-700 flex-shrink-0">
            <i className="ri-add-line"></i>
          </span>
          No sections yet — <span className="font-semibold">Click to add…</span>
        </button>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {sections.map((section, index) => (
            <li
              key={`${section.start}-${section.title}`}
              className="flex items-center gap-2 rounded-lg border border-background-200 bg-background-100/60 px-2.5 py-1.5"
            >
              <button
                type="button"
                onClick={() => onFocusSection(section.start)}
                title={`Jump to “${section.title}”`}
                className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
              >
                <i className="ri-hashtag text-foreground-400 group-hover:text-primary-600"></i>
                <span className="text-sm font-medium text-foreground-900 truncate">
                  {section.title || "Untitled"}
                </span>
                {section.empty && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-900 bg-accent-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                    <i className="ri-cursor-line"></i>
                    Click to add…
                  </span>
                )}
              </button>
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveSection(index, -1)}
                  disabled={index === 0}
                  title="Move up"
                  aria-label={`Move ${section.title} up`}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <i className="ri-arrow-up-line"></i>
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSection(index, 1)}
                  disabled={index === sections.length - 1}
                  title="Move down"
                  aria-label={`Move ${section.title} down`}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-200 hover:text-foreground-900 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <i className="ri-arrow-down-line"></i>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSection(index)}
                  title="Delete section"
                  aria-label={`Delete ${section.title}`}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-500 hover:bg-accent-100 hover:text-accent-900 transition-colors cursor-pointer"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}