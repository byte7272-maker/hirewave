import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/base/ToastProvider";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import useAiEdit, { AI_EDIT_NO_CHANGE_INLINE_MESSAGE } from "@/hooks/useAiEdit";
import { runDirectImprove } from "@/lib/directImprove";
import { jobMatches } from "@/mocks/dashboard";
import {
  createCoverLetterVersion,
  createResumeVersion,
  getCoverLetter,
  getResumeStructured,
  improveCoverLetterStructured,
  improveResumeStructured,
  incorporateCoverLetter,
  incorporateResume,
  tailorErrorMessage,
  type CoverLetter,
  type FlaggedMetric,
  type Resume,
} from "@/lib/documents";
import {
  buildCoverLetterStructured,
  type CoverLetterStructured,
} from "@/lib/coverLetterTemplate";
import type { JsonResume } from "@/lib/jsonResume";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import { useImproveMemory } from "@/hooks/useImproveMemory";
import { RESUME_PRESETS } from "@/lib/resumePresets";
import { COVER_PRESETS } from "@/lib/coverLetterPresets";
import { saveVersionFindings } from "@/lib/versionFindings";
import { markImprovedVersion } from "@/lib/versionImproveMemory";
import { saveAppliedInstruction } from "@/lib/versionAppliedInstruction";
import { recordWorkHighlightsImported } from "@/lib/workHighlightsMemory";
import TargetRoleSelect from "@/pages/dashboard/documents/components/TargetRoleSelect";
import ReadablePreviewModal from "@/pages/dashboard/documents/components/ReadablePreviewModal";
import LandedInNotice from "@/pages/dashboard/documents/components/LandedInNotice";
import { impactLabelForEntry, impactTermsForEntry } from "@/lib/impact";
import CompactTemplatePicker from "./CompactTemplatePicker";
import { DEFAULT_THEME_ID, RESUME_THEMES, getTheme } from "./themeRegistry";
import {
  COVER_LETTER_THEMES,
  DEFAULT_COVER_LETTER_THEME_ID,
  getCoverLetterTheme,
} from "./coverLetterThemeRegistry";
import { DEFAULT_ACCENT, getAccent, isKnownAccent } from "./accent";
import { readStyle, saveStyle } from "./templateStyle";
import { readTargetRole, writeTargetRole } from "./targetRoleMemory";
import { diffFields, resolveByReverts, type StructuredChange } from "./structuredDiff";
import { flattenResume, resumeToMarkdown } from "./resumeFields";
import {
  stripCoverLetterInstructionEchoDetailed,
  stripResumeInstructionEchoDetailed,
} from "./instructionEcho";
import { coverLetterToMarkdown, flattenCoverLetter } from "./coverLetterFields";
import { metricMemoryKey, saveVersionMetric } from "./metricMemory";
import {
  readIncorporateDraft,
  writeIncorporateDraft,
} from "@/lib/incorporateMemory";
import { useIncorporateHistory } from "@/hooks/useIncorporateHistory";
import { useRecentInstructions } from "@/hooks/useRecentInstructions";
import type { IncorporateEntry } from "@/lib/incorporateHistory";
import { PAPER_WIDTH } from "./themes/paper";
import { countStrengthenedBullets, isWholeResumeStrengthen } from "./bulletActions";
import { saveBulletStrengthen } from "@/lib/bulletStrengthenMemory";
import { readSkillsLayout, type SkillsLayout } from "@/lib/skillsLayoutMemory";
import { IMPROVE_EVERYTHING_INSTRUCTION } from "@/lib/improveEverything";
import { saveAiEditTrace } from "@/lib/aiEditTrace";
import { describeAction } from "./changeActionMessage";

export type ImproveKind = "resume" | "cover-letter";
/** Either a JSON Resume or a structured cover letter, depending on `kind`. */
export type ImproveDoc = JsonResume | CoverLetterStructured;

/** Remembered layout for the structured-improve preview: "replace" or "split". */
const COMPARE_STORAGE_KEY = "hirewave_preview_compare_mode";
/** The cover-letter improve shares the same remembered keys as the editor. */
const COVER_MEMORY_PREFIX = "hirewave_cover_letter_improve";

function readCompare(): boolean {
  try {
    return localStorage.getItem(COMPARE_STORAGE_KEY) === "split";
  } catch {
    return false;
  }
}

interface UseStructuredImproveArgs {
  kind: ImproveKind;
  docId: string | number;
  /** AI Review findings (suggestion titles) offered as tickable focus points. */
  findings?: string[];
  /** Called with the updated document after an improvement is saved as a version. */
  onAccepted?: (doc: Resume | CoverLetter) => void;
  /**
   * Returns the document text exactly as it reads on screen right now — including
   * any edits the user has typed but not yet saved. When provided, every improve
   * send it as `content`, so the AI improves what the user currently sees instead
   * of the last-saved version.
   */
  getContent?: () => string;
  /**
   * The version that is active BEFORE a direct self-entry apply, so the
   * confirmation can offer a one-click Undo that restores it.
   */
  getActiveVersion?: () => string | number | undefined;
  /** Re-activate a version (the direct-apply Undo calls this). */
  activateVersion?: (version: string | number) => Promise<void> | void;
  /**
   * Route an instruction that is really a literal replacement into the
   * deterministic Find & replace tool (instant + exact) instead of the AI.
   */
  onRouteLiteralReplace?: (find: string, replace: string) => void;
  /**
   * Open the deterministic Find & replace tool. When provided, the immediate
   * edit's "no change made" notice offers a one-tap "Open Find & replace"
   * action, so the suggested fallback is a single click away.
   */
  onOpenFindReplace?: () => void;
  /**
   * Handle a Skills layout instruction locally (re-render the Skills section)
   * instead of round-tripping the LLM for formatting.
   */
  onRouteSkillsLayout?: (layout: SkillsLayout) => void;
}

/**
 * The one "Improve with AI" experience, shared by the full editor and the quick
 * preview. It drives the same component pair (`ImprovePanel` for the controls,
 * `StructuredImprovePreview` for the result) against the SAME endpoint
 * (`POST /resumes|cover-letters/{id}/improve-structured`) and the same
 * accept/discard/flagged-metrics behavior — so there is no divergent path.
 *
 * The improved result renders through the document's chosen template; nothing is
 * saved until the returned markdown is posted to `…/versions`.
 */
export default function useStructuredImprove({
  kind,
  docId,
  findings = [],
  onAccepted,
  getContent,
  getActiveVersion,
  activateVersion,
  onRouteLiteralReplace,
  onRouteSkillsLayout,
  onOpenFindReplace,
}: UseStructuredImproveArgs) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { reportError, reportUnchanged } = useChangeFeedback();
  const isResume = kind === "resume";
  const presets = isResume ? RESUME_PRESETS : COVER_PRESETS;

  // Latest on-screen content provider, readable from inside callbacks without
  // re-creating them on every keystroke.
  const getContentRef = useRef(getContent);
  getContentRef.current = getContent;

  // Remembered chips + custom instruction — the same keys the editor uses.
  const memory = useImproveMemory(
    String(docId),
    presets,
    isResume ? undefined : COVER_MEMORY_PREFIX
  );
  // Ticked findings, kept in sync with the current review (a stale tick drops out).
  const activeFindings = memory.selectedFindings.filter((f) => findings.includes(f));

  const [structured, setStructured] = useState<ImproveDoc | null>(null);
  const [coverDoc, setCoverDoc] = useState<CoverLetter | null>(null);
  // Latest loaded document, readable inside callbacks without a stale closure —
  // lets us tell a genuine edit apart from an echo of the user's guidance.
  const structuredRef = useRef<ImproveDoc | null>(null);
  structuredRef.current = structured;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [improvement, setImprovement] = useState<ImproveDoc | null>(null);
  const [improvementFlags, setImprovementFlags] = useState<FlaggedMetric[]>([]);
  // How many of the AI's returned lines were verbatim echoes of the user's
  // guidance and got stripped before preview — surfaced so the removal is
  // transparent instead of silent.
  const [ignoredEchoCount, setIgnoredEchoCount] = useState(0);
  const [improving, setImproving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [pendingPrompts, setPendingPrompts] = useState<string[]>([]);
  const [pendingInstruction, setPendingInstruction] = useState("");
  const [pendingFindings, setPendingFindings] = useState<string[]>([]);
  // Whether the pending preview came from an "own points" submission (only then
  // does accepting it settle an incorporate-history entry).
  const fromIncorporateRef = useRef(false);
  // Whether that submission came from the "Notes & instructions" box specifically
  // (only then is the box cleared once the instruction actually lands).
  const fromNotesBoxRef = useRef(false);
  // Whether the pending improvement came from a "My Work Highlights" run, so an
  // accepted one can bump the résumé's imported-highlights badge count.
  const fromEvidenceRef = useRef(false);
  const [compare, setCompareState] = useState<boolean>(readCompare);

  // The "Notes & instructions" draft — persisted per document so a half-written
  // directive survives a reopen. It is a COMMAND for the AI, never document content.
  const [incNotes, setIncNotes] = useState<string>(
    () => readIncorporateDraft(kind, docId).notes
  );
  const [incorporating, setIncorporating] = useState(false);
  const [incorporateError, setIncorporateError] = useState("");
  /**
   * Inline status under the instruction box when a submit reached the endpoint
   * but made NO change. Kept in the host (not the panel) so it survives the
   * panel's own re-renders, and cleared the moment the instruction text changes.
   */
  const [notesNotice, setNotesNotice] = useState("");

  // Past "own points" submissions + whether they landed (drives the re-run log).
  const {
    entries: incorporateHistory,
    record: recordIncorporate,
    rearm: rearmIncorporate,
    settle: settleIncorporate,
    remove: removeIncorporate,
    clearAll: clearIncorporateHistory,
  } = useIncorporateHistory(kind, docId);

  // Recently applied AI directives — shown in the box so a past command can be
  // re-run in one click.
  const recentInstructions = useRecentInstructions(kind, docId);

  // A past submission's impact, painted onto the rendered paper on demand.
  const [impact, setImpact] = useState<{ label: string; terms: string[] } | null>(null);

  // A small "Landed in: …" confirmation shown right after an AI change is accepted
  // (a direct apply OR a preview accept), naming the sections it actually touched.
  const [landed, setLanded] = useState<{ id: number; sections: string[] } | null>(null);
  const landedIdRef = useRef(0);
  const showLanded = useCallback((sections: string[]) => {
    const unique = Array.from(new Set(sections.filter(Boolean)));
    if (!unique.length) return;
    landedIdRef.current += 1;
    setLanded({ id: landedIdRef.current, sections: unique });
  }, []);
  const dismissLanded = useCallback(() => setLanded(null), []);

  const [targetJobs, setTargetJobs] = useState<TailorableJob[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(() =>
    readTargetRole(kind, docId)
  );

  /** Load (or re-load) the current structured document + its improve context. */
  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setImprovement(null);
    setImprovementFlags([]);
    setError("");
    setIgnoredEchoCount(0);
    try {
      if (isResume) {
        const data = await getResumeStructured(docId);
        setStructured(data);
      } else {
        const letter = await getCoverLetter(docId);
        setCoverDoc(letter);
        // Pull the linked résumé's basics (name/contact) for the letter header.
        let basics: JsonResume["basics"] | undefined;
        if (letter.resume_id !== undefined && letter.resume_id !== null) {
          try {
            basics = (await getResumeStructured(letter.resume_id)).basics;
          } catch {
            /* header identity is best-effort */
          }
        }
        const job = jobMatches.find(
          (j) => String(j.id) === String(letter.job_posting_id)
        );
        setStructured(
          buildCoverLetterStructured(letter.content ?? "", {
            date: letter.created_at ?? letter.generated_at,
            basics,
            company: job?.company,
            role: job?.title,
          })
        );
        // Seed the improve target from the letter's linked job when nothing is set.
        setSelectedTargetId(
          (prev) =>
            prev ||
            (letter.job_posting_id !== undefined && letter.job_posting_id !== null
              ? String(letter.job_posting_id)
              : "")
        );
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : "Could not load this document's content."
      );
    } finally {
      setLoading(false);
    }
  }, [isResume, docId]);

  // Reload whenever the previewed document changes.
  useEffect(() => {
    void reload();
  }, [reload]);

  // Reset the remembered improve target when the document changes.
  useEffect(() => {
    setSelectedTargetId(readTargetRole(kind, docId));
  }, [kind, docId]);

  // Reload the "Notes & instructions" draft whenever the document changes.
  useEffect(() => {
    const draft = readIncorporateDraft(kind, docId);
    setIncNotes(draft.notes);
    setIncorporateError("");
    setNotesNotice("");
  }, [kind, docId]);

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

  /**
   * A template/accent pick made from within this hook (the compact preview
   * picker). When set it wins over the remembered style, and it is persisted to
   * the SAME shared memory the editor's full gallery reads — so the two agree.
   */
  const [styleOverride, setStyleOverride] = useState<{
    themeId: string;
    accentId: string;
  } | null>(null);

  // A new document starts from its own remembered look, not a stale override.
  useEffect(() => {
    setStyleOverride(null);
  }, [kind, docId]);

  /** Resolve the document's chosen template + accent (its own pick, else defaults). */
  const themeChoice = useMemo(() => {
    if (styleOverride) return styleOverride;
    if (isResume) {
      const stored = readStyle("resume", docId);
      return {
        themeId:
          stored?.themeId && RESUME_THEMES.some((t) => t.id === stored.themeId)
            ? stored.themeId
            : DEFAULT_THEME_ID,
        accentId:
          stored?.accentId && isKnownAccent(stored.accentId)
            ? stored.accentId
            : DEFAULT_ACCENT.id,
      };
    }
    const own = readStyle("cover-letter", docId);
    const linkedId = coverDoc?.resume_id;
    const linked =
      linkedId !== undefined && linkedId !== null
        ? readStyle("resume", String(linkedId))
        : null;
    const themeRaw = own?.themeId ?? linked?.themeId ?? DEFAULT_COVER_LETTER_THEME_ID;
    const accentRaw = own?.accentId ?? linked?.accentId ?? DEFAULT_ACCENT.id;
    return {
      themeId: COVER_LETTER_THEMES.some((t) => t.id === themeRaw)
        ? themeRaw
        : DEFAULT_COVER_LETTER_THEME_ID,
      accentId: isKnownAccent(accentRaw) ? accentRaw : DEFAULT_ACCENT.id,
    };
  }, [styleOverride, isResume, docId, coverDoc?.resume_id]);

  const accent = getAccent(themeChoice.accentId);
  const metricKey = metricMemoryKey(kind, docId);

  /** The document's remembered Skills presentation (comma list vs bullets). */
  const skillsLayout = useMemo(() => readSkillsLayout(docId), [docId]);

  /**
   * Switch the improved result's template from a compact control. Persists to
   * the shared style memory so the editor's gallery reflects the same choice.
   */
  const selectTheme = useCallback(
    (nextId: string) => {
      const next = { themeId: nextId, accentId: themeChoice.accentId };
      setStyleOverride(next);
      saveStyle(kind, docId, null, next);
    },
    [kind, docId, themeChoice.accentId]
  );

  /** Render the document through its chosen template (formatting intact). */
  const renderPaper = useCallback(
    (node: ImproveDoc, flags: FlaggedMetric[]): ReactNode => {
      if (isResume) {
        const Theme = getTheme(themeChoice.themeId).Component;
        return (
          <Theme
            resume={node as JsonResume}
            accent={accent}
            flags={flags}
            skillsLayout={skillsLayout}
          />
        );
      }
      const Theme = getCoverLetterTheme(themeChoice.themeId).Component;
      return <Theme data={node as CoverLetterStructured} accent={accent} />;
    },
    [isResume, themeChoice.themeId, accent, skillsLayout]
  );

  /** Serialize a resolved document to the markdown posted on save. */
  const toMarkdown = useCallback(
    (node: ImproveDoc): string =>
      isResume
        ? resumeToMarkdown(node as JsonResume)
        : coverLetterToMarkdown(node as CoverLetterStructured),
    [isResume]
  );

  const flatten = useCallback(
    (node: ImproveDoc | null) =>
      isResume
        ? flattenResume(node as JsonResume | null)
        : flattenCoverLetter(node as CoverLetterStructured | null),
    [isResume]
  );

  /** Field-level differences between the saved document and the AI's version. */
  const changes: StructuredChange[] = useMemo(
    () => (improvement ? diffFields(flatten(structured), flatten(improvement)) : []),
    [improvement, structured, flatten]
  );

  const emptyStructured = useMemo<ImproveDoc>(
    () =>
      isResume
        ? (Object() as JsonResume)
        : ({ contact: [], paragraphs: [] } as CoverLetterStructured),
    [isResume]
  );

  /** The document reflecting the user's keep/revert choices. */
  const resolve = useCallback(
    (reverted: ReadonlySet<number>): ImproveDoc =>
      improvement
        ? resolveByReverts(improvement, structured ?? emptyStructured, changes, reverted)
        : structured ?? emptyStructured,
    [improvement, structured, changes, emptyStructured]
  );

  const handleTargetChange = useCallback(
    (value: string) => {
      setSelectedTargetId(value);
      writeTargetRole(kind, docId, value);
    },
    [kind, docId]
  );

  const targetLabel = useMemo(() => {
    if (!selectedTargetId) return null;
    const job = targetJobs.find((j) => String(j.job_posting_id) === selectedTargetId);
    return job ? `${job.title} · ${job.company}` : null;
  }, [selectedTargetId, targetJobs]);

  const setCompare = useCallback((value: boolean) => {
    setCompareState(value);
    try {
      localStorage.setItem(COMPARE_STORAGE_KEY, value ? "split" : "replace");
    } catch {
      /* toggle still works for this session */
    }
  }, []);

  /** Run a structured improve on `…/improve-structured`. The result is a preview only. */
  const runImprove = useCallback(
    async (
      prompts: string[],
      freeText: string,
      focusPoints: string[] = [],
      contentOverride?: string,
      opts?: { fromNotes?: boolean }
    ) => {
      if (improving) return;
      fromEvidenceRef.current = false;
      setImproving(true);
      setError("");
      setPendingPrompts(prompts);
      setPendingInstruction(freeText);
      setPendingFindings(focusPoints);
      // Track the Improve panel's chip + custom-instruction runs in the SAME
      // past-inputs log, so accepting settles them and re-running can replay them.
      // A single-bullet polish passes `contentOverride` and isn't logged (it's an
      // inline edit, not a panel run). A "Notes & instructions" run is a pure
      // directive — it's never logged as a content submission.
      const fromNotes = opts?.fromNotes ?? false;
      const trackable =
        !fromNotes &&
        (prompts.length > 0 || (freeText.trim().length > 0 && !contentOverride));
      if (trackable) {
        recordIncorporate(freeText.trim(), prompts);
        fromIncorporateRef.current = true;
      } else {
        fromIncorporateRef.current = false;
      }
      // Remember whether this preview came from the "Notes & instructions" box, so
      // accepting it clears that box and confirms with the right toast.
      fromNotesBoxRef.current = fromNotes;
      const payload = {
        instructions: prompts,
        instruction: freeText,
        job_posting_id: selectedTargetId || undefined,
        focus_points: focusPoints.length ? focusPoints : undefined,
        content: contentOverride ?? getContentRef.current?.(),
      };
      try {
        let guardedDoc: ImproveDoc;
        let stripped = 0;
        let flagged: FlaggedMetric[] = [];
        if (isResume) {
          const result = await improveResumeStructured(docId, payload);
          const guarded = stripResumeInstructionEchoDetailed(
            result.structured,
            structuredRef.current as JsonResume | null,
            [freeText, ...prompts]
          );
          guardedDoc = guarded.doc;
          stripped = guarded.strippedCount;
          flagged = result.flagged_metrics ?? [];
        } else {
          const result = await improveCoverLetterStructured(docId, payload);
          const guarded = stripCoverLetterInstructionEchoDetailed(
            result.structured,
            structuredRef.current as CoverLetterStructured | null,
            [freeText, ...prompts]
          );
          guardedDoc = guarded.doc;
          stripped = guarded.strippedCount;
          flagged = result.flagged_metrics ?? [];
        }
        // Nothing actually changed → say so plainly instead of opening a
        // pointless empty diff preview that would re-save the same content.
        const before = structuredRef.current;
        const nextChanges = before
          ? diffFields(flatten(before), flatten(guardedDoc))
          : [];
        if (before && nextChanges.length === 0) {
          setImprovement(null);
          setImprovementFlags([]);
          setIgnoredEchoCount(0);
          fromIncorporateRef.current = false;
          fromNotesBoxRef.current = false;
          reportUnchanged();
          return;
        }
        setImprovement(guardedDoc);
        setIgnoredEchoCount(stripped);
        setImprovementFlags(flagged);
      } catch (err) {
        setError(tailorErrorMessage(err, isResume ? "résumé" : "cover letter"));
        reportError(err, isResume ? "résumé" : "cover letter");
      } finally {
        setImproving(false);
      }
    },
    [
      improving,
      memory,
      isResume,
      docId,
      selectedTargetId,
      recordIncorporate,
      flatten,
      reportError,
      reportUnchanged,
    ]
  );

  /**
   * Write the "AI instructions" draft for this document. Declared above
   * `applyInstruction` (which references it) so its dependency array never touches
   * the binding before it is initialized.
   */
  const updateIncNotes = useCallback(
    (value: string) => {
      setIncNotes(value);
      // Editing the instruction dismisses any stale "no change" notice.
      setNotesNotice("");
      writeIncorporateDraft(kind, docId, { ideas: [], notes: value });
    },
    [kind, docId]
  );

  // The immediate "Ask AI to change it" action: send the instruction to `…/ai-edit`,
  // which makes ONLY the requested change and saves it as a new active version —
  // no preview, no Apply-all, no Accept. The returned document re-renders the
  // editor, the box clears, and the confirmation offers one-click Undo.
  const aiEdit = useAiEdit({
    kind,
    docId,
    getContent: () => getContentRef.current?.(),
    getPreviousVersion: () => getActiveVersion?.(),
    onApplied: (updated) => onAccepted?.(updated as Resume | CoverLetter),
    activateVersion: (version) => activateVersion?.(version),
    reload,
    onAppliedClear: () => updateIncNotes(""),
    rememberInstruction: (instruction) => recentInstructions.push(instruction),
    onVersionTagged: (version, instruction, editCount) => {
      markImprovedVersion(kind, docId, version);
      saveAppliedInstruction(kind, docId, version, instruction);
      saveAiEditTrace(kind, docId, { count: editCount, version, at: Date.now() });
    },
    onOpenFindReplace: () => onOpenFindReplace?.(),
    // A no-op edit is never silent: show an inline notice under the box while the
    // instruction stays put, so the user can reword and try again.
    onNoChange: () => setNotesNotice(AI_EDIT_NO_CHANGE_INLINE_MESSAGE),
  });

  /**
   * Apply a typed self-entry improvement DIRECTLY (no review preview): send the
   * instruction to `…/improve-structured`, then — when the AI actually changed
   * the text — save the result as a new version and re-render the document.
   *
   * Every click ends visibly: a success toast with one-click Undo, an explicit
   * "no changes" note, or an error toast with the status + message. The result is
   * always reversible (it is a tracked version, and Undo restores the previous one).
   */
  const applyInstruction = useCallback(
    async (
      instruction: string,
      prompts: string[],
      focusPoints: string[],
      opts?: { clearNotes?: boolean }
    ) => {
      const text = instruction.trim();
      if (!text || improving || applying) return;
      fromEvidenceRef.current = false;
      setImproving(true);
      setError("");
      setPendingPrompts(prompts);
      setPendingInstruction(text);
      setPendingFindings(focusPoints);
      // Drop any pending review preview so it can't shadow the applied result.
      setImprovement(null);
      setImprovementFlags([]);
      setIgnoredEchoCount(0);
      const prevVersion = getActiveVersion?.();
      try {
        const result = await runDirectImprove({
          kind,
          docId,
          instruction: text,
          instructions: prompts,
          focusPoints,
          jobPostingId: selectedTargetId || undefined,
          content: getContentRef.current?.(),
          original: structuredRef.current ?? undefined,
        });
        if (!result.changed) {
          reportUnchanged();
          return;
        }
        // Report where the change landed — the sections whose wording actually changed.
        const landedSections = (() => {
          const before = structuredRef.current;
          const after = result.structured as ImproveDoc | undefined;
          if (!before || !after) return [] as string[];
          return diffFields(flatten(before), flatten(after)).map((c) => c.section);
        })();
        showLanded(landedSections);
        // Applied — record the version's figures + addressed findings for traceability.
        const updated = result.updated;
        const newVersion = updated?.active_version;
        if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
          markImprovedVersion(kind, docId, newVersion);
          // Tag this version with the exact instruction the user typed, so it is
          // easy to spot as "Applied: …" in the version switcher.
          saveAppliedInstruction(kind, docId, newVersion, text);
          if (result.flaggedMetrics.length) {
            saveVersionMetric(kind, docId, newVersion, {
              total: result.flaggedMetrics.length,
              verified: 0,
            });
          }
          if (focusPoints.length) {
            saveVersionFindings(kind, docId, newVersion, focusPoints);
          }
        }
        // Consume the chips it used and clear the now-applied guidance text.
        if (prompts.some((p) => presets.includes(p))) memory.clearPrompts();
        memory.updateInstruction("");
        // A "Notes & instructions" apply clears its own box on success, and the
        // command is remembered so it can be re-run in one click.
        if (opts?.clearNotes) {
          updateIncNotes("");
          recentInstructions.push(text);
        }
        if (updated) onAccepted?.(updated);
        void reload();
        const canUndo =
          Boolean(activateVersion) &&
          prevVersion !== undefined &&
          prevVersion !== null &&
          prevVersion !== "";
        showToast(
          describeAction(
            opts?.clearNotes ? "Applied your instruction to" : "Updated",
            landedSections,
            opts?.clearNotes
              ? "Applied your instruction"
              : isResume
                ? "Résumé updated."
                : "Cover letter updated."
          ),
          "success",
          canUndo
            ? {
                label: "Undo",
                onUndo: async () => {
                  await activateVersion?.(prevVersion as string | number);
                  void reload();
                },
              }
            : undefined
        );
      } catch (err) {
        reportError(err, isResume ? "résumé" : "cover letter");
      } finally {
        setImproving(false);
      }
    },
    [
      improving,
      applying,
      kind,
      docId,
      isResume,
      selectedTargetId,
      presets,
      memory,
      onAccepted,
      reload,
      showToast,
      getActiveVersion,
      activateVersion,
      updateIncNotes,
      recentInstructions,
      flatten,
      showLanded,
      reportError,
      reportUnchanged,
    ]
  );

  /**
   * Apply the "Notes & instructions" directive IMMEDIATELY: send it to `…/ai-edit`,
   * which makes ONLY the requested change and saves it as a new active version —
   * no preview, no Apply-all, no Accept. On success the box clears and the toast
   * offers one-click Undo; when nothing matched it says so; on failure the toast
   * is retryable. Commands are GUIDANCE and never become document content.
   */
  const applyNotesInstruction = useCallback(() => {
    const text = incNotes.trim();
    if (!text || improving || applying || aiEdit.running) return;
    // Clear any previous "no change" notice — a fresh submit always re-evaluates.
    setNotesNotice("");
    // Every Enter / "Apply change" POSTs to `…/ai-edit`. The Recent list and any
    // local shortcut are never a gate, and the box is only cleared once the
    // response actually lands (inside useAiEdit's success path).
    void aiEdit.run(text);
  }, [incNotes, improving, applying, aiEdit]);

  /** Re-run a remembered command from the recent-instructions list in one click. */
  const runRecentInstruction = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || improving || applying || aiEdit.running) return;
      setNotesNotice("");
      updateIncNotes(t);
      // A remembered command re-runs through the same POST — never a local branch.
      void aiEdit.run(t);
    },
    [improving, applying, aiEdit, updateIncNotes]
  );

  /** Forget the recent-instructions list for this document. */
  const clearRecentInstructions = useCallback(() => {
    recentInstructions.clear();
  }, [recentInstructions]);

  const discard = useCallback(() => {
    if (applying) return;
    // A discarded tracked submission never landed — close it as not implemented.
    if (fromIncorporateRef.current) {
      settleIncorporate("not-implemented", []);
      fromIncorporateRef.current = false;
    }
    fromNotesBoxRef.current = false;
    fromEvidenceRef.current = false;
    setImprovement(null);
    setImprovementFlags([]);
    setIgnoredEchoCount(0);
    setError("");
  }, [applying, settleIncorporate]);

  /** Send one incorporate payload and surface its preview. */
  const submitIncorporate = useCallback(
    async (ideas: string[], notes: string, jobPostingId?: string | number) => {
      if (incorporating) return;
      setIncorporating(true);
      setIncorporateError("");
      setError("");
      setPendingPrompts(ideas);
      setPendingInstruction(notes);
      setPendingFindings([]);
      fromIncorporateRef.current = true;
      try {
        const payload = {
          ideas,
          notes,
          ...(jobPostingId ? { job_posting_id: jobPostingId } : {}),
        };
        const result = isResume
          ? await incorporateResume(docId, payload)
          : await incorporateCoverLetter(docId, payload);
        // Nothing was woven in → say so plainly and close the pending submission.
        const before = structuredRef.current;
        const nextChanges = before
          ? diffFields(flatten(before), flatten(result.structured))
          : [];
        if (before && nextChanges.length === 0) {
          setImprovement(null);
          setImprovementFlags([]);
          settleIncorporate("not-implemented", []);
          fromIncorporateRef.current = false;
          reportUnchanged();
          return;
        }
        setImprovement(result.structured);
        setImprovementFlags(result.flagged_metrics ?? []);
      } catch (err) {
        setIncorporateError(
          tailorErrorMessage(err, isResume ? "résumé" : "cover letter")
        );
        reportError(err, isResume ? "résumé" : "cover letter");
      } finally {
        setIncorporating(false);
      }
    },
    [incorporating, isResume, docId, flatten, settleIncorporate, reportError, reportUnchanged]
  );

  /**
   * Open "My Work Highlights". It now lives on its own consolidated workspace
   * page, so this navigates there (preselecting this résumé and jumping to the
   * review zone) instead of opening the old in-editor modal — every entry point
   * leads to the one place the tool lives.
   */
  const openEvidence = useCallback(() => {
    const id = docId !== undefined && docId !== null ? String(docId) : "";
    navigate(
      id
        ? `/dashboard/experience?resume=${encodeURIComponent(id)}&zone=review`
        : "/dashboard/experience?zone=review"
    );
  }, [docId, navigate]);

  /** Paint a past submission's impact onto the rendered paper. */
  const openImpact = useCallback((entry: IncorporateEntry) => {
    setImpact({ label: impactLabelForEntry(entry), terms: impactTermsForEntry(entry) });
  }, []);

  /**
   * Weave the facts imported from the user's work tools into the document. They
   * go through the SAME incorporate preview + accept flow as "add your own
   * points" — nothing is saved until the user accepts.
   */
  const runEvidence = useCallback(
    async (ideas: string[]) => {
      if (!ideas.length) return;
      fromNotesBoxRef.current = false;
      fromEvidenceRef.current = true;
      recordIncorporate("", ideas);
      await submitIncorporate(ideas, "", selectedTargetId || undefined);
    },
    [recordIncorporate, submitIncorporate, selectedTargetId]
  );

  /** Re-run the notes / instructions that never landed, in one submission. */
  const rerunIncorporate = useCallback(
    async (list: IncorporateEntry[]) => {
      if (!list.length) return;
      fromNotesBoxRef.current = false;
      rearmIncorporate(list.map((e) => e.id));
      const ideas = Array.from(new Set(list.flatMap((e) => e.ideas)));
      const notes = list
        .map((e) => e.text.trim())
        .filter(Boolean)
        .join("\n");
      await submitIncorporate(ideas, notes, selectedTargetId || undefined);
    },
    [rearmIncorporate, submitIncorporate, selectedTargetId]
  );

  /**
   * Accept the improvement: post the resolved markdown to `…/versions` (creating
   * the new version), then re-load so the structured doc reflects it.
   */
  const accept = useCallback(
    async (markdown: string, metrics: { total: number; verified: number }) => {
      if (!improvement || applying) return;
      setApplying(true);
      setError("");
      // Whether the "Notes & instructions" box auto-cleared as a result of this
      // accept — used to fire the small "1 cleared" confirmation afterwards.
      let clearedNotes = false;
      const body = {
        text: markdown,
        instructions: pendingPrompts.length ? pendingPrompts : undefined,
        instruction: pendingInstruction || undefined,
        job_posting_id: selectedTargetId || undefined,
      };
      try {
        const updated = isResume
          ? await createResumeVersion(docId, body)
          : await createCoverLetterVersion(docId, body);
        const newVersion = updated.active_version;
        if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
          markImprovedVersion(kind, docId, newVersion);
          if (metrics.total > 0) {
            saveVersionMetric(kind, docId, newVersion, {
              total: metrics.total,
              verified: metrics.verified,
            });
          }
          if (pendingFindings.length) {
            saveVersionFindings(kind, docId, newVersion, pendingFindings);
          }
          // Tag this preview-accepted version with the instruction that produced it,
          // so it reads as "Applied: …" in the switcher just like a direct apply.
          if (pendingInstruction.trim()) {
            saveAppliedInstruction(kind, docId, newVersion, pendingInstruction.trim());
          }
          // Stamp how many bullets a whole-résumé strengthen pass actually changed,
          // so the accepted version shows "N bullets strengthened" (bulk traceability).
          if (isWholeResumeStrengthen(pendingInstruction)) {
            const strengthened = countStrengthenedBullets(
              changes.map((c) => c.path)
            );
            if (strengthened > 0) {
              saveBulletStrengthen(kind, docId, newVersion, strengthened);
            }
          }
        }
        // Close the pending "own points" submission with what actually changed.
        if (fromIncorporateRef.current) {
          const impacted = Array.from(
            new Set(changes.map((c) => c.section).filter(Boolean))
          );
          // The wording that survived into the saved markdown — used to paint the
          // change onto the paper, so reverted edits aren't highlighted.
          const passages = changes
            .map((c) => c.after)
            .filter((t) => t && markdown.includes(t));
          const landed = impacted.length > 0;
          settleIncorporate(
            landed ? "implemented" : "not-implemented",
            impacted,
            passages
          );
          fromIncorporateRef.current = false;
          // A "My Work Highlights" run that actually landed bumps the résumé's
          // imported total, so the list badge reflects real progress.
          if (landed && fromEvidenceRef.current) {
            recordWorkHighlightsImported(docId, pendingPrompts.length);
          }
          fromEvidenceRef.current = false;
        }
        // A "Notes & instructions" preview that landed: clear the directive box —
        // its command was applied, and it was guidance, never content.
        if (fromNotesBoxRef.current) {
          updateIncNotes("");
          // Remember the command so it can be re-run in one click.
          recentInstructions.push(pendingInstruction);
          clearedNotes = true;
          fromNotesBoxRef.current = false;
        }
        // The improvement is now applied — consume the chips it used so they
        // aren't offered as pre-selected again. Only chips from the improve
        // catalog count ("Add your own points" ideas are not improve chips).
        // The run itself stays in history via "Reuse last improve".
        if (pendingPrompts.some((p) => presets.includes(p))) {
          memory.clearPrompts();
        }
        // Clear the guidance text — it has been applied; a follow-up improve
        // starts from a blank instruction.
        memory.updateInstruction("");
        setImprovement(null);
        setImprovementFlags([]);
        setIgnoredEchoCount(0);
        onAccepted?.(updated);
        void reload();
        // Confirm where the accepted change landed, from the diffed section labels.
        showLanded(changes.map((c) => c.section));
        showToast(
          describeAction(
            clearedNotes ? "Applied your instruction to" : "Improved",
            changes.map((c) => c.section),
            clearedNotes ? "Applied your instruction" : "Improved version saved"
          ),
          "success"
        );
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not save the improved version."
        );
        reportError(err, isResume ? "résumé" : "cover letter");
      } finally {
        setApplying(false);
      }
    },
    [
      improvement,
      applying,
      isResume,
      docId,
      pendingPrompts,
      pendingInstruction,
      selectedTargetId,
      pendingFindings,
      kind,
      presets,
      memory,
      onAccepted,
      reload,
      showToast,
      changes,
      settleIncorporate,
      updateIncNotes,
      recentInstructions,
      showLanded,
      reportError,
    ]
  );

  /** Props for the shared `ImprovePanel` — identical to how the editor wires it. */
  const panelProps = {
    presets,
    revising: improving,
    error,
    instruction: memory.instruction,
    onInstructionChange: memory.updateInstruction,
    selectedPrompts: memory.selectedPrompts,
    onSelectedPromptsChange: memory.updateSelectedPrompts,
    onImprove: runImprove,
    applyInstruction,
    onClearRemembered: memory.clearRemembered,
    lastImprove: memory.lastImprove,
    onImproveRun: memory.recordLastImprove,
    selectedJobLabel: targetLabel,
    findings,
    selectedFindings: activeFindings,
    onSelectedFindingsChange: memory.updateSelectedFindings,
    jobControl:
      selectedTargetId || targetJobs.length > 0 ? (
        <TargetRoleSelect
          jobs={targetJobs}
          value={selectedTargetId}
          onChange={handleTargetChange}
          fallbackLabel={targetLabel}
          disabled={improving}
        />
      ) : undefined,
    description: isResume
      ? "Tap one or more improvements to apply them together — your picks are remembered for this résumé. The improved résumé renders in your chosen template; nothing is saved until you accept."
      : "Tap one or more improvements to apply them together — your picks are remembered for this cover letter. The improved letter renders in your chosen template; nothing is saved until you accept.",
  };

  /** The compact template picker for the quick preview — switches the result's layout. */
  const themeOptions = (isResume ? RESUME_THEMES : COVER_LETTER_THEMES).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    paper: t.paper,
  }));
  const styleControl = (
    <CompactTemplatePicker
      options={themeOptions}
      value={themeChoice.themeId}
      onChange={selectTheme}
      accentValue={accent.value}
      disabled={applying}
    />
  );

  /** Props for the shared `AddPointsPanel` — the "Notes & instructions" directive box. */
  const incorporateProps = {
    notes: incNotes,
    onNotesChange: updateIncNotes,
    submitting: incorporating || applying || improving || aiEdit.running,
    error: incorporateError || error,
    onApplyDirect: applyNotesInstruction,
    // Inline "no change" status under the box (the instruction is kept).
    notesNotice,
    // A dedicated full-document rewrite that keeps the OLD preview-and-accept flow.
    onImproveEverything: () => runImprove([], IMPROVE_EVERYTHING_INSTRUCTION, []),
    improvingEverything: improving,
    kindLabel: isResume ? "résumé" : "cover letter",
    historyEntries: incorporateHistory,
    onRerunHistory: rerunIncorporate,
    onRerunOneHistory: (entry: IncorporateEntry) => rerunIncorporate([entry]),
    onViewImpactHistory: openImpact,
    onRemoveHistory: removeIncorporate,
    onClearHistory: clearIncorporateHistory,
    rerunRoleLabel: targetLabel,
    onWorkHighlights: isResume ? openEvidence : undefined,
    memoryKey: `${kind}_${docId}`,
    recentInstructions: recentInstructions.recent,
    onRunRecentInstruction: runRecentInstruction,
    onClearRecentInstructions: clearRecentInstructions,
  };

  /**
   * Overlays the host renders once: the "My Work Highlights" wizard and the
   * impact review that paints a past submission onto the rendered paper.
   */
  const overlays = (
    <>
      {impact && structured && (
        <ReadablePreviewModal
          title="Where this input landed"
          subtitle={impact.label}
          onClose={() => setImpact(null)}
          revision={renderPaper(structured, [])}
          revisionHighlightTerms={impact.terms}
          defaultHighlight
          revisionLabel="Your document"
          revisionWidth={PAPER_WIDTH}
          memoryKey={`impact_${kind}_${docId}`}
        />
      )}
    </>
  );

  /** The "Landed in: …" confirmation node hosts render after an accepted change. */
  const landedNotice = landed ? (
    <LandedInNotice key={landed.id} sections={landed.sections} onDismiss={dismissLanded} />
  ) : null;

  return {
    loading,
    loadError,
    structured,
    improvement,
    improvementFlags,
    /** How many AI-returned lines were stripped as guidance echoes for this preview. */
    ignoredEchoCount,
    changes,
    renderPaper,
    resolve,
    toMarkdown,
    compare,
    setCompare,
    applying,
    accept,
    discard,
    /** Launch a structured improve directly (used by the editor's AI-guidance box). */
    runImprove,
    /**
     * Apply a typed self-entry instruction directly (no preview): saves a new
     * version + shows a confirmation toast, or a "no changes" / error toast.
     */
    applyInstruction,
    /** Whether an improve is in flight — drives the editor panel's spinner lock. */
    improving,
    /** Retryable improve error message (empty when fine). */
    error,
    pendingPrompts,
    pendingInstruction,
    metricKey,
    panelProps,
    incorporateProps,
    styleControl,
    themeId: themeChoice.themeId,
    overlays,
    /** The "Landed in: …" confirmation to render after an accepted AI change. */
    landedNotice,
    /** Open the "My Work Highlights" wizard (résumé only). */
    openEvidence,
    /**
     * Weave facts imported from the user's work tools straight into the document
     * (used when the wizard was finished outside the editor and handed off).
     */
    runEvidence,
  };
}