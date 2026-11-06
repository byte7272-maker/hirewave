import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@/components/base/ToastProvider";
import { ApiError, buildApiDiagnostics, classifyApiError, isAuthError, refreshSessionNow, type ApiErrorKind } from "@/lib/api";
import { dropRecentlyViewedEntry, recordRecentlyViewed } from "@/lib/recentlyViewed";
import { rememberRecentDocument } from "@/lib/recentDocument";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import {
  activateResumeVersion,
  createResumeVersion,
  downloadResume,
  getResume,
  getResumeFileUrl,
  getResumeReuse,
  getResumeReviewNarrative,
  getResumeReviewScore,
  replaceResumeText,
  resolveResumeTitle,
  resolveUpdatedAt,
  reviseResume,
  tailorErrorMessage,
  tailorResume,
  updateResume,
  type DocumentVersion,
  type Resume,
  type ReuseResult,
  type ReviewResult,
  type TailorResult,
} from "@/lib/documents";
import ScoreMeter from "@/pages/dashboard/documents/components/ScoreMeter";
import WidgetBoundary from "@/components/feature/WidgetBoundary";
import NarrationText from "@/components/feature/NarrationText";
import ReadAloudControl from "@/components/feature/ReadAloudControl";
import ReviewPanel from "@/pages/dashboard/documents/components/ReviewPanel";
import AddPointsPanel from "@/pages/dashboard/documents/components/AddPointsPanel";
import TailorPanel from "@/pages/dashboard/documents/components/TailorPanel";
import VersionSwitcher from "@/pages/dashboard/documents/components/VersionSwitcher";
import VersionsStrip from "@/pages/dashboard/documents/components/VersionsStrip";
import { asText, versionTitle } from "@/pages/dashboard/documents/components/versionMeta";
import VersionDocumentViewer from "@/pages/dashboard/documents/components/VersionDocumentViewer";
import DocumentMarqueeButton from "@/pages/dashboard/documents/components/DocumentMarqueeButton";
import DocumentMarqueeDialog from "@/pages/dashboard/documents/components/DocumentMarqueeDialog";
import ReuseBanner from "@/pages/dashboard/documents/components/ReuseBanner";
import VersionMetaChips from "@/pages/dashboard/documents/components/VersionMetaChips";
import AddressedFindings from "@/pages/dashboard/documents/components/AddressedFindings";
import HtmlDocumentViewer from "@/pages/dashboard/documents/components/HtmlDocumentViewer";
import ReadableDocumentModal from "@/pages/dashboard/documents/components/ReadableDocumentModal";
import DocumentLoadError from "@/pages/dashboard/documents/components/DocumentLoadError";
import ShortcutsCheatSheet from "@/pages/dashboard/documents/components/ShortcutsCheatSheet";
import SaveShortcutTip from "@/pages/dashboard/documents/components/SaveShortcutTip";
import DocumentModeHeader from "@/pages/dashboard/documents/components/DocumentModeHeader";
import DocumentEditToolbar from "@/pages/dashboard/documents/components/DocumentEditToolbar";
import SaveFeedback from "@/pages/dashboard/documents/components/SaveFeedback";
import SectionNavigator from "@/pages/dashboard/documents/components/SectionNavigator";
import FindReplacePanel from "@/pages/dashboard/documents/components/FindReplacePanel";
import HighlightedTextarea from "@/pages/dashboard/documents/components/HighlightedTextarea";
import LiteralReplaceHint from "@/pages/dashboard/documents/components/LiteralReplaceHint";
import { writeSkillsLayout, readSkillsLayout, type SkillsLayout } from "@/lib/skillsLayoutMemory";
import { countMatches, matchSentenceContext } from "@/lib/findReplace";
import ConfirmDialog from "@/components/base/ConfirmDialog";
import useEditHistory from "@/hooks/useEditHistory";
import useDebouncedValue from "@/hooks/useDebouncedValue";
import useUnsavedGuard from "@/hooks/useUnsavedGuard";
import { useImproveMemory } from "@/hooks/useImproveMemory";
import useFindReplace from "@/hooks/useFindReplace";
import useFindReplaceShortcut from "@/hooks/useFindReplaceShortcut";
import useDocumentSaveShortcut from "@/hooks/useDocumentSaveShortcut";
import useDesignShortcut from "@/hooks/useDesignShortcut";
import useUndoVersionShortcut from "@/hooks/useUndoVersionShortcut";
import useWorkHighlightsShortcut from "@/hooks/useWorkHighlightsShortcut";
import { clearDocDraft, readDocDraft, writeDocDraft } from "@/lib/docDraft";
import {
  DOC_SECTION_OPTIONS,
  deleteSectionAt,
  detectSections,
  insertSectionAt,
  moveSection,
} from "@/lib/docSections";
import { isImprovedVersion, markImprovedVersion } from "@/lib/versionImproveMemory";
import DocumentPaneControls from "@/pages/dashboard/documents/components/DocumentPaneControls";
import DocumentBulletInserter from "@/pages/dashboard/documents/components/DocumentBulletInserter";
import PaneResizer from "@/pages/dashboard/documents/components/PaneResizer";
import { useDocumentPreviewLayout } from "@/hooks/useDocumentPreviewLayout";
import ImprovePreview from "@/pages/dashboard/documents/components/ImprovePreview";
import { openRevisionReview, revisionReviewKey } from "@/lib/revisionReview";
import { takeEvidenceIdeas } from "@/lib/evidenceHandoff";
import KeywordCoverageSummary from "@/pages/dashboard/documents/components/KeywordCoverageSummary";
import ResumeTemplatesPanel from "@/pages/dashboard/documents/templates/ResumeTemplatesPanel";
import ResumeDesignModal from "@/pages/dashboard/documents/templates/design/ResumeDesignModal";
import StructuredImprovePreview from "@/pages/dashboard/documents/templates/StructuredImprovePreview";
import useStructuredImprove, {
  type ImproveDoc,
} from "@/pages/dashboard/documents/templates/useStructuredImprove";
import {
  collectResumeBulletGroups,
  countResumeBullets,
  strengthenWholeResumeInstruction,
} from "@/pages/dashboard/documents/templates/bulletActions";
import { resumeToMarkdown } from "@/pages/dashboard/documents/templates/resumeFields";
import { stripTextInstructionEcho } from "@/pages/dashboard/documents/templates/instructionEcho";
import { describeAction, findChangedSection } from "@/pages/dashboard/documents/templates/changeActionMessage";
import {
  readBulletStrengthenMap,
  type VersionBulletStrengthenMap,
} from "@/lib/bulletStrengthenMemory";
import {
  readAppliedInstructionMap,
  type VersionAppliedInstructionMap,
} from "@/lib/versionAppliedInstruction";
import { readAiEditTrace, type AiEditTrace } from "@/lib/aiEditTrace";
import type { JsonResume } from "@/lib/jsonResume";
import {
  clearDocumentMetricMemory,
  clearVersionMetricMemory,
  readVersionMetricMap,
  type VersionMetricMap,
} from "@/pages/dashboard/documents/templates/metricMemory";
import {
  readVersionFindingsMap,
  saveVersionFindings,
  type VersionFindingsMap,
} from "@/lib/versionFindings";
import {
  readRephraseDiffs,
  saveRephraseDiff,
  type RephraseDiffMap,
} from "@/lib/rephraseDiffs";
import type { InlineEditMeta } from "@/hooks/useInlineDocEdit";
import { RESUME_PRESETS } from "@/lib/resumePresets";
import { readPaneCollapsed, writePaneCollapsed } from "@/lib/paneCollapseMemory";
import {
  computeCoverage,
  getVersionCoverage,
  readVersionCoverageMap,
  saveVersionCoverage,
  saveVersionNote,
  type VersionCoverageMap,
} from "@/lib/versionCoverage";

import {
  NOTES_MARKER,
  PREVIEW_COMPARE_STORAGE_KEY,
  REVIEW_JOB_STORAGE_PREFIX,
  TAILOR_JOB_STORAGE_PREFIX,
  combineText,
  detectFormat,
  formatDate,
  jobOptions,
  splitNotes,
} from "./support";
import ResumedFromDashboardBanner from "./ResumedFromDashboardBanner";
import DraftRestoredNotice from "./DraftRestoredNotice";
import SparseResumeHighlightsCta from "./SparseResumeHighlightsCta";

export default function ResumeDetail() {
  const { id } = useParams<{ id: string }>();
  const resumeId = id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const queryTailorJob = searchParams.get("tailorJob") ?? "";
  const queryTailorTitle = searchParams.get("tailorTitle") ?? "";
  const queryTailorCompany = searchParams.get("tailorCompany") ?? "";
  /** A version the "Jump back in" shortcut asked us to open on (see the effect below). */
  const queryVersion = searchParams.get("version") ?? "";
  const { showToast } = useToast();
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  /** Mirrors the active version so the "Undo switch" toast reads the live value. */
  const activeVersionRef = useRef<string | number>("");
  /**
   * The version we last switched AWAY from, set in lockstep with the "Undo
   * switch" toast, so Cmd/Ctrl+Z can undo the same switch from the keyboard.
   */
  const lastSwitchFromRef = useRef<string | number>("");

  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadErrorKind, setLoadErrorKind] = useState<ApiErrorKind | "">("");
  /** Plain-text diagnostics (path + status/timeout) for the load-error state. */
  const [loadDiagnostics, setLoadDiagnostics] = useState("");

  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNarrativeLoading, setReviewNarrativeLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [jobId, setJobId] = useState("");

  const [tailorJobs, setTailorJobs] = useState<TailorableJob[]>([]);
  const [tailorJobId, setTailorJobId] = useState("");
  const [tailorResult, setTailorResult] = useState<TailorResult | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState("");

  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | number>("");
  activeVersionRef.current = activeVersion;
  /**
   * The version the main viewer is PREVIEWING from the strip — clicking a card
   * shows it large above, without making it current. Cleared whenever the active
   * version changes so the viewer follows activation again.
   */
  const [viewerVersion, setViewerVersion] = useState<string | number | null>(null);
  const [activatingVersion, setActivatingVersion] = useState<string | number | null>(null);
  const [versionNote, setVersionNote] = useState<string | null>(null);
  const [versionError, setVersionError] = useState("");
  const [reuse, setReuse] = useState<ReuseResult | null>(null);
  const [pendingInstructions, setPendingInstructions] = useState<string[]>([]);
  const [pendingInstruction, setPendingInstruction] = useState("");
  const [pendingJobId, setPendingJobId] = useState<string | number | undefined>(undefined);
  /** Review findings sent as focus_points on the improve that produced the current preview. */
  const [pendingFindings, setPendingFindings] = useState<string[]>([]);

  // Remembered Improve picks (chips + custom instruction + ticked findings).
  // Backed by the shared memory, which syncs to the account so the picks follow
  // the user across devices instead of staying in this browser.
  const improveMemory = useImproveMemory(resumeId, RESUME_PRESETS);

  // Set true when the AI-guidance box launches an improve, so the guidance text
  // + consumed chips can be cleared once it's applied (but NOT when the
  // "Add your own points" flow saves).
  const guidanceRunRef = useRef(false);

  // The AI-guidance box and the "Add your own points" flow share the structured
  // improve pipeline — the same /improve-structured call, preview UI and
  // accept/…/versions save path. Accepting reloads this page's document.
  const structuredImprove = useStructuredImprove({
    kind: "resume",
    docId: resumeId,
    // Always improve the text exactly as it reads on screen — including bullet
    // points typed but not yet saved — instead of the last saved résumé.
    getContent: () => combineText(text, notes),
    // Direct self-entry applies save a new version; capture the current one so the
    // confirmation toast can offer a one-click Undo.
    getActiveVersion: () => activeVersion,
    activateVersion: (version) => handleSelectVersion(version),
    // Cheapest-correct-path routing: a literal swap runs through Find & replace,
    // a Skills layout ask re-renders locally — neither reaches the AI.
    onRouteLiteralReplace: (find, replaceWith) =>
      handleRouteLiteralReplace(find, replaceWith),
    onRouteSkillsLayout: (layout) => handleRouteSkillsLayout(layout),
    // One-tap fallback from the "no change made" notice straight into Find & replace.
    onOpenFindReplace: () => openFindReplace(),
    onAccepted: (updated) => {
      if (guidanceRunRef.current) {
        guidanceRunRef.current = false;
        improveMemory.clearPrompts();
        improveMemory.updateInstruction("");
      }
      // Pick up any bulk-strengthen tally stamped by an accepted whole-résumé pass.
      setBulletStrengthenByVersion(readBulletStrengthenMap("resume", resumeId));
      // Pick up the instruction tag stamped by a direct self-entry apply.
      setAppliedInstructionByVersion(readAppliedInstructionMap("resume", resumeId));
      // Treat the returned document as the new source of truth: re-render the
      // editor from it immediately, instead of re-reading and risking a stale
      // draft being restored over the fresh content.
      const saved = updated as Resume;
      applyServerDoc(saved);
      void handleReview(undefined, splitNotes(saved.rendered_text ?? "").body);
    },
  });

  // Deterministic Find & Replace — the reliable path for an exact "replace X with
  // Y" edit. It calls the dedicated endpoint and re-renders from its result.
  const findReplace = useFindReplace({
    replaceFn: (input) => replaceResumeText(resumeId, input),
    getText: () => combineText(text, notes),
    onApply: handleFindReplaceApply,
    memoryKey: `resume_${resumeId}`,
    kindLabel: "résumé",
  });

  const [preview, setPreview] = useState<string | null>(null);
  /** How many tailoring-guidance lines the echo guard stripped from the preview. */
  const [ignoredEchoCount, setIgnoredEchoCount] = useState(0);
  const [comparePreview, setComparePreview] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_COMPARE_STORAGE_KEY) === "split";
    } catch {
      return false;
    }
  });
  const [revising, setRevising] = useState(false);
  const [applying, setApplying] = useState(false);
  const [improveError, setImproveError] = useState("");

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  /** Which document surface opens — driven by summarized_at (see load()). */
  const [docView, setDocView] = useState<"preview" | "original">("preview");
  /** Cached factual summary from GET /resumes/{id}, shown before any re-review. */
  const [cachedSummary, setCachedSummary] = useState("");
  /** The saved résumé text the current AI review reflects — edits mark it stale. */
  const [reviewedText, setReviewedText] = useState("");
  /** When the last AI review completed — versions saved after it are marked stale. */
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  /** Whether the full-screen readable view is open. */
  const [readableOpen, setReadableOpen] = useState(false);
  /** Whether the version marquee (opened from the header / zoom-bar badge) is open. */
  const [versionMarqueeOpen, setVersionMarqueeOpen] = useState(false);
  /** Whether the in-context Design chooser (template preview + apply) is open. */
  const [designOpen, setDesignOpen] = useState(false);
  /** Bumped after an inline document change (e.g. add/undo bullet) to re-fetch the render. */
  const [docRefresh, setDocRefresh] = useState(0);
  /** Whether the pinned document pane is collapsed (controls take full width). */
  const [paneCollapsed, setPaneCollapsed] = useState(() =>
    readPaneCollapsed(`resume_${resumeId}`)
  );

  const {
    containerRef: paneContainerRef,
    mode: paneMode,
    previewWidth,
    applyPreset: applyPanePreset,
    onResize: handlePaneResize,
  } = useDocumentPreviewLayout(`resume_${resumeId}`);
  /** Top-level mode: the editable document view, or the template presentation layer. */
  const [view, setView] = useState<"document" | "templates">("document");
  // Before/after coverage of the job's gaps, shown after a tailored version is saved.
  const [coverage, setCoverage] = useState<{
    gaps: string[];
    jobLabel: string | null;
  } | null>(null);
  // Per-version coverage memory so a version re-shows its own badge when revisited.
  // Per-version AI-figure tally, so the switcher can flag versions with unchecked figures.
  const [versionMetrics, setVersionMetrics] = useState<VersionMetricMap>();
  const [versionCoverage, setVersionCoverage] = useState<VersionCoverageMap>({});
  /** Per-version review findings addressed, so an accepted version stays traceable. */
  const [versionFindings, setVersionFindings] = useState<VersionFindingsMap>({});
  /** Per-version accepted inline-rephrase diffs, shown in the version history. */
  const [rephraseDiffs, setRephraseDiffs] = useState<RephraseDiffMap>();
  /** Per-version "N bullets strengthened" tally, so bulk AI passes stay traceable. */
  const [bulletStrengthenByVersion, setBulletStrengthenByVersion] =
    useState<VersionBulletStrengthenMap>();
  /** Per-version instruction applied directly (skipping the review preview). */
  const [appliedInstructionByVersion, setAppliedInstructionByVersion] =
    useState<VersionAppliedInstructionMap>();
  /** Trace of the last immediate AI edit — shown inline next to the version badge. */
  const [aiEditTrace, setAiEditTrace] = useState<AiEditTrace | null>(null);

  /** Edit vs. read-only Preview — the mode the document opens in. */
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  /** The last saved/loaded text + notes, so unsaved changes can be detected. */
  const [baseline, setBaseline] = useState("");
  const [baselineNotes, setBaselineNotes] = useState("");
  /** Guards the draft autosave until the document has loaded once. */
  const [hydrated, setHydrated] = useState(false);
  /** True when a locally autosaved draft was restored on load. */
  const [draftRestored, setDraftRestored] = useState(false);
  /** True when the wizard was resumed via the dashboard "Resume where you left off" shortcut. */
  const [resumedFromDashboard, setResumedFromDashboard] = useState(false);
  /** One-time hand-off helper shown right after an Improve is accepted. */
  const [improvedHelper, setImprovedHelper] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const navigate = useNavigate();

  const dirty = text !== baseline || notes !== baselineNotes;
  const history = useEditHistory(text, setText, baseline);
  const { pendingHref, cancelLeave } = useUnsavedGuard(
    dirty,
    "You have unsaved edits to this résumé."
  );

  // Document-wide scans (section detection, Find-match counting, match context)
  // are DEBOUNCED and MEMOIZED, so a fast typist never re-scans the whole résumé
  // on every keystroke — the thing that pegged the main thread. The textarea keeps
  // the live value, so the caret never lags; only these derived reads are throttled.
  const debouncedText = useDebouncedValue(text, 180);
  const sections = useMemo(() => detectSections(debouncedText), [debouncedText]);
  const findMatchCount = useMemo(
    () =>
      findReplace.open && findReplace.find.trim().length > 0
        ? countMatches(debouncedText, findReplace.find, findReplace.matchCase)
        : 0,
    [findReplace.open, findReplace.find, findReplace.matchCase, debouncedText]
  );
  const findMatchContext = useMemo(
    () =>
      findReplace.open && findReplace.find.trim().length > 0
        ? matchSentenceContext(
            debouncedText,
            findReplace.find,
            findReplace.matchCase,
            findReplace.activeMatch
          )
        : null,
    [
      findReplace.open,
      findReplace.find,
      findReplace.matchCase,
      findReplace.activeMatch,
      debouncedText,
    ]
  );

  const format = resume ? detectFormat(resume) : "";
  const isPdf = format === "pdf";
  const hasFile = Boolean(resume?.file_url);

  async function load() {
    setLoading(true);
    setLoadError("");
    setLoadErrorKind("");
    setLoadDiagnostics("");
    setVersionNote(null);
    try {
      const res = await getResume(resumeId);
      setResume(res);
      setVersions((res.versions ?? []).filter(Boolean));
      setActiveVersion(res.active_version ?? "");
      const { body, notes: n } = splitNotes(res.rendered_text ?? "");
      // Restore a locally autosaved draft so an interrupted edit isn't lost.
      const draft = readDocDraft("resume", resumeId);
      if (draft && draft.text.trim() && draft.text !== body) {
        setText(draft.text);
        setDraftRestored(true);
      } else {
        setText(body);
        setDraftRestored(false);
      }
      setNotes(n);
      setBaseline(body);
      setBaselineNotes(n);
      setVersionCoverage(readVersionCoverageMap("resume", resumeId));
      setVersionMetrics(readVersionMetricMap("resume", resumeId));
      setVersionFindings(readVersionFindingsMap("resume", resumeId));
      setRephraseDiffs(readRephraseDiffs("resume", resumeId));
      setBulletStrengthenByVersion(readBulletStrengthenMap("resume", resumeId));
      setAppliedInstructionByVersion(readAppliedInstructionMap("resume", resumeId));
      setAiEditTrace(readAiEditTrace("resume", resumeId));
      const storedCoverage = getVersionCoverage("resume", resumeId, res.active_version ?? "");
      if (storedCoverage?.gaps?.length) {
        setCoverage({ gaps: storedCoverage.gaps, jobLabel: storedCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      const storedReviewJob = localStorage.getItem(REVIEW_JOB_STORAGE_PREFIX + resumeId) ?? "";
      if (storedReviewJob) setJobId(storedReviewJob);
      // Preview-first once summarized; otherwise open the uploaded document view.
      setCachedSummary(res.content_summary ?? "");
      const fileAvailable = Boolean(res.file_url);
      setDocView(fileAvailable && !res.summarized_at ? "original" : "preview");
      void recordRecentlyViewed({
        kind: "resume",
        ref_id: resumeId,
        title: resolveResumeTitle(res),
        subtitle: [res.target_role, res.quality_grade ? `Grade ${res.quality_grade}` : ""]
          .filter(Boolean)
          .join(" · "),
        view: "resumes",
      });
      if (body.trim()) {
        handleReview(storedReviewJob || undefined, body);
      }
    } catch (err) {
      const kind = classifyApiError(err);
      // A résumé that's gone shouldn't linger as a dead card in the rail.
      if (kind === "not-found") {
        dropRecentlyViewedEntry("resume", resumeId);
      }
      setLoadErrorKind(kind);
      setLoadError(err instanceof ApiError ? err.message : "Could not load this résumé.");
      setLoadDiagnostics(
        buildApiDiagnostics(err, {
          label: `résumé ${resumeId}`,
          path: `GET /api/v1/resumes/${resumeId}`,
        })
      );
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }

  /**
   * One-tap session recovery for the "session expired" state: force a token
   * refresh, then reload this résumé. A definitive rejection tears the session
   * down and redirects to sign-in; an unreachable server returns a message to
   * show in place without losing the page.
   */
  async function handleRefreshSession(): Promise<string | null> {
    const result = await refreshSessionNow();
    if (result === "refreshed") {
      await load();
      return null;
    }
    if (result === "unreachable") {
      return "Couldn't reach the server to refresh your session. Check your connection and try again.";
    }
    return "Your session has ended — taking you to sign in…";
  }

  /**
   * Render the server's returned document into the editor — the single source of
   * truth after any mutation (save, version save, improve/incorporate accept, or
   * find & replace). It also drops the local autosave draft, so a stale copy can
   * never shadow the freshly saved content.
   */
  function applyServerDoc(res: Resume) {
    setResume(res);
    setVersions((res.versions ?? []).filter(Boolean));
    setActiveVersion(res.active_version ?? "");
    const { body, notes: n } = splitNotes(res.rendered_text ?? "");
    setText(body);
    setNotes(n);
    setBaseline(body);
    setBaselineNotes(n);
    clearDocDraft("resume", resumeId);
    setDraftRestored(false);
    // Pick up the inline AI-edit trace ("N edit → vN") for the fresh version.
    setAiEditTrace(readAiEditTrace("resume", resumeId));
    // Force the rendered preview to re-read even when the version is unchanged
    // (e.g. a find & replace saved in place).
    setDocRefresh((count) => count + 1);
  }

  /**
   * Apply a Find & Replace result: render the returned text immediately, then
   * persist it through the existing version flow and re-render from what was
   * saved. Rolls the optimistic render back if the save fails, so the editor
   * always matches the last saved content.
   */
  async function handleFindReplaceApply(renderedText: string): Promise<void> {
    const prevText = text;
    const prevNotes = notes;
    const { body, notes: n } = splitNotes(renderedText);
    setText(body);
    setNotes(n);
    try {
      const updated = await createResumeVersion(resumeId, { text: renderedText });
      applyServerDoc(updated);
      void handleReview(undefined, splitNotes(updated.rendered_text ?? renderedText).body);
    } catch (err) {
      setText(prevText);
      setNotes(prevNotes);
      throw err;
    }
  }

  /** Route a literal "replace X with Y" instruction into Find & Replace. */
  function handleUseFindReplace(find: string, replaceWith: string) {
    setMode("edit");
    if (paneCollapsed) setPaneCollapsed(false);
    findReplace.openWith(find, replaceWith);
    window.setTimeout(() => {
      const el = document.getElementById(
        `find-replace-input-${resumeId}`
      ) as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 160);
  }

  /**
   * Open the Find & replace tool from a one-tap fallback (the "no change made"
   * notice), keeping whatever the user already searched for.
   */
  function openFindReplace() {
    setMode("edit");
    if (paneCollapsed) setPaneCollapsed(false);
    findReplace.setOpen(true);
    window.setTimeout(() => {
      const el = document.getElementById(
        `find-replace-input-${resumeId}`
      ) as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 160);
  }

  /**
   * Route a detected literal replacement straight into Find & Replace and run it
   * immediately — instant and exact, with the match count shown for confirmation
   * (or the clear "No matches" message). The AI is never called for a verbatim swap.
   */
  function handleRouteLiteralReplace(find: string, replaceWith: string) {
    setMode("edit");
    if (paneCollapsed) setPaneCollapsed(false);
    findReplace.runWith(find, replaceWith);
    window.setTimeout(() => {
      const el = document.getElementById(
        `find-replace-input-${resumeId}`
      ) as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
  }

  /**
   * Handle a Skills layout instruction locally — the Skills section is re-rendered
   * from the display toggle in the Templates view; formatting never round-trips the LLM.
   */
  function handleRouteSkillsLayout(layout: SkillsLayout) {
    writeSkillsLayout(resumeId, layout);
    setView("templates");
    showToast(
      `Skills layout set to ${layout === "bullets" ? "a bulleted list" : "a comma list"}`,
      "success"
    );
  }

  // Cmd/Ctrl+F opens Find & Replace from anywhere in the editor (overriding the
  // browser's own find) — pre-filling it with any text selected in the editor.
  useFindReplaceShortcut(() => {
    const el = textareaRef.current;
    const selected =
      el && el.selectionStart !== el.selectionEnd
        ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim()
        : "";
    setMode("edit");
    if (paneCollapsed) setPaneCollapsed(false);
    findReplace.setOpen(true);
    if (selected) findReplace.setFind(selected);
    window.setTimeout(() => {
      const input = document.getElementById(
        `find-replace-input-${resumeId}`
      ) as HTMLInputElement | null;
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
      input?.select();
    }, 180);
  });

  // Cmd/Ctrl+S saves the résumé in place; Shift + Cmd/Ctrl+S saves it as a new
  // tracked version — the same two actions as the editor toolbar buttons.
  useDocumentSaveShortcut(
    () => {
      if (dirty && !saving && !savingVersion) void handleSaveText();
    },
    () => {
      if (dirty && !saving && !savingVersion) void handleSaveAsVersion();
    }
  );

  // Alt+D opens the in-context Design chooser from anywhere in the editor.
  useDesignShortcut(() => setDesignOpen(true));

  // Cmd/Ctrl+Z undoes the last version switch — the same action the "Undo
  // switch" toast offers, from the keyboard. It stands down while the caret is
  // in a text field, so ordinary text undo still works there.
  useUndoVersionShortcut(
    () =>
      lastSwitchFromRef.current !== "" &&
      String(lastSwitchFromRef.current) !== String(activeVersionRef.current),
    () => {
      const previous = lastSwitchFromRef.current;
      if (previous === "") return;
      void handleSelectVersion(previous);
    }
  );

  // Alt+H opens "My Work Highlights" from anywhere in the editor — the same
  // action as the header button, so the feature's home is one keystroke away.
  useWorkHighlightsShortcut(() => structuredImprove.openEvidence());

  useEffect(() => {
    load();
    loadTailorJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  // The main viewer follows the marquee: a card click previews that version above,
  // but an explicit activation (or switching documents) takes it back over.
  useEffect(() => {
    setViewerVersion(null);
  }, [activeVersion, resumeId]);

  /**
   * Reopen on the version that was being PREVIEWED when the link was made. The
   * viewer's pick is remembered under `?preview=` — deliberately SEPARATE from
   * `?version=`, which the dashboard uses to ACTIVATE a version — so a shared or
   * reloaded link reopens the preview without changing which version is current.
   * Seeded once, after the document loads.
   */
  const previewSeeded = useRef(false);
  useEffect(() => {
    if (previewSeeded.current) return;
    if (loading || versions.length === 0) return;
    previewSeeded.current = true;
    const picked = searchParams.get("preview");
    if (picked && versions.some((v) => String(v.version) === picked)) {
      setViewerVersion(picked);
    }
  }, [loading, versions, searchParams]);

  // Keep the previewed version in the URL so a reload / shared link reopens on
  // it. Uses `preview` (never `version`, which activates) and `replace` so
  // previewing doesn't spam the back button.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const current = prev.get("preview") ?? "";
        const want =
          viewerVersion === null || viewerVersion === undefined
            ? ""
            : String(viewerVersion);
        if (current === want) return prev;
        const next = new URLSearchParams(prev);
        if (want) next.set("preview", want);
        else next.delete("preview");
        return next;
      },
      { replace: true }
    );
  }, [viewerVersion, setSearchParams]);

  // Remember this résumé as the "Jump back in" target, at the version on screen,
  // so the Documents page shortcut can drop the user straight back to it.
  useEffect(() => {
    if (!resume) return;
    rememberRecentDocument({
      kind: "resume",
      id: resumeId,
      title: resolveResumeTitle(resume),
      version: activeVersion,
    });
  }, [resume, resumeId, activeVersion]);

  // Open on a specific version when the "Jump back in" shortcut asks for it
  // (the version the user was on before a batch of edits), or when the documents
  // rail links here with `?version=`. This is a ONE-SHOT intent: it is honoured
  // the first time, then consumed and cleared from the URL. It must NEVER be
  // re-applied just because the active version later diverges from the URL —
  // that re-fire was the bug where picking v14 in the marquee snapped straight
  // back to the URL's v13 (the effect saw activeVersion 14 !== queryVersion 13
  // and re-activated 13).
  const versionIntentApplied = useRef<string>("");
  useEffect(() => {
    if (loading || !queryVersion || versions.length === 0) return;
    if (!versions.some((v) => String(v.version) === String(queryVersion))) return;
    const intentKey = `${resumeId}:${queryVersion}`;
    if (versionIntentApplied.current === intentKey) return;
    versionIntentApplied.current = intentKey;
    // Consume the intent so a later version change is never reverted by it.
    setSearchParams(
      (prev) => {
        if (!prev.has("version")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("version");
        return next;
      },
      { replace: true }
    );
    if (String(activeVersion) === String(queryVersion)) return;
    void handleSelectVersion(queryVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, queryVersion, activeVersion, versions, resumeId, setSearchParams]);

  // Autosave the in-progress (unsaved) edit locally so it survives a reload.
  useEffect(() => {
    if (!hydrated) return;
    if (text !== baseline) writeDocDraft("resume", resumeId, text);
    else clearDocDraft("resume", resumeId);
  }, [hydrated, text, baseline, resumeId]);

  // Restore the remembered collapsed/expanded state of the document pane.
  useEffect(() => {
    setPaneCollapsed(readPaneCollapsed(`resume_${resumeId}`));
  }, [resumeId]);

  // Remember the collapse choice so a reopened résumé keeps the same layout.
  useEffect(() => {
    writePaneCollapsed(`resume_${resumeId}`, paneCollapsed);
  }, [resumeId, paneCollapsed]);

  // Alt+I (and the legacy Alt+P) jump focus straight to the "AI instructions" box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "p") return;
      const el = document.getElementById(
        `add-points-${resumeId}`
      ) as HTMLTextAreaElement | null;
      if (!el) return;
      event.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [resumeId]);

  // A "Résumé tools" action can ask for a specific panel (improve / tailor /
  // review) — scroll to it once the page has painted.
  const panelTarget = searchParams.get("panel");
  useEffect(() => {
    if (loading || !panelTarget) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(panelTarget)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 160);
    return () => window.clearTimeout(t);
  }, [loading, panelTarget]);

  // "My Work Highlights" started elsewhere (the Documents list or the
  // dashboard): pick up the facts handed off after navigation and run the SAME
  // incorporate preview here. When nothing was handed off, open the wizard so the
  // button also works as a plain "start it from here" entry point.
  const accomplishmentsHandled = useRef(false);
  useEffect(() => {
    if (loading || accomplishmentsHandled.current) return;
    if (searchParams.get("accomplishments") !== "1") return;
    accomplishmentsHandled.current = true;
    if (searchParams.get("from") === "dashboard") setResumedFromDashboard(true);
    const ideas = takeEvidenceIdeas(resumeId);
    if (ideas && ideas.length) {
      structuredImprove.runEvidence(ideas);
    } else {
      structuredImprove.openEvidence();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, resumeId]);

  // A "Resumed from dashboard" confirmation is subtle and self-clearing.
  useEffect(() => {
    if (!resumedFromDashboard) return undefined;
    const timer = window.setTimeout(() => setResumedFromDashboard(false), 8000);
    return () => window.clearTimeout(timer);
  }, [resumedFromDashboard]);

  // Fetch the raw upload lazily the first time the user flips to the original view.
  useEffect(() => {
    if (docView !== "original" || originalUrl || !resume?.file_url) return;
    void handleViewOriginal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docView, resume?.file_url, originalUrl]);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  async function loadTailorJobs() {
    const jobs = await listTailorableJobs().catch(() => [] as TailorableJob[]);
    setTailorJobs(jobs);
    const stored = localStorage.getItem(TAILOR_JOB_STORAGE_PREFIX + resumeId) ?? "";
    // A job carried in via the "Tailor résumé to this job" shortcut wins over the last-used job.
    const initial = queryTailorJob || stored;
    if (initial) {
      handleSelectJob(initial);
    }
  }

  async function handleSelectJob(id: string) {
    setTailorJobId(id);
    setTailorResult(null);
    setTailorError("");
    setReuse(null);
    setCoverage(null);
    if (!id) {
      localStorage.removeItem(TAILOR_JOB_STORAGE_PREFIX + resumeId);
      return;
    }
    localStorage.setItem(TAILOR_JOB_STORAGE_PREFIX + resumeId, id);
    setTailorLoading(true);
    try {
      const reuseResult = await getResumeReuse(resumeId, id);
      if (reuseResult.reuse_recommended) {
        setReuse(reuseResult);
        return;
      }
      const result = await tailorResume(resumeId, id);
      setTailorResult(result);
    } catch (err) {
      setTailorError(tailorErrorMessage(err, "résumé"));
    } finally {
      setTailorLoading(false);
    }
  }

  async function handleReview(overrideJobId?: string, snapshot: string = baseline) {
    const jid = overrideJobId !== undefined ? overrideJobId : jobId;
    setReviewLoading(true);
    setReviewError("");
    // PHASE 1 — the deterministic score (no LLM). Shows the rating/grade the
    // instant it lands, so opening a résumé never waits on the slow narrative.
    let scoreShown = false;
    try {
      const score = await getResumeReviewScore(resumeId, jid || undefined);
      setReview(score);
      // Remember which saved text this review reflects, so later edits can flag it stale.
      setReviewedText(snapshot);
      // Stamp the review time — versions saved after it are marked "needs review".
      setReviewedAt(new Date().toISOString());
      scoreShown = true;
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : "Review failed.");
    } finally {
      setReviewLoading(false);
    }
    if (!scoreShown) return;
    // PHASE 2 — the narrative, fetched in the background. A slow or failed
    // narrative must never freeze or delay the page: the score above is already
    // on screen and this simply swaps richer text in when it arrives.
    setReviewNarrativeLoading(true);
    try {
      const full = await getResumeReviewNarrative(resumeId, jid || undefined);
      setReview(full);
    } catch {
      // Keep the deterministic score — the narrative is best-effort.
    } finally {
      setReviewNarrativeLoading(false);
    }
  }

  /** Re-run the AI review because the résumé changed since the last one. */
  function handleReassess() {
    void handleReview();
  }

  function handleJobChange(value: string) {
    setJobId(value);
    if (value) {
      localStorage.setItem(REVIEW_JOB_STORAGE_PREFIX + resumeId, value);
    } else {
      localStorage.removeItem(REVIEW_JOB_STORAGE_PREFIX + resumeId);
    }
  }

  async function handleSaveText() {
    setSaving(true);
    setSaveSuccess("");
    setSaveError("");
    try {
      const updated = await updateResume(resumeId, {
        rendered_text: combineText(text, notes),
      });
      // Re-render from the server's copy so the editor never shows a stale version.
      applyServerDoc(updated);
      setLastSavedAt(
        new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      );
      setSaveSuccess("Résumé saved.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save the résumé.");
    } finally {
      setSaving(false);
    }
  }

  /** Persist the current edit as a tracked new version (alongside the AI versions). */
  async function handleSaveAsVersion() {
    setSavingVersion(true);
    setSaveSuccess("");
    setSaveError("");
    try {
      const updated = await createResumeVersion(resumeId, {
        text: combineText(text, notes),
      });
      applyServerDoc(updated);
      setLastSavedAt(
        new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      );
      // Inline confirmation carries a one-click Reassess, no toast needed.
      setSaveSuccess("Saved as a new version.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save a new version.");
    } finally {
      setSavingVersion(false);
    }
  }

  /** Insert a new `## Heading` section at the caret and focus it. */
  function handleAddSection(heading: string, sample: string) {
    const pos = caretRef.current ?? text.length;
    const { text: next, caret } = insertSectionAt(text, pos, heading, sample);
    setText(next);
    caretRef.current = caret;
    setMode("edit");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    showToast(`Added “${heading}” section`, "success");
  }

  /** Move a section one slot up/down; the change flows through the normal save path. */
  function handleMoveSection(index: number, direction: -1 | 1) {
    setText((prev) => moveSection(prev, index, direction));
  }

  /** Delete a section; the change flows through the normal save path. */
  function handleDeleteSection(index: number) {
    setText((prev) => deleteSectionAt(prev, index));
  }

  /** Put the caret on a section so the editor scrolls to and focuses it. */
  function handleFocusSection(start: number) {
    const el = textareaRef.current;
    if (!el) return;
    setMode("edit");
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start);
    });
  }

  /** Throw away a restored local draft and return to the server copy. */
  function handleDiscardDraft() {
    clearDocDraft("resume", resumeId);
    setText(baseline);
    setNotes(baselineNotes);
    setDraftRestored(false);
  }

  /** Persist an inline edit of the rendered document as a new version. */
  async function handleInlineEdit(editedText: string, meta?: InlineEditMeta) {
    try {
      const updated = await createResumeVersion(resumeId, { text: editedText });
      const nextVersions = updated.versions ?? [];
      const nextActive = updated.active_version ?? "";
      applyServerDoc(updated);
      if (meta?.rephrase) {
        setRephraseDiffs(
          saveRephraseDiff("resume", resumeId, nextActive, meta.rephrase)
        );
      }
      const changedSection = findChangedSection(text, editedText);
      const actionMessage = describeAction(
        meta?.reason === "section-move"
          ? "Reordered"
          : meta?.reason === "section-move-undo"
            ? "Restored the order of"
            : meta?.rephrase
              ? "Rephrased"
              : "Edited",
        [changedSection],
        meta?.rephrase
          ? "Rephrase saved as a new version"
          : "Inline edit saved as a new version"
      );
      setVersionNote(
        asText(
          nextVersions.find((v) => String(v.version) === String(nextActive))?.change_summary
        ) || actionMessage
      );
      showToast(actionMessage, "success");
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Could not save the edit.",
        "error"
      );
    }
  }

  /** Run a revise/preview call. Carries the selected prompts plus optional free text. */
  async function runRevise(input: {
    instructions?: string[];
    instruction?: string;
    jobId?: string;
    focusPoints?: string[];
  }) {
    const instructions = input.instructions ?? [];
    setRevising(true);
    setImproveError("");
    setIgnoredEchoCount(0);
    const jid = input.jobId !== undefined ? input.jobId : tailorJobId;
    setPendingInstructions(instructions);
    setPendingInstruction(input.instruction ?? "");
    setPendingJobId(jid || undefined);
    setPendingFindings(input.focusPoints ?? []);
    try {
      const result = await reviseResume(resumeId, {
        instructions,
        instruction: input.instruction ?? "",
        // Improve the text exactly as it reads on screen — including bullet
        // points the user just typed but hasn't saved — instead of the last
        // saved résumé. This is a preview only; save/accept is unchanged.
        content: combineText(text, notes),
        job_posting_id: jid || undefined,
        focus_points: input.focusPoints && input.focusPoints.length ? input.focusPoints : undefined,
      });
      // The tailoring instructions are GUIDANCE, not content — drop any verbatim
      // echo line the AI returned so a directive can't leak into the résumé.
      const guidance = [input.instruction ?? "", ...instructions].filter(
        (g) => g.trim().length > 0
      );
      const guarded = stripTextInstructionEcho(
        result.preview,
        combineText(text, notes),
        guidance
      );
      setIgnoredEchoCount(guarded.strippedCount);
      setPreview(guarded.text);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setImproveError("Please add a résumé and an instruction before tailoring.");
      } else {
        setImproveError(tailorErrorMessage(err, "résumé"));
      }
    } finally {
      setRevising(false);
    }
  }

  /** Step 4: turn the chosen "what to change" items into a tailored preview. */
  async function handleTailor(instructions: string[]) {
    // The tailor preview and the structured improve share the centre pane — drop
    // any pending structured improvement so the tailor result isn't shadowed.
    structuredImprove.discard();
    await runRevise({ instructions, jobId: tailorJobId });
    previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Remember whether the preview is shown replace-in-place or split/compare. */
  function updateComparePreview(value: boolean) {
    setComparePreview(value);
    try {
      localStorage.setItem(PREVIEW_COMPARE_STORAGE_KEY, value ? "split" : "replace");
    } catch {
      // Ignore storage failures — the toggle still works for this session.
    }
  }

  function rememberCaret() {
    const el = textareaRef.current;
    if (el) caretRef.current = el.selectionStart ?? null;
  }

  /** Drop a missing "Gaps" keyword straight into the résumé text at the last caret position. */
  function insertKeyword(keyword: string) {
    const current = text;
    const pos = caretRef.current ?? current.length;
    const start = Math.max(0, Math.min(pos, current.length));
    const before = current.slice(0, start);
    const after = current.slice(start);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpace ? " " : ""}${keyword}`;
    setText(`${before}${insertion}${after}`);
    const caret = before.length + insertion.length;
    caretRef.current = caret;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    showToast(`Added \u201c${keyword}\u201d to your r\u00e9sum\u00e9`, "success");
  }

  async function handleApply(resolvedText: string) {
    if (!preview) return;
    setApplying(true);
    setImproveError("");
    try {
      const rendered = combineText(resolvedText, notes);
      const updated = await createResumeVersion(resumeId, {
        text: rendered,
        job_posting_id: pendingJobId,
        instructions: pendingInstructions.length ? pendingInstructions : undefined,
      });
      const nextVersions = updated.versions ?? [];
      const nextActive = updated.active_version ?? "";
      // Render the saved document immediately — the response is the new truth.
      applyServerDoc(updated);
      setVersionNote(
        asText(
          nextVersions.find((v) => String(v.version) === String(nextActive))?.change_summary
        ) || null
      );
      if (pendingFindings.length) {
        setVersionFindings(
          saveVersionFindings("resume", resumeId, nextActive, pendingFindings)
        );
      }
      const { body } = splitNotes(updated.rendered_text ?? rendered);
      setPreview(null);
      // Hand the user straight from AI into manual editing on the new version.
      markImprovedVersion("resume", resumeId, nextActive);
      setMode("edit");
      setImprovedHelper(true);
      // The improvement is applied — consume the chips it used so they aren't
      // offered as pre-selected again. The run stays in "Reuse last improve".
      if (pendingInstructions.some((p) => RESUME_PRESETS.includes(p))) {
        improveMemory.clearPrompts();
      }
      const gaps = tailorResult?.missing_keywords ?? [];
      const tailoredJobId = pendingJobId ?? tailorJobId ?? null;
      // Record the tailored version even when there are no gaps, so the pipeline
      // can flag this role as having a ready résumé (with its version + ATS score).
      if (gaps.length || tailoredJobId) {
        const job = tailorResult?.job;
        const jobLabel = job ? `${job.title} \u00b7 ${job.company}` : null;
        const counts = computeCoverage(gaps, body);
        setVersionCoverage(
          saveVersionCoverage("resume", resumeId, nextActive, {
            gaps,
            jobLabel,
            jobId: tailoredJobId,
            covered: counts.covered,
            total: counts.total,
            atsScore: updated.ats_score ?? resume?.ats_score ?? null,
          })
        );
        setCoverage(gaps.length ? { gaps, jobLabel } : null);
      } else {
        setCoverage(null);
      }
      await handleReview(undefined, body);
    } catch (err) {
      setImproveError(err instanceof ApiError ? err.message : "Could not apply the change.");
    } finally {
      setApplying(false);
    }
  }

  /** Pin the coverage summary as a one-line note onto the active version. */
  function handleSaveCoverageNote(note: string) {
    if (activeVersion === "" || activeVersion === null || activeVersion === undefined) return;
    setVersionCoverage(saveVersionNote("resume", resumeId, activeVersion, note));
    showToast("Note saved to this version", "success");
  }

  /** Wipe every version's figure tally + verified decisions for this résumé at once. */
  function handleResetAllMetrics() {
    clearDocumentMetricMemory("resume", resumeId);
    setVersionMetrics({});
    showToast("Cleared all figure verifications for this résumé", "success");
  }

  /** Wipe a single version's figure tally + verified decisions for this résumé. */
  function handleResetVersionMetrics(version: string | number) {
    if (version === "" || version === null || version === undefined) return;
    setVersionMetrics(clearVersionMetricMemory("resume", resumeId, version));
    showToast("Cleared this version's figure verification", "success");
  }

  /**
   * Opt-in AI polish for a bullet just added from the Document view. Runs the
   * SAME structured improve pipeline, but sends the exact résumé text the bullet
   * was written into (so the AI improves precisely what's on screen).
   */
  function handlePolishDocumentBullet(instruction: string, content: string) {
    // The polish preview and the tailor preview share the centre pane.
    setPreview(null);
    structuredImprove.runImprove([], instruction, [], content);
  }

  /**
   * Strengthen EVERY experience and project bullet across the whole résumé in a
   * single pass — one instruction covering every list, so it arrives as ONE
   * preview to review (and selectively accept) at once.
   */
  function handleStrengthenWholeResume() {
    const current = structuredImprove.structured as JsonResume | null;
    if (!current) return;
    const groups = collectResumeBulletGroups(current);
    if (countResumeBullets(groups) < 2) return;
    const instruction = strengthenWholeResumeInstruction(groups);
    improveMemory.recordLastImprove([], instruction, []);
    // Clear any tailor preview so the strengthened result takes the centre pane.
    setPreview(null);
    structuredImprove.runImprove([], instruction, [], resumeToMarkdown(current));
  }

  /**
   * Offer a one-tap "Undo switch" right after a version change, so a mistaken
   * pick is reverted without hunting for the previous card (mirrors the marquee).
   */
  function offerUndoSwitch(
    previous: string | number,
    next: string | number,
    updated: Resume
  ) {
    const prevKey =
      previous === "" || previous === null || previous === undefined
        ? ""
        : String(previous);
    if (!prevKey || prevKey === String(next)) return;
    lastSwitchFromRef.current = previous;
    const record = (updated.versions ?? []).find(
      (v) => String(v.version) === String(updated.active_version ?? next)
    );
    const label = record ? versionTitle(record) : `Version ${next}`;
    showToast(`Switched to ${label}`, "success", {
      label: "Undo switch",
      onUndo: () => void handleSelectVersion(previous),
    });
  }

  async function handleSelectVersion(version: string | number) {
    if (String(version) === String(activeVersionRef.current)) return;
    const previous = activeVersionRef.current;
    setActivatingVersion(version);
    setVersionError("");
    try {
      const updated = await activateResumeVersion(resumeId, version);
      // The returned document is the ONLY source of truth — "Current" is applied
      // from the backend's `active_version` (never optimistically), so the UI can
      // never show a version the server didn't actually accept.
      applyServerDoc(updated);
      setPreview(null);
      setTailorResult(null);
      setReuse(null);
      const chosenCoverage = getVersionCoverage(
        "resume",
        resumeId,
        updated.active_version ?? version
      );
      if (chosenCoverage?.gaps?.length) {
        setCoverage({ gaps: chosenCoverage.gaps, jobLabel: chosenCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      // One-tap Undo, so a mistaken pick is trivially reverted.
      offerUndoSwitch(previous, version, updated);
      await handleReview(undefined, splitNotes(updated.rendered_text ?? "").body);
    } catch (err) {
      // A dead session is already being torn down + redirected by the guard.
      if (isAuthError(err)) return;
      const message =
        err instanceof ApiError ? err.message : "Could not activate that version.";
      // Leave the previous "Current" untouched and surface the failure loudly, so
      // a version the backend rejected is never shown as current.
      setVersionError(message);
      showToast(message, "error");
    } finally {
      setActivatingVersion(null);
    }
  }

  /**
   * Re-render the editor from a résumé returned by the Versions strip's activate
   * or delete call, then refresh the per-version coverage + AI review. The
   * response is the single source of truth — never a cached copy.
   */
  function handleVersionsStripChange(updated: Resume) {
    applyServerDoc(updated);
    setPreview(null);
    setTailorResult(null);
    setReuse(null);
    const chosenCoverage = getVersionCoverage(
      "resume",
      resumeId,
      updated.active_version ?? ""
    );
    if (chosenCoverage?.gaps?.length) {
      setCoverage({ gaps: chosenCoverage.gaps, jobLabel: chosenCoverage.jobLabel });
    } else {
      setCoverage(null);
    }
    void handleReview(undefined, splitNotes(updated.rendered_text ?? "").body);
  }

  async function handleUseReuseVersion() {
    if (!reuse || reuse.best_version == null) return;
    const version = reuse.best_version;
    setActivatingVersion(version);
    setTailorError("");
    try {
      const updated = await activateResumeVersion(resumeId, version);
      applyServerDoc(updated);
      setReuse(null);
      const reuseCoverage = getVersionCoverage("resume", resumeId, version);
      if (reuseCoverage?.gaps?.length) {
        setCoverage({ gaps: reuseCoverage.gaps, jobLabel: reuseCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      await handleReview(undefined, splitNotes(updated.rendered_text ?? "").body);
      // Jump straight to the tailor view for the job the user picked.
      if (tailorJobId) {
        setTailorLoading(true);
        setTailorError("");
        try {
          const result = await tailorResume(resumeId, tailorJobId);
          setTailorResult(result);
        } catch (err) {
          setTailorError(tailorErrorMessage(err, "résumé"));
        } finally {
          setTailorLoading(false);
        }
      }
    } catch (err) {
      setTailorError(
        err instanceof ApiError ? err.message : "Could not activate that version."
      );
    } finally {
      setActivatingVersion(null);
    }
  }

  async function handleViewOriginal() {
    setFileLoading(true);
    setFileError("");
    try {
      const url = await getResumeFileUrl(resumeId);
      setOriginalUrl(url);
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : "Could not load the file.");
    } finally {
      setFileLoading(false);
    }
  }

  async function handleDownload() {
    setFileError("");
    try {
      await downloadResume(resumeId, resume?.original_filename);
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : "Download failed.");
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-sm text-foreground-500 flex items-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading résumé…
      </div>
    );
  }

  if (loadError) {
    return (
      <DocumentLoadError
        kind={loadErrorKind}
        entity="résumé"
        message={loadError}
        diagnostics={loadDiagnostics}
        onRetry={() => void load()}
        onRefreshSession={handleRefreshSession}
      />
    );
  }

  if (!resume) {
    // The load settled without an error but also without a document (e.g. an
    // empty 200 response). Never render nothing — show a real, retryable state.
    return (
      <DocumentLoadError
        kind="other"
        entity="résumé"
        message="The server returned an empty response for this résumé. Please try again."
        onRetry={() => void load()}
      />
    );
  }

  // AI Review findings the Improve panel can target (kept in sync with the
  // current review, so a stale tick simply drops out).
  const reviewFindings = review
    ? review.suggestions.map((s) => s.title).filter(Boolean)
    : [];
  /** How many bullets a whole-résumé strengthen pass would cover (drives the button). */
  const bulkResumeBullets = structuredImprove.structured
    ? countResumeBullets(
        collectResumeBulletGroups(structuredImprove.structured as JsonResume)
      )
    : 0;
  /** Findings this saved version was improved against (recorded at accept time). */
  const addressedFindings = versionFindings[String(activeVersion)] ?? [];
  /** True when the résumé changed since the last AI review — saved or unsaved. */
  const reviewStale = Boolean(review) && text !== reviewedText;

  const title = resolveResumeTitle(resume);
  // updated_at may be null on a valid 200 — fall back to the latest version's
  // date, then created_at; hide the line entirely when none is usable.
  const updatedLabel = formatDate(resolveUpdatedAt(resume));
  const contentSummaryText = cachedSummary || review?.content_summary || "";
  /** Word count of the current résumé body — drives the sparse / empty-state CTA. */
  const resumeWordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const resumeIsSparse = resumeWordCount < 25;
  const isGenerated = resume.source === "generated";
  const activeVersionObj = versions.find((v) => String(v.version) === String(activeVersion));
  const coverageByVersion = Object.fromEntries(
    Object.entries(versionCoverage).map(([v, e]) => [
      v,
      { covered: e.covered, total: e.total, note: e.note ?? null, jobLabel: e.jobLabel ?? null },
    ])
  );

  const tailorJobOptions = tailorJobs.map((j) => ({
    value: String(j.job_posting_id),
    label: `${j.title} · ${j.company}`,
    title: j.title,
    company: j.company,
    company_logo: j.company_logo,
    salary_display: j.salary_display,
    source_display: j.source_display,
    source_platform: j.source_platform,
    url: j.url,
  }));
  // If the shortcut opened a job that isn't in the matches/saved pool, keep it selectable.
  if (
    tailorJobId &&
    tailorJobId === queryTailorJob &&
    !tailorJobs.some((j) => String(j.job_posting_id) === tailorJobId)
  ) {
    tailorJobOptions.unshift({
      value: tailorJobId,
      label:
        [queryTailorTitle, queryTailorCompany].filter(Boolean).join(" · ") ||
        `Job ${tailorJobId}`,
      title: queryTailorTitle || "Selected job",
      company: queryTailorCompany,
    });
  }
  const selectedTailorJob = tailorJobs.find(
    (j) => String(j.job_posting_id) === tailorJobId
  );
  const selectedJobLabel = selectedTailorJob
    ? `${selectedTailorJob.title} · ${selectedTailorJob.company}`
    : queryTailorTitle
      ? [queryTailorTitle, queryTailorCompany].filter(Boolean).join(" · ")
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/dashboard/documents"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-100 border border-background-200 text-foreground-600 hover:text-foreground-950 cursor-pointer flex-shrink-0"
            aria-label="Back to documents"
          >
            <i className="ri-arrow-left-line"></i>
          </Link>
          <div className="min-w-0">
            <h1 className="font-heading text-xl md:text-2xl font-medium text-foreground-950 truncate">
              {title}
            </h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                  isGenerated ? "text-accent-900 bg-accent-100" : "text-secondary-900 bg-secondary-100"
                }`}
              >
                <i className={isGenerated ? "ri-sparkling-line" : "ri-upload-2-line"}></i>
                {isGenerated ? "AI-generated" : "Uploaded"}
              </span>
              {format && (
                <span className="inline-flex items-center text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full uppercase whitespace-nowrap">
                  {format}
                </span>
              )}
              {resume.approved && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-900 bg-primary-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <i className="ri-check-line"></i>
                  Approved
                </span>
              )}
              {updatedLabel && (
                <span className="text-xs text-foreground-500 whitespace-nowrap">
                  Updated {updatedLabel}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <DocumentMarqueeButton
            kind="resume"
            docId={resumeId}
            title={title}
            versions={versions}
            activeVersion={activeVersion}
            onChanged={handleVersionsStripChange}
            revisionKey={docRefresh}
          />
          <button
            type="button"
            onClick={() => structuredImprove.openEvidence()}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-accent-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-accent-600 transition-colors cursor-pointer whitespace-nowrap"
            title="Pull real accomplishments from your work email & chat into this résumé — one click, no need to open Improve"
          >
            <span className="w-4 h-4 flex items-center justify-center">
              <i className="ri-sparkling-2-line"></i>
            </span>
            My Work Highlights
          </button>
          <button
            onClick={() => {
              // A pending improve/incorporate revision opens in the full review view
              // (highlight + compare); otherwise the saved document opens.
              if (openRevisionReview(revisionReviewKey("resume", resumeId))) return;
              setReadableOpen(true);
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            title="Open a full-screen readable view of this résumé"
          >
            <i className="ri-expand-diagonal-line"></i>
            Preview
          </button>
          <ShortcutsCheatSheet storageKey={`resume_${resumeId}`} showWorkHighlights />
          <Link
            to={`/dashboard/documents/resumes/${resumeId}/templates`}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-layout-line"></i>
            Templates
          </Link>
          <button
            type="button"
            onClick={() => setDesignOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            title="Change this résumé's design without leaving the editor"
          >
            <i className="ri-palette-line"></i>
            Design
          </button>
          {typeof resume.ats_score === "number" && (
            <div className="w-full sm:w-48">
              <ScoreMeter score={resume.ats_score} label="ATS score" />
            </div>
          )}
        </div>
      </div>

      <SaveShortcutTip />

      {structuredImprove.landedNotice}

      {resumedFromDashboard && (
        <ResumedFromDashboardBanner onDismiss={() => setResumedFromDashboard(false)} />
      )}

      <VersionDocumentViewer
        kind="resume"
        docId={resumeId}
        title={title}
        versions={versions}
        activeVersion={activeVersion}
        selectedVersion={viewerVersion}
        onSelect={(version) => void handleSelectVersion(version)}
        selecting={activatingVersion}
        onClearPreview={() => setViewerVersion(null)}
        refreshKey={docRefresh}
      />

      <WidgetBoundary label="Version history">
        <VersionsStrip
          docId={resumeId}
          versions={versions}
          activeVersion={activeVersion}
          onChanged={handleVersionsStripChange}
          onViewVersion={setViewerVersion}
          previewVersion={viewerVersion}
          onUndoableSwitch={(previous) => {
            lastSwitchFromRef.current = previous;
          }}
          revisionKey={docRefresh}
        />
      </WidgetBoundary>

      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-background-100 border border-background-200">
        <button
          onClick={() => setView("document")}
          className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            view === "document"
              ? "bg-primary-500 text-background-50 dark:text-foreground-950"
              : "text-foreground-600 hover:text-foreground-950"
          }`}
        >
          <i className="ri-file-text-line"></i>
          Document
        </button>
        <button
          onClick={() => setView("templates")}
          className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
            view === "templates"
              ? "bg-primary-500 text-background-50 dark:text-foreground-950"
              : "text-foreground-600 hover:text-foreground-950"
          }`}
        >
          <i className="ri-layout-line"></i>
          Templates
        </button>
      </div>

      {view === "document" && (
        <DocumentModeHeader
          mode={mode}
          onModeChange={(next) => {
            setMode(next);
            if (next === "edit") setImprovedHelper(false);
          }}
          title={title}
          version={activeVersion}
          aiImproved={isImprovedVersion("resume", resumeId, activeVersion)}
          aiEditTrace={aiEditTrace}
          onOpenMarquee={() => setVersionMarqueeOpen(true)}
          showImprovedHelper={improvedHelper}
          onDismissImprovedHelper={() => setImprovedHelper(false)}
        />
      )}

      {view === "document" && resumeIsSparse && (
        <SparseResumeHighlightsCta
          wordCount={resumeWordCount}
          onOpen={() => structuredImprove.openEvidence()}
        />
      )}

      {view === "templates" ? (
        <ResumeTemplatesPanel
          resumeId={resumeId}
          title={title}
          refreshKey={String(activeVersion)}
          version={activeVersion}
          jobPostingId={tailorJobId}
          jobLabel={selectedJobLabel}
          findings={reviewFindings}
          onAccepted={(updated) => {
            const nextSavedBody =
              typeof updated.rendered_text === "string"
                ? splitNotes(updated.rendered_text).body
                : undefined;
            applyServerDoc(updated);
            setPreview(null);
            setTailorResult(null);
            setReuse(null);
            setVersionMetrics(readVersionMetricMap("resume", resumeId));
            setVersionFindings(readVersionFindingsMap("resume", resumeId));
            setBulletStrengthenByVersion(readBulletStrengthenMap("resume", resumeId));
            setAppliedInstructionByVersion(readAppliedInstructionMap("resume", resumeId));
            // Hand the user from AI straight into manual editing on the new version.
            markImprovedVersion("resume", resumeId, updated.active_version ?? "");
            setMode("edit");
            setImprovedHelper(true);
            handleReview(undefined, nextSavedBody);
          }}
        />
      ) : (
        <>
      <VersionSwitcher
        versions={versions}
        activeVersion={activeVersion}
        activating={activatingVersion}
        onActivate={handleSelectVersion}
        changeNote={versionNote}
        onDismissChangeNote={() => setVersionNote(null)}
        error={versionError}
        coverageByVersion={coverageByVersion}
        metricByVersion={versionMetrics}
        onResetMetrics={handleResetAllMetrics}
        onResetMetricsForVersion={handleResetVersionMetrics}
        roleFilterKey={`resume_${resumeId}`}
        rephraseByVersion={rephraseDiffs}
        bulletStrengthenByVersion={bulletStrengthenByVersion}
        appliedInstructionByVersion={appliedInstructionByVersion}
        lastReviewedAt={reviewedAt}
      />

      {coverage && (
        <KeywordCoverageSummary
          gaps={coverage.gaps}
          text={text}
          label="gaps"
          jobLabel={coverage.jobLabel}
          onInsert={insertKeyword}
          onSaveNote={handleSaveCoverageNote}
          onDismiss={() => setCoverage(null)}
        />
      )}

      <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
        <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-heading text-lg font-medium text-foreground-950">Summary</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {reviewStale && (
              <button
                type="button"
                onClick={handleReassess}
                disabled={reviewLoading}
                title="This résumé changed since the last review — re-run the AI review for an updated summary"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-3 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {reviewLoading ? (
                  <i className="ri-loader-4-line animate-spin"></i>
                ) : (
                  <i className="ri-refresh-line"></i>
                )}
                {reviewLoading ? "Reassessing…" : "Reassess"}
              </button>
            )}
            {review?.summary && (
              <ReadAloudControl
                id={`resume-summary-${resumeId}`}
                text={review.summary}
                label="summary"
                autoRead
              />
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
              {contentSummaryText && (
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wide text-foreground-500 mb-1.5">
                    What this résumé says
                  </span>
                  <p className="text-sm text-foreground-700 leading-[1.7] max-w-[68ch]">
                    <NarrationText
                      id={`resume-content-summary-${resumeId}`}
                      text={contentSummaryText}
                    />
                  </p>
                </div>
              )}
          {reviewStale && !reviewLoading && (
            <p className="text-xs text-accent-700 flex items-center gap-1.5 flex-wrap">
              <i className="ri-information-line"></i>
              This résumé has changed since the last review — reassess to refresh this summary.
              {dirty && (
                <span className="text-foreground-500">Save your edits to include them.</span>
              )}
            </p>
          )}
          <p className="text-sm text-foreground-700 leading-[1.7] max-w-[68ch]">
            {review?.summary ? (
              <NarrationText id={`resume-summary-${resumeId}`} text={review.summary} />
            ) : reviewLoading || reviewNarrativeLoading ? (
              <span className="inline-flex items-center gap-2 text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Generating…
              </span>
            ) : (
              "Run the AI review to get a one-paragraph assessment of this résumé."
            )}
          </p>
          <div>
            <span className="block text-xs font-medium text-foreground-600 mb-1.5">
              Your notes{" "}
              <span className="text-foreground-400 font-normal">(saved with the résumé)</span>
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Keep your own notes about this résumé here…"
              className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-foreground-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
            />
          </div>
        </div>
      </section>

      <div
        ref={paneContainerRef}
        className="flex flex-col lg:flex-row gap-6 items-start"
        style={
          previewWidth
            ? ({ "--doc-pane-w": `${previewWidth}px` } as CSSProperties)
            : undefined
        }
      >
        <div
          ref={previewRef}
          className={`w-full space-y-6 scroll-mt-24 ${
            paneCollapsed
              ? "lg:hidden"
              : `lg:min-w-0 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overscroll-auto ${
                  previewWidth
                    ? "lg:grow-0 lg:shrink-0 lg:basis-[var(--doc-pane-w)]"
                    : "lg:grow-[2] lg:shrink lg:basis-0"
                }`
          }`}
        >
          <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <h2 className="font-heading text-lg font-medium text-foreground-950">Preview</h2>
                <VersionMetaChips
                  version={activeVersionObj}
                  bulletsStrengthened={bulletStrengthenByVersion?.[String(activeVersion)] ?? 0}
                  appliedInstruction={appliedInstructionByVersion?.[String(activeVersion)] ?? ""}
                  onRerunInstruction={(instruction) =>
                    structuredImprove.applyInstruction(instruction, [], [])
                  }
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDesignOpen(true)}
                  title="Change this résumé's design — instant preview, apply to save"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-palette-line"></i>
                  Design
                </button>
                {mode === "preview" && !preview && (
                  <button
                    onClick={() => setMode("edit")}
                    title="Open the editor to change this r\u00e9sum\u00e9's text or add sections"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-1.5 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-edit-line"></i>
                    Open editor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaneCollapsed(true)}
                  title="Collapse the document pane to give the controls more room"
                  aria-label="Collapse document pane"
                  className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-md border border-background-200 bg-background-50 text-foreground-600 hover:text-foreground-950 hover:bg-background-100 transition-colors cursor-pointer"
                >
                  <span className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-sidebar-fold-line"></i>
                  </span>
                </button>
                <DocumentPaneControls mode={paneMode} onPreset={applyPanePreset} />
                {hasFile && (
                  <div className="inline-flex items-center rounded-full bg-background-100 border border-background-200 p-1">
                    <button
                      onClick={() => setDocView("preview")}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                        docView === "preview"
                          ? "bg-background-50 text-foreground-950"
                          : "text-foreground-600 hover:text-foreground-950"
                      }`}
                    >
                      <i className="ri-eye-line"></i>
                      Preview
                    </button>
                    <button
                      onClick={() => setDocView("original")}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                        docView === "original"
                          ? "bg-background-50 text-foreground-950"
                          : "text-foreground-600 hover:text-foreground-950"
                      }`}
                    >
                      <i className="ri-attachment-2"></i>
                      Original file
                    </button>
                  </div>
                )}
                {hasFile && !isPdf && (
                  <button
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-download-2-line"></i>
                    Download
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {!preview && addressedFindings.length > 0 && (
                <AddressedFindings findings={addressedFindings} />
              )}

              {fileError && (
                <div className="flex items-start gap-2.5 rounded-lg bg-accent-100 text-accent-900 px-4 py-3 text-sm">
                  <i className="ri-error-warning-line text-base mt-0.5"></i>
                  <span>{fileError}</span>
                </div>
              )}

              {structuredImprove.improvement ? (
                <>
                  <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-background-200 bg-background-50 px-3 py-2 hw-print-hide">
                    {structuredImprove.styleControl}
                    <span className="text-[11px] text-foreground-500 whitespace-nowrap hidden sm:inline">
                      Updates the preview live
                    </span>
                  </div>
                  {structuredImprove.changes.length === 0 && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
                      <i className="ri-information-line text-base mt-0.5"></i>
                      <span>
                        Guidance rewrites existing content — to add a new accomplishment, type it
                        into the résumé directly, then run Improve again so it&apos;s included.
                      </span>
                    </div>
                  )}
                  <StructuredImprovePreview<ImproveDoc>
                    renderPaper={structuredImprove.renderPaper}
                    resolve={structuredImprove.resolve}
                    toMarkdown={structuredImprove.toMarkdown}
                    beforeNode={structuredImprove.structured}
                    changes={structuredImprove.changes}
                    flags={structuredImprove.improvementFlags}
                    compare={structuredImprove.compare}
                    onCompareChange={structuredImprove.setCompare}
                    applying={structuredImprove.applying}
                    onAccept={structuredImprove.accept}
                    onDiscard={structuredImprove.discard}
                    appliedPrompts={structuredImprove.pendingPrompts}
                    appliedInstruction={structuredImprove.pendingInstruction}
                    memoryKey={structuredImprove.metricKey}
                    reviewKey={revisionReviewKey("resume", resumeId)}
                    ignoredCount={structuredImprove.ignoredEchoCount}
                  />
                </>
              ) : preview ? (
                <ImprovePreview
                  currentText={text}
                  preview={preview}
                  compare={comparePreview}
                  onCompareChange={updateComparePreview}
                  appliedPrompts={pendingInstructions}
                  appliedInstruction={pendingInstruction}
                  applying={applying}
                  onAccept={handleApply}
                  onDiscard={() => setPreview(null)}
                  memoryKey={`resume_${resumeId}`}
                  ignoredCount={ignoredEchoCount}
                />
              ) : mode === "edit" ? (
                <div className="space-y-4">
                  {draftRestored && <DraftRestoredNotice onDiscard={handleDiscardDraft} />}

                  {docView !== "original" && (
                    <HtmlDocumentViewer
                      kind="resume"
                      docId={resumeId}
                      title={title}
                      currentVersion={activeVersion}
                      refreshKey={`${activeVersion}-${docRefresh}`}
                      memoryKey={`resume_${resumeId}`}
                      resizable={false}
                      chainScroll
                      editMode
                      onOpenVersionMarquee={() => setVersionMarqueeOpen(true)}
                      find={findReplace.open ? findReplace.find : ""}
                      matchCase={findReplace.matchCase}
                      activeMatch={findReplace.activeMatch}
                      onResize={handlePaneResize}
                      onOpen={() => setReadableOpen(true)}
                      openHint="Click the page for a full readable view"
                      onSaveEditText={handleInlineEdit}
                    />
                  )}

                  <section className="rounded-2xl border border-background-200 bg-background-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-background-200 flex items-center gap-2 flex-wrap">
                      <span className="w-7 h-7 flex items-center justify-center rounded-md bg-primary-100 text-primary-700 flex-shrink-0">
                        <i className="ri-edit-2-line"></i>
                      </span>
                      <h3 className="font-heading text-sm font-medium text-foreground-950">
                        Edit text
                      </h3>
                      <span className="text-xs text-foreground-500 hidden sm:inline">
                        Add sections, reorder them, then Save
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      <DocumentEditToolbar
                        dirty={dirty}
                        saving={saving}
                        savingVersion={savingVersion}
                        savedAt={lastSavedAt}
                        canUndo={history.canUndo}
                        canRedo={history.canRedo}
                        onUndo={history.undo}
                        onRedo={history.redo}
                        onSave={handleSaveText}
                        onSaveVersion={handleSaveAsVersion}
                        onAddSection={handleAddSection}
                        onOpenDesign={() => setDesignOpen(true)}
                      />

                      <SaveFeedback
                        saveSuccess={saveSuccess}
                        saveError={saveError}
                        reassessStale={reviewStale}
                        reassessLoading={reviewLoading}
                        onReassess={handleReassess}
                      />

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
                        matchCount={findMatchCount}
                        activeMatch={findReplace.activeMatch}
                        matchContext={findMatchContext}
                        onNextMatch={() => findReplace.stepMatch(1, findMatchCount)}
                        onPrevMatch={() => findReplace.stepMatch(-1, findMatchCount)}
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

                      <SectionNavigator
                        sections={sections}
                        onFocusSection={handleFocusSection}
                        onMoveSection={handleMoveSection}
                        onDeleteSection={handleDeleteSection}
                        onAddSection={() =>
                          handleAddSection("New section", "- Add your first line here…")
                        }
                      />

                      <HighlightedTextarea
                        value={text}
                        onChange={setText}
                        find={findReplace.open ? findReplace.find : ""}
                        matchCase={findReplace.matchCase}
                        activeMatch={findReplace.activeMatch}
                        textareaRef={textareaRef}
                        onCaret={rememberCaret}
                      />
                      <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                        <i className="ri-cursor-line"></i>
                        Click any text to change it · use{" "}
                        <span className="font-medium text-foreground-700">+ Add section</span> to
                        extend the document
                      </p>
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  {docView === "original" ? (
                    fileLoading ? (
                      <div className="flex items-center justify-center gap-2 h-[520px] text-sm text-foreground-500 rounded-xl border border-background-200 bg-background-50">
                        <i className="ri-loader-4-line animate-spin"></i>
                        Loading original file…
                      </div>
                    ) : originalUrl ? (
                      <iframe
                        src={originalUrl}
                        title={`${title} original`}
                        className="w-full h-[520px] rounded-xl border border-background-200 bg-background-50"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 h-[520px] text-center rounded-xl border border-background-200 bg-background-50">
                        <i className="ri-file-warning-line text-2xl text-foreground-400"></i>
                        <p className="text-sm text-foreground-500">Original file unavailable</p>
                        <button
                          onClick={handleViewOriginal}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700 hover:text-primary-900 cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-refresh-line"></i>
                          Retry
                        </button>
                      </div>
                    )
                  ) : (
                    <HtmlDocumentViewer
                      kind="resume"
                      docId={resumeId}
                      title={title}
                      currentVersion={activeVersion}
                      refreshKey={`${activeVersion}-${docRefresh}`}
                      memoryKey={`resume_${resumeId}`}
                      resizable={false}
                      chainScroll
                      onOpenVersionMarquee={() => setVersionMarqueeOpen(true)}
                      find={findReplace.open ? findReplace.find : ""}
                      matchCase={findReplace.matchCase}
                      activeMatch={findReplace.activeMatch}
                      onResize={handlePaneResize}
                      onOpen={() => setReadableOpen(true)}
                      openHint="Click the page for a full readable view"
                      onSaveEditText={handleInlineEdit}
                    />
                  )}

                  <p className="text-xs text-foreground-500 flex items-center gap-1.5">
                    <i className="ri-eye-line"></i>
                    Read-only preview — switch to{" "}
                    <button
                      onClick={() => setMode("edit")}
                      className="font-medium text-primary-700 hover:text-primary-900 underline cursor-pointer"
                    >
                      Edit
                    </button>{" "}
                    to change the text or add sections.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>

        {!paneCollapsed && (
          <PaneResizer
            targetRef={previewRef}
            onResize={handlePaneResize}
            onReset={() => applyPanePreset("fit")}
          />
        )}

        <div
          className={`w-full space-y-6 ${
            paneCollapsed
              ? "lg:grow lg:shrink lg:basis-full"
              : `lg:min-w-[320px] ${
                  previewWidth
                    ? "lg:grow lg:shrink lg:basis-0"
                    : "lg:grow-[3] lg:shrink lg:basis-0"
                }`
          }`}
        >
          {paneCollapsed && (
            <button
              type="button"
              onClick={() => setPaneCollapsed(false)}
              title="Show the document pane again"
              className="hidden lg:inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-sidebar-unfold-line"></i>
              Show résumé
            </button>
          )}
          <div id="improve" className="scroll-mt-24">
            <AddPointsPanel
              {...structuredImprove.incorporateProps}
              error={improveError || structuredImprove.incorporateProps.error}
              notesInputId={`add-points-${resumeId}`}
              notesHint={
                <LiteralReplaceHint
                  instruction={structuredImprove.incorporateProps.notes}
                  onUse={handleUseFindReplace}
                />
              }
              quickActions={
                bulkResumeBullets > 1 ? (
                  <button
                    type="button"
                    onClick={handleStrengthenWholeResume}
                    disabled={revising || structuredImprove.improving}
                    title="Strengthen every experience and project bullet across the whole résumé in one pass — punchier verbs and clearer impact, no new facts"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-background-50 dark:text-foreground-950 bg-accent-500 hover:bg-accent-600 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                  >
                    <i
                      className={
                        structuredImprove.improving
                          ? "ri-loader-4-line animate-spin"
                          : "ri-rocket-2-line"
                      }
                    ></i>
                    Strengthen whole résumé ({bulkResumeBullets})
                  </button>
                ) : undefined
              }
              addContentSlot={
                <DocumentBulletInserter
                  resumeId={resumeId}
                  refreshKey={`${activeVersion}-${docRefresh}`}
                  embedded
                  polishing={structuredImprove.improving}
                  onChanged={(updated) => {
                    setResume(updated);
                    setDocRefresh((n) => n + 1);
                  }}
                  onPolish={handlePolishDocumentBullet}
                />
              }
            />
          </div>
          <div id="review" className="scroll-mt-24">
          <ReviewPanel
            review={review}
            loading={reviewLoading}
            narrativeLoading={reviewNarrativeLoading}
            error={reviewError}
            onReview={() => handleReview()}
            jobOptions={jobOptions}
            jobId={jobId}
            onJobChange={handleJobChange}
            hasContent={text.trim().length > 0}
            actionLabel="Review résumé"
            readAloudId={`resume-review-${resumeId}`}
            showContentSummary={false}
            stale={reviewStale}
            onReassess={handleReassess}
            onImportHighlights={structuredImprove.openEvidence}
          />
          </div>
          {reuse && (
            <ReuseBanner
              reuse={reuse}
              activating={activatingVersion !== null}
              onUse={handleUseReuseVersion}
              onDismiss={() => setReuse(null)}
            />
          )}
          <div id="tailor" className="scroll-mt-24">
          <TailorPanel
            options={tailorJobOptions}
            selectedId={tailorJobId}
            onSelect={handleSelectJob}
            loading={tailorLoading}
            error={tailorError}
            result={tailorResult}
            hasContent={text.trim().length > 0}
            revising={revising}
            onTailor={handleTailor}
            onInsertKeyword={insertKeyword}
          />
          </div>

        </div>
      </div>
        </>
      )}

      {pendingHref && (
        <ConfirmDialog
          title="Unsaved changes"
          message="You have unsaved edits to this résumé. Leave without saving?"
          confirmLabel="Leave without saving"
          onConfirm={() => {
            const href = pendingHref;
            cancelLeave();
            navigate(href);
          }}
          onCancel={cancelLeave}
        />
      )}

      {structuredImprove.overlays}

      {versionMarqueeOpen && (
        <DocumentMarqueeDialog
          kind="resume"
          docId={resumeId}
          title={title}
          versions={versions}
          activeVersion={activeVersion}
          onChanged={handleVersionsStripChange}
          revisionKey={docRefresh}
          onClose={() => setVersionMarqueeOpen(false)}
        />
      )}

      {designOpen && (
        <ResumeDesignModal
          resumeId={resumeId}
          version={activeVersion}
          title={title}
          data={(structuredImprove.structured as JsonResume | null) ?? null}
          currentTemplateId={asText(activeVersionObj?.template_id) || asText(resume.template_id)}
          skillsLayout={readSkillsLayout(resumeId)}
          onClose={() => setDesignOpen(false)}
          onApplied={(updated) => applyServerDoc(updated)}
        />
      )}

      {readableOpen && (
        <ReadableDocumentModal
          kind="resume"
          docId={resumeId}
          title={title}
          onClose={() => setReadableOpen(false)}
        />
      )}
    </div>
  );
}