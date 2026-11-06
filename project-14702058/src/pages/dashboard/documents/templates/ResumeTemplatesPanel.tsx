import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import {
  activateResumeVersion,
  createResumeVersion,
  exportResumeDocx,
  exportResumePdf,
  getResume,
  getResumeRender,
  getResumeStructured,
  improveResumeStructured,
  incorporateResume,
  replaceResumeText,
  resolveResumeTitle,
  setResumeVersionTemplate,
  tailorErrorMessage,
  updateResume,
  type Resume,
  type StructuredImprovement,
} from "@/lib/documents";
import { runDirectImprove } from "@/lib/directImprove";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import useAiEdit, { AI_EDIT_NO_CHANGE_INLINE_MESSAGE } from "@/hooks/useAiEdit";
import type { JsonResume } from "@/lib/jsonResume";
import { RESUME_PRESETS } from "@/lib/resumePresets";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import { useImproveMemory } from "@/hooks/useImproveMemory";
import { useIncorporateHistory } from "@/hooks/useIncorporateHistory";
import { useRecentInstructions } from "@/hooks/useRecentInstructions";
import type { IncorporateEntry } from "@/lib/incorporateHistory";
import AddPointsPanel from "@/pages/dashboard/documents/components/AddPointsPanel";
import SectionStyleScope from "@/pages/dashboard/documents/components/SectionStyleScope";
import FindReplacePanel from "@/pages/dashboard/documents/components/FindReplacePanel";
import useFindReplace from "@/hooks/useFindReplace";
import { countMatches, matchSentenceContext } from "@/lib/findReplace";
import { useSectionStyles } from "@/lib/sectionStyles";
import {
  readSkillsLayout,
  writeSkillsLayout,
  type SkillsLayout,
} from "@/lib/skillsLayoutMemory";
import SkillsLayoutToggle from "./SkillsLayoutToggle";
import TargetRoleSelect from "@/pages/dashboard/documents/components/TargetRoleSelect";
import TemplatePreview from "./TemplatePreview";
import { PAPER_WIDTH } from "./themes/paper";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";
import { invalidateVersionPreview } from "@/pages/dashboard/documents/components/useVersionPreview";
import TemplateGallery from "./TemplateGallery";
import SavedStylesPanel from "./SavedStylesPanel";
import StructuredImprovePreview from "./StructuredImprovePreview";
import RoleAddBullet from "./RoleAddBullet";
import EditableBullet from "./EditableBullet";
import {
  appendBullet,
  bulletTargetKey,
  collectResumeBulletGroups,
  countResumeBullets,
  countStrengthenedBullets,
  getTargetBullets,
  isWholeResumeStrengthen,
  moveBullet,
  persistResumeStructure,
  polishBulletInstruction,
  strengthenBulletInstruction,
  strengthenRoleInstruction,
  strengthenWholeResumeInstruction,
  removeBulletAt,
  removeLastBullet,
  setBullet,
  type BulletTarget,
} from "./bulletActions";
import { saveBulletStrengthen } from "@/lib/bulletStrengthenMemory";
import type { RenderBulletArgs } from "./bulletRender";
import { revisionReviewKey } from "@/lib/revisionReview";
import { DEFAULT_THEME_ID, RESUME_THEMES, getTheme } from "./themeRegistry";
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  getAccent,
  isKnownAccent,
} from "./accent";
import { DEFAULT_FONT_ID, DOC_FONTS, getFont, isKnownFont } from "./styleFonts";
import {
  clearPreview,
  clearStyle,
  readPreview,
  readStyle,
  savePreview,
  saveStyle,
} from "./templateStyle";
import { diffFields, resolveByReverts } from "./structuredDiff";
import { metricMemoryKey, migrateVerifiedMetrics, saveVersionMetric } from "./metricMemory";
import {
  readIncorporateDraft,
  writeIncorporateDraft,
} from "@/lib/incorporateMemory";
import { saveVersionFindings } from "@/lib/versionFindings";
import { markImprovedVersion } from "@/lib/versionImproveMemory";
import { saveAppliedInstruction } from "@/lib/versionAppliedInstruction";
import { IMPROVE_EVERYTHING_INSTRUCTION } from "@/lib/improveEverything";
import { saveAiEditTrace } from "@/lib/aiEditTrace";
import { readTargetRole, writeTargetRole } from "./targetRoleMemory";
import { flattenResume, resumeToMarkdown } from "./resumeFields";
import { stripResumeInstructionEchoDetailed } from "./instructionEcho";
import { impactLabelForEntry, impactTermsForEntry } from "@/lib/impact";
import { describeAction } from "./changeActionMessage";

/** Remembered layout for the structured-improve preview: "replace" or "split". */
const PREVIEW_COMPARE_STORAGE_KEY = "hirewave_preview_compare_mode";

/**
 * Resolve the remembered template + accent for a résumé, validating each pick
 * against the known catalogs (and honouring a version-specific memory).
 */
function resolveResumeChoice(
  id: string,
  version?: string | number
): { themeId: string; accentId: string; fontId: string } {
  const stored = readStyle("resume", id, version);
  return {
    themeId:
      stored?.themeId && RESUME_THEMES.some((t) => t.id === stored.themeId)
        ? stored.themeId
        : DEFAULT_THEME_ID,
    accentId:
      stored?.accentId && isKnownAccent(stored.accentId)
        ? stored.accentId
        : DEFAULT_ACCENT.id,
    fontId:
      stored?.fontId && isKnownFont(stored.fontId) ? stored.fontId : DEFAULT_FONT_ID,
  };
}

function fileBase(name: string): string {
  return (
    name
      .replace(/\.[^./\\]+$/, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "resume"
  );
}

/** A résumé is "too thin to preview" only when name, work and skills are all empty. */
function isEmptyResume(r: JsonResume | null): boolean {
  if (!r) return true;
  return (
    !(r.basics?.name && r.basics.name.trim()) &&
    (r.work ?? []).length === 0 &&
    (r.skills ?? []).length === 0
  );
}

interface ResumeTemplatesPanelProps {
  resumeId: string;
  /** Known résumé title, used for the download filename. Fetched when omitted. */
  title?: string;
  /** Changing this re-fetches the structured data (e.g. after a version change). */
  refreshKey?: string;
  /** Active version — its own template + accent are remembered separately. */
  version?: string | number;
  /** Called with the full résumé after an improvement is saved as a new version. */
  onAccepted?: (resume: Resume) => void;
  /**
   * The role the user is targeting (from the tailor picker). When set, the
   * main Improve and every per-section Improve are tailored to this job.
   */
  jobPostingId?: string | number;
  /** Display label for the target role, shown on the Improve panel. */
  jobLabel?: string | null;
  /**
   * Role carried in via a link (e.g. a document-row role chip). Pre-selects the
   * improve target and is remembered for this document.
   */
  initialRole?: string;
  /** Display label for `initialRole` when it isn't a known job id. */
  initialRoleLabel?: string | null;
  /**
   * AI Review findings (suggestion titles) to offer as tickable focus points on
   * the Improve panel. Passed down from the Document view's current review.
   */
  findings?: string[];
}

/**
 * Two-pane template chooser: a compact thumbnail gallery + style controls on the
 * left, and the résumé rendered live on the selected template on the right (sticky,
 * so choices and results are always visible together). Selecting a template only
 * previews it — "Use this template" persists it on the résumé.
 */
export default function ResumeTemplatesPanel({
  resumeId,
  title,
  refreshKey,
  version,
  onAccepted,
  jobPostingId,
  jobLabel,
  initialRole,
  initialRoleLabel,
  findings = [],
}: ResumeTemplatesPanelProps) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { reportError, reportUnchanged } = useChangeFeedback();
  const improve = useImproveMemory(resumeId, RESUME_PRESETS);
  // Ticked review findings — remembered per résumé by the shared improve memory.
  const activeFindings = improve.selectedFindings.filter((f) => findings.includes(f));

  const [structured, setStructured] = useState<JsonResume | null>(null);
  const [resume, setResume] = useState<Resume | null>(null);
  /** How the Skills section is presented — a display toggle, never an AI call. */
  const [skillsLayout, setSkillsLayout] = useState<SkillsLayout>(() =>
    readSkillsLayout(resumeId)
  );
  // Per-section bold / italic overrides for THIS version — applied to the live
  // preview (a client-rendered theme paper) so it matches the main preview, and
  // remembered per version so switching versions restores each one's own styling.
  const sectionStyles = useSectionStyles(resumeId, version);

  // Deterministic Find & Replace — the reliable path for an exact "replace X with
  // Y" instruction (mirrors the detail editor), so verbatim swaps never reach the AI.
  const findReplace = useFindReplace({
    replaceFn: (input) => replaceResumeText(resumeId, input),
    getText: () => resume?.rendered_text ?? "",
    onApply: handleFindReplaceApply,
    memoryKey: `resume_${resumeId}`,
    kindLabel: "résumé",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [themeId, setThemeId] = useState<string>(
    () => resolveResumeChoice(resumeId, version).themeId
  );
  const [accentId, setAccentId] = useState<string>(
    () => resolveResumeChoice(resumeId, version).accentId
  );
  const [fontId, setFontId] = useState<string>(
    () => resolveResumeChoice(resumeId, version).fontId
  );
  /** The template persisted on the résumé (server `template_id`). */
  const [appliedTemplateId, setAppliedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadError, setDownloadError] = useState("");
  /** Whether the live-preview paper is open in the full-screen readable view. */
  const [previewExpanded, setPreviewExpanded] = useState(false);
  /** Debounce timer for live-rendering a candidate template while browsing. */
  const renderTimer = useRef<number | null>(null);
  /** The template applied on the server, mirrored in a ref for restore logic. */
  const appliedRef = useRef("");

  /**
   * Decide what the document should open on: the last template the user
   * previewed when it differs from the applied one, otherwise the applied (or
   * remembered) layout. This is what makes a document reopen "where you left
   * off" even when the previewed layout was never applied.
   */
  function restoreChoice(applied: string) {
    const preview = readPreview("resume", resumeId);
    if (
      preview &&
      preview.themeId !== applied &&
      RESUME_THEMES.some((t) => t.id === preview.themeId)
    ) {
      setThemeId(preview.themeId);
      setAccentId(isKnownAccent(preview.accentId) ? preview.accentId : DEFAULT_ACCENT.id);
      setFontId(preview.fontId && isKnownFont(preview.fontId) ? preview.fontId : DEFAULT_FONT_ID);
      return;
    }
    const base = resolveResumeChoice(resumeId, version);
    setThemeId(applied || base.themeId);
    setAccentId(base.accentId);
    setFontId(base.fontId);
  }

  // Structured improve — preview only until accepted.
  const [improvement, setImprovement] = useState<StructuredImprovement | null>(null);
  /** How many AI-returned lines the echo guard stripped from this preview. */
  const [ignoredEchoCount, setIgnoredEchoCount] = useState(0);
  const [improving, setImproving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [improveError, setImproveError] = useState("");
  const [pendingPrompts, setPendingPrompts] = useState<string[]>([]);
  const [pendingInstruction, setPendingInstruction] = useState("");
  /** Review findings sent as focus_points on the improve that produced the current preview. */
  const [pendingFindings, setPendingFindings] = useState<string[]>([]);
  const [compare, setCompare] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_COMPARE_STORAGE_KEY) === "split";
    } catch {
      return false;
    }
  });

  // The "Notes & instructions" draft — persisted per résumé so it survives a reopen.
  const [incNotes, setIncNotes] = useState<string>(
    () => readIncorporateDraft("resume", resumeId).notes
  );
  const [incorporating, setIncorporating] = useState(false);
  const [incorporateError, setIncorporateError] = useState("");
  /** Inline status under the instruction box when a submit made NO change. */
  const [notesNotice, setNotesNotice] = useState("");

  // Past "own points" submissions + whether they landed (the re-run log).
  const {
    entries: incorporateHistory,
    record: recordIncorporate,
    rearm: rearmIncorporate,
    settle: settleIncorporate,
    remove: removeIncorporate,
    clearAll: clearIncorporateHistory,
  } = useIncorporateHistory("resume", resumeId);
  // Recently applied AI directives — shown in the box so a past command can be re-run.
  const recentInstructions = useRecentInstructions("resume", resumeId);
  // The immediate "Ask AI to change it" action (shared): apply the instruction via
  // `…/ai-edit`, re-render from the returned résumé, and offer one-click Undo.
  const aiEdit = useAiEdit({
    kind: "resume",
    docId: resumeId,
    getContent: () => (structured ? resumeToMarkdown(structured) : resume?.rendered_text),
    getPreviousVersion: () => resume?.active_version,
    onApplied: (updated) => {
      const next = updated as Resume;
      setResume(next);
      onAccepted?.(next);
    },
    activateVersion: async (version) => {
      const restored = await activateResumeVersion(resumeId, version);
      setResume(restored);
      onAccepted?.(restored);
    },
    reload: refreshStructured,
    onAppliedClear: () => updateIncNotes(""),
    rememberInstruction: (instruction) => recentInstructions.push(instruction),
    onVersionTagged: (version, instruction, editCount) => {
      markImprovedVersion("resume", resumeId, version);
      saveAppliedInstruction("resume", resumeId, version, instruction);
      saveAiEditTrace("resume", resumeId, { count: editCount, version, at: Date.now() });
    },
    onOpenFindReplace: () => findReplace.setOpen(true),
    // A no-op edit shows an inline notice under the box (the text stays put).
    onNoChange: () => setNotesNotice(AI_EDIT_NO_CHANGE_INLINE_MESSAGE),
  });
  // Only an "own points" submission should settle a history entry on accept.
  const fromIncorporateRef = useRef(false);
  // True while the pending preview came from the "Notes & instructions" box.
  const fromNotesRef = useRef(false);
  // A past input's impact view (painted onto the rendered paper on demand).
  const [impact, setImpact] = useState<{ label: string; terms: string[] } | null>(null);
  /** The row currently persisting a bullet change (locked while it saves). */
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Which role an improvement tailors to. Seeded from the Document view's tailor
  // picker (or the last in-tab pick, so it survives a reload), then changeable
  // right here so the target can be switched without leaving the tab.
  const [targetJobs, setTargetJobs] = useState<TailorableJob[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(() => {
    if (initialRole) return initialRole;
    const stored = readTargetRole("resume", resumeId);
    if (stored) return stored;
    return jobPostingId !== undefined && jobPostingId !== null ? String(jobPostingId) : "";
  });

  const displayTitle = title?.trim() || resolveResumeTitle(resume);
  const theme = getTheme(themeId);
  const accent = getAccent(accentId);
  const font = getFont(fontId);
  const isEmpty = isEmptyResume(structured);
  // Verified-figure memory is scoped to this document + its active version.
  const metricKey = metricMemoryKey("resume", resumeId, version);

  // The chosen improve target's display label (falls back to the carrier label).
  const selectedTargetLabel = useMemo(() => {
    if (!selectedTargetId) return null;
    const job = targetJobs.find((j) => String(j.job_posting_id) === selectedTargetId);
    if (job) return `${job.title} · ${job.company}`;
    if (initialRole && initialRoleLabel && selectedTargetId === initialRole) {
      return initialRoleLabel;
    }
    return jobLabel ?? null;
  }, [selectedTargetId, targetJobs, jobLabel, initialRole, initialRoleLabel]);

  // Fallback label so a carried-in role that isn't in the jobs list still renders.
  const selectedTargetFallbackLabel =
    initialRole && initialRoleLabel && selectedTargetId === initialRole
      ? initialRoleLabel
      : jobLabel ?? null;

  // Field-level differences between the saved résumé and the AI's version —
  // powers the selective-accept list (revert individual edits before saving).
  const improveChanges = useMemo(
    () =>
      improvement
        ? diffFields(flattenResume(structured), flattenResume(improvement.structured))
        : [],
    [improvement, structured]
  );

  /**
   * Resolve the rendered document + the template it's saved on from the render
   * endpoint, falling back to the structured endpoint when /render is unavailable.
   */
  async function refreshStructured() {
    setError("");
    try {
      const rendered = await getResumeRender(resumeId);
      const saved =
        rendered.template && RESUME_THEMES.some((t) => t.id === rendered.template)
          ? rendered.template
          : "";
      if (saved) {
        setAppliedTemplateId(saved);
        appliedRef.current = saved;
      }
      setStructured(rendered.data);
      restoreChoice(saved || appliedRef.current);
    } catch {
      try {
        setStructured(await getResumeStructured(resumeId));
      } catch (fallbackErr) {
        setError(
          fallbackErr instanceof ApiError
            ? fallbackErr.message
            : "Could not load this résumé's structured data."
        );
      }
    }
  }

  async function load() {
    setLoading(true);
    // Fetch the résumé first for its persisted template_id (and fallback title).
    try {
      const fetched = await getResume(resumeId);
      setResume(fetched);
      if (fetched.template_id) {
        setAppliedTemplateId(fetched.template_id);
        appliedRef.current = fetched.template_id;
      }
    } catch {
      /* title + saved template are best-effort */
    }
    await refreshStructured();
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, refreshKey]);

  // Clear the live-render debounce timer on unmount.
  useEffect(
    () => () => {
      if (renderTimer.current) window.clearTimeout(renderTimer.current);
    },
    []
  );

  // Load the roles an improvement can be tailored to (matches + saved jobs).
  useEffect(() => {
    let alive = true;
    listTailorableJobs()
      .then((jobs) => {
        if (alive) setTargetJobs(jobs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Follow the role selected in the Document view's tailor picker, but only for
  // genuine in-session changes — a reload restores the remembered in-tab pick.
  const targetDocRef = useRef<string | null>(null);
  const targetInitRef = useRef(true);

  // (Re)initialize the target whenever the document changes.
  useEffect(() => {
    if (targetDocRef.current === resumeId) return;
    targetDocRef.current = resumeId;
    targetInitRef.current = true; // re-arm the prop effect for this document
    if (initialRole) {
      setSelectedTargetId(initialRole);
      writeTargetRole("resume", resumeId, initialRole);
      return;
    }
    const stored = readTargetRole("resume", resumeId);
    setSelectedTargetId(
      stored ||
        (jobPostingId !== undefined && jobPostingId !== null ? String(jobPostingId) : "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // Follow the tailor picker once the initial (persisted) value has settled.
  useEffect(() => {
    if (targetInitRef.current) {
      targetInitRef.current = false;
      return;
    }
    const next =
      jobPostingId !== undefined && jobPostingId !== null ? String(jobPostingId) : "";
    setSelectedTargetId(next);
    writeTargetRole("resume", resumeId, next);
  }, [jobPostingId, resumeId]);

  // A role carried in via a link (e.g. a document-row role chip) pre-selects the
  // improve target and is remembered for this document.
  const initialRoleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialRole) return;
    if (initialRoleRef.current === initialRole) return;
    initialRoleRef.current = initialRole;
    setSelectedTargetId(initialRole);
    writeTargetRole("resume", resumeId, initialRole);
  }, [initialRole, resumeId]);

  /** Change the improve target and remember it for this résumé. */
  function handleTargetChange(value: string) {
    setSelectedTargetId(value);
    writeTargetRole("resume", resumeId, value);
  }

  // Re-read the remembered look whenever the active version changes, so
  // revisiting a version restores exactly how it was styled. The improvement
  // preview belongs to the previous content, so it's dropped too.
  useEffect(() => {
    restoreChoice(appliedRef.current);
    setSkillsLayout(readSkillsLayout(resumeId));
    setImprovement(null);
    setIgnoredEchoCount(0);
    setImproveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId, version]);

  // Reload the "Notes & instructions" draft whenever the résumé changes.
  useEffect(() => {
    const draft = readIncorporateDraft("resume", resumeId);
    setIncNotes(draft.notes);
    setIncorporateError("");
    setNotesNotice("");
  }, [resumeId]);

  /** Preview a template (doesn't persist) and live-render it, debounced. */
  function selectTheme(nextId: string) {
    setThemeId(nextId);
    saveStyle("resume", resumeId, version, { themeId: nextId, accentId, fontId });
    savePreview("resume", resumeId, { themeId: nextId, accentId, fontId });
    if (renderTimer.current) window.clearTimeout(renderTimer.current);
    renderTimer.current = window.setTimeout(() => {
      getResumeRender(resumeId, nextId)
        .then((rendered) => {
          if (rendered?.data) setStructured(rendered.data);
        })
        .catch(() => {
          /* preview already re-renders client-side — keep the current data */
        });
    }, 300);
  }

  function selectAccent(nextId: string) {
    setAccentId(nextId);
    saveStyle("resume", resumeId, version, { themeId, accentId: nextId, fontId });
    savePreview("resume", resumeId, { themeId, accentId: nextId, fontId });
  }

  function selectFont(nextId: string) {
    setFontId(nextId);
    saveStyle("resume", resumeId, version, { themeId, accentId, fontId: nextId });
    savePreview("resume", resumeId, { themeId, accentId, fontId: nextId });
  }

  /** Apply a saved library style: preview it here; "Use this template" persists it. */
  function handleApplyLibraryStyle(nextThemeId: string, nextAccentId: string, nextFontId: string) {
    selectTheme(nextThemeId);
    setAccentId(nextAccentId);
    setFontId(nextFontId);
    saveStyle("resume", resumeId, version, {
      themeId: nextThemeId,
      accentId: nextAccentId,
      fontId: nextFontId,
    });
    savePreview("resume", resumeId, {
      themeId: nextThemeId,
      accentId: nextAccentId,
      fontId: nextFontId,
    });
  }

  /** Persist the previewed template onto the SELECTED version (or the résumé when none). */
  async function handleUseTemplate() {
    if (applyingTemplate || themeId === appliedTemplateId) return;
    setApplyingTemplate(true);
    try {
      const scopedToVersion =
        version !== undefined && version !== null && version !== "";
      // Per-version designs: apply to the selected version so it carries its own
      // design; the résumé-level template is only used when no version is in play.
      const updated = scopedToVersion
        ? await setResumeVersionTemplate(resumeId, version as string | number, themeId)
        : await updateResume(resumeId, { template_id: themeId });
      setResume(updated);
      setAppliedTemplateId(themeId);
      appliedRef.current = themeId;
      saveStyle("resume", resumeId, version, { themeId, accentId, fontId });
      // Applied — the "last previewed" pointer is now the applied layout.
      clearPreview("resume", resumeId);
      // A version's design changed — drop its cached render so the viewer/marquee
      // re-read it, then re-render the version from the response so the change
      // shows immediately.
      if (scopedToVersion) {
        invalidateVersionPreview("resume", resumeId, version as string | number);
      }
      await refreshStructured();
      showToast(
        `${theme.name} applied${scopedToVersion ? " to this version" : " to this résumé"}`,
        "success"
      );
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not apply the template.",
        "error"
      );
    } finally {
      setApplyingTemplate(false);
    }
  }

  /** Forget this résumé's saved style and return it to the default layout. */
  function handleResetStyle() {
    clearStyle("resume", resumeId, version);
    clearPreview("resume", resumeId);
    setThemeId(DEFAULT_THEME_ID);
    setAccentId(DEFAULT_ACCENT.id);
    setFontId(DEFAULT_FONT_ID);
    saveStyle("resume", resumeId, version, {
      themeId: DEFAULT_THEME_ID,
      accentId: DEFAULT_ACCENT.id,
      fontId: DEFAULT_FONT_ID,
    });
    showToast("Style reset to default", "success");
  }

  function updateCompare(value: boolean) {
    setCompare(value);
    try {
      localStorage.setItem(PREVIEW_COMPARE_STORAGE_KEY, value ? "split" : "replace");
    } catch {
      /* the toggle still works for this session */
    }
  }

  /**
   * Run a structured improve. Carries the selected prompts plus optional free
   * text. `content` overrides the on-screen text the AI improves (used by the
   * just-added-bullet "Polish with AI", which sends the exact résumé text).
   */
  async function runImprove(
    instructions: string[],
    instruction: string,
    focusPoints: string[] = [],
    content?: string,
    opts?: { fromNotes?: boolean }
  ) {
    if (improving) return;
    setImproving(true);
    setImproveError("");
    setPendingPrompts(instructions);
    setPendingInstruction(instruction);
    setPendingFindings(focusPoints);
    // Track the Improve panel's chip + custom-instruction runs in the past-inputs
    // log too — accepting settles them and re-running can replay them. A single-
    // bullet polish passes `content` and isn't logged (an inline edit, not a run);
    // a "Notes & instructions" run is a pure directive and is never logged.
    const fromNotes = opts?.fromNotes ?? false;
    const trackable =
      !fromNotes &&
      (instructions.length > 0 || (instruction.trim().length > 0 && !content));
    if (trackable) {
      recordIncorporate(instruction.trim(), instructions);
      fromIncorporateRef.current = true;
    } else {
      fromIncorporateRef.current = false;
    }
    fromNotesRef.current = fromNotes;
    try {
      const result = await improveResumeStructured(resumeId, {
        instructions,
        instruction,
        job_posting_id: selectedTargetId || undefined,
        focus_points: focusPoints.length ? focusPoints : undefined,
        content,
      });
      // The instruction + chips are GUIDANCE, not content — drop any verbatim
      // echo the AI returned so a directive can't become a résumé bullet.
      const guarded = stripResumeInstructionEchoDetailed(result.structured, structured, [
        instruction,
        ...instructions,
      ]);
      setImprovement({ ...result, structured: guarded.doc });
      setIgnoredEchoCount(guarded.strippedCount);
    } catch (err) {
      setImproveError(tailorErrorMessage(err, "résumé"));
      reportError(err, "résumé");
    } finally {
      setImproving(false);
    }
  }

  /** Save the resolved markdown (kept AI edits only) as a new version, then re-render. */
  async function handleAccept(
    markdown: string,
    metrics: { total: number; verified: number }
  ) {
    if (!improvement || applying) return;
    setApplying(true);
    setImproveError("");
    try {
      const updated = await createResumeVersion(resumeId, {
        text: markdown,
        instructions: pendingPrompts.length ? pendingPrompts : undefined,
        instruction: pendingInstruction || undefined,
        job_posting_id: selectedTargetId || undefined,
      });
      // Remember which AI-added figures this saved version carries, so the
      // version switcher can flag versions that still need verifying.
      const newVersion = updated.active_version;
      if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
        markImprovedVersion("resume", resumeId, newVersion);
        if (metrics.total > 0) {
          saveVersionMetric("resume", resumeId, newVersion, {
            total: metrics.total,
            verified: metrics.verified,
          });
        }
        // Record which review findings this saved version addressed (traceability).
        if (pendingFindings.length) {
          saveVersionFindings("resume", resumeId, newVersion, pendingFindings);
        }
        // Tag this preview-accepted version with the instruction that produced it,
        // so it reads as "Applied: …" just like a direct apply.
        if (pendingInstruction.trim()) {
          saveAppliedInstruction("resume", resumeId, newVersion, pendingInstruction.trim());
        }
        // Stamp how many bullets a whole-résumé strengthen pass actually changed,
        // so the accepted version shows "N bullets strengthened" (bulk traceability).
        if (isWholeResumeStrengthen(pendingInstruction)) {
          const strengthened = countStrengthenedBullets(
            improveChanges.map((c) => c.path)
          );
          if (strengthened > 0) {
            saveBulletStrengthen("resume", resumeId, newVersion, strengthened);
          }
        }
        // Carry the verified-figure memory onto the new version, so re-improving
        // from it remembers which figures were already checked.
        migrateVerifiedMetrics(metricKey, metricMemoryKey("resume", resumeId, newVersion));
      }
      // Close the pending "own points" submission with what actually changed.
      if (fromIncorporateRef.current) {
        const impacted = Array.from(
          new Set(improveChanges.map((c) => c.section).filter(Boolean))
        );
        // The wording that survived into the saved markdown — used to paint the
        // change onto the paper, so reverted edits aren't highlighted.
        const passages = improveChanges
          .map((c) => c.after)
          .filter((t) => t && markdown.includes(t));
        settleIncorporate(
          impacted.length ? "implemented" : "not-implemented",
          impacted,
          passages
        );
        fromIncorporateRef.current = false;
      }
      // A "Notes & instructions" preview that landed: clear the directive box.
      const wasFromNotes = fromNotesRef.current;
      if (wasFromNotes) {
        updateIncNotes("");
        // Remember the command so it can be re-run in one click.
        recentInstructions.push(pendingInstruction);
        fromNotesRef.current = false;
      }
      setResume(updated);
      setImprovement(null);
      setIgnoredEchoCount(0);
      onAccepted?.(updated);
      await refreshStructured();
      showToast(
        describeAction(
          wasFromNotes ? "Applied your instruction to" : "Improved",
          improveChanges.map((c) => c.section),
          wasFromNotes ? "Applied your instruction" : "Improved version saved"
        ),
        "success"
      );
    } catch (err) {
      setImproveError(
        err instanceof ApiError ? err.message : "Could not save the improved résumé."
      );
      reportError(err, "résumé");
    } finally {
      setApplying(false);
    }
  }

  /**
   * Apply a typed self-entry improvement DIRECTLY (no review preview): send it to
   * `…/improve-structured`, then — when something changed — save it as a new
   * version and re-render. Every click ends visibly (updated / no changes /
   * error), and it's reversible (the confirmation offers a one-click Undo).
   */
  async function applyInstruction(
    instruction: string,
    prompts: string[],
    focusPoints: string[],
    opts?: { clearNotes?: boolean }
  ) {
    const text = instruction.trim();
    if (!text || improving || applying) return;
    setImproving(true);
    setImproveError("");
    setPendingPrompts(prompts);
    setPendingInstruction(text);
    setPendingFindings(focusPoints);
    // Drop any pending review preview so it can't shadow the applied result.
    setImprovement(null);
    const prevVersion = resume?.active_version;
    const content = structured ? resumeToMarkdown(structured) : undefined;
    try {
      const result = await runDirectImprove({
        kind: "resume",
        docId: resumeId,
        instruction: text,
        instructions: prompts,
        focusPoints,
        jobPostingId: selectedTargetId || undefined,
        content,
        original: structured ?? undefined,
      });
      if (!result.changed) {
        reportUnchanged();
        return;
      }
      const updated = result.updated as Resume | undefined;
      const newVersion = updated?.active_version;
      if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
        markImprovedVersion("resume", resumeId, newVersion);
        // Tag this version with the exact instruction the user typed, so it is
        // easy to spot as "Applied: …" in the version switcher.
        saveAppliedInstruction("resume", resumeId, newVersion, text);
        if (result.flaggedMetrics.length) {
          saveVersionMetric("resume", resumeId, newVersion, {
            total: result.flaggedMetrics.length,
            verified: 0,
          });
        }
        if (focusPoints.length) {
          saveVersionFindings("resume", resumeId, newVersion, focusPoints);
        }
      }
      if (prompts.some((p) => RESUME_PRESETS.includes(p))) improve.clearPrompts();
      improve.updateInstruction("");
      if (opts?.clearNotes) {
        updateIncNotes("");
        recentInstructions.push(text);
      }
      if (updated) {
        setResume(updated);
        onAccepted?.(updated);
      }
      await refreshStructured();
      const canUndo =
        prevVersion !== undefined && prevVersion !== null && prevVersion !== "";
      const landedSections =
        structured && result.structured
          ? diffFields(flattenResume(structured), flattenResume(result.structured)).map(
              (c) => c.section
            )
          : [];
      showToast(
        describeAction(
          opts?.clearNotes ? "Applied your instruction to" : "Updated",
          landedSections,
          opts?.clearNotes ? "Applied your instruction" : "Résumé updated."
        ),
        "success",
        canUndo
          ? {
              label: "Undo",
              onUndo: async () => {
                const restored = await activateResumeVersion(
                  resumeId,
                  prevVersion as string | number
                );
                setResume(restored);
                onAccepted?.(restored);
                await refreshStructured();
              },
            }
          : undefined
      );
    } catch (err) {
      reportError(err, "résumé");
    } finally {
      setImproving(false);
    }
  }

  function handleDiscard() {
    if (applying) return;
    // A discarded tracked submission never landed — close it as not implemented.
    if (fromIncorporateRef.current) {
      settleIncorporate("not-implemented", []);
      fromIncorporateRef.current = false;
    }
    fromNotesRef.current = false;
    setImprovement(null);
    setIgnoredEchoCount(0);
    setImproveError("");
  }

  function updateIncNotes(value: string) {
    setIncNotes(value);
    // Editing the instruction dismisses any stale "no change" notice.
    setNotesNotice("");
    writeIncorporateDraft("resume", resumeId, { ideas: [], notes: value });
  }

  /** Re-render the Skills section locally — a display choice, never an AI call. */
  function handleSkillsLayoutChange(next: SkillsLayout) {
    setSkillsLayout(next);
    writeSkillsLayout(resumeId, next);
    showToast(
      `Skills layout set to ${next === "bullets" ? "a bulleted list" : "a comma list"}`,
      "success"
    );
  }

  /** Persist a Find & Replace result as a new version and re-render the paper. */
  async function handleFindReplaceApply(renderedText: string): Promise<void> {
    const updated = await createResumeVersion(resumeId, { text: renderedText });
    setResume(updated);
    await refreshStructured();
  }

  /** Apply the "Notes & instructions" directive immediately via `…/ai-edit`. */
  function applyNotesInstruction() {
    const text = incNotes.trim();
    if (!text || improving || applying || aiEdit.running) return;
    // Clear any previous "no change" notice — a fresh submit always re-evaluates.
    setNotesNotice("");
    // Every Enter / "Apply change" POSTs to `…/ai-edit`. Recent/history and any
    // local shortcut are never a gate, and the box clears only once the response
    // lands (inside useAiEdit's success path).
    void aiEdit.run(text);
  }

  /** Re-run a remembered command from the recent-instructions list in one click. */
  function runRecentInstruction(text: string) {
    const t = text.trim();
    if (!t || improving || applying || aiEdit.running) return;
    setNotesNotice("");
    updateIncNotes(t);
    // A remembered command re-runs through the same POST — never a local branch.
    void aiEdit.run(t);
  }

  /** Send one incorporate payload and surface its preview. */
  async function submitIncorporate(
    ideas: string[],
    notes: string,
    jobPostingId?: string | number
  ) {
    if (incorporating) return;
    setIncorporating(true);
    setIncorporateError("");
    setImproveError("");
    setPendingPrompts(ideas);
    setPendingInstruction(notes);
    setPendingFindings([]);
    fromIncorporateRef.current = true;
    try {
      const result = await incorporateResume(resumeId, {
        ideas,
        notes,
        ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
      });
      // Nothing was woven in → say so plainly and close the pending submission.
      const nextChanges = structured
        ? diffFields(flattenResume(structured), flattenResume(result.structured))
        : [];
      if (structured && nextChanges.length === 0) {
        setImprovement(null);
        settleIncorporate("not-implemented", []);
        fromIncorporateRef.current = false;
        reportUnchanged();
        return;
      }
      setImprovement(result);
    } catch (err) {
      setIncorporateError(tailorErrorMessage(err, "résumé"));
      reportError(err, "résumé");
    } finally {
      setIncorporating(false);
    }
  }

  /**
   * Re-run the notes / instructions that never landed, in one submission.
   * Re-runs are nudged toward the current target role, so a replay steers the
   * same way the original improve would.
   */
  async function rerunIncorporate(list: IncorporateEntry[]) {
    if (!list.length) return;
    rearmIncorporate(list.map((e) => e.id));
    const ideas = Array.from(new Set(list.flatMap((e) => e.ideas)));
    const notes = list
      .map((e) => e.text.trim())
      .filter(Boolean)
      .join("\n");
    await submitIncorporate(ideas, notes, selectedTargetId || undefined);
  }

  /** Re-run a single past submission (toward the current target role). */
  async function rerunIncorporateOne(entry: IncorporateEntry) {
    await rerunIncorporate([entry]);
  }

  /** Paint a past submission's impact onto the rendered paper. */
  function openImpact(entry: IncorporateEntry) {
    setImpact({ label: impactLabelForEntry(entry), terms: impactTermsForEntry(entry) });
  }

  /**
   * Optimistically swap the résumé for `next`, persist it, then reconcile with
   * the copy the server returns — reverting to `base` if the write fails. One
   * path for every add / edit / remove so the surfaces can't drift apart.
   */
  async function persistBulletChange(
    target: BulletTarget,
    next: JsonResume | null,
    base: JsonResume,
    successMsg: string,
    failMsg: string
  ): Promise<boolean> {
    if (!next) return false;
    setSavingKey(bulletTargetKey(target));
    setStructured(next); // optimistic — the change appears immediately
    try {
      const updated = await persistResumeStructure(resumeId, next);
      setResume(updated);
      showToast(successMsg, "success");
      await refreshStructured(); // reconcile with the saved copy
      return true;
    } catch (err) {
      setStructured(base); // revert the optimistic change
      showToast(err instanceof ApiError ? err.message : failMsg, "error");
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  /** Append a typed bullet to a target VERBATIM (no AI) and persist the résumé. */
  async function handleAddBullet(target: BulletTarget, text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed || !structured) return false;
    const base = structured;
    const next = appendBullet(base, target, trimmed);
    const msg =
      target.kind === "certificate"
        ? `Added a certification to ${bulletTargetLabel(target)}`
        : `Added a bullet to ${bulletTargetLabel(target)}`;
    return persistBulletChange(target, next, base, msg, "Could not add the bullet.");
  }

  /** Undo a just-added bullet: remove it verbatim and persist the résumé. */
  async function handleUndoBullet(target: BulletTarget, text: string): Promise<void> {
    if (!structured) return;
    const base = structured;
    const next = removeLastBullet(base, target, text);
    if (!next) return;
    await persistBulletChange(
      target,
      next,
      base,
      `Removed the last bullet from ${bulletTargetLabel(target)}`,
      "Could not remove the bullet."
    );
  }

  /** Edit an existing bullet in place, then persist the résumé. */
  async function handleEditBullet(
    target: BulletTarget,
    bulletIndex: number,
    text: string
  ): Promise<void> {
    if (!structured) return;
    const base = structured;
    const next = setBullet(base, target, bulletIndex, text);
    const ok = await persistBulletChange(
      target,
      next,
      base,
      `Updated a bullet in ${bulletTargetLabel(target)}`,
      "Could not update the bullet."
    );
    // Keep the inline editor open on failure so the user can retry.
    if (!ok) throw new Error("bullet edit failed");
  }

  /** Reorder a bullet one slot up/down within its list, then persist the résumé. */
  async function handleMoveBullet(
    target: BulletTarget,
    bulletIndex: number,
    direction: -1 | 1
  ): Promise<void> {
    if (!structured) return;
    const base = structured;
    const next = moveBullet(base, target, bulletIndex, direction);
    if (!next) return;
    await persistBulletChange(
      target,
      next,
      base,
      `Moved a bullet ${direction < 0 ? "up" : "down"} in ${bulletTargetLabel(target)}`,
      "Could not move the bullet."
    );
  }

  /** Remove an existing bullet at its exact position, then persist the résumé. */
  async function handleRemoveBulletAt(
    target: BulletTarget,
    bulletIndex: number
  ): Promise<void> {
    if (!structured) return;
    const base = structured;
    const next = removeBulletAt(base, target, bulletIndex);
    if (!next) return;
    await persistBulletChange(
      target,
      next,
      base,
      `Removed a bullet from ${bulletTargetLabel(target)}`,
      "Could not remove the bullet."
    );
  }

  /**
   * Opt-in AI polish for a single just-added bullet. Runs the SAME
   * improve-structured pipeline (with the current résumé text as `content`), so
   * the result previews through the chosen template and saves on accept.
   */
  function handlePolishBullet(text: string) {
    const instruction = polishBulletInstruction(text);
    const content = structured ? resumeToMarkdown(structured) : undefined;
    improve.recordLastImprove([], instruction, []);
    void runImprove([], instruction, [], content);
  }

  /**
   * Opt-in "Strengthen" for a single bullet — a punchier, outcome-first rewrite
   * that differs from the general Polish (which only tightens wording). Runs the
   * SAME improve-structured pipeline, so the result previews and saves on accept.
   */
  function handleStrengthenBullet(text: string) {
    const instruction = strengthenBulletInstruction(text);
    const content = structured ? resumeToMarkdown(structured) : undefined;
    improve.recordLastImprove([], instruction, []);
    void runImprove([], instruction, [], content);
  }

  /** A readable label for a bullet target — the role, project, or the cert list. */
  function bulletTargetLabel(target: BulletTarget): string {
    if (target.kind === "certificate") return "Certifications";
    if (target.kind === "work") {
      const w = structured?.work?.[target.index];
      return (
        [w?.position, w?.name].filter(Boolean).join(" · ") || `Role ${target.index + 1}`
      );
    }
    return structured?.projects?.[target.index]?.name || `Project ${target.index + 1}`;
  }

  /**
   * Strengthen EVERY bullet in a target at once. Runs the SAME improve-structured
   * pipeline as the single-bullet polish (with the current résumé text as
   * `content`), so the result previews through the chosen template and saves on
   * accept — just aimed at the whole list instead of one line.
   */
  function handleStrengthenRole(target: BulletTarget, bullets: string[]) {
    if (!structured || bullets.length < 2) return;
    const instruction = strengthenRoleInstruction(bulletTargetLabel(target), bullets);
    const content = resumeToMarkdown(structured);
    improve.recordLastImprove([], instruction, []);
    void runImprove([], instruction, [], content);
  }

  /**
   * Strengthen EVERY experience and project bullet across the whole résumé in
   * ONE pass — a single instruction covering every list, so the result arrives
   * as a single preview the user reviews (and selectively accepts) once.
   */
  function handleStrengthenWholeResume() {
    if (!structured || improving) return;
    const groups = collectResumeBulletGroups(structured);
    if (countResumeBullets(groups) < 2) return;
    const instruction = strengthenWholeResumeInstruction(groups);
    const content = resumeToMarkdown(structured);
    improve.recordLastImprove([], instruction, []);
    void runImprove([], instruction, [], content);
  }

  /** The "+ Add" affordance for a target — work role, project, or certification. */
  function renderAddAffordance(target: BulletTarget, label?: string) {
    // Only work/project bullets get the bulk strengthen — certification entries
    // are single names, not sentences worth a punchier rewrite.
    const bullets = structured ? getTargetBullets(structured, target) : [];
    const canBulk = target.kind !== "certificate" && bullets.length > 1;
    return (
      <RoleAddBullet
        label={label}
        busy={savingKey === bulletTargetKey(target)}
        polishing={improving}
        strengthenAllCount={canBulk ? bullets.length : 0}
        onStrengthenAll={canBulk ? () => handleStrengthenRole(target, bullets) : undefined}
        onAdd={(text) => handleAddBullet(target, text)}
        onUndo={(text) => handleUndoBullet(target, text)}
        onPolish={handlePolishBullet}
        onStrengthen={handleStrengthenBullet}
      />
    );
  }

  /** Per-role "+ Add bullet" affordance for the live preview paper. */
  function renderRoleActions(workIndex: number) {
    return renderAddAffordance({ kind: "work", index: workIndex });
  }

  /** Per-project "+ Add highlight" affordance. */
  function renderProjectActions(projectIndex: number) {
    return renderAddAffordance({ kind: "project", index: projectIndex }, "Add highlight");
  }

  /** "+ Add certification" affordance for the certifications list. */
  function renderCertificateActions() {
    return renderAddAffordance({ kind: "certificate" }, "Add certification");
  }

  /** Inline edit / reorder / remove / polish for an EXISTING bullet on the paper. */
  function renderBullet(args: RenderBulletArgs) {
    const target: BulletTarget =
      args.group === "work"
        ? { kind: "work", index: args.ownerIndex }
        : { kind: "project", index: args.ownerIndex };
    // How many bullets are in this list — decides whether the row can move.
    const siblings =
      args.group === "work"
        ? structured?.work?.[args.ownerIndex]?.highlights?.length ?? 0
        : structured?.projects?.[args.ownerIndex]?.highlights?.length ?? 0;
    const canMoveUp = args.bulletIndex > 0;
    const canMoveDown = args.bulletIndex < siblings - 1;
    return (
      <EditableBullet
        text={args.text}
        fieldPrefix={args.fieldPrefix}
        flags={args.flags}
        busy={savingKey === bulletTargetKey(target)}
        polishing={improving}
        onMoveUp={
          canMoveUp ? () => handleMoveBullet(target, args.bulletIndex, -1) : undefined
        }
        onMoveDown={
          canMoveDown ? () => handleMoveBullet(target, args.bulletIndex, 1) : undefined
        }
        onEdit={(next) => handleEditBullet(target, args.bulletIndex, next)}
        onRemove={() => handleRemoveBulletAt(target, args.bulletIndex)}
        onPolish={handlePolishBullet}
        onStrengthen={handleStrengthenBullet}
      />
    );
  }

  /** Hover improvement on the paper — a focused, single-section instruction. */
  function handleSectionImprove(instruction: string) {
    improve.recordLastImprove([], instruction, []);
    runImprove([], instruction);
  }

  async function handleExport(kind: "pdf" | "docx") {
    setDownloading(kind);
    setDownloadError("");
    const base = fileBase(displayTitle);
    // Export with the exact look on screen — template, accent, and typeface.
    const style = { templateId: themeId, accentId, fontId };
    try {
      if (kind === "pdf") {
        await exportResumePdf(resumeId, `${base}.pdf`, style);
      } else {
        await exportResumeDocx(resumeId, `${base}.docx`, style);
      }
      showToast(`Exported ${kind.toUpperCase()}`, "success");
    } catch (err) {
      setDownloadError(
        err instanceof ApiError
          ? err.message
          : `Could not export the ${kind.toUpperCase()} file.`
      );
    } finally {
      setDownloading(null);
    }
  }

  function handlePrint() {
    showToast("Opening print dialog — choose “Save as PDF” to keep this design", "success");
    // Let the toast paint, then hand off to the browser print dialog.
    window.setTimeout(() => window.print(), 120);
  }

  if (loading) {
    return (
      <div className="py-20 text-sm text-foreground-500 flex items-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading templates…
      </div>
    );
  }

  const templateDirty = themeId !== appliedTemplateId;
  // How many bullets a whole-résumé strengthen pass would cover (drives the button).
  const resumeBulletCount = structured
    ? countResumeBullets(collectResumeBulletGroups(structured))
    : 0;
  /** Live Find-match count / context for the panel — read from the saved résumé text. */
  const findPanelText = resume?.rendered_text ?? "";
  const findPanelMatchCount =
    findReplace.open && findReplace.find.trim().length > 0
      ? countMatches(findPanelText, findReplace.find, findReplace.matchCase)
      : 0;
  const findPanelMatchContext =
    findReplace.open && findReplace.find.trim().length > 0
      ? matchSentenceContext(
          findPanelText,
          findReplace.find,
          findReplace.matchCase,
          findReplace.activeMatch
        )
      : null;

  return (
    <div className="space-y-6">
      {downloadError && (
        <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm hw-print-hide">
          <i className="ri-error-warning-line text-base mt-0.5"></i>
          <span>{downloadError}</span>
        </div>
      )}

      {error ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 py-16 text-center hw-print-hide">
          <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-accent-100 text-accent-700">
            <i className="ri-error-warning-line text-2xl"></i>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground-900">
            Couldn&apos;t load the structured résumé
          </p>
          <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">{error}</p>
          <div className="mt-4 flex items-center justify-center">
            <button
              onClick={load}
              className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line"></i>
              Try again
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl bg-background-100/60 border border-background-200 py-16 text-center hw-print-hide">
          <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-2xl bg-secondary-100 text-secondary-700">
            <i className="ri-file-text-line text-2xl"></i>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground-900">
            Add more to your résumé first.
          </p>
          <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">
            Add your name, at least one role, or a few skills and you&apos;ll be able to preview and improve it here.
          </p>
        </div>
      ) : (
        <>
          {improvement ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap hw-print-hide">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-heading text-lg font-medium text-foreground-950">Preview</h2>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <i className="ri-layout-line"></i>
                    {theme.name}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent.value }} />
                    {accent.name}
                  </span>
                </div>
                <span className="text-xs text-foreground-500">
                  Rendered live from the résumé JSON · print to keep this exact design
                </span>
              </div>

              <StructuredImprovePreview<JsonResume>
                renderPaper={(node, flags) => (
                  <SectionStyleScope styles={sectionStyles}>
                    <theme.Component
                      resume={node}
                      accent={accent}
                      flags={flags}
                      skillsLayout={skillsLayout}
                    />
                  </SectionStyleScope>
                )}
                resolve={(reverted) =>
                  resolveByReverts(
                    improvement.structured,
                    structured ?? {},
                    improveChanges,
                    reverted
                  )
                }
                toMarkdown={resumeToMarkdown}
                beforeNode={structured}
                changes={improveChanges}
                flags={improvement.flagged_metrics ?? []}
                compare={compare}
                onCompareChange={updateCompare}
                applying={applying}
                onAccept={handleAccept}
                onDiscard={handleDiscard}
                appliedPrompts={pendingPrompts}
                appliedInstruction={pendingInstruction}
                memoryKey={metricKey}
                reviewKey={revisionReviewKey("resume", resumeId)}
                ignoredCount={ignoredEchoCount}
              />
            </section>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start hw-print-hide">
              {/* LEFT — improve + chooser (scrolls; the live preview stays pinned on the right) */}
              <div className="min-w-0 space-y-4">
                <FindReplacePanel
                  open={findReplace.open}
                  onOpenChange={findReplace.setOpen}
                  find={findReplace.find}
                  onFindChange={findReplace.setFind}
                  replace={findReplace.replace}
                  onReplaceChange={findReplace.setReplace}
                  matchCase={findReplace.matchCase}
                  onMatchCaseChange={findReplace.setMatchCase}
                  firstOnly={findReplace.firstOnly}
                  onFirstOnlyChange={findReplace.setFirstOnly}
                  replacing={findReplace.replacing}
                  canReplace={findReplace.canReplace}
                  matchCount={findPanelMatchCount}
                  activeMatch={findReplace.activeMatch}
                  matchContext={findPanelMatchContext}
                  onNextMatch={() => findReplace.stepMatch(1, findPanelMatchCount)}
                  onPrevMatch={() => findReplace.stepMatch(-1, findPanelMatchCount)}
                  error={findReplace.error}
                  notice={findReplace.notice}
                  preview={findReplace.preview}
                  onClearNotice={findReplace.clearNotice}
                  onSubmit={findReplace.submit}
                  onConfirm={findReplace.confirm}
                  onCancelPreview={findReplace.cancelPreview}
                  onRetry={findReplace.retry}
                  inputId={`find-replace-input-${resumeId}`}
                />
                <AddPointsPanel
                  notes={incNotes}
                  onNotesChange={updateIncNotes}
                  submitting={incorporating || improving || applying || aiEdit.running}
                  error={incorporateError || improveError}
                  notesNotice={notesNotice}
                  onApplyDirect={applyNotesInstruction}
                  onImproveEverything={() =>
                    runImprove([], IMPROVE_EVERYTHING_INSTRUCTION)
                  }
                  improvingEverything={improving}
                  kindLabel="résumé"
                  historyEntries={incorporateHistory}
                  onRerunHistory={rerunIncorporate}
                  onRerunOneHistory={rerunIncorporateOne}
                  onViewImpactHistory={openImpact}
                  onRemoveHistory={removeIncorporate}
                  onClearHistory={clearIncorporateHistory}
                  rerunRoleLabel={selectedTargetLabel}
                  onWorkHighlights={() =>
                    navigate(
                      `/dashboard/experience?resume=${encodeURIComponent(resumeId)}&zone=review`
                    )
                  }
                  memoryKey={`resume_${resumeId}`}
                  recentInstructions={recentInstructions.recent}
                  onRunRecentInstruction={runRecentInstruction}
                  onClearRecentInstructions={recentInstructions.clear}
                  quickActions={
                    <>
                      {resumeBulletCount > 1 && (
                        <button
                          type="button"
                          onClick={handleStrengthenWholeResume}
                          disabled={improving}
                          title="Strengthen every experience and project bullet across the whole résumé in one pass — punchier verbs and clearer impact, no new facts"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                        >
                          <i className={improving ? "ri-loader-4-line animate-spin" : "ri-rocket-2-line"}></i>
                          Strengthen whole résumé ({resumeBulletCount})
                        </button>
                      )}
                      {(selectedTargetId || targetJobs.length > 0) && (
                        <TargetRoleSelect
                          jobs={targetJobs}
                          value={selectedTargetId}
                          onChange={handleTargetChange}
                          fallbackLabel={selectedTargetFallbackLabel}
                          disabled={improving}
                        />
                      )}
                    </>
                  }
                />
                <TemplateGallery
                  themes={RESUME_THEMES}
                  value={themeId}
                  appliedId={appliedTemplateId}
                  onSelect={selectTheme}
                  accents={ACCENT_COLORS}
                  accentValue={accentId}
                  onAccentSelect={selectAccent}
                  fonts={DOC_FONTS}
                  fontValue={fontId}
                  onFontSelect={selectFont}
                  advanced={
                    <>
                      <p className="text-xs text-foreground-500">
                        Export the current design, or reset this résumé to the default layout.
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handlePrint}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-printer-line"></i>
                          Print this design
                        </button>
                        <button
                          onClick={() => handleExport("pdf")}
                          disabled={downloading !== null}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                        >
                          <i className={downloading === "pdf" ? "ri-loader-4-line animate-spin" : "ri-file-pdf-2-line"}></i>
                          {downloading === "pdf" ? "Exporting…" : "Download PDF"}
                        </button>
                        <button
                          onClick={() => handleExport("docx")}
                          disabled={downloading !== null}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                        >
                          <i className={downloading === "docx" ? "ri-loader-4-line animate-spin" : "ri-file-word-2-line"}></i>
                          {downloading === "docx" ? "Exporting…" : "Download Word"}
                        </button>
                        <button
                          onClick={handleResetStyle}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 hover:text-foreground-900 px-2 py-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-restart-line"></i>
                          Reset style
                        </button>
                      </div>
                    </>
                  }
                />

                {structured && (structured.skills ?? []).length > 0 && (
                  <SkillsLayoutToggle
                    value={skillsLayout}
                    onChange={handleSkillsLayoutChange}
                    disabled={improving}
                  />
                )}

                <SavedStylesPanel
                  kind="resume"
                  themeId={themeId}
                  accentId={accentId}
                  fontId={fontId}
                  defaultThemeId={DEFAULT_THEME_ID}
                  defaultAccentId={DEFAULT_ACCENT.id}
                  defaultFontId={DEFAULT_FONT_ID}
                  themeLabel={(id) => RESUME_THEMES.find((t) => t.id === id)?.name ?? id}
                  accentLabel={(id) => ACCENT_COLORS.find((a) => a.id === id)?.name ?? id}
                  previewData={structured}
                  targetRoleId={selectedTargetId}
                  targetRoleLabel={selectedTargetLabel}
                  onApply={handleApplyLibraryStyle}
                />
              </div>

              {/* RIGHT — live preview (sticky) */}
              <div className="min-w-0 lg:sticky lg:top-20">
                <section className="rounded-2xl border border-background-200 bg-background-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-background-200 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <h2 className="font-heading text-base font-medium text-foreground-950">
                        Live preview
                      </h2>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-secondary-900 bg-secondary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-layout-line"></i>
                        {theme.name}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: accent.value }} />
                        {accent.name}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full whitespace-nowrap">
                        <i className="ri-font-size"></i>
                        {font.name}
                      </span>
                    </div>
                    <button
                      onClick={handleUseTemplate}
                      disabled={applyingTemplate || !templateDirty}
                      className={`inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-md transition-colors whitespace-nowrap ${
                        templateDirty
                          ? "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600 cursor-pointer"
                          : "bg-background-100 text-foreground-500 cursor-default"
                      } disabled:opacity-70 disabled:cursor-not-allowed`}
                    >
                      {applyingTemplate ? (
                        <i className="ri-loader-4-line animate-spin"></i>
                      ) : (
                        <i className={templateDirty ? "ri-check-double-line" : "ri-check-line"}></i>
                      )}
                      {applyingTemplate
                        ? "Applying…"
                        : templateDirty
                          ? "Use this template"
                          : "Applied"}
                    </button>
                  </div>

                  <div className="p-3 md:p-4 space-y-2">
                    <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                      <i className={templateDirty ? "ri-eye-line" : "ri-check-line"}></i>
                      {templateDirty
                        ? `Previewing ${theme.name} — apply it to save this layout on your résumé.`
                        : `${theme.name} is the layout saved on your résumé.`}
                    </p>
                    {structured && (
                      <TemplatePreview
                        resetKey={themeId}
                        viewerHeight={540}
                        fontStack={font.stack}
                        onExpand={() => setPreviewExpanded(true)}
                      >
                        <SectionStyleScope styles={sectionStyles}>
                          <theme.Component
                            resume={structured}
                            accent={accent}
                            skillsLayout={skillsLayout}
                            onImproveSection={improving ? undefined : handleSectionImprove}
                            renderRoleActions={improving ? undefined : renderRoleActions}
                            renderProjectActions={improving ? undefined : renderProjectActions}
                            renderCertificateActions={improving ? undefined : renderCertificateActions}
                            renderBullet={improving ? undefined : renderBullet}
                          />
                        </SectionStyleScope>
                      </TemplatePreview>
                    )}
                    {previewExpanded && structured && (
                      <ReadablePreviewModal
                        title={displayTitle}
                        subtitle="Full readable view · live preview"
                        onClose={() => setPreviewExpanded(false)}
                        revision={<SectionStyleScope styles={sectionStyles}><theme.Component resume={structured} accent={accent} skillsLayout={skillsLayout} /></SectionStyleScope>}
                        revisionLabel="Live preview"
                        revisionWidth={PAPER_WIDTH}
                        memoryKey={revisionReviewKey("resume", resumeId)}
                      />
                    )}
                    <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                      <i className="ri-sparkling-line"></i>
                      Hover or tap a section on the paper to improve just that part with AI.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          )}
        </>
      )}

      {impact && structured && (
        <ReadablePreviewModal
          title="Where this input landed"
          subtitle={impact.label}
          onClose={() => setImpact(null)}
          revision={<SectionStyleScope styles={sectionStyles}><theme.Component resume={structured} accent={accent} flags={[]} skillsLayout={skillsLayout} /></SectionStyleScope>}
          revisionHighlightTerms={impact.terms}
          defaultHighlight
          revisionLabel="Your résumé"
          revisionWidth={PAPER_WIDTH}
          memoryKey={`impact_resume_${resumeId}`}
        />
      )}
    </div>
  );
}