import AddSectionMenu from "./AddSectionMenu";
import { Badge, Button, Card } from "@/components/base";

interface DocumentEditToolbarProps {
  /** True when the text differs from the last saved/loaded baseline. */
  dirty: boolean;
  saving: boolean;
  /** True while "Save as new version" is running. */
  savingVersion: boolean;
  /** Human label of the last successful save, e.g. "2:41 PM". */
  savedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Save the edit in place (PUT). Disabled until there are unsaved changes. */
  onSave: () => void;
  /** Save the edit as a tracked new version instead. */
  onSaveVersion: () => void;
  onAddSection: (heading: string, sample: string) => void;
  /** Open the in-context Design chooser (previews locally, applies on confirm). */
  onOpenDesign?: () => void;
}

/**
 * The persistent manual-edit toolbar: Save (disabled until dirty, with a
 * live "• Unsaved changes" indicator), Undo / Redo, "Save as new version", and
 * the "+ Add section" menu. It sits directly above the editable text so the
 * working state of the document is always obvious.
 */
export default function DocumentEditToolbar({
  dirty,
  saving,
  savingVersion,
  savedAt,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onSaveVersion,
  onAddSection,
  onOpenDesign,
}: DocumentEditToolbarProps) {
  const busy = saving || savingVersion;
  return (
    <Card className="rounded-xl">
      <div className="flex items-center gap-2 flex-wrap px-3 py-2.5">
        <Button
          variant="solid"
          icon="ri-save-line"
          loading={saving}
          disabled={!dirty || busy}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>

        {dirty ? (
          <Badge tone="accent" dot>
            Unsaved changes
          </Badge>
        ) : (
          savedAt && (
            <Badge tone="primary" icon="ri-check-line">
              Saved {savedAt}
            </Badge>
          )
        )}

        <span className="hidden sm:block w-px h-6 bg-background-300/70" aria-hidden="true"></span>

        <div className="inline-flex items-center rounded-md border border-background-200 bg-background-50 overflow-hidden">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || busy}
            title="Undo"
            aria-label="Undo"
            className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className="ri-arrow-go-back-line"></i>
          </button>
          <span className="w-px h-5 bg-background-200"></span>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo || busy}
            title="Redo"
            aria-label="Redo"
            className="w-8 h-8 flex items-center justify-center text-foreground-600 hover:bg-background-100 hover:text-foreground-950 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <i className="ri-arrow-go-forward-line"></i>
          </button>
        </div>

        <span className="hidden sm:block w-px h-6 bg-background-300/70" aria-hidden="true"></span>

        <Button
          variant="outline"
          icon="ri-git-branch-line"
          loading={savingVersion}
          disabled={!dirty || busy}
          onClick={onSaveVersion}
        >
          Save as new version
        </Button>

        {onOpenDesign && (
          <Button variant="ghost" icon="ri-palette-line" disabled={busy} onClick={onOpenDesign}>
            Design
          </Button>
        )}

        <div className="ml-auto">
          <AddSectionMenu onPick={onAddSection} disabled={busy} />
        </div>
      </div>
    </Card>
  );
}