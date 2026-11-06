import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useToast } from "@/components/base/ToastProvider";
import { jobMatches } from "@/mocks/dashboard";
import { ApiError, buildApiDiagnostics, classifyApiError, isAuthError, refreshSessionNow, type ApiErrorKind } from "@/lib/api";
import { dropRecentlyViewedEntry, recordRecentlyViewed } from "@/lib/recentlyViewed";
import { rememberRecentDocument } from "@/lib/recentDocument";
import { listTailorableJobs, type TailorableJob } from "@/lib/jobs";
import {
  activateCoverLetterVersion,
  createCoverLetterVersion,
  downloadCoverLetter,
  getCoverLetter,
  getCoverLetterFileUrl,
  getCoverLetterReviewNarrative,
  getCoverLetterReviewScore,
  getCoverLetterReuse,
  reviseCoverLetter,
  replaceCoverLetterText,
  tailorCoverLetter,
  tailorErrorMessage,
  updateCoverLetter,
  type CoverLetter,
  type CoverLetterTailorResult,
  type DocumentVersion,
  type ReuseResult,
  type ReviewResult,
} from "@/lib/documents";
import ReviewPanel from "@/pages/dashboard/documents/components/ReviewPanel";
import WidgetBoundary from "@/components/feature/WidgetBoundary";
import NarrationText from "@/components/feature/NarrationText";
import ReadAloudControl from "@/components/feature/ReadAloudControl";
import AddPointsPanel from "@/pages/dashboard/documents/components/AddPointsPanel";
import CoverLetterTailorPanel from "@/pages/dashboard/documents/components/CoverLetterTailorPanel";
import VersionSwitcher from "@/pages/dashboard/documents/components/VersionSwitcher";
import VersionsStrip from "@/pages/dashboard/documents/components/VersionsStrip";
import { asString, asText, versionTitle } from "@/pages/dashboard/documents/components/versionMeta";
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
import { clearDocDraft, readDocDraft, writeDocDraft } from "@/lib/docDraft";
import { deleteSectionAt, detectSections, insertSectionAt, moveSection } from "@/lib/docSections";
import { isImprovedVersion, markImprovedVersion } from "@/lib/versionImproveMemory";
import DocumentPaneControls from "@/pages/dashboard/documents/components/DocumentPaneControls";
import PaneResizer from "@/pages/dashboard/documents/components/PaneResizer";
import { useDocumentPreviewLayout } from "@/hooks/useDocumentPreviewLayout";
import ImprovePreview from "@/pages/dashboard/documents/components/ImprovePreview";
import { openRevisionReview, revisionReviewKey } from "@/lib/revisionReview";
import CoverLetterTemplatesPanel from "@/pages/dashboard/documents/templates/CoverLetterTemplatesPanel";
import CoverLetterDesignModal from "@/pages/dashboard/documents/templates/design/CoverLetterDesignModal";
import StructuredImprovePreview from "@/pages/dashboard/documents/templates/StructuredImprovePreview";
import useStructuredImprove, {
  type ImproveDoc,
} from "@/pages/dashboard/documents/templates/useStructuredImprove";
import { stripTextInstructionEcho } from "@/pages/dashboard/documents/templates/instructionEcho";
import { describeAction, findChangedSection } from "@/pages/dashboard/documents/templates/changeActionMessage";
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
import {
  readAppliedInstructionMap,
  type VersionAppliedInstructionMap,
} from "@/lib/versionAppliedInstruction";
import { readAiEditTrace, type AiEditTrace } from "@/lib/aiEditTrace";
import type { InlineEditMeta } from "@/hooks/useInlineDocEdit";
import KeywordCoverageSummary from "@/pages/dashboard/documents/components/KeywordCoverageSummary";
import { COVER_PRESETS } from "@/lib/coverLetterPresets";
import { readPaneCollapsed, writePaneCollapsed } from "@/lib/paneCollapseMemory";
import {
  computeCoverage,
  getVersionCoverage,
  readVersionCoverageMap,
  saveVersionCoverage,
  saveVersionNote,
  type VersionCoverageMap,
} from "@/lib/versionCoverage";

const jobOptions = jobMatches.map((j) => ({
  value: String(j.id),
  label: `${j.title} · ${j.company}`,
}));

/** The cover-letter improve shares its own memory namespace (mirrors the editor keys). */
const IMPROVE_MEMORY_PREFIX = "hirewave_cover_letter_improve";
const TAILOR_JOB_STORAGE_PREFIX = "hirewave_cover_letter_tailor_job_id_";
const REVIEW_JOB_STORAGE_PREFIX = "hirewave_cover_letter_review_job_id_";
/** Remembered layout for the improve preview: "replace" (single pane) or "split". */
const PREVIEW_COMPARE_STORAGE_KEY = "hirewave_preview_compare_mode";

function detectFormat(letter: CoverLetter): string {
  const fmt = asString(letter.format).toLowerCase();
  if (fmt) return fmt;
  const name = asString(letter.original_filename).toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "markdown";
  if (name.endsWith(".txt")) return "text";
  return "";
}

function formatDate(v?: string) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function jobLabel(id: string | number | undefined) {
  const job = jobMatches.find((j) => String(j.id) === String(id));
  return job ? `${job.title} · ${job.company}` : "Generic cover letter";
}

export default function CoverLetterDetail() {
  const { id } = useParams<{ id: string }>();
  const letterId = id ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  /** A version the "Jump back in" shortcut asked us to open on (see the effect below). */
  const queryVersion = searchParams.get("version") ?? "";
  const previewRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const { showToast } = useToast();

  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadErrorKind, setLoadErrorKind] = useState<ApiErrorKind | "">("");
  /** Plain-text diagnostics (path + status/timeout) for the load-error state. */
  const [loadDiagnostics, setLoadDiagnostics] = useState("");

  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState("");
  const [saveError, setSaveError] = useState("");

  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewNarrativeLoading, setReviewNarrativeLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [jobId, setJobId] = useState("");
  /** The saved letter text the current AI review reflects — edits mark it stale. */
  const [reviewedText, setReviewedText] = useState("");
  /** When the last AI review completed — versions saved after it are marked stale. */
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);

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
  // Remembered Improve picks (chips + custom instruction + ticked findings).
  // Backed by the shared memory, which syncs to the account so the picks follow
  // the user across devices instead of staying in this browser.
  const improveMemory = useImproveMemory(letterId, COVER_PRESETS, IMPROVE_MEMORY_PREFIX);

  // Set true when the AI-guidance box launches an improve, so the guidance text
  // + consumed chips can be cleared once it's applied (but NOT when the
  // "Add your own points" flow saves).
  const guidanceRunRef = useRef(false);

  // The AI-guidance box and the "Add your own points" flow share the structured
  // improve pipeline — the same /improve-structured call, preview UI and
  // accept/…/versions save path. Accepting reloads this page's letter.
  //
  // The active version state is declared further down, so it's mirrored in a ref
  // here for the direct self-entry apply's Undo.
  const activeVersionRef = useRef<string | number>("");
  /**
   * The version we last switched AWAY from, set in lockstep with the "Undo
   * switch" toast, so Cmd/Ctrl+Z can undo the same switch from the keyboard.
   */
  const lastSwitchFromRef = useRef<string | number>("");
  const structuredImprove = useStructuredImprove({
    kind: "cover-letter",
    docId: letterId,
    // Always improve the text exactly as it reads on screen (unsaved edits included).
    getContent: () => content,
    getActiveVersion: () => activeVersionRef.current,
    activateVersion: (version) => handleSelectVersion(version),
    // Cheapest-correct-path routing: a literal swap runs through Find & replace
    // (instant + exact) instead of the AI rewrite.
    onRouteLiteralReplace: (find, replaceWith) =>
      handleRouteLiteralReplace(find, replaceWith),
    // One-tap fallback from the "no change made" notice straight into Find & replace.
    onOpenFindReplace: () => openFindReplace(),
    onAccepted: () => {
      if (guidanceRunRef.current) {
        guidanceRunRef.current = false;
        improveMemory.clearPrompts();
        improveMemory.updateInstruction("");
      }
      void load();
    },
  });

  // Deterministic Find & Replace — the reliable path for an exact "replace X
  // with Y" edit, mirrored from the résumé editor. It calls the dedicated
  // endpoint and holds the swap for confirmation before saving a version.
  const findReplace = useFindReplace({
    replaceFn: (input) => replaceCoverLetterText(letterId, input),
    getText: () => content,
    onApply: handleFindReplaceApply,
    memoryKey: `cover-letter_${letterId}`,
    kindLabel: "cover letter",
  });

  const [tailorJobs, setTailorJobs] = useState<TailorableJob[]>([]);
  const [tailorJobId, setTailorJobId] = useState("");
  const [tailorResult, setTailorResult] = useState<CoverLetterTailorResult | null>(null);
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState("");

  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<string | number>("");
  /**
   * The version the main viewer is PREVIEWING from the strip — clicking a card
   * shows it large above, without making it current. Cleared whenever the active
   * version changes so the viewer follows activation again.
   */
  const [viewerVersion, setViewerVersion] = useState<string | number | null>(null);
  // Mirror the active version into the ref read by the improve hook's Undo.
  activeVersionRef.current = activeVersion;
  const [activatingVersion, setActivatingVersion] = useState<string | number | null>(null);
  const [versionNote, setVersionNote] = useState<string | null>(null);
  const [versionError, setVersionError] = useState("");
  const [reuse, setReuse] = useState<ReuseResult | null>(null);
  const [pendingInstructions, setPendingInstructions] = useState<string[]>([]);
  const [pendingInstruction, setPendingInstruction] = useState("");
  const [pendingJobId, setPendingJobId] = useState<string | number | undefined>(undefined);
  /** Review findings sent as focus_points on the improve that produced the current preview. */
  const [pendingFindings, setPendingFindings] = useState<string[]>([]);

  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  /** Whether the full-screen readable view is open. */
  const [readableOpen, setReadableOpen] = useState(false);
  /** Whether the version marquee (opened from the header / zoom-bar badge) is open. */
  const [versionMarqueeOpen, setVersionMarqueeOpen] = useState(false);
  /** Whether the in-context Design chooser (template preview + apply) is open. */
  const [designOpen, setDesignOpen] = useState(false);
  /** Whether the pinned document pane is collapsed (controls take full width). */
  const [paneCollapsed, setPaneCollapsed] = useState(() =>
    readPaneCollapsed(`cover-letter_${letterId}`)
  );

  /** Edit vs. read-only Preview — the mode the letter opens in. */
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  /** The last saved/loaded content, so unsaved changes can be detected. */
  const [baseline, setBaseline] = useState("");
  /** Guards the draft autosave until the letter has loaded once. */
  const [hydrated, setHydrated] = useState(false);
  /** True when a locally autosaved draft was restored on load. */
  const [draftRestored, setDraftRestored] = useState(false);
  /** One-time hand-off helper shown right after an Improve is accepted. */
  const [improvedHelper, setImprovedHelper] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  /** Bumped after a mutation to force the rendered preview to re-read. */
  const [docRefresh, setDocRefresh] = useState(0);

  const navigate = useNavigate();

  const dirty = content !== baseline;
  const history = useEditHistory(content, setContent, baseline);
  const { pendingHref, cancelLeave } = useUnsavedGuard(
    dirty,
    "You have unsaved edits to this cover letter."
  );

  // Document-wide scans (section detection, Find-match counting, match context)
  // are DEBOUNCED and MEMOIZED, so typing never re-scans the whole letter on
  // every keystroke. The textarea keeps the live value, so the caret never lags.
  const debouncedContent = useDebouncedValue(content, 180);
  const sections = useMemo(() => detectSections(debouncedContent), [debouncedContent]);
  const findMatchCount = useMemo(
    () =>
      findReplace.open && findReplace.find.trim().length > 0
        ? countMatches(debouncedContent, findReplace.find, findReplace.matchCase)
        : 0,
    [findReplace.open, findReplace.find, findReplace.matchCase, debouncedContent]
  );
  const findMatchContext = useMemo(
    () =>
      findReplace.open && findReplace.find.trim().length > 0
        ? matchSentenceContext(
            debouncedContent,
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
      debouncedContent,
    ]
  );

  const {
    containerRef: paneContainerRef,
    mode: paneMode,
    previewWidth,
    applyPreset: applyPanePreset,
    onResize: handlePaneResize,
  } = useDocumentPreviewLayout(`cover-letter_${letterId}`);
  /** Top-level mode: the editable letter view, or the template presentation layer. */
  const [view, setView] = useState<"document" | "templates">("document");

  // Before/after coverage of the job's missing points, shown after a tailored version is saved.
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
  /** Per-version instruction applied directly (skipping the review preview). */
  const [appliedInstructionByVersion, setAppliedInstructionByVersion] =
    useState<VersionAppliedInstructionMap>();
  /** Trace of the last immediate AI edit — shown inline next to the version badge. */
  const [aiEditTrace, setAiEditTrace] = useState<AiEditTrace | null>(null);

  const format = letter ? detectFormat(letter) : "";
  const isPdf = format === "pdf";
  const hasFile = Boolean(letter?.file_url);

  async function load() {
    setLoading(true);
    setLoadError("");
    setLoadErrorKind("");
    setLoadDiagnostics("");
    setVersionNote(null);
    try {
      const res = await getCoverLetter(letterId);
      setLetter(res);
      const body = asString(res.content);
      // Restore a locally autosaved draft so an interrupted edit isn't lost.
      const draft = readDocDraft("cover-letter", letterId);
      if (draft && draft.text.trim() && draft.text !== body) {
        setContent(draft.text);
        setDraftRestored(true);
      } else {
        setContent(body);
        setDraftRestored(false);
      }
      setBaseline(body);
      setVersions(res.versions ?? []);
      setActiveVersion(res.active_version ?? "");
      setVersionCoverage(readVersionCoverageMap("cover-letter", letterId));
      setVersionMetrics(readVersionMetricMap("cover-letter", letterId));
      setVersionFindings(readVersionFindingsMap("cover-letter", letterId));
      setRephraseDiffs(readRephraseDiffs("cover-letter", letterId));
      setAppliedInstructionByVersion(readAppliedInstructionMap("cover-letter", letterId));
      setAiEditTrace(readAiEditTrace("cover-letter", letterId));
      const storedCoverage = getVersionCoverage(
        "cover-letter",
        letterId,
        res.active_version ?? ""
      );
      if (storedCoverage?.gaps?.length) {
        setCoverage({ gaps: storedCoverage.gaps, jobLabel: storedCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      const storedReviewJob = localStorage.getItem(REVIEW_JOB_STORAGE_PREFIX + letterId) ?? "";
      if (storedReviewJob) setJobId(storedReviewJob);
      void recordRecentlyViewed({
        kind: "cover_letter",
        ref_id: letterId,
        title:
          res.original_filename ||
          (res.source === "uploaded" ? `Cover letter ${res.id}` : "Generated cover letter"),
        subtitle: res.job_posting_id ? jobLabel(res.job_posting_id) : "Generic cover letter",
        view: "cover-letters",
      });
      if (asString(res.content).trim()) {
        handleReview(storedReviewJob || undefined, body);
      }
    } catch (err) {
      const kind = classifyApiError(err);
      // A letter that's gone shouldn't linger as a dead card in the rail.
      if (kind === "not-found") {
        dropRecentlyViewedEntry("cover_letter", letterId);
      }
      setLoadErrorKind(kind);
      setLoadError(err instanceof ApiError ? err.message : "Could not load this cover letter.");
      setLoadDiagnostics(
        buildApiDiagnostics(err, {
          label: `cover letter ${letterId}`,
          path: `GET /api/v1/cover-letters/${letterId}`,
        })
      );
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }

  /**
   * One-tap session recovery for the "session expired" state: force a token
   * refresh, then reload this cover letter. A definitive rejection tears the
   * session down and redirects to sign-in; an unreachable server returns a
   * message to show in place without losing the page.
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
   * Render the server's returned letter into the editor — the single source of
   * truth after any mutation (save, version save, improve/incorporate accept, or
   * find & replace). It also drops the local autosave draft, so a stale copy can
   * never shadow the freshly saved content.
   */
  function applyServerLetter(res: CoverLetter) {
    setLetter(res);
    setVersions(res.versions ?? []);
    setActiveVersion(res.active_version ?? "");
    const body = asString(res.content);
    setContent(body);
    setBaseline(body);
    clearDocDraft("cover-letter", letterId);
    setDraftRestored(false);
    // Pick up the inline AI-edit trace ("N edit → vN") for the fresh version.
    setAiEditTrace(readAiEditTrace("cover-letter", letterId));
    // Force the rendered preview to re-read even when the version is unchanged.
    setDocRefresh((count) => count + 1);
  }

  /**
   * Apply a Find & Replace result: render the returned text immediately, then
   * persist it through the version flow and re-render from what was saved. Rolls
   * the optimistic render back if the save fails, so the editor always matches
   * the last saved content.
   */
  async function handleFindReplaceApply(renderedText: string): Promise<void> {
    const prevContent = content;
    setContent(renderedText);
    try {
      const updated = await createCoverLetterVersion(letterId, { text: renderedText });
      applyServerLetter(updated);
      void handleReview(undefined, updated.content ?? renderedText);
    } catch (err) {
      setContent(prevContent);
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
        `find-replace-input-${letterId}`
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
        `find-replace-input-${letterId}`
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
        `find-replace-input-${letterId}`
      ) as HTMLInputElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 160);
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
        `find-replace-input-${letterId}`
      ) as HTMLInputElement | null;
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus();
      input?.select();
    }, 180);
  });

  // Cmd/Ctrl+S saves the letter in place; Shift + Cmd/Ctrl+S saves it as a new
  // tracked version — the same two actions as the editor toolbar buttons.
  useDocumentSaveShortcut(
    () => {
      if (dirty && !saving && !savingVersion) void handleSave();
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

  async function loadTailorJobs() {
    const jobs = await listTailorableJobs().catch(() => [] as TailorableJob[]);
    setTailorJobs(jobs);
    const stored = localStorage.getItem(TAILOR_JOB_STORAGE_PREFIX + letterId);
    if (stored && jobs.some((j) => String(j.job_posting_id) === stored)) {
      handleSelectJob(stored);
    }
  }

  async function handleSelectJob(id: string) {
    setTailorJobId(id);
    setTailorResult(null);
    setTailorError("");
    setReuse(null);
    setCoverage(null);
    if (!id) {
      localStorage.removeItem(TAILOR_JOB_STORAGE_PREFIX + letterId);
      return;
    }
    localStorage.setItem(TAILOR_JOB_STORAGE_PREFIX + letterId, id);
    setTailorLoading(true);
    try {
      const reuseResult = await getCoverLetterReuse(letterId, id);
      if (reuseResult.reuse_recommended) {
        setReuse(reuseResult);
        return;
      }
      const result = await tailorCoverLetter(letterId, id);
      setTailorResult(result);
    } catch (err) {
      setTailorError(tailorErrorMessage(err, "cover letter"));
    } finally {
      setTailorLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadTailorJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId]);

  // The main viewer follows the marquee: a card click previews that version above,
  // but an explicit activation (or switching documents) takes it back over.
  useEffect(() => {
    setViewerVersion(null);
  }, [activeVersion, letterId]);

  /**
   * Reopen on the version that was being PREVIEWED when the link was made. The
   * viewer's pick is remembered under `?preview=` — deliberately SEPARATE from
   * `?version=`, which the dashboard uses to ACTIVATE a version — so a shared or
   * reloaded link reopens the preview without changing which version is current.
   * Seeded once, after the letter loads.
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

  // Remember this letter as the "Jump back in" target, at the version on screen,
  // so the Documents page shortcut can drop the user straight back to it.
  useEffect(() => {
    if (!letter) return;
    rememberRecentDocument({
      kind: "cover-letter",
      id: letterId,
      title:
        letter.original_filename ||
        (letter.source === "uploaded" ? `Cover letter ${letter.id}` : "Generated cover letter"),
      version: activeVersion,
    });
  }, [letter, letterId, activeVersion]);

  // Open on a specific version when the "Jump back in" shortcut asks for it
  // (the version the user was on before a batch of edits), or when the documents
  // rail links here with `?version=`. This is a ONE-SHOT intent: it is honoured
  // the first time, then consumed and cleared from the URL. It must NEVER be
  // re-applied just because the active version later diverges from the URL —
  // that re-fire was the bug where picking a version in the marquee snapped
  // straight back to the URL's older version.
  const versionIntentApplied = useRef<string>("");
  useEffect(() => {
    if (loading || !queryVersion || versions.length === 0) return;
    if (!versions.some((v) => String(v.version) === String(queryVersion))) return;
    const intentKey = `${letterId}:${queryVersion}`;
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
  }, [loading, queryVersion, activeVersion, versions, letterId, setSearchParams]);

  // Autosave the in-progress (unsaved) edit locally so it survives a reload.
  useEffect(() => {
    if (!hydrated) return;
    if (content !== baseline) writeDocDraft("cover-letter", letterId, content);
    else clearDocDraft("cover-letter", letterId);
  }, [hydrated, content, baseline, letterId]);

  // Restore the remembered collapsed/expanded state of the document pane.
  useEffect(() => {
    setPaneCollapsed(readPaneCollapsed(`cover-letter_${letterId}`));
  }, [letterId]);

  // Remember the collapse choice so a reopened letter keeps the same layout.
  useEffect(() => {
    writePaneCollapsed(`cover-letter_${letterId}`, paneCollapsed);
  }, [letterId, paneCollapsed]);

  // Alt+I (and the legacy Alt+P) jump focus straight to the "AI instructions" box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key !== "i" && key !== "p") return;
      const el = document.getElementById(
        `add-points-${letterId}`
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
  }, [letterId]);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  async function handleReview(overrideJobId?: string, snapshot: string = baseline) {
    const jid = overrideJobId !== undefined ? overrideJobId : jobId;
    setReviewLoading(true);
    setReviewError("");
    // PHASE 1 — the deterministic score (no LLM), shown the instant it lands.
    let scoreShown = false;
    try {
      const score = await getCoverLetterReviewScore(letterId, jid || undefined);
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
    // PHASE 2 — the narrative, in the background. A slow/failed narrative never
    // blocks the page; the deterministic score above is already on screen.
    setReviewNarrativeLoading(true);
    try {
      const full = await getCoverLetterReviewNarrative(letterId, jid || undefined);
      setReview(full);
    } catch {
      // Keep the deterministic score — the narrative is best-effort.
    } finally {
      setReviewNarrativeLoading(false);
    }
  }

  /** Re-run the AI review because the letter changed since the last one. */
  function handleReassess() {
    void handleReview();
  }

  function handleJobChange(value: string) {
    setJobId(value);
    if (value) {
      localStorage.setItem(REVIEW_JOB_STORAGE_PREFIX + letterId, value);
    } else {
      localStorage.removeItem(REVIEW_JOB_STORAGE_PREFIX + letterId);
    }
  }

  /** Pin the coverage summary as a one-line note onto the active version. */
  function handleSaveCoverageNote(note: string) {
    if (activeVersion === "" || activeVersion === null || activeVersion === undefined) return;
    setVersionCoverage(saveVersionNote("cover-letter", letterId, activeVersion, note));
    showToast("Note saved to this version", "success");
  }

  /** Wipe every version's figure tally + verified decisions for this letter at once. */
  function handleResetAllMetrics() {
    clearDocumentMetricMemory("cover-letter", letterId);
    setVersionMetrics({});
    showToast("Cleared all figure verifications for this cover letter", "success");
  }

  /** Wipe a single version's figure tally + verified decisions for this letter. */
  function handleResetVersionMetrics(version: string | number) {
    if (version === "" || version === null || version === undefined) return;
    setVersionMetrics(clearVersionMetricMemory("cover-letter", letterId, version));
    showToast("Cleared this version's figure verification", "success");
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess("");
    setSaveError("");
    try {
      const updated = await updateCoverLetter(letterId, { content });
      setLetter(updated);
      setBaseline(content);
      clearDocDraft("cover-letter", letterId);
      setDraftRestored(false);
      // Force the rendered document pane to re-read the freshly saved content.
      setDocRefresh((count) => count + 1);
      setLastSavedAt(
        new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      );
      setSaveSuccess("Cover letter saved.");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save the cover letter.");
    } finally {
      setSaving(false);
    }
  }

  /** Persist the current edit as a tracked new version. */
  async function handleSaveAsVersion() {
    setSavingVersion(true);
    setSaveSuccess("");
    setSaveError("");
    try {
      const updated = await createCoverLetterVersion(letterId, { text: content });
      setLetter(updated);
      setVersions(updated.versions ?? []);
      setActiveVersion(updated.active_version ?? "");
      const body = updated.content ?? content;
      setContent(body);
      setBaseline(body);
      clearDocDraft("cover-letter", letterId);
      setDraftRestored(false);
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
    const pos = caretRef.current ?? content.length;
    const { text: next, caret } = insertSectionAt(content, pos, heading, sample);
    setContent(next);
    caretRef.current = caret;
    setMode("edit");
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    showToast(`Added “${heading}” section`, "success");
  }

  function handleMoveSection(index: number, direction: -1 | 1) {
    setContent((prev) => moveSection(prev, index, direction));
  }

  function handleDeleteSection(index: number) {
    setContent((prev) => deleteSectionAt(prev, index));
  }

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
    clearDocDraft("cover-letter", letterId);
    setContent(baseline);
    setDraftRestored(false);
  }

  /** Persist an inline edit of the rendered letter as a new version. */
  async function handleInlineEdit(editedText: string, meta?: InlineEditMeta) {
    try {
      const updated = await createCoverLetterVersion(letterId, { text: editedText });
      const nextVersions = updated.versions ?? [];
      const nextActive = updated.active_version ?? "";
      setLetter(updated);
      setVersions(nextVersions);
      setActiveVersion(nextActive);
      setContent(updated.content ?? editedText);
      setBaseline(updated.content ?? editedText);
      clearDocDraft("cover-letter", letterId);
      setDraftRestored(false);
      if (meta?.rephrase) {
        setRephraseDiffs(
          saveRephraseDiff("cover-letter", letterId, nextActive, meta.rephrase)
        );
      }
      const changedSection = findChangedSection(content, editedText);
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
    const effectiveJobId =
      (input.jobId !== undefined ? input.jobId : tailorJobId || jobId) || undefined;
    setPendingInstructions(instructions);
    setPendingInstruction(input.instruction ?? "");
    setPendingJobId(effectiveJobId);
    setPendingFindings(input.focusPoints ?? []);
    try {
      const result = await reviseCoverLetter(letterId, {
        instructions,
        instruction: input.instruction ?? "",
        // Improve the text exactly as it reads on screen — including anything
        // the user just typed but hasn't saved — instead of the last saved
        // letter. This is a preview only; save/accept is unchanged.
        content,
        job_posting_id: effectiveJobId,
        focus_points: input.focusPoints && input.focusPoints.length ? input.focusPoints : undefined,
      });
      // The tailoring instructions are GUIDANCE, not content — drop any verbatim
      // echo line the AI returned so a directive can't leak into the letter.
      const guidance = [input.instruction ?? "", ...instructions].filter(
        (g) => g.trim().length > 0
      );
      const guarded = stripTextInstructionEcho(result.preview, content, guidance);
      setIgnoredEchoCount(guarded.strippedCount);
      setPreview(guarded.text);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      if (status === 400) {
        setImproveError("Please add a letter and an instruction before tailoring.");
      } else {
        setImproveError(tailorErrorMessage(err, "cover letter"));
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

  /** Drop a missing "Missing points" keyword straight into the letter at the last caret position. */
  function insertKeyword(keyword: string) {
    const current = content;
    const pos = caretRef.current ?? current.length;
    const start = Math.max(0, Math.min(pos, current.length));
    const before = current.slice(0, start);
    const after = current.slice(start);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = `${needsSpace ? " " : ""}${keyword}`;
    setContent(`${before}${insertion}${after}`);
    const caret = before.length + insertion.length;
    caretRef.current = caret;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    showToast(`Added \u201c${keyword}\u201d to your cover letter`, "success");
  }

  /**
   * Re-render the editor from a letter returned by the Versions strip's activate,
   * delete, or restore-as-copy call, then refresh the per-version coverage + AI
   * review. The response is the single source of truth — never a cached copy.
   */
  function handleVersionsStripChange(updated: CoverLetter) {
    applyServerLetter(updated);
    setPreview(null);
    setTailorResult(null);
    setReuse(null);
    const chosenCoverage = getVersionCoverage(
      "cover-letter",
      letterId,
      updated.active_version ?? ""
    );
    if (chosenCoverage?.gaps?.length) {
      setCoverage({ gaps: chosenCoverage.gaps, jobLabel: chosenCoverage.jobLabel });
    } else {
      setCoverage(null);
    }
    void handleReview(undefined, updated.content ?? "");
  }

  /**
   * Offer a one-tap "Undo switch" right after a version change, so a mistaken
   * pick is reverted without hunting for the previous card (mirrors the marquee).
   */
  function offerUndoSwitch(
    previous: string | number,
    next: string | number,
    updated: CoverLetter
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
      const updated = await activateCoverLetterVersion(letterId, version);
      // Re-render from the returned letter — "Current" is applied from the
      // backend's own `active_version` (no optimistic fallback to the picked
      // version), so the UI can never show a version the server didn't accept.
      applyServerLetter(updated);
      setPreview(null);
      setTailorResult(null);
      setReuse(null);
      const chosenCoverage = getVersionCoverage(
        "cover-letter",
        letterId,
        updated.active_version ?? ""
      );
      if (chosenCoverage?.gaps?.length) {
        setCoverage({ gaps: chosenCoverage.gaps, jobLabel: chosenCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      // One-tap Undo, so a mistaken pick is trivially reverted.
      offerUndoSwitch(previous, version, updated);
      await handleReview(undefined, updated.content ?? "");
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

  async function handleUseReuseVersion() {
    if (!reuse || reuse.best_version == null) return;
    const version = reuse.best_version;
    setActivatingVersion(version);
    setTailorError("");
    try {
      const updated = await activateCoverLetterVersion(letterId, version);
      setLetter(updated);
      setActiveVersion(updated.active_version ?? version);
      setVersions(updated.versions ?? []);
      setContent(updated.content ?? "");
      setBaseline(updated.content ?? "");
      clearDocDraft("cover-letter", letterId);
      setDraftRestored(false);
      setReuse(null);
      const reuseCoverage = getVersionCoverage("cover-letter", letterId, version);
      if (reuseCoverage?.gaps?.length) {
        setCoverage({ gaps: reuseCoverage.gaps, jobLabel: reuseCoverage.jobLabel });
      } else {
        setCoverage(null);
      }
      await handleReview(undefined, updated.content ?? "");
      // Jump straight to the tailor view for the job the user picked.
      if (tailorJobId) {
        setTailorLoading(true);
        setTailorError("");
        try {
          const result = await tailorCoverLetter(letterId, tailorJobId);
          setTailorResult(result);
        } catch (err) {
          setTailorError(tailorErrorMessage(err, "cover letter"));
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

  async function handleApply(resolvedText: string) {
    if (!preview) return;
    setApplying(true);
    setImproveError("");
    try {
      const updated = await createCoverLetterVersion(letterId, {
        text: resolvedText,
        job_posting_id: pendingJobId,
        instructions: pendingInstructions.length ? pendingInstructions : undefined,
      });
      const nextVersions = updated.versions ?? [];
      const nextActive = updated.active_version ?? "";
      setLetter(updated);
      setVersions(nextVersions);
      setActiveVersion(nextActive);
      setVersionNote(
        asText(
          nextVersions.find((v) => String(v.version) === String(nextActive))?.change_summary
        ) || null
      );
      if (pendingFindings.length) {
        setVersionFindings(
          saveVersionFindings("cover-letter", letterId, nextActive, pendingFindings)
        );
      }
      const body = updated.content ?? resolvedText;
      setContent(body);
      setBaseline(body);
      setPreview(null);
      // Hand the user from AI straight into manual editing on the new version.
      markImprovedVersion("cover-letter", letterId, nextActive);
      clearDocDraft("cover-letter", letterId);
      setDraftRestored(false);
      setMode("edit");
      setImprovedHelper(true);
      // The improvement is applied — consume the chips it used so they aren't
      // offered as pre-selected again. The run stays in "Reuse last improve".
      if (pendingInstructions.some((p) => COVER_PRESETS.includes(p))) {
        improveMemory.clearPrompts();
      }
      const gaps = tailorResult?.missing_points ?? [];
      if (gaps.length) {
        const job = tailorResult?.job;
        const jobLabel = job ? `${job.title} \u00b7 ${job.company}` : null;
        const counts = computeCoverage(gaps, resolvedText);
        setVersionCoverage(
          saveVersionCoverage("cover-letter", letterId, nextActive, {
            gaps,
            jobLabel,
            jobId: pendingJobId ?? tailorJobId ?? null,
            covered: counts.covered,
            total: counts.total,
          })
        );
        setCoverage({ gaps, jobLabel });
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

  async function handleViewOriginal() {
    setFileLoading(true);
    setFileError("");
    try {
      const url = await getCoverLetterFileUrl(letterId);
      setOriginalUrl(url);
      setShowOriginal(true);
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : "Could not load the file.");
    } finally {
      setFileLoading(false);
    }
  }

  async function handleDownload() {
    setFileError("");
    try {
      await downloadCoverLetter(letterId, letter?.original_filename);
    } catch (err) {
      setFileError(err instanceof ApiError ? err.message : "Download failed.");
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-sm text-foreground-500 flex items-center gap-2">
        <i className="ri-loader-4-line animate-spin"></i>
        Loading cover letter…
      </div>
    );
  }

  if (loadError) {
    return (
      <DocumentLoadError
        kind={loadErrorKind}
        entity="cover letter"
        message={loadError}
        diagnostics={loadDiagnostics}
        onRetry={() => void load()}
        onRefreshSession={handleRefreshSession}
      />
    );
  }

  if (!letter) {
    // The load settled without an error but also without a document (e.g. an
    // empty 200 response). Never render nothing — show a real, retryable state.
    return (
      <DocumentLoadError
        kind="other"
        entity="cover letter"
        message="The server returned an empty response for this cover letter. Please try again."
        onRetry={() => void load()}
      />
    );
  }

  // AI Review findings the Improve panel can target (kept in sync with the
  // current review, so a stale tick simply drops out).
  const reviewFindings = review
    ? review.suggestions.map((s) => s.title).filter(Boolean)
    : [];
  /** Findings this saved version was improved against (recorded at accept time). */
  const addressedFindings = versionFindings[String(activeVersion)] ?? [];
  /** True when the letter changed since the last AI review — saved or unsaved. */
  const reviewStale = Boolean(review) && content !== reviewedText;

  const isUploaded = letter.source === "uploaded";
  const title =
    isUploaded ? (letter.original_filename || `Cover letter ${letter.id}`) : "Generated cover letter";
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
  const selectedTailorJob = tailorJobs.find(
    (j) => String(j.job_posting_id) === tailorJobId
  );
  const selectedJobLabel = selectedTailorJob
    ? `${selectedTailorJob.title} · ${selectedTailorJob.company}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
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
                isUploaded ? "text-secondary-900 bg-secondary-100" : "text-accent-900 bg-accent-100"
              }`}
            >
              <i className={isUploaded ? "ri-upload-2-line" : "ri-sparkling-line"}></i>
              {isUploaded ? "Uploaded" : "AI-generated"}
            </span>
            {format && (
              <span className="inline-flex items-center text-xs font-medium text-foreground-600 bg-background-200/70 px-2 py-0.5 rounded-full uppercase whitespace-nowrap">
                {format}
              </span>
            )}
            <span className="text-xs text-foreground-500 whitespace-nowrap">
              {letter.job_posting_id
                ? jobLabel(letter.job_posting_id)
                : "Generic cover letter"}
            </span>
            {formatDate(letter.created_at ?? letter.generated_at) && (
              <span className="text-xs text-foreground-500 whitespace-nowrap">
                · {formatDate(letter.created_at ?? letter.generated_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DocumentMarqueeButton
            kind="cover-letter"
            docId={letterId}
            title={title}
            versions={versions}
            activeVersion={activeVersion}
            onChanged={handleVersionsStripChange}
            revisionKey={docRefresh}
          />
          <button
            onClick={() => {
              // A pending improve/incorporate revision opens in the full review view
              // (highlight + compare); otherwise the saved letter opens.
              if (openRevisionReview(revisionReviewKey("cover-letter", letterId))) return;
              setReadableOpen(true);
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-3 py-2 rounded-md hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
            title="Open a full-screen readable view of this cover letter"
          >
            <i className="ri-expand-diagonal-line"></i>
            Preview
          </button>
          <ShortcutsCheatSheet storageKey={`cover-letter_${letterId}`} />
          <Link
            to={`/dashboard/documents/cover-letters/${letterId}/templates`}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-layout-line"></i>
            Templates
          </Link>
          <button
            type="button"
            onClick={() => setDesignOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-2 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            title="Change this cover letter's design without leaving the editor"
          >
            <i className="ri-palette-line"></i>
            Design
          </button>
        </div>
      </div>

      <SaveShortcutTip />

      {structuredImprove.landedNotice}

      <VersionDocumentViewer
        kind="cover-letter"
        docId={letterId}
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
          kind="cover-letter"
          docId={letterId}
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
          aiImproved={isImprovedVersion("cover-letter", letterId, activeVersion)}
          aiEditTrace={aiEditTrace}
          onOpenMarquee={() => setVersionMarqueeOpen(true)}
          showImprovedHelper={improvedHelper}
          onDismissImprovedHelper={() => setImprovedHelper(false)}
        />
      )}

      {view === "templates" ? (
        <CoverLetterTemplatesPanel
          letterId={letterId}
          refreshKey={String(activeVersion)}
          version={activeVersion}
          jobPostingId={tailorJobId || letter.job_posting_id}
          jobLabel={
            selectedJobLabel ??
            (letter.job_posting_id ? jobLabel(letter.job_posting_id) : null)
          }
          findings={reviewFindings}
          onAccepted={(updated) => {
            setLetter(updated);
            setVersions(updated.versions ?? []);
            setActiveVersion(updated.active_version ?? "");
            const body = updated.content ?? "";
            setContent(body);
            setBaseline(body);
            setVersionMetrics(readVersionMetricMap("cover-letter", letterId));
            setVersionFindings(readVersionFindingsMap("cover-letter", letterId));
            setAppliedInstructionByVersion(readAppliedInstructionMap("cover-letter", letterId));
            // Hand the user from AI straight into manual editing on the new version.
            markImprovedVersion("cover-letter", letterId, updated.active_version ?? "");
            clearDocDraft("cover-letter", letterId);
            setDraftRestored(false);
            setMode("edit");
            setImprovedHelper(true);
            handleReview(undefined, body);
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
        roleFilterKey={`cover-letter_${letterId}`}
        rephraseByVersion={rephraseDiffs}
        appliedInstructionByVersion={appliedInstructionByVersion}
        lastReviewedAt={reviewedAt}
      />

      {coverage && (
        <KeywordCoverageSummary
          gaps={coverage.gaps}
          text={content}
          label="missing points"
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
                title="This letter changed since the last review — re-run the AI review for an updated summary"
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
                id={`cover-letter-summary-${letterId}`}
                text={review.summary}
                label="summary"
                autoRead
              />
            )}
          </div>
        </div>
        <div className="p-5 space-y-4">
          {reviewStale && !reviewLoading && (
            <p className="text-xs text-accent-700 flex items-center gap-1.5 flex-wrap">
              <i className="ri-information-line"></i>
              This letter has changed since the last review — reassess to refresh this summary.
              {dirty && (
                <span className="text-foreground-500">Save your edits to include them.</span>
              )}
            </p>
          )}
          <p className="text-sm text-foreground-700 leading-[1.7] max-w-[68ch]">
            {review?.summary ? (
              <NarrationText id={`cover-letter-summary-${letterId}`} text={review.summary} />
            ) : reviewLoading || reviewNarrativeLoading ? (
              <span className="inline-flex items-center gap-2 text-foreground-500">
                <i className="ri-loader-4-line animate-spin"></i>
                Generating…
              </span>
            ) : (
              "Run the AI review to get a one-paragraph assessment of this cover letter."
            )}
          </p>
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
          <section className="rounded-2xl bg-background-100/60 border border-background-200 overflow-hidden animate-fade-in-up">
            <div className="px-5 py-4 border-b border-background-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap min-w-0">
                <h2 className="font-heading text-lg font-medium text-foreground-950">Preview</h2>
                <VersionMetaChips
                  version={activeVersionObj}
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
                  title="Change this cover letter's design — instant preview, apply to save"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold bg-background-50 border border-background-200 text-foreground-900 px-3 py-1.5 rounded-md hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-palette-line"></i>
                  Design
                </button>
                {mode === "preview" && !preview && (
                  <button
                    onClick={() => setMode("edit")}
                    title="Open the editor to change this cover letter's text or add sections"
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
                {hasFile && isPdf && (
                  <button
                    onClick={handleViewOriginal}
                    disabled={fileLoading}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-900 disabled:opacity-60 cursor-pointer whitespace-nowrap"
                  >
                    <i className={fileLoading ? "ri-loader-4-line animate-spin" : "ri-file-pdf-2-line"}></i>
                    {fileLoading ? "Loading…" : showOriginal ? "Hide original" : "View original"}
                  </button>
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
                        Guidance rewrites existing content — to add something new, type it into the
                        letter directly, then run Improve again so it&apos;s included.
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
                    currentLabel="Current letter"
                    memoryKey={structuredImprove.metricKey}
                    reviewKey={revisionReviewKey("cover-letter", letterId)}
                    ignoredCount={structuredImprove.ignoredEchoCount}
                  />
                </>
              ) : preview ? (
                <ImprovePreview
                  currentText={content}
                  preview={preview}
                  compare={comparePreview}
                  onCompareChange={updateComparePreview}
                  appliedPrompts={pendingInstructions}
                  appliedInstruction={pendingInstruction}
                  applying={applying}
                  onAccept={handleApply}
                  onDiscard={() => setPreview(null)}
                  memoryKey={`cover-letter_${letterId}`}
                  ignoredCount={ignoredEchoCount}
                />
              ) : mode === "edit" ? (
                <div className="space-y-4">
                  {draftRestored && (
                    <div className="flex items-start gap-2.5 rounded-lg bg-secondary-100 text-secondary-900 px-4 py-3 text-sm">
                      <i className="ri-history-line text-base mt-0.5"></i>
                      <span className="flex-1">
                        We restored your unsaved draft from this device.
                      </span>
                      <button
                        onClick={handleDiscardDraft}
                        className="text-sm font-semibold text-secondary-900 hover:text-foreground-950 underline cursor-pointer whitespace-nowrap"
                      >
                        Discard draft
                      </button>
                    </div>
                  )}

                  <HtmlDocumentViewer
                    kind="cover-letter"
                    docId={letterId}
                    title={title}
                    currentVersion={activeVersion}
                    refreshKey={`${activeVersion}-${docRefresh}`}
                    memoryKey={`cover-letter_${letterId}`}
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
                        onSave={handleSave}
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
                        inputId={`find-replace-input-${letterId}`}
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
                        value={content}
                        onChange={setContent}
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
                        extend the letter
                      </p>
                    </div>
                  </section>
                </div>
              ) : (
                <>
                  <HtmlDocumentViewer
                    kind="cover-letter"
                    docId={letterId}
                    title={title}
                    currentVersion={activeVersion}
                    refreshKey={`${activeVersion}-${docRefresh}`}
                    memoryKey={`cover-letter_${letterId}`}
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

                  {showOriginal && originalUrl && (
                    <iframe
                      src={originalUrl}
                      title={`${title} original`}
                      className="w-full h-[520px] rounded-xl border border-background-200 bg-background-50"
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
              Show cover letter
            </button>
          )}
          <div id="improve" className="scroll-mt-24">
            <AddPointsPanel
              {...structuredImprove.incorporateProps}
              error={improveError || structuredImprove.incorporateProps.error}
              notesInputId={`add-points-${letterId}`}
              notesHint={
                <LiteralReplaceHint
                  instruction={structuredImprove.incorporateProps.notes}
                  onUse={handleUseFindReplace}
                />
              }
              addContentHint="Write new paragraphs in the letter body itself — open Edit, type your text, then Save. The AI only rewrites what's already there; it never invents facts."
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
            hasContent={content.trim().length > 0}
            actionLabel="Review cover letter"
            contentSummaryLabel="What this letter says"
            readAloudId={`cover-letter-review-${letterId}`}
            stale={reviewStale}
            onReassess={handleReassess}
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
          <CoverLetterTailorPanel
            options={tailorJobOptions}
            selectedId={tailorJobId}
            onSelect={handleSelectJob}
            loading={tailorLoading}
            error={tailorError}
            result={tailorResult}
            hasContent={content.trim().length > 0}
            revising={revising}
            onRevise={handleTailor}
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
          message="You have unsaved edits to this cover letter. Leave without saving?"
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
          kind="cover-letter"
          docId={letterId}
          title={title}
          versions={versions}
          activeVersion={activeVersion}
          onChanged={handleVersionsStripChange}
          revisionKey={docRefresh}
          onClose={() => setVersionMarqueeOpen(false)}
        />
      )}

      {designOpen && (
        <CoverLetterDesignModal
          letterId={letterId}
          version={activeVersion}
          title={title}
          letter={letter}
          content={content}
          onClose={() => setDesignOpen(false)}
          onApplied={(updated) => applyServerLetter(updated)}
        />
      )}

      {readableOpen && (
        <ReadableDocumentModal
          kind="cover-letter"
          docId={letterId}
          title={title}
          onClose={() => setReadableOpen(false)}
        />
      )}
    </div>
  );
}