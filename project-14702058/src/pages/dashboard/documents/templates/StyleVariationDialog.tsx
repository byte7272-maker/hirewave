import { useMemo, useState } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import { evaluateStyleQuality, type LibraryStyleKind } from "@/lib/styleLibrary";
import { ACCENT_COLORS } from "./accent";
import { DOC_FONTS, getFont } from "./styleFonts";
import StyleThumbnail from "./StyleThumbnail";

/** The editable fields of a variation, seeded from the current look or a saved style. */
export interface VariationDraft {
  name: string;
  note: string;
  accentId: string;
  fontId: string;
  roleOn: boolean;
  roleLabel: string;
}

/** The values handed back when the (passed) quality gate is cleared. */
export interface VariationValues {
  name: string;
  note: string;
  accentId: string;
  fontId: string;
  roleId?: string;
  roleLabel?: string;
}

interface StyleVariationDialogProps {
  mode: "create" | "edit" | "duplicate";
  kind: LibraryStyleKind;
  /** The layout this variation is composed on. Fixed — editing never changes layout. */
  themeId: string;
  themeLabel: string;
  /** The stock look — deviations from it are what make a style worth saving. */
  defaultThemeId: string;
  defaultAccentId: string;
  defaultFontId: string;
  accentLabel: (id: string) => string;
  /** Live document data, used to render the mini preview of the composed look. */
  previewData: JsonResume | CoverLetterStructured | null;
  /** The role currently targeted — captured as a tag when saving. */
  targetRoleId?: string;
  targetRoleLabel?: string | null;
  /** When editing, the id of the style being edited (so its own name isn't "taken"). */
  editingId?: string;
  initial: VariationDraft;
  onClose: () => void;
  onSave: (values: VariationValues) => void;
}

/**
 * The "variation composer" — a small dialog shared by "Save current style",
 * "Edit variation", and "Duplicate variation", so the accent/typeface pickers,
 * the role tag, and the live quality gate are defined in exactly one place.
 * Save stays disabled until every gate check passes. Duplicating seeds the
 * composer from an existing look so you can branch it into a new combo without
 * starting from scratch (it saves as a new entry, never overwriting the source).
 */
export default function StyleVariationDialog({
  mode,
  kind,
  themeId,
  themeLabel,
  defaultThemeId,
  defaultAccentId,
  defaultFontId,
  accentLabel,
  previewData,
  targetRoleId,
  targetRoleLabel,
  editingId,
  initial,
  onClose,
  onSave,
}: StyleVariationDialogProps) {
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note);
  const [accentId, setAccentId] = useState(initial.accentId);
  const [fontId, setFontId] = useState(initial.fontId);
  const [roleOn, setRoleOn] = useState(initial.roleOn);
  const [roleDraft, setRoleDraft] = useState(initial.roleLabel);

  const quality = useMemo(
    () =>
      evaluateStyleQuality({
        name,
        kind,
        themeId,
        accentId,
        fontId,
        defaultThemeId,
        defaultAccentId,
        defaultFontId,
        editingId,
      }),
    [name, kind, themeId, accentId, fontId, defaultThemeId, defaultAccentId, defaultFontId, editingId]
  );

  function handleSave() {
    if (!quality.passed) return;
    onSave({
      name,
      note,
      accentId,
      fontId,
      roleId: roleOn ? targetRoleId : undefined,
      roleLabel: roleOn ? roleDraft.trim() || targetRoleId : undefined,
    });
  }

  const editing = mode === "edit";
  const duplicating = mode === "duplicate";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground-950/40 dark:bg-black/55" onClick={onClose}></div>
      <div className="relative w-full max-w-lg bg-background-50 rounded-2xl border border-background-200 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between">
          <h3 className="font-heading text-lg font-medium text-foreground-950">
            {editing
              ? "Edit this variation"
              : duplicating
                ? "Duplicate this variation"
                : "Save a style variation"}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 cursor-pointer"
            aria-label="Close"
          >
            <i className="ri-close-line text-lg"></i>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-background-200 bg-background-100/60 p-3">
            <StyleThumbnail
              kind={kind}
              themeId={themeId}
              accentId={accentId}
              fontId={fontId}
              data={previewData}
              width={76}
              height={106}
            />
            <div className="min-w-0">
              <p className="text-xs text-foreground-600">
                Layout{" "}
                <span className="font-semibold text-foreground-900">{themeLabel}</span>
              </p>
              <p className="text-xs text-foreground-500 mt-0.5">
                {editing
                  ? "Tweak this look's accent, typeface, name, or role — the mini preview updates live."
                  : duplicating
                    ? "Branch this look into a new accent or typeface without starting over — the mini preview updates live."
                    : "Compose a named variation on this layout — accent + typeface — and preview it live."}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-foreground-700">Accent</span>
              <span className="text-xs text-foreground-400">{accentLabel(accentId)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ACCENT_COLORS.map((a) => {
                const selected = a.id === accentId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccentId(a.id)}
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

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-foreground-700">Typeface</span>
              <span className="text-xs text-foreground-400">{getFont(fontId).name}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DOC_FONTS.map((f) => {
                const selected = f.id === fontId;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFontId(f.id)}
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

          <div>
            <label
              htmlFor="style-name"
              className="block text-xs font-semibold text-foreground-700 mb-1.5"
            >
              Variation name
            </label>
            <input
              id="style-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Teal Editorial for design roles"
              maxLength={60}
              className="w-full text-sm rounded-md border border-background-200 bg-background-50 px-3 py-2 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <div>
            <label
              htmlFor="style-note"
              className="block text-xs font-semibold text-foreground-700 mb-1.5"
            >
              Note <span className="font-normal text-foreground-400">(optional)</span>
            </label>
            <input
              id="style-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="When to reach for this look"
              maxLength={80}
              className="w-full text-sm rounded-md border border-background-200 bg-background-50 px-3 py-2 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <div className="rounded-xl border border-background-200 bg-background-100/50 p-3">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-foreground-700">
                <i className="ri-briefcase-line text-foreground-500"></i>
                Tag with target role
              </span>
              <input
                type="checkbox"
                checked={roleOn}
                onChange={(e) => setRoleOn(e.target.checked)}
                className="w-4 h-4 accent-primary-500 cursor-pointer"
              />
            </label>
            {roleOn && (
              <input
                type="text"
                value={roleDraft}
                onChange={(e) => setRoleDraft(e.target.value)}
                placeholder={targetRoleId || "Role name"}
                maxLength={60}
                className="mt-2.5 w-full text-sm rounded-md border border-background-200 bg-background-50 px-3 py-2 text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            )}
          </div>

          <div className="rounded-xl border border-background-200 bg-background-100/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground-700">Quality gate</span>
              <span className="text-xs text-foreground-500">
                {quality.passedCount} of {quality.checks.length} met
              </span>
            </div>
            <ul className="space-y-1.5">
              {quality.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2 text-xs">
                  <span
                    className={`w-4 h-4 mt-0.5 flex items-center justify-center rounded-full flex-shrink-0 ${
                      check.passed
                        ? "bg-primary-500 text-background-50"
                        : "bg-background-200 text-foreground-500"
                    }`}
                  >
                    <i
                      className={
                        check.passed ? "ri-check-line text-[10px]" : "ri-subtract-line text-[10px]"
                      }
                    ></i>
                  </span>
                  <span className="min-w-0">
                    <span className={check.passed ? "text-foreground-800" : "text-foreground-600"}>
                      {check.label}
                    </span>
                    {!check.passed && <span className="block text-foreground-400">{check.hint}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-background-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex items-center text-sm font-semibold text-foreground-600 px-4 py-2 rounded-md hover:bg-background-100 cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!quality.passed}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className={editing ? "ri-save-line" : duplicating ? "ri-file-copy-line" : "ri-bookmark-3-line"}></i>
            {editing ? "Save changes" : duplicating ? "Create copy" : "Save variation"}
          </button>
        </div>
      </div>
    </div>
  );
}