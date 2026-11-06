import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import { jobMatches } from "@/mocks/dashboard";
import {
  activateCoverLetterVersion,
  createCoverLetterVersion,
  downloadCoverLetter,
  exportCoverLetterDocx,
  exportCoverLetterPdf,
  getCoverLetter,
  getResumeStructured,
  improveCoverLetterStructured,
  incorporateCoverLetter,
  tailorErrorMessage,
  updateCoverLetter,
  type CoverLetter,
  type CoverLetterStructuredImprovement,
} from "@/lib/documents";
import { runDirectImprove } from "@/lib/directImprove";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import useAiEdit, { AI_EDIT_NO_CHANGE_INLINE_MESSAGE } from "@/hooks/useAiEdit";
import {
  buildCoverLetterStructured,
  isEmptyCoverLetter,
  type CoverLetterStructured,
} from "@/lib/coverLetterTemplate";
import { COVER_PRESETS } from "@/lib/coverLetterPresets";
import type { JsonResume } from "@/lib/jsonResume";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import { useImproveMemory } from "@/hooks/useImproveMemory";
import { useIncorporateHistory } from "@/hooks/useIncorporateHistory";
import { useRecentInstructions } from "@/hooks/useRecentInstructions";
import type { IncorporateEntry } from "@/lib/incorporateHistory";
import AddPointsPanel from "@/pages/dashboard/documents/components/AddPointsPanel";
import TargetRoleSelect from "@/pages/dashboard/documents/components/TargetRoleSelect";
import TemplatePreview from "./TemplatePreview";
import { PAPER_WIDTH } from "./themes/paper";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";
import TemplateGallery from "./TemplateGallery";
import SavedStylesPanel from "./SavedStylesPanel";
import StructuredImprovePreview from "./StructuredImprovePreview";
import { impactLabelForEntry, impactTermsForEntry } from "@/lib/impact";
import { revisionReviewKey } from "@/lib/revisionReview";
import {
  COVER_LETTER_THEMES,
  DEFAULT_COVER_LETTER_THEME_ID,
  getCoverLetterTheme,
} from "./coverLetterThemeRegistry";
import {
  ACCENT_COLORS,
  DEFAULT_ACCENT,
  getAccent,
  isKnownAccent,
  type AccentColor,
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
import { saveAppliedInstruction } from "@/lib/versionAppliedInstruction";
import { IMPROVE_EVERYTHING_INSTRUCTION } from "@/lib/improveEverything";
import { saveAiEditTrace } from "@/lib/aiEditTrace";
import { readTargetRole, writeTargetRole } from "./targetRoleMemory";
import { coverLetterToMarkdown, flattenCoverLetter } from "./coverLetterFields";
import { stripCoverLetterInstructionEchoDetailed } from "./instructionEcho";
import { describeAction } from "./changeActionMessage";

/** The cover-letter Improve uses the same remembered keys as the Document view. */
const IMPROVE_MEMORY_PREFIX = "hirewave_cover_letter_improve";

/** Remembered layout for the structured-improve preview: "replace" or "split". */
const PREVIEW_COMPARE_STORAGE_KEY = "hirewave_preview_compare_mode";

/** True when an id is one of the known cover-letter templates. */
function isKnownTemplate(id: string | undefined): boolean {
  return Boolean(id) && COVER_LETTER_THEMES.some((t) => t.id === id);
}

/**
 * Resolve a cover letter's style. Its own remembered pick wins; otherwise it
 * borrows the linked résumé's choice (so the pair looks consistent); otherwise
 * it falls back to the defaults. Each field resolves independently.
 */
function resolveCoverChoice(
  id: string,
  version: string | number | undefined,
  resumeId: string | number | undefined | null
): { themeId: string; accentId: string; fontId: string; inherited: boolean } {
  const own = readStyle("cover-letter", id, version);
  const hasResume = resumeId !== undefined && resumeId !== null && String(resumeId) !== "";
  const linked = hasResume ? readStyle("resume", String(resumeId)) : null;

  const themeRaw = own?.themeId ?? linked?.themeId ?? DEFAULT_COVER_LETTER_THEME_ID;
  const accentRaw = own?.accentId ?? linked?.accentId ?? DEFAULT_ACCENT.id;
  const fontRaw = own?.fontId ?? linked?.fontId ?? DEFAULT_FONT_ID;

  return {
    themeId: COVER_LETTER_THEMES.some((t) => t.id === themeRaw)
      ? themeRaw
      : DEFAULT_COVER_LETTER_THEME_ID,
    accentId: isKnownAccent(accentRaw) ? accentRaw : DEFAULT_ACCENT.id,
    fontId: isKnownFont(fontRaw) ? fontRaw : DEFAULT_FONT_ID,
    inherited: !own?.themeId && !own?.accentId && Boolean(linked?.themeId || linked?.accentId),
  };
}

function fileBase(name: string): string {
  return (
    name
      .replace(/\.[^./\\]+$/, "")
      .replace(/[^\w.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "cover-letter"
  );
}

interface CoverLetterTemplatesPanelProps {
  letterId: string;
  /** Changing this re-fetches the letter (e.g. after a version change). */
  refreshKey?: string;
  /** Active version — its own template + accent are remembered separately. */
  version?: string | number;
  /** Called with the full cover letter after an improvement is saved as a new version. */
  onAccepted?: (letter: CoverLetter) => void;
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
 * Two-pane cover-letter template chooser — mirrors the résumé panel: a compact
 * thumbnail gallery + style controls on the left, and the letter rendered live
 * on the selected template on the right (sticky). Selecting only previews;
 * "Use this template" persists the choice on the letter.
 */
export default function CoverLetterTemplatesPanel({
  letterId,
  refreshKey,
  version,
  onAccepted,
  jobPostingId,
  jobLabel,
  initialRole,
  initialRoleLabel,
  findings = [],
}: CoverLetterTemplatesPanelProps) {
  const { showToast } = useToast();
  const { reportError, reportUnchanged } = useChangeFeedback();
  const improve = useImproveMemory(letterId, COVER_PRESETS, IMPROVE_MEMORY_PREFIX);
  // Ticked review findings — remembered per letter by the shared improve memory.
  const activeFindings = improve.selectedFindings.filter((f) => findings.includes(f));

  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [structured, setStructured] = useState<CoverLetterStructured | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [themeId, setThemeId] = useState<string>(
    () => resolveCoverChoice(letterId, version, undefined).themeId
  );
  const [accentId, setAccentId] = useState<string>(
    () => resolveCoverChoice(letterId, version, undefined).accentId
  );
  const [fontId, setFontId] = useState<string>(
    () => resolveCoverChoice(letterId, version, undefined).fontId
  );
  /** True when this letter is borrowing its linked résumé's style (no pick of its own). */
  const [matchedToResume, setMatchedToResume] = useState(false);
  /** The template persisted on the letter (server `template_id`). */
  const [appliedTemplateId, setAppliedTemplateId] = useState("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | "original" | null>(null);
  const [downloadError, setDownloadError] = useState("");
  /** Whether the live-preview paper is open in the full-screen readable view. */
  const [previewExpanded, setPreviewExpanded] = useState(false);
  /** The template applied on the server, mirrored in a ref for restore logic. */
  const appliedRef = useRef("");

  /**
   * Decide what the letter should open on: the last template the user previewed
   * when it differs from the applied one, otherwise the applied (or remembered /
   * résumé-matched) layout.
   */
  function restoreChoice(applied: string, resumeIdArg?: string | number | null) {
    const preview = readPreview("cover-letter", letterId);
    if (
      preview &&
      preview.themeId !== applied &&
      COVER_LETTER_THEMES.some((t) => t.id === preview.themeId)
    ) {
      setThemeId(preview.themeId);
      setAccentId(isKnownAccent(preview.accentId) ? preview.accentId : DEFAULT_ACCENT.id);
      setFontId(preview.fontId && isKnownFont(preview.fontId) ? preview.fontId : DEFAULT_FONT_ID);
      setMatchedToResume(false);
      return;
    }
    const style = resolveCoverChoice(letterId, version, resumeIdArg);
    setThemeId(applied || style.themeId);
    setAccentId(style.accentId);
    setFontId(style.fontId);
    setMatchedToResume(!applied && style.inherited);
  }

  // Structure-aware improve — preview only until accepted.
  const [improvement, setImprovement] = useState<CoverLetterStructuredImprovement | null>(null);
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

  // The "Notes & instructions" draft — persisted per letter so it survives a reopen.
  const [incNotes, setIncNotes] = useState<string>(
    () => readIncorporateDraft("cover-letter", letterId).notes
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
  } = useIncorporateHistory("cover-letter", letterId);
  // Recently applied AI directives — shown in the box so a past command can be re-run.
  const recentInstructions = useRecentInstructions("cover-letter", letterId);
  // The immediate "Ask AI to change it" action (shared): apply the instruction via
  // `…/ai-edit`, re-render from the returned letter, and offer one-click Undo.
  const aiEdit = useAiEdit({
    kind: "cover-letter",
    docId: letterId,
    getContent: () => (structured ? coverLetterToMarkdown(structured) : letter?.content),
    getPreviousVersion: () => letter?.active_version,
    onApplied: (updated) => {
      const next = updated as CoverLetter;
      setLetter(next);
      onAccepted?.(next);
    },
    activateVersion: async (version) => {
      const restored = await activateCoverLetterVersion(letterId, version);
      setLetter(restored);
      onAccepted?.(restored);
    },
    reload: load,
    onAppliedClear: () => updateIncNotes(""),
    rememberInstruction: (instruction) => recentInstructions.push(instruction),
    onVersionTagged: (version, instruction, editCount) => {
      saveAppliedInstruction("cover-letter", letterId, version, instruction);
      saveAiEditTrace("cover-letter", letterId, {
        count: editCount,
        version,
        at: Date.now(),
      });
    },
    // A no-op edit shows an inline notice under the box (the text stays put).
    onNoChange: () => setNotesNotice(AI_EDIT_NO_CHANGE_INLINE_MESSAGE),
  });
  // Only an "own points" submission should settle a history entry on accept.
  const fromIncorporateRef = useRef(false);
  // True while the pending preview came from the "Notes & instructions" box.
  const fromNotesRef = useRef(false);
  // A past input's impact, painted onto the rendered paper on demand.
  const [impact, setImpact] = useState<{ label: string; terms: string[] } | null>(null);

  // Which role an improvement tailors to. Seeded from the Document view's tailor
  // picker (or the last in-tab pick, so it survives a reload), then changeable
  // right here so the target can be switched without leaving the tab.
  const [targetJobs, setTargetJobs] = useState<TailorableJob[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(() => {
    if (initialRole) return initialRole;
    const stored = readTargetRole("cover-letter", letterId);
    if (stored) return stored;
    return jobPostingId !== undefined && jobPostingId !== null ? String(jobPostingId) : "";
  });

  const theme = getCoverLetterTheme(themeId);
  const accent = getAccent(accentId);
  const font = getFont(fontId);
  const isEmpty = isEmptyCoverLetter(structured);
  const linkedResumeId = letter?.resume_id;
  const displayTitle = letter?.original_filename || `cover-letter-${letterId}`;
  // Display label for the improve target (the picker's selection, else the linked job).
  const targetJobLabel = useMemo(() => {
    if (!selectedTargetId) return null;
    const job = targetJobs.find((j) => String(j.job_posting_id) === selectedTargetId);
    if (job) return `${job.title} · ${job.company}`;
    if (initialRole && initialRoleLabel && selectedTargetId === initialRole) {
      return initialRoleLabel;
    }
    if (jobLabel) return jobLabel;
    const linked = jobMatches.find((j) => String(j.id) === selectedTargetId);
    return linked ? `${linked.title} · ${linked.company}` : null;
  }, [selectedTargetId, targetJobs, jobLabel, initialRole, initialRoleLabel]);

  // Fallback label so a carried-in role that isn't in the jobs list still renders.
  const selectedTargetFallbackLabel =
    initialRole && initialRoleLabel && selectedTargetId === initialRole
      ? initialRoleLabel
      : targetJobLabel ?? jobLabel ?? null;
  // Verified-figure memory is scoped to this document + its active version.
  const metricKey = metricMemoryKey("cover-letter", letterId, version);

  // Field-level differences between the saved letter and the AI's version.
  const improveChanges = useMemo(
    () =>
      improvement
        ? diffFields(flattenCoverLetter(structured), flattenCoverLetter(improvement.structured))
        : [],
    [improvement, structured]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await getCoverLetter(letterId);
      setLetter(res);
      // Seed the improve target from the letter's linked job when nothing is set yet.
      setSelectedTargetId((prev) =>
        prev ||
        (res.job_posting_id !== undefined && res.job_posting_id !== null
          ? String(res.job_posting_id)
          : "")
      );

      // Adopt the server-persisted template when present; otherwise the
      // remembered / borrowed style.
      const savedTpl = isKnownTemplate(res.template_id) ? (res.template_id as string) : "";
      if (savedTpl) {
        setAppliedTemplateId(savedTpl);
        appliedRef.current = savedTpl;
      }

      // Adopt the server-persisted template when present; otherwise the
      // remembered / borrowed style (or the last previewed layout).
      restoreChoice(savedTpl, res.resume_id);

      // Pull the linked résumé's basics (name/contact) for the letter header.
      let basics: JsonResume["basics"];
      if (res.resume_id) {
        try {
          const resumeData = await getResumeStructured(res.resume_id);
          basics = resumeData.basics;
        } catch {
          /* header identity is best-effort */
        }
      }

      const job = jobMatches.find(
        (j) => String(j.id) === String(res.job_posting_id)
      );

      setStructured(
        buildCoverLetterStructured(res.content ?? "", {
          date: res.created_at ?? res.generated_at,
          basics,
          company: job?.company,
          role: job?.title,
        })
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not load this cover letter."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId, refreshKey]);

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

  // (Re)initialize the target whenever the letter changes.
  useEffect(() => {
    if (targetDocRef.current === letterId) return;
    targetDocRef.current = letterId;
    targetInitRef.current = true; // re-arm the prop effect for this document
    if (initialRole) {
      setSelectedTargetId(initialRole);
      writeTargetRole("cover-letter", letterId, initialRole);
      return;
    }
    const stored = readTargetRole("cover-letter", letterId);
    setSelectedTargetId(
      stored ||
        (jobPostingId !== undefined && jobPostingId !== null ? String(jobPostingId) : "")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId]);

  // Follow the tailor picker once the initial (persisted) value has settled.
  useEffect(() => {
    if (targetInitRef.current) {
      targetInitRef.current = false;
      return;
    }
    if (jobPostingId === undefined || jobPostingId === null) return;
    const next = String(jobPostingId);
    setSelectedTargetId(next);
    writeTargetRole("cover-letter", letterId, next);
  }, [jobPostingId, letterId]);

  // A role carried in via a link (e.g. a document-row role chip) pre-selects the
  // improve target and is remembered for this document.
  const initialRoleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialRole) return;
    if (initialRoleRef.current === initialRole) return;
    initialRoleRef.current = initialRole;
    setSelectedTargetId(initialRole);
    writeTargetRole("cover-letter", letterId, initialRole);
  }, [initialRole, letterId]);

  /** Change the improve target and remember it for this cover letter. */
  function handleTargetChange(value: string) {
    setSelectedTargetId(value);
    writeTargetRole("cover-letter", letterId, value);
  }

  // Re-read the remembered look whenever the active version changes, so
  // revisiting a version restores exactly how it was styled. The improvement
  // preview belongs to the previous content, so it's dropped too.
  useEffect(() => {
    const savedTpl = isKnownTemplate(letter?.template_id)
      ? (letter?.template_id as string)
      : "";
    if (savedTpl) appliedRef.current = savedTpl;
    restoreChoice(savedTpl || appliedRef.current, linkedResumeId);
    setImprovement(null);
    setIgnoredEchoCount(0);
    setImproveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId, version, linkedResumeId, letter?.template_id]);

  // Reload the "Notes & instructions" draft whenever the letter changes.
  useEffect(() => {
    const draft = readIncorporateDraft("cover-letter", letterId);
    setIncNotes(draft.notes);
    setIncorporateError("");
    setNotesNotice("");
  }, [letterId]);

  function selectTheme(nextId: string) {
    setThemeId(nextId);
    setMatchedToResume(false);
    saveStyle("cover-letter", letterId, version, { themeId: nextId, accentId, fontId });
    savePreview("cover-letter", letterId, { themeId: nextId, accentId, fontId });
  }

  function selectAccent(nextId: string) {
    setAccentId(nextId);
    setMatchedToResume(false);
    saveStyle("cover-letter", letterId, version, { themeId, accentId: nextId, fontId });
    savePreview("cover-letter", letterId, { themeId, accentId: nextId, fontId });
  }

  function selectFont(nextId: string) {
    setFontId(nextId);
    setMatchedToResume(false);
    saveStyle("cover-letter", letterId, version, { themeId, accentId, fontId: nextId });
    savePreview("cover-letter", letterId, { themeId, accentId, fontId: nextId });
  }

  /** Apply a saved library style: preview it here; "Use this template" persists it. */
  function handleApplyLibraryStyle(nextThemeId: string, nextAccentId: string, nextFontId: string) {
    selectTheme(nextThemeId);
    setAccentId(nextAccentId);
    setFontId(nextFontId);
    saveStyle("cover-letter", letterId, version, {
      themeId: nextThemeId,
      accentId: nextAccentId,
      fontId: nextFontId,
    });
    savePreview("cover-letter", letterId, {
      themeId: nextThemeId,
      accentId: nextAccentId,
      fontId: nextFontId,
    });
  }

  /** Persist the previewed template onto the letter. */
  async function handleUseTemplate() {
    if (applyingTemplate || themeId === appliedTemplateId) return;
    setApplyingTemplate(true);
    try {
      const updated = await updateCoverLetter(letterId, { template_id: themeId });
      setLetter(updated);
      setAppliedTemplateId(themeId);
      appliedRef.current = themeId;
      setMatchedToResume(false);
      saveStyle("cover-letter", letterId, version, { themeId, accentId, fontId });
      clearPreview("cover-letter", letterId);
      showToast(`${theme.name} applied to this cover letter`, "success");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not apply the template.",
        "error"
      );
    } finally {
      setApplyingTemplate(false);
    }
  }

  /** Drop this letter's own style so it follows the linked résumé again. */
  function handleMatchResume() {
    if (linkedResumeId === undefined || linkedResumeId === null) return;
    clearStyle("cover-letter", letterId, version);
    clearPreview("cover-letter", letterId);
    const style = resolveCoverChoice(letterId, version, linkedResumeId);
    setThemeId(style.themeId);
    setAccentId(style.accentId);
    setFontId(style.fontId);
    setMatchedToResume(true);
    showToast("Matched your résumé's style", "success");
  }

  function updateCompare(value: boolean) {
    setCompare(value);
    try {
      localStorage.setItem(PREVIEW_COMPARE_STORAGE_KEY, value ? "split" : "replace");
    } catch {
      /* the toggle still works for this session */
    }
  }

  /** Run a structured improve. Carries the selected prompts plus optional free text. */
  async function runImprove(
    instructions: string[],
    instruction: string,
    focusPoints: string[] = [],
    opts?: { fromNotes?: boolean }
  ) {
    if (improving) return;
    setImproving(true);
    setImproveError("");
    setPendingPrompts(instructions);
    setPendingInstruction(instruction);
    setPendingFindings(focusPoints);
    // Track the Improve panel's chip + custom-instruction runs in the past-inputs
    // log too — accepting settles them and re-running can replay them. A
    // "Notes & instructions" run is a pure directive and is never logged.
    const fromNotes = opts?.fromNotes ?? false;
    const trackable = !fromNotes && (instructions.length > 0 || instruction.trim().length > 0);
    if (trackable) {
      recordIncorporate(instruction.trim(), instructions);
      fromIncorporateRef.current = true;
    } else {
      fromIncorporateRef.current = false;
    }
    fromNotesRef.current = fromNotes;
    try {
      const result = await improveCoverLetterStructured(letterId, {
        instructions,
        instruction,
        job_posting_id: selectedTargetId || undefined,
        focus_points: focusPoints.length ? focusPoints : undefined,
      });
      // The instruction + chips are GUIDANCE, not content — drop any verbatim
      // echo the AI returned so a directive can't become a letter paragraph.
      const guarded = stripCoverLetterInstructionEchoDetailed(result.structured, structured, [
        instruction,
        ...instructions,
      ]);
      setImprovement({ ...result, structured: guarded.doc });
      setIgnoredEchoCount(guarded.strippedCount);
    } catch (err) {
      setImproveError(tailorErrorMessage(err, "cover letter"));
      reportError(err, "cover letter");
    } finally {
      setImproving(false);
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
    const prevVersion = letter?.active_version;
    const content = structured ? coverLetterToMarkdown(structured) : letter?.content ?? "";
    try {
      const result = await runDirectImprove({
        kind: "cover-letter",
        docId: letterId,
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
      const updated = result.updated as CoverLetter | undefined;
      const newVersion = updated?.active_version;
      if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
        // Tag this version with the exact instruction the user typed, so it is
        // easy to spot as "Applied: …" in the version switcher.
        saveAppliedInstruction("cover-letter", letterId, newVersion, text);
        if (result.flaggedMetrics.length) {
          saveVersionMetric("cover-letter", letterId, newVersion, {
            total: result.flaggedMetrics.length,
            verified: 0,
          });
        }
        if (focusPoints.length) {
          saveVersionFindings("cover-letter", letterId, newVersion, focusPoints);
        }
      }
      if (prompts.some((p) => COVER_PRESETS.includes(p))) improve.clearPrompts();
      improve.updateInstruction("");
      if (opts?.clearNotes) {
        updateIncNotes("");
        recentInstructions.push(text);
      }
      if (updated) {
        setLetter(updated);
        onAccepted?.(updated);
      }
      await load();
      const canUndo =
        prevVersion !== undefined && prevVersion !== null && prevVersion !== "";
      const landedSections =
        structured && result.structured
          ? diffFields(
              flattenCoverLetter(structured),
              flattenCoverLetter(result.structured)
            ).map((c) => c.section)
          : [];
      showToast(
        describeAction(
          opts?.clearNotes ? "Applied your instruction to" : "Updated",
          landedSections,
          opts?.clearNotes ? "Applied your instruction" : "Cover letter updated."
        ),
        "success",
        canUndo
          ? {
              label: "Undo",
              onUndo: async () => {
                const restored = await activateCoverLetterVersion(
                  letterId,
                  prevVersion as string | number
                );
                setLetter(restored);
                onAccepted?.(restored);
                await load();
              },
            }
          : undefined
      );
    } catch (err) {
      reportError(err, "cover letter");
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
      const updated = await createCoverLetterVersion(letterId, {
        text: markdown,
        instructions: pendingPrompts.length ? pendingPrompts : undefined,
        instruction: pendingInstruction || undefined,
        job_posting_id: selectedTargetId || undefined,
      });
      // Remember which AI-added figures this saved version carries, so the
      // version switcher can flag versions that still need verifying.
      const newVersion = updated.active_version;
      if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
        if (metrics.total > 0) {
          saveVersionMetric("cover-letter", letterId, newVersion, {
            total: metrics.total,
            verified: metrics.verified,
          });
        }
        // Record which review findings this saved version addressed (traceability).
        if (pendingFindings.length) {
          saveVersionFindings("cover-letter", letterId, newVersion, pendingFindings);
        }
        // Tag this preview-accepted version with the instruction that produced it,
        // so it reads as "Applied: …" just like a direct apply.
        if (pendingInstruction.trim()) {
          saveAppliedInstruction(
            "cover-letter",
            letterId,
            newVersion,
            pendingInstruction.trim()
          );
        }
        // Carry the verified-figure memory onto the new version, so re-improving
        // from it remembers which figures were already checked.
        migrateVerifiedMetrics(
          metricKey,
          metricMemoryKey("cover-letter", letterId, newVersion)
        );
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
      setLetter(updated);
      setImprovement(null);
      setIgnoredEchoCount(0);
      onAccepted?.(updated);
      await load();
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
        err instanceof ApiError ? err.message : "Could not save the improved cover letter."
      );
      reportError(err, "cover letter");
    } finally {
      setApplying(false);
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
    writeIncorporateDraft("cover-letter", letterId, { ideas: [], notes: value });
  }

  /** Apply the "Notes & instructions" directive immediately via `…/ai-edit`. */
  function applyNotesInstruction() {
    const text = incNotes.trim();
    if (!text || improving || applying || aiEdit.running) return;
    // Clear any previous "no change" notice — a fresh submit always re-evaluates.
    setNotesNotice("");
    void aiEdit.run(text);
  }

  /** Re-run a remembered command from the recent-instructions list in one click. */
  function runRecentInstruction(text: string) {
    const t = text.trim();
    if (!t || improving || applying || aiEdit.running) return;
    updateIncNotes(t);
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
      const result = await incorporateCoverLetter(letterId, {
        ideas,
        notes,
        ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
      });
      // Nothing was woven in → say so plainly and close the pending submission.
      const nextChanges = structured
        ? diffFields(flattenCoverLetter(structured), flattenCoverLetter(result.structured))
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
      setIncorporateError(tailorErrorMessage(err, "cover letter"));
      reportError(err, "cover letter");
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

  /** Hover improvement on the paper — a focused, single-section instruction. */
  function handleSectionImprove(instruction: string) {
    improve.recordLastImprove([], instruction, []);
    runImprove([], instruction);
  }

  function handlePrint() {
    showToast("Opening print dialog — choose “Save as PDF” to keep this design", "success");
    window.setTimeout(() => window.print(), 120);
  }

  async function handleExport(kind: "pdf" | "docx") {
    setDownloading(kind);
    setDownloadError("");
    const base = fileBase(displayTitle);
    // Export with the exact look on screen — template, accent, and typeface.
    const style = { templateId: themeId, accentId, fontId };
    try {
      if (kind === "pdf") {
        await exportCoverLetterPdf(letterId, `${base}.pdf`, style);
      } else {
        await exportCoverLetterDocx(letterId, `${base}.docx`, style);
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

  async function handleDownloadOriginal() {
    setDownloading("original");
    setDownloadError("");
    try {
      await downloadCoverLetter(letterId, letter?.original_filename);
      showToast("Downloaded original", "success");
    } catch (err) {
      setDownloadError(
        err instanceof ApiError ? err.message : "Could not download the file."
      );
    } finally {
      setDownloading(null);
    }
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
            Couldn&apos;t load this cover letter
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
            <i className="ri-mail-send-line text-2xl"></i>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground-900">
            Add more to your cover letter to preview a template.
          </p>
          <p className="mt-1 text-xs text-foreground-500 max-w-sm mx-auto">
            Write a few paragraphs and your chosen template will fill in here.
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
                  Rendered live from the letter · print to keep this exact design
                </span>
              </div>

              <StructuredImprovePreview<CoverLetterStructured>
                renderPaper={(node, flags) => (
                  <theme.Component data={node} accent={accent as AccentColor} />
                )}
                resolve={(reverted) =>
                  resolveByReverts(
                    improvement.structured,
                    structured ?? { contact: [], paragraphs: [] },
                    improveChanges,
                    reverted
                  )
                }
                toMarkdown={coverLetterToMarkdown}
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
                currentLabel="Current letter"
                memoryKey={metricKey}
                reviewKey={revisionReviewKey("cover-letter", letterId)}
                ignoredCount={ignoredEchoCount}
              />
            </section>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start hw-print-hide">
              {/* LEFT — improve + chooser (scrolls; the live preview stays pinned on the right) */}
              <div className="min-w-0 space-y-4">
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
                  kindLabel="cover letter"
                  historyEntries={incorporateHistory}
                  onRerunHistory={rerunIncorporate}
                  onRerunOneHistory={rerunIncorporateOne}
                  onViewImpactHistory={openImpact}
                  onRemoveHistory={removeIncorporate}
                  onClearHistory={clearIncorporateHistory}
                  rerunRoleLabel={targetJobLabel}
                  memoryKey={`cover-letter_${letterId}`}
                  recentInstructions={recentInstructions.recent}
                  onRunRecentInstruction={runRecentInstruction}
                  onClearRecentInstructions={recentInstructions.clear}
                  addContentHint="Write new paragraphs in the letter body itself — open Edit, type your text, then Save. The AI only rewrites what's already there; it never invents facts."
                  quickActions={
                    (selectedTargetId || targetJobs.length > 0) ? (
                      <TargetRoleSelect
                        jobs={targetJobs}
                        value={selectedTargetId}
                        onChange={handleTargetChange}
                        fallbackLabel={selectedTargetFallbackLabel}
                        disabled={improving}
                      />
                    ) : undefined
                  }
                />
                <TemplateGallery
                  themes={COVER_LETTER_THEMES}
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
                      {linkedResumeId !== undefined && linkedResumeId !== null && (
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-xs text-foreground-600 min-w-0">
                            <i className={matchedToResume ? "ri-link" : "ri-link-unlink"}></i>
                            {matchedToResume
                              ? "Matched to your linked résumé's style."
                              : "This letter has its own style."}
                          </span>
                          {!matchedToResume && (
                            <button
                              onClick={handleMatchResume}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-secondary-500 text-background-50 dark:text-foreground-950 px-2.5 py-1.5 rounded-md hover:bg-secondary-600 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              <i className="ri-link"></i>
                              Match résumé style
                            </button>
                          )}
                        </div>
                      )}
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
                        {letter?.file_url && (
                          <button
                            onClick={handleDownloadOriginal}
                            disabled={downloading !== null}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                          >
                            <i className={downloading === "original" ? "ri-loader-4-line animate-spin" : "ri-download-2-line"}></i>
                            {downloading === "original" ? "Downloading…" : "Download original"}
                          </button>
                        )}
                      </div>
                    </>
                  }
                />

                <SavedStylesPanel
                  kind="cover-letter"
                  themeId={themeId}
                  accentId={accentId}
                  fontId={fontId}
                  defaultThemeId={DEFAULT_COVER_LETTER_THEME_ID}
                  defaultAccentId={DEFAULT_ACCENT.id}
                  defaultFontId={DEFAULT_FONT_ID}
                  themeLabel={(id) => COVER_LETTER_THEMES.find((t) => t.id === id)?.name ?? id}
                  accentLabel={(id) => ACCENT_COLORS.find((a) => a.id === id)?.name ?? id}
                  previewData={structured}
                  targetRoleId={selectedTargetId}
                  targetRoleLabel={targetJobLabel}
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
                        ? `Previewing ${theme.name} — apply it to save this layout on your letter.`
                        : `${theme.name} is the layout saved on your cover letter.`}
                    </p>
                    {structured && (
                      <TemplatePreview
                        resetKey={themeId}
                        viewerHeight={540}
                        fontStack={font.stack}
                        onExpand={() => setPreviewExpanded(true)}
                      >
                        <theme.Component
                          data={structured}
                          accent={accent as AccentColor}
                          onImproveSection={improving ? undefined : handleSectionImprove}
                        />
                      </TemplatePreview>
                    )}
                    {previewExpanded && structured && (
                      <ReadablePreviewModal
                        title={displayTitle}
                        subtitle="Full readable view · live preview"
                        onClose={() => setPreviewExpanded(false)}
                        revision={<theme.Component data={structured} accent={accent as AccentColor} />}
                        revisionLabel="Live preview"
                        revisionWidth={PAPER_WIDTH}
                        memoryKey={revisionReviewKey("cover-letter", letterId)}
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
          revision={<theme.Component data={structured} accent={accent as AccentColor} />}
          revisionHighlightTerms={impact.terms}
          defaultHighlight
          revisionLabel="Your cover letter"
          revisionWidth={PAPER_WIDTH}
          memoryKey={`impact_cover-letter_${letterId}`}
        />
      )}
    </div>
  );
}