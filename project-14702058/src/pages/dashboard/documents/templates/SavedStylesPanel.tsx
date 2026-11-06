import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useToast } from "@/components/base/ToastProvider";
import type { JsonResume } from "@/lib/jsonResume";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import {
  addLibraryStyle,
  deleteLibraryStyle,
  importLibrary,
  listLibraryStyles,
  serializeLibrary,
  updateLibraryStyle,
  type LibraryStyle,
  type LibraryStyleKind,
} from "@/lib/styleLibrary";
import { getFont } from "./styleFonts";
import StyleThumbnail from "./StyleThumbnail";
import StyleVariationDialog, {
  type VariationDraft,
  type VariationValues,
} from "./StyleVariationDialog";
import StyleCompareDialog from "./StyleCompareDialog";

interface SavedStylesPanelProps {
  kind: LibraryStyleKind;
  /** The style currently previewed on the document (what "Save current style" captures). */
  themeId: string;
  accentId: string;
  fontId: string;
  /** The stock look — deviations from it are what make a style worth saving. */
  defaultThemeId: string;
  defaultAccentId: string;
  defaultFontId: string;
  /** Human labels for a saved style's template / accent. */
  themeLabel: (id: string) => string;
  accentLabel: (id: string) => string;
  /** Live document data, used to render each saved style's thumbnail. */
  previewData: JsonResume | CoverLetterStructured | null;
  /** The role currently targeted — captured as a tag when saving, filterable after. */
  targetRoleId?: string;
  targetRoleLabel?: string | null;
  /** Apply a saved look to the document (previews it; Apply persists). */
  onApply: (themeId: string, accentId: string, fontId: string) => void;
}

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; editing: LibraryStyle }
  | { mode: "duplicate"; source: LibraryStyle }
  | null;

/**
 * "Save to library" flow. A saved look is a layout + accent + font, so one
 * layout can ship several named variations. Styles are grouped by layout and
 * each shows a tiny live render of the real document. Looks can be edited in
 * place (name / accent / font / role), compared two-up on the same layout, and
 * filtered by role.
 */
export default function SavedStylesPanel({
  kind,
  themeId,
  accentId,
  fontId,
  defaultThemeId,
  defaultAccentId,
  defaultFontId,
  themeLabel,
  accentLabel,
  previewData,
  targetRoleId,
  targetRoleLabel,
  onApply,
}: SavedStylesPanelProps) {
  const { showToast } = useToast();
  const [items, setItems] = useState<LibraryStyle[]>(() => listLibraryStyles(kind));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("all");
  // Two-up comparison: pick two variations on the same layout.
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  /** Hidden file picker backing the "Import" action. */
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Distinct role tags present in the library, for the filter row. */
  const roles = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of items) {
      if (s.roleId) map.set(s.roleId, s.roleLabel || s.roleId);
    }
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [items]);

  const visibleItems =
    roleFilter === "all" ? items : items.filter((s) => s.roleId === roleFilter);

  /** Group the visible styles by layout so one layout's variations sit together. */
  const groups = useMemo(() => {
    const order: string[] = [];
    const byTheme = new Map<string, LibraryStyle[]>();
    for (const s of visibleItems) {
      if (!byTheme.has(s.themeId)) {
        byTheme.set(s.themeId, []);
        order.push(s.themeId);
      }
      byTheme.get(s.themeId)!.push(s);
    }
    return order.map((id) => ({ themeId: id, items: byTheme.get(id)! }));
  }, [visibleItems]);

  const comparing = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = items.find((s) => s.id === compareIds[0]);
    const b = items.find((s) => s.id === compareIds[1]);
    return a && b ? { a, b } : null;
  }, [compareIds, items]);

  function refresh() {
    setItems(listLibraryStyles(kind));
  }

  const isActive = (item: LibraryStyle) =>
    item.themeId === themeId &&
    item.accentId === accentId &&
    (item.fontId ?? defaultFontId) === fontId;

  /** The draft seeded when the dialog opens — from the current look, or a saved style. */
  function currentDraft(): VariationDraft {
    return {
      name: "",
      note: "",
      accentId,
      fontId,
      roleOn: Boolean(targetRoleLabel),
      roleLabel: targetRoleLabel ?? "",
    };
  }

  function editDraft(item: LibraryStyle): VariationDraft {
    return {
      name: item.name,
      note: item.note ?? "",
      accentId: item.accentId,
      fontId: item.fontId ?? defaultFontId,
      roleOn: Boolean(item.roleId),
      roleLabel: item.roleLabel ?? "",
    };
  }

  /** A duplicate seeds from the source — new name, same accent/font to branch from. */
  function duplicateDraft(item: LibraryStyle): VariationDraft {
    return {
      name: `${item.name} copy`.slice(0, 60),
      note: item.note ?? "",
      accentId: item.accentId,
      fontId: item.fontId ?? defaultFontId,
      roleOn: Boolean(item.roleId),
      roleLabel: item.roleLabel ?? "",
    };
  }

  function handleDialogSave(values: VariationValues) {
    if (!dialog) return;
    if (dialog.mode === "edit") {
      // Capture the look it was edited from the first time it genuinely deviates,
      // so a "Modified from …" lineage note can tell similar looks apart.
      const sourceFont = dialog.editing.fontId ?? defaultFontId;
      const changed =
        values.accentId !== dialog.editing.accentId || values.fontId !== sourceFont;
      const origin =
        dialog.editing.origin || !changed
          ? dialog.editing.origin
          : {
              themeId: dialog.editing.themeId,
              accentId: dialog.editing.accentId,
              fontId: sourceFont,
              name: dialog.editing.name,
            };
      const updated = updateLibraryStyle(dialog.editing.id, {
        name: values.name,
        note: values.note,
        accentId: values.accentId,
        fontId: values.fontId,
        roleId: values.roleId,
        roleLabel: values.roleLabel,
        origin,
      });
      refresh();
      setDialog(null);
      if (updated) showToast(`Updated “${updated.name}”`, "success");
      return;
    }
    // Both "create" and "duplicate" add a fresh entry; a duplicate records the
    // source it branched from so it carries a lineage note.
    const source = dialog.mode === "duplicate" ? dialog.source : null;
    const entry = addLibraryStyle({
      name: values.name,
      kind,
      themeId: source ? source.themeId : themeId,
      accentId: values.accentId,
      fontId: values.fontId,
      note: values.note,
      roleId: values.roleId,
      roleLabel: values.roleLabel,
      origin: source
        ? {
            themeId: source.themeId,
            accentId: source.accentId,
            fontId: source.fontId ?? defaultFontId,
            name: source.name,
          }
        : undefined,
    });
    refresh();
    setDialog(null);
    showToast(
      source
        ? `Duplicated into “${entry.name}”`
        : `Saved “${entry.name}” to your library`,
      "success"
    );
  }

  function handleApply(item: LibraryStyle) {
    onApply(item.themeId, item.accentId, item.fontId ?? defaultFontId);
    showToast(`Previewing “${item.name}” — apply it to keep this look`, "success");
  }

  function handleDelete(id: string) {
    deleteLibraryStyle(id);
    refresh();
    setConfirmId(null);
    setCompareIds((prev) => prev.filter((x) => x !== id));
    showToast("Removed from your library", "success");
  }

  /** Download the library as a portable JSON file so it can move between browsers. */
  function handleExport() {
    const json = serializeLibrary(kind);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hirewave-${kind}-styles.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast(
      `Exported ${items.length} style${items.length === 1 ? "" : "s"} to a file`,
      "success"
    );
  }

  /** Merge a previously-exported library file into this browser. */
  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so the same file can be picked again later.
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const result = importLibrary(text);
      refresh();
      if (result.added === 0 && result.skipped === 0) {
        showToast("That file didn't contain any saved styles", "error");
      } else if (result.added === 0) {
        showToast("Already up to date — nothing new to import", "success");
      } else {
        showToast(
          `Imported ${result.added} style${result.added === 1 ? "" : "s"}${
            result.skipped ? ` · skipped ${result.skipped}` : ""
          }`,
          "success"
        );
      }
    } catch {
      showToast("Could not read that file", "error");
    }
  }

  /** Toggle the two-up comparison mode; leaving it clears any selection. */
  function toggleCompareMode() {
    setCompareMode((on) => {
      if (on) setCompareIds([]);
      return !on;
    });
  }

  /** True when a style can't join the comparison (a different layout is already picked). */
  function compareBlocked(item: LibraryStyle): boolean {
    if (compareIds.length === 0 || compareIds.includes(item.id)) return false;
    const first = items.find((s) => s.id === compareIds[0]);
    return Boolean(first && first.themeId !== item.themeId);
  }

  function toggleCompare(item: LibraryStyle) {
    setCompareIds((prev) => {
      if (prev.includes(item.id)) return prev.filter((id) => id !== item.id);
      if (prev.length === 0) return [item.id];
      const first = items.find((s) => s.id === prev[0]);
      if (first && first.themeId !== item.themeId) return prev; // guard: same layout only
      if (prev.length >= 2) return [prev[0], item.id];
      return [...prev, item.id];
    });
  }

  return (
    <section className="rounded-2xl border border-background-200 bg-background-100/60 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-background-200 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-medium text-foreground-950 flex items-center gap-2">
            <i className="ri-bookmark-3-line text-accent-600"></i>
            Saved styles
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            {items.length > 0
              ? `${items.length} saved look${items.length === 1 ? "" : "s"} — variations you can reuse on any ${
                  kind === "resume" ? "résumé" : "cover letter"
                }.`
              : "Save this look to reuse it on your other documents."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold border border-background-200 text-foreground-700 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-upload-2-line"></i>
            Import
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-xs font-semibold border border-background-200 text-foreground-700 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-2-line"></i>
              Export
            </button>
          )}
          {items.length >= 2 && (
            <button
              type="button"
              onClick={toggleCompareMode}
              aria-pressed={compareMode}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                compareMode
                  ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                  : "border border-background-200 text-foreground-700 hover:bg-background-100"
              }`}
            >
              <i className="ri-layout-grid-line"></i>
              {compareMode ? "Comparing" : "Compare"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialog({ mode: "create" })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line"></i>
            Save current style
          </button>
        </div>
      </div>

      {compareMode && (
        <div className="px-4 pt-3 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-foreground-600 inline-flex items-center gap-1.5">
            <i className="ri-information-line text-primary-600"></i>
            {compareIds.length < 2
              ? "Pick two variations on the same layout to compare them side by side."
              : "Ready — compare the two selected looks."}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              disabled={!comparing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className="ri-layout-grid-line"></i>
              Compare {compareIds.length}/2
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareMode(false);
                setCompareIds([]);
              }}
              className="text-xs font-medium text-foreground-500 hover:text-foreground-900 px-1.5 py-1.5 cursor-pointer whitespace-nowrap"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {roles.length > 0 && (
        <div className="px-4 pt-3 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-medium text-foreground-500 mr-0.5">Filter by role</span>
          {[{ id: "all", label: "All" }, ...roles].map((r) => {
            const on = r.id === roleFilter;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRoleFilter(r.id)}
                aria-pressed={on}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  on
                    ? "bg-primary-500 text-background-50 dark:text-foreground-950"
                    : "text-foreground-600 border border-background-200 hover:bg-background-100"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="p-3 space-y-4">
          {groups.map((group) => (
            <div key={group.themeId} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground-500">
                  {themeLabel(group.themeId)}
                </span>
                {group.items.length > 1 && (
                  <span className="text-[10px] font-semibold text-foreground-400 bg-background-200/70 px-1.5 py-0.5 rounded-full">
                    {group.items.length} variations
                  </span>
                )}
              </div>

              {group.items.map((item) => {
                const active = isActive(item);
                const confirming = confirmId === item.id;
                const fontName = getFont(item.fontId ?? defaultFontId).name;
                const picked = compareIds.includes(item.id);
                const blocked = compareMode && compareBlocked(item);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                      picked
                        ? "border-primary-400 ring-1 ring-primary-300 bg-primary-100/40"
                        : active
                          ? "border-primary-300 bg-primary-100/40"
                          : "border-background-200 bg-background-50"
                    }`}
                  >
                    {compareMode ? (
                      <button
                        type="button"
                        onClick={() => toggleCompare(item)}
                        disabled={blocked}
                        aria-pressed={picked}
                        aria-label={`${picked ? "Remove" : "Add"} ${item.name} ${picked ? "from" : "to"} comparison`}
                        className={`w-6 h-6 flex items-center justify-center rounded-full border flex-shrink-0 transition-colors ${
                          blocked
                            ? "border-background-200 text-foreground-300 cursor-not-allowed"
                            : picked
                              ? "bg-primary-500 border-primary-500 text-background-50 cursor-pointer"
                              : "border-background-300 text-transparent hover:border-primary-400 cursor-pointer"
                        }`}
                      >
                        <i className="ri-check-line text-xs"></i>
                      </button>
                    ) : null}

                    <StyleThumbnail
                      kind={kind}
                      themeId={item.themeId}
                      accentId={item.accentId}
                      fontId={item.fontId ?? defaultFontId}
                      data={previewData}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground-950 truncate">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-foreground-500 truncate">
                        {accentLabel(item.accentId)} · {fontName}
                      </p>
                      {item.roleLabel && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-secondary-900 bg-secondary-100 px-1.5 py-0.5 rounded-full">
                          <i className="ri-briefcase-line"></i>
                          {item.roleLabel}
                        </span>
                      )}
                      {item.note && (
                        <p className="text-[11px] text-foreground-400 truncate">{item.note}</p>
                      )}
                      {item.origin &&
                        (item.accentId !== item.origin.accentId ||
                          (item.fontId ?? defaultFontId) !==
                            (item.origin.fontId ?? defaultFontId)) && (
                          <p className="text-[10px] text-foreground-400 truncate flex items-center gap-1">
                            <i className="ri-git-branch-line"></i>
                            Modified from {themeLabel(item.origin.themeId)} ·{" "}
                            {accentLabel(item.origin.accentId)}
                          </p>
                        )}
                    </div>

                    {!compareMode && active && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-800 bg-primary-100 px-2 py-1 rounded-full whitespace-nowrap">
                        <i className="ri-eye-line"></i>
                        Previewing
                      </span>
                    )}
                    {!compareMode && !active && (
                      <button
                        type="button"
                        onClick={() => handleApply(item)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-foreground-700 border border-background-200 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-magic-line"></i>
                        Apply
                      </button>
                    )}
                    {!compareMode && (
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "edit", editing: item })}
                        aria-label={`Edit ${item.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                    )}
                    {!compareMode && (
                      <button
                        type="button"
                        onClick={() => setDialog({ mode: "duplicate", source: item })}
                        aria-label={`Duplicate ${item.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <i className="ri-file-copy-line"></i>
                      </button>
                    )}
                    {confirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="text-xs font-semibold text-accent-700 px-2 py-1.5 rounded-md hover:bg-accent-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmId(null)}
                          className="text-xs font-medium text-foreground-500 px-1.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmId(item.id)}
                        aria-label={`Delete ${item.name}`}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-accent-700 hover:bg-background-100 transition-colors cursor-pointer flex-shrink-0"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <StyleVariationDialog
          key={
            dialog.mode === "edit"
              ? dialog.editing.id
              : dialog.mode === "duplicate"
                ? `dup-${dialog.source.id}`
                : "create"
          }
          mode={dialog.mode}
          kind={kind}
          themeId={
            dialog.mode === "edit"
              ? dialog.editing.themeId
              : dialog.mode === "duplicate"
                ? dialog.source.themeId
                : themeId
          }
          themeLabel={themeLabel(
            dialog.mode === "edit"
              ? dialog.editing.themeId
              : dialog.mode === "duplicate"
                ? dialog.source.themeId
                : themeId
          )}
          defaultThemeId={defaultThemeId}
          defaultAccentId={defaultAccentId}
          defaultFontId={defaultFontId}
          accentLabel={accentLabel}
          previewData={previewData}
          targetRoleId={targetRoleId}
          targetRoleLabel={targetRoleLabel}
          editingId={dialog.mode === "edit" ? dialog.editing.id : undefined}
          initial={
            dialog.mode === "edit"
              ? editDraft(dialog.editing)
              : dialog.mode === "duplicate"
                ? duplicateDraft(dialog.source)
                : currentDraft()
          }
          onClose={() => setDialog(null)}
          onSave={handleDialogSave}
        />
      )}

      {compareOpen && comparing && (
        <StyleCompareDialog
          kind={kind}
          a={comparing.a}
          b={comparing.b}
          data={previewData}
          defaultFontId={defaultFontId}
          accentLabel={accentLabel}
          isPreviewing={isActive}
          onApply={(style) => {
            handleApply(style);
            setCompareOpen(false);
          }}
          onClose={() => setCompareOpen(false)}
        />
      )}

      {/* Hidden picker behind the Import button. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleImportFile}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
    </section>
  );
}