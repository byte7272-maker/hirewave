import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/base/ToastProvider";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import {
  getResumeStructured,
  setCoverLetterVersionTemplate,
  updateCoverLetter,
  type CoverLetter,
} from "@/lib/documents";
import { readDesignCategory, saveDesignCategory } from "@/lib/designChooserMemory";
import type { JsonResume } from "@/lib/jsonResume";
import { jobMatches } from "@/mocks/dashboard";
import {
  buildCoverLetterStructured,
  type CoverLetterStructured,
} from "@/lib/coverLetterTemplate";
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  getAccent,
  isKnownAccent,
  type AccentColor,
} from "@/pages/dashboard/documents/templates/accent";
import {
  DEFAULT_FONT_ID,
  DOC_FONTS,
  getFont,
  isKnownFont,
} from "@/pages/dashboard/documents/templates/styleFonts";
import {
  clearPreview,
  readPreview,
  readStyle,
  savePreview,
  saveStyle,
} from "@/pages/dashboard/documents/templates/templateStyle";
import {
  COVER_LETTER_THEMES,
  DEFAULT_COVER_LETTER_THEME_ID,
} from "@/pages/dashboard/documents/templates/coverLetterThemeRegistry";
import { getTheme } from "@/pages/dashboard/documents/templates/themeRegistry";
import StyleVariationDialog, {
  type VariationValues,
} from "@/pages/dashboard/documents/templates/StyleVariationDialog";
import { addLibraryStyle } from "@/lib/styleLibrary";
import DesignChooserDialog, { type DesignCard } from "./DesignChooserDialog";
import { invalidateVersionPreview } from "@/pages/dashboard/documents/components/useVersionPreview";
import { coverLetterSignature } from "./coverLetterSignature";

interface CoverLetterDesignModalProps {
  letterId: string;
  /** Active version — its own style memory is written alongside the current one. */
  version?: string | number;
  /** The letter's display title, shown in the header. */
  title: string;
  /** The loaded cover letter (for its linked résumé, target job, and template). */
  letter: CoverLetter;
  /** The letter text exactly as it reads on screen (unsaved edits included). */
  content: string;
  onClose: () => void;
  /** Called with the updated cover letter once a design is applied. */
  onApplied: (letter: CoverLetter) => void;
}

/**
 * The in-context Design chooser for a cover letter — the same dialog as the
 * résumé editor, driven by the cover-letter theme set. Every thumbnail renders
 * the user's OWN letter (built from the already-loaded text plus the linked
 * résumé's header basics), so there are no per-design requests. Beyond the
 * layout, the accent and typeface can be fine-tuned, or pulled straight from the
 * linked résumé with "Match my résumé's style". Only "Use this template" writes,
 * and the dialog reopens on the design you last previewed.
 */
export default function CoverLetterDesignModal({
  letterId,
  version,
  title,
  letter,
  content,
  onClose,
  onApplied,
}: CoverLetterDesignModalProps) {
  const { showToast } = useToast();
  const { reportError } = useChangeFeedback();

  const [structured, setStructured] = useState<CoverLetterStructured | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusedId, setFocusedId] = useState("");
  const [category, setCategory] = useState(() => readDesignCategory("cover-letter"));
  const [applying, setApplying] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // The style recorded on this letter's linked résumé (if any) — the source for
  // "Match my résumé's style" and the fallback the letter inherits.
  const linkedStyle = useMemo(
    () =>
      letter.resume_id !== undefined && letter.resume_id !== null
        ? readStyle("resume", String(letter.resume_id))
        : null,
    [letter.resume_id]
  );

  // The accent + typeface this letter renders with — its own pick, else its
  // linked résumé's, else the defaults. This is the applied baseline.
  const initialStyle = useMemo(() => {
    const own = readStyle("cover-letter", letterId, version);
    const a = own?.accentId ?? linkedStyle?.accentId ?? DEFAULT_ACCENT.id;
    const f = own?.fontId ?? linkedStyle?.fontId ?? DEFAULT_FONT_ID;
    return {
      accentId: isKnownAccent(a) ? a : DEFAULT_ACCENT.id,
      fontId: isKnownFont(f) ? f : DEFAULT_FONT_ID,
    };
  }, [letterId, version, linkedStyle]);

  const [accentId, setAccentId] = useState(initialStyle.accentId);
  const [fontId, setFontId] = useState(initialStyle.fontId);

  const canMatchResume = Boolean(
    linkedStyle?.accentId || linkedStyle?.fontId || linkedStyle?.themeId
  );

  // Build the structured letter (with the linked résumé's header basics, best-effort).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      let basics: JsonResume["basics"];
      if (letter.resume_id !== undefined && letter.resume_id !== null) {
        try {
          const resume = await getResumeStructured(letter.resume_id);
          basics = resume.basics;
        } catch {
          /* header identity is best-effort */
        }
      }
      if (!alive) return;
      const job = jobMatches.find((j) => String(j.id) === String(letter.job_posting_id));
      setStructured(
        buildCoverLetterStructured(content, {
          date: letter.created_at ?? letter.generated_at,
          basics,
          company: job?.company,
          role: job?.title,
        })
      );
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [content, letter.resume_id, letter.job_posting_id, letter.created_at, letter.generated_at]);

  // Land on the last design previewed for this letter; otherwise the applied one.
  useEffect(() => {
    if (focusedId) return;
    const remembered = readPreview("cover-letter", letterId)?.themeId;
    const initial =
      COVER_LETTER_THEMES.find((t) => t.id === remembered) ??
      COVER_LETTER_THEMES.find((t) => t.id === letter.template_id) ??
      COVER_LETTER_THEMES[0];
    if (initial) setFocusedId(initial.id);
  }, [letterId, letter.template_id, focusedId]);

  const cards: DesignCard[] = useMemo(
    () =>
      COVER_LETTER_THEMES.map((t) => {
        // Each card shows its template's own signature look (the stock accent
        // plus the typeface baked into that template), so the layouts read
        // distinctly in the gallery — exactly like the résumé chooser.
        const sig = coverLetterSignature(t.id);
        const sigFont = getFont(sig.fontId);
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          accent: getAccent(sig.accentId),
          fontLabel: sigFont.name,
          fontName: sigFont.name,
          fontStack: sigFont.stack,
          render: (picked: AccentColor) =>
            structured ? <t.Component data={structured} accent={picked} /> : null,
        };
      }),
    [structured]
  );

  const categories = useMemo(() => {
    const out: string[] = [];
    for (const t of COVER_LETTER_THEMES) if (!out.includes(t.category)) out.push(t.category);
    return out;
  }, []);

  const hasChanges =
    focusedId !== letter.template_id ||
    accentId !== initialStyle.accentId ||
    fontId !== initialStyle.fontId;

  // How the tuned look deviates from the focused template's own signature.
  const focusedSignature = coverLetterSignature(focusedId);
  const accentChanged = accentId !== focusedSignature.accentId;
  const fontChanged = fontId !== focusedSignature.fontId;
  const customization = {
    accentFrom: accentChanged ? getAccent(focusedSignature.accentId).name : undefined,
    accentTo: accentChanged ? getAccent(accentId).name : undefined,
    fontFrom: fontChanged ? getFont(focusedSignature.fontId).name : undefined,
    fontTo: fontChanged ? getFont(fontId).name : undefined,
  };

  /** Focus a design and remember it as the last previewed for this letter. */
  function handleFocus(id: string) {
    setFocusedId(id);
    savePreview("cover-letter", letterId, { themeId: id, accentId, fontId });
  }

  /** Fine-tune the accent — remembered with the previewed look. */
  function handleAccent(id: string) {
    setAccentId(id);
    if (focusedId) savePreview("cover-letter", letterId, { themeId: focusedId, accentId: id, fontId });
  }

  /** Fine-tune the typeface — remembered with the previewed look. */
  function handleFont(id: string) {
    setFontId(id);
    if (focusedId) savePreview("cover-letter", letterId, { themeId: focusedId, accentId, fontId: id });
  }

  /** Pull the accent + typeface straight from the linked résumé's saved style,
   * and jump to the layout that best matches the résumé's — so the pair reads as
   * a set. */
  function handleMatchResume() {
    if (!linkedStyle) {
      showToast("Your linked résumé doesn't have a saved style yet.", "info");
      return;
    }
    const a = linkedStyle.accentId && isKnownAccent(linkedStyle.accentId)
      ? linkedStyle.accentId
      : DEFAULT_ACCENT.id;
    const f = linkedStyle.fontId && isKnownFont(linkedStyle.fontId)
      ? linkedStyle.fontId
      : DEFAULT_FONT_ID;
    setAccentId(a);
    setFontId(f);
    // Jump to the cover-letter layout whose category matches the résumé's
    // template (single column / two column / traditional).
    const resumeCategory = linkedStyle.themeId
      ? getTheme(linkedStyle.themeId).category
      : undefined;
    const match = resumeCategory
      ? COVER_LETTER_THEMES.find((t) => t.category === resumeCategory)
      : undefined;
    const nextThemeId = match?.id ?? focusedId;
    if (match) setFocusedId(match.id);
    if (focusedId) {
      savePreview("cover-letter", letterId, { themeId: nextThemeId, accentId: a, fontId: f });
    }
    showToast(
      match && match.id !== focusedId
        ? "Matched your résumé's style and layout."
        : "Matched your résumé's accent and typeface.",
      "success"
    );
  }

  /** Remember the category filter across reopens. */
  function handleCategory(next: string) {
    setCategory(next);
    saveDesignCategory("cover-letter", next);
  }

  /** Save the currently tuned look (layout + accent + typeface) to the style library. */
  function handleSaveLook(values: VariationValues) {
    const entry = addLibraryStyle({
      name: values.name,
      kind: "cover-letter",
      themeId: focusedId,
      accentId: values.accentId,
      fontId: values.fontId,
      note: values.note,
    });
    setSaveOpen(false);
    showToast(`Saved “${entry.name}” to your library`, "success");
  }

  /** Persist the previewed template + tuned style onto the letter, then update the editor. */
  async function handleApply() {
    if (applying || !focusedId || !hasChanges) return;
    setApplying(true);
    try {
      const scopedToVersion =
        version !== undefined && version !== null && version !== "";
      // Per-version designs: target the SELECTED version so each saved version
      // carries its own design; only fall back to the letter-level template when
      // no version is in play.
      const updated = scopedToVersion
        ? await setCoverLetterVersionTemplate(
            letterId,
            version as string | number,
            focusedId
          )
        : await updateCoverLetter(letterId, { template_id: focusedId });
      saveStyle("cover-letter", letterId, version, { themeId: focusedId, accentId, fontId });
      clearPreview("cover-letter", letterId);
      if (scopedToVersion) {
        invalidateVersionPreview("cover-letter", letterId, version as string | number);
      }
      showToast(
        scopedToVersion ? "Design applied to this version." : "Design applied.",
        "success"
      );
      onApplied(updated);
      onClose();
    } catch (err) {
      reportError(err, "cover letter");
    } finally {
      setApplying(false);
    }
  }

  const styleActions = (
    <div className="pt-1">
      <button
        type="button"
        onClick={handleMatchResume}
        disabled={!canMatchResume}
        title={
          canMatchResume
            ? "Use your linked résumé's accent, typeface, and closest layout"
            : "Link a résumé to this cover letter to match its style"
        }
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-900 bg-background-50 border border-background-200 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <i className="ri-file-user-line"></i>
        Match my résumé&apos;s style
      </button>
    </div>
  );

  return (
    <>
    <DesignChooserDialog
      title={title}
      noun="cover letter"
      cards={cards}
      loading={loading}
      currentId={letter.template_id}
      focusedId={focusedId}
      onFocus={handleFocus}
      category={category}
      categories={categories}
      onCategory={handleCategory}
      previewReady={Boolean(structured)}
      applying={applying}
      onApply={() => void handleApply()}
      hasChanges={hasChanges}
      accents={ACCENT_COLORS}
      accentId={accentId}
      onAccent={handleAccent}
      fonts={DOC_FONTS}
      fontId={fontId}
      onFont={handleFont}
      styleActions={styleActions}
      customization={customization}
      onSaveLook={() => setSaveOpen(true)}
      onClose={onClose}
    />
    {saveOpen && (
      <StyleVariationDialog
        mode="create"
        kind="cover-letter"
        themeId={focusedId}
        themeLabel={COVER_LETTER_THEMES.find((t) => t.id === focusedId)?.name ?? focusedId}
        defaultThemeId={DEFAULT_COVER_LETTER_THEME_ID}
        defaultAccentId={DEFAULT_ACCENT.id}
        defaultFontId={DEFAULT_FONT_ID}
        accentLabel={(id) => getAccent(id).name}
        previewData={structured}
        initial={{ name: "", note: "", accentId, fontId, roleOn: false, roleLabel: "" }}
        onClose={() => setSaveOpen(false)}
        onSave={handleSaveLook}
      />
    )}
    </>
  );
}