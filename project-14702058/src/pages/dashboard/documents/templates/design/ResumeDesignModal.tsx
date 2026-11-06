import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/base/ToastProvider";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import {
  generateResumeTemplate,
  setResumeVersionTemplate,
  updateResume,
  type Resume,
  type ResumeTemplate,
} from "@/lib/documents";
import { readDesignCategory, saveDesignCategory } from "@/lib/designChooserMemory";
import type { JsonResume } from "@/lib/jsonResume";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
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
import { DEFAULT_THEME_ID } from "@/pages/dashboard/documents/templates/themeRegistry";
import StyleVariationDialog, {
  type VariationValues,
} from "@/pages/dashboard/documents/templates/StyleVariationDialog";
import { addLibraryStyle } from "@/lib/styleLibrary";
import useResumeTemplates from "./useResumeTemplates";
import { invalidateVersionPreview } from "@/pages/dashboard/documents/components/useVersionPreview";
import DesignChooserDialog, { type DesignCard } from "./DesignChooserDialog";
import {
  resolveTemplateAccentId,
  resolveTemplateFontId,
  resolveTemplateTheme,
  templateFontLabel,
} from "./resumeTemplateMapping";

interface ResumeDesignModalProps {
  resumeId: string;
  /** Active version — its own style memory is written alongside the current one. */
  version?: string | number;
  /** The résumé's display title, shown in the header. */
  title: string;
  /** The user's OWN résumé data — rendered into every preview. Never re-fetched. */
  data: JsonResume | null;
  /** The template persisted on the résumé (server `template_id`) — gets the "Current" badge. */
  currentTemplateId?: string;
  /** How the Skills section should render inside the previews. */
  skillsLayout?: SkillsLayout;
  onClose: () => void;
  /** Called with the updated résumé once a design is applied. */
  onApplied: (resume: Resume) => void;
}

/** A template's own default accent + typeface — its "starting point". */
function templateStyleDefaults(t: ResumeTemplate): { accentId: string; fontId: string } {
  return {
    accentId: resolveTemplateAccentId(t.style?.accent_color),
    fontId: resolveTemplateFontId(t),
  };
}

/**
 * The in-context Design chooser for a résumé. The catalog is fetched once, every
 * thumbnail is rendered from the already-loaded résumé data, and only "Use this
 * template" writes. Beyond picking a layout, the accent and typeface can be
 * fine-tuned before applying. It reopens on the design you last previewed
 * (remembered per résumé), so you land exactly where you left off browsing.
 */
export default function ResumeDesignModal({
  resumeId,
  version,
  title,
  data,
  currentTemplateId,
  skillsLayout = "comma",
  onClose,
  onApplied,
}: ResumeDesignModalProps) {
  const { showToast } = useToast();
  const { reportError } = useChangeFeedback();
  const { templates, categories, loading, error, reload, append } = useResumeTemplates();

  const [focusedId, setFocusedId] = useState("");
  const [category, setCategory] = useState(() => readDesignCategory("resume"));
  const [accentId, setAccentId] = useState("");
  const [fontId, setFontId] = useState("");
  const [applying, setApplying] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genText, setGenText] = useState("");
  const [generating, setGenerating] = useState(false);

  // Land on the last design previewed for this résumé; otherwise the applied one,
  // otherwise the first available design — and seed the accent/typeface from the
  // previewed look (or the applied style for the current template).
  useEffect(() => {
    if (focusedId || templates.length === 0) return;
    const remembered = readPreview("resume", resumeId);
    const rememberedTemplate = remembered
      ? templates.find((t) => t.id === remembered.themeId)
      : undefined;
    const initial =
      rememberedTemplate ?? templates.find((t) => t.id === currentTemplateId) ?? templates[0];
    setFocusedId(initial.id);

    const defaults = templateStyleDefaults(initial);
    if (rememberedTemplate && remembered) {
      setAccentId(isKnownAccent(remembered.accentId) ? remembered.accentId : defaults.accentId);
      setFontId(
        remembered.fontId && isKnownFont(remembered.fontId) ? remembered.fontId : defaults.fontId
      );
      return;
    }
    if (initial.id === currentTemplateId) {
      const stored = readStyle("resume", resumeId, version);
      setAccentId(
        stored?.accentId && isKnownAccent(stored.accentId) ? stored.accentId : defaults.accentId
      );
      setFontId(
        stored?.fontId && isKnownFont(stored.fontId) ? stored.fontId : defaults.fontId
      );
      return;
    }
    setAccentId(defaults.accentId);
    setFontId(defaults.fontId);
  }, [templates, currentTemplateId, focusedId, resumeId, version]);

  // Union the API categories with anything the catalog introduces (e.g. generated).
  const chips = useMemo(() => {
    const out = [...categories];
    for (const t of templates) if (!out.includes(t.category)) out.push(t.category);
    return out;
  }, [categories, templates]);

  const cards: DesignCard[] = useMemo(
    () =>
      templates.map((t) => {
        const theme = resolveTemplateTheme(t);
        const accent = getAccent(resolveTemplateAccentId(t.style?.accent_color));
        const font = getFont(resolveTemplateFontId(t));
        return {
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          accent,
          fontLabel: templateFontLabel(t),
          fontName: font.name,
          fontStack: font.stack,
          render: (picked: AccentColor) =>
            data ? <theme.Component resume={data} accent={picked} skillsLayout={skillsLayout} /> : null,
        };
      }),
    [templates, data, skillsLayout]
  );

  /** The accent/typeface currently recorded on the résumé (its applied look). */
  const applied = useMemo(() => {
    const stored = readStyle("resume", resumeId, version);
    const appliedTemplate = templates.find((t) => t.id === currentTemplateId);
    const defaults = appliedTemplate ? templateStyleDefaults(appliedTemplate) : null;
    return {
      accentId:
        stored?.accentId && isKnownAccent(stored.accentId)
          ? stored.accentId
          : defaults?.accentId ?? DEFAULT_ACCENT.id,
      fontId:
        stored?.fontId && isKnownFont(stored.fontId)
          ? stored.fontId
          : defaults?.fontId ?? DEFAULT_FONT_ID,
    };
  }, [resumeId, version, templates, currentTemplateId]);

  /** Whether the focused template's own defaults have been deviated from. */
  const focusedTemplate = templates.find((t) => t.id === focusedId);
  const focusedDefaults = focusedTemplate
    ? templateStyleDefaults(focusedTemplate)
    : { accentId: DEFAULT_ACCENT.id, fontId: DEFAULT_FONT_ID };
  const accentChanged = accentId !== focusedDefaults.accentId;
  const fontChanged = fontId !== focusedDefaults.fontId;
  const customization = {
    accentFrom: accentChanged ? getAccent(focusedDefaults.accentId).name : undefined,
    accentTo: accentChanged ? getAccent(accentId).name : undefined,
    fontFrom: fontChanged ? getFont(focusedDefaults.fontId).name : undefined,
    fontTo: fontChanged ? getFont(fontId).name : undefined,
  };

  const hasChanges =
    focusedId !== currentTemplateId ||
    accentId !== applied.accentId ||
    fontId !== applied.fontId;

  /** Focus a design (adopting its look) and remember it as the last previewed. */
  function handleFocus(id: string) {
    setFocusedId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    const defaults = templateStyleDefaults(t);
    setAccentId(defaults.accentId);
    setFontId(defaults.fontId);
    savePreview("resume", resumeId, {
      themeId: t.id,
      accentId: defaults.accentId,
      fontId: defaults.fontId,
    });
  }

  /** Fine-tune the accent — remembered with the previewed look. */
  function handleAccent(id: string) {
    setAccentId(id);
    if (focusedId) savePreview("resume", resumeId, { themeId: focusedId, accentId: id, fontId });
  }

  /** Fine-tune the typeface — remembered with the previewed look. */
  function handleFont(id: string) {
    setFontId(id);
    if (focusedId) savePreview("resume", resumeId, { themeId: focusedId, accentId, fontId: id });
  }

  /** Reset the accent/typeface back to the focused template's own defaults. */
  function handleResetStyle() {
    setAccentId(focusedDefaults.accentId);
    setFontId(focusedDefaults.fontId);
    if (focusedId) {
      savePreview("resume", resumeId, {
        themeId: focusedId,
        accentId: focusedDefaults.accentId,
        fontId: focusedDefaults.fontId,
      });
    }
  }

  /** Remember the category filter across reopens. */
  function handleCategory(next: string) {
    setCategory(next);
    saveDesignCategory("resume", next);
  }

  /** Save the currently tuned look (layout + accent + typeface) to the style library. */
  function handleSaveLook(values: VariationValues) {
    const entry = addLibraryStyle({
      name: values.name,
      kind: "resume",
      themeId: focusedId,
      accentId: values.accentId,
      fontId: values.fontId,
      note: values.note,
    });
    setSaveOpen(false);
    showToast(`Saved “${entry.name}” to your library`, "success");
  }

  /** Persist the previewed template + tuned style onto the résumé, then update the editor. */
  async function handleApply() {
    const focusedCard = templates.find((t) => t.id === focusedId) ?? templates[0];
    if (!focusedCard || applying || !hasChanges) return;
    setApplying(true);
    try {
      const scopedToVersion =
        version !== undefined && version !== null && version !== "";
      // Per-version designs: the chooser targets the SELECTED version, so each
      // saved version carries its own design
      // (PATCH /resumes/{id}/versions/{version} with { template_id }). Only fall
      // back to the résumé-level template when no version is in play.
      const updated = scopedToVersion
        ? await setResumeVersionTemplate(resumeId, version as string | number, focusedCard.id)
        : await updateResume(resumeId, { template_id: focusedCard.id });
      // Persist the full look — layout + accent + typeface — as the starting point,
      // so the editor's accent/font can still be adjusted from there.
      saveStyle("resume", resumeId, version, {
        themeId: focusedCard.id,
        accentId,
        fontId,
      });
      clearPreview("resume", resumeId);
      // This version's own render now carries a new template — drop the cached
      // render so the viewer/marquee re-read it and show the new design at once.
      if (scopedToVersion) {
        invalidateVersionPreview("resume", resumeId, version as string | number);
      }
      showToast(
        scopedToVersion ? "Design applied to this version." : "Design applied.",
        "success"
      );
      onApplied(updated);
      onClose();
    } catch (err) {
      reportError(err, "résumé");
    } finally {
      setApplying(false);
    }
  }

  async function handleGenerate() {
    const description = genText.trim();
    if (!description || generating) return;
    setGenerating(true);
    try {
      const template = await generateResumeTemplate({ description });
      append(template);
      setFocusedId(template.id);
      const defaults = templateStyleDefaults(template);
      setAccentId(defaults.accentId);
      setFontId(defaults.fontId);
      setGenText("");
      setGenOpen(false);
      showToast("Template generated.", "success");
    } catch (err) {
      reportError(err, "résumé");
    } finally {
      setGenerating(false);
    }
  }

  const advanced = (
    <>
      <div className="rounded-lg border border-background-200 bg-background-100/60 px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs text-foreground-600">
          Browse looks built by the community.
        </span>
        <button
          type="button"
          onClick={() => showToast("Community templates aren’t available yet.", "info")}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-900 bg-background-50 border border-background-200 px-2.5 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-compass-3-line"></i>
          Community
        </button>
      </div>

      <div className="rounded-lg border border-background-200 bg-background-100/60 px-3 py-2.5 space-y-2">
        <button
          type="button"
          onClick={() => setGenOpen((v) => !v)}
          aria-expanded={genOpen}
          className="w-full flex items-center gap-1.5 text-xs font-semibold text-foreground-700 hover:text-foreground-950 cursor-pointer"
        >
          <i className="ri-sparkling-2-line text-accent-600"></i>
          Generate a template with AI
        </button>
        {genOpen && (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={genText}
              onChange={(e) => setGenText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleGenerate();
              }}
              placeholder="e.g. a calm, editorial two-column look"
              className="flex-1 min-w-[180px] px-3 py-1.5 rounded-md bg-background-50 border border-background-400 text-xs text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400"
            />
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating || !genText.trim()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className={generating ? "ri-loader-4-line animate-spin" : "ri-magic-line"}></i>
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
    <DesignChooserDialog
      title={title}
      noun="résumé"
      cards={cards}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      currentId={currentTemplateId}
      focusedId={focusedId}
      onFocus={handleFocus}
      category={category}
      categories={chips}
      onCategory={handleCategory}
      previewReady={Boolean(data)}
      applying={applying}
      onApply={() => void handleApply()}
      hasChanges={hasChanges}
      accents={ACCENT_COLORS}
      accentId={accentId}
      onAccent={handleAccent}
      fonts={DOC_FONTS}
      fontId={fontId}
      onFont={handleFont}
      customization={customization}
      onResetStyle={handleResetStyle}
      onSaveLook={() => setSaveOpen(true)}
      advanced={advanced}
      onClose={onClose}
    />
    {saveOpen && (
      <StyleVariationDialog
        mode="create"
        kind="resume"
        themeId={focusedId}
        themeLabel={focusedTemplate?.name ?? focusedId}
        defaultThemeId={DEFAULT_THEME_ID}
        defaultAccentId={DEFAULT_ACCENT.id}
        defaultFontId={DEFAULT_FONT_ID}
        accentLabel={(id) => getAccent(id).name}
        previewData={data}
        initial={{ name: "", note: "", accentId, fontId, roleOn: false, roleLabel: "" }}
        onClose={() => setSaveOpen(false)}
        onSave={handleSaveLook}
      />
    )}
    </>
  );
}