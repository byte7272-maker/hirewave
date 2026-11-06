import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { IncorporateEntry } from "@/lib/incorporateHistory";
import { IMPROVE_EVERYTHING_HINT } from "@/lib/improveEverything";
import PastInputsPanel from "./PastInputsPanel";

interface AddPointsPanelProps {
  /**
   * Free-text instructions for the AI — COMMANDS, never document content. They
   * travel as the `instruction` parameter of the improve call only; they are
   * never written into the résumé/letter.
   */
  notes: string;
  onNotesChange: (notes: string) => void;
  /** True while an instruction is being applied or previewed. */
  submitting: boolean;
  error: string;
  /**
   * Execute the instruction DIRECTLY — send it to the AI as guidance, save the
   * result as a new version, then clear the box.
   */
  onApplyDirect: () => void;
  /**
   * Execute the instruction and show the result as a DIFF PREVIEW first — keep
   * or revert each edit before anything is saved. This is the primary action.
   */
  onPreview?: () => void;
  /** "résumé" or "cover letter" — used only in the helper copy. */
  kindLabel?: string;
  /**
   * Optional id for the instruction textarea, so an editor keyboard shortcut can
   * jump focus straight here.
   */
  notesInputId?: string;
  /**
   * Render without card chrome, so the writer can sit inside another panel
   * instead of as its own boxed card.
   */
  embedded?: boolean;
  /** Past submissions + their implementation status, shown under the form. */
  historyEntries?: IncorporateEntry[];
  /** Re-run the notes / instructions that never landed. */
  onRerunHistory?: (entries: IncorporateEntry[]) => void;
  /** Re-run just one past submission. */
  onRerunOneHistory?: (entry: IncorporateEntry) => void;
  /** Open a past submission's impact painted onto the rendered document. */
  onViewImpactHistory?: (entry: IncorporateEntry) => void;
  /** Drop one past submission from the history. */
  onRemoveHistory?: (id: string) => void;
  /** Forget the whole history for this document. */
  onClearHistory?: () => void;
  /**
   * Display label of the role a re-run is nudged toward (the document's current
   * improve target), so the user knows re-running also steers toward that job.
   */
  rerunRoleLabel?: string | null;
  /**
   * Opens the "My Work Highlights" wizard — the `…/incorporate` path that
   * (unlike the instruction box) MAY add new content. This is the feature's home
   * action, so it is rendered as a prominent, recommended entry point.
   */
  onWorkHighlights?: () => void;
  /**
   * Optional helper rendered directly under the instruction box — e.g. a nudge
   * toward Find & Replace when the notes read as a literal "replace X with Y" ask.
   */
  notesHint?: ReactNode;
  /**
   * An inline status shown under the instruction box when the last submit made
   * NO change to the document (the AI matched nothing to change). The typed
   * instruction is KEPT in the box; this only explains why nothing happened, so
   * the submit is never a silent no-op. Cleared the moment the text changes.
   */
  notesNotice?: string;
  /**
   * Per-document key used to remember the past-inputs log's open/closed state.
   */
  memoryKey?: string;
  /**
   * Past commands applied from this box (newest first), offered so a past
   * directive can be reloaded into the box for tweaking or run in one click.
   */
  recentInstructions?: string[];
  /** Run one remembered command immediately (sends it to the AI as an instruction). */
  onRunRecentInstruction?: (instruction: string) => void;
  /** Forget the remembered commands for this document. */
  onClearRecentInstructions?: () => void;
  /**
   * The "+ Add bullet" affordance for Action 2 ("Add my own content") — real text
   * typed by the user, written into the document verbatim. Provided by the résumé
   * surfaces; omitted when the document has no bullet structure.
   */
  addContentSlot?: ReactNode;
  /**
   * Optional helper shown under "Add my own content" when there's no bullet UI to
   * embed (e.g. a cover letter) — explains how to add real content by hand.
   */
  addContentHint?: string;
  /**
   * Optional one-tap AI actions shown in the header (e.g. "Strengthen whole
   * résumé"). Kept here so a document-wide AI pass has a single obvious home.
   */
  quickActions?: ReactNode;
  /**
   * A dedicated whole-document rewrite that KEEPS the preview-and-accept flow:
   * it runs a full-document improve (via `…/improve-structured`) and shows the
   * result as a diff preview the user reviews before anything is saved. When
   * provided, an "Improve everything" button appears on the panel.
   */
  onImproveEverything?: () => void;
  /** True while the whole-document improve is running — drives the button spinner. */
  improvingEverything?: boolean;
}

/**
 * The unified "change" controls for the résumé / cover-letter editor — exactly
 * TWO clearly-named actions:
 *
 *  - **Ask AI to change it** — a command box. The text travels ONLY as the
 *    improve `instruction`; it is never written into the document as a bullet or
 *    paragraph. Submitting shows a diff preview; accepting it saves a new version.
 *  - **Add my own content** — the paths that DO write into the document:
 *    "+ Add bullet" (verbatim, via `addContentSlot`) and "My Work Highlights"
 *    (`…/incorporate`). Only these add content.
 *
 * The separate "Find & replace" utility lives on its own; there is one name per
 * concept across the editor.
 */
export default function AddPointsPanel({
  notes,
  onNotesChange,
  submitting,
  error,
  onApplyDirect,
  onPreview,
  kindLabel = "document",
  notesInputId,
  embedded = false,
  historyEntries = [],
  onRerunHistory,
  onRerunOneHistory,
  onViewImpactHistory,
  onRemoveHistory,
  onClearHistory,
  onWorkHighlights,
  rerunRoleLabel,
  notesHint,
  notesNotice,
  memoryKey,
  recentInstructions = [],
  onRunRecentInstruction,
  onClearRecentInstructions,
  addContentSlot,
  addContentHint,
  quickActions,
  onImproveEverything,
  improvingEverything = false,
}: AddPointsPanelProps) {
  const notesFieldId = useId();
  const fieldId = notesInputId ?? notesFieldId;
  const notesRef = useRef<HTMLTextAreaElement>(null);
  /**
   * Which of the two action buttons the user pressed — so the spinner appears on
   * the control they actually clicked (the combined `submitting` lock can't tell
   * the two apart on its own). Cleared as soon as the request settles.
   */
  const [running, setRunning] = useState<"preview" | "apply" | null>(null);
  useEffect(() => {
    if (!submitting) setRunning(null);
  }, [submitting]);
  /**
   * Inline validation shown under the box when the user submits with nothing
   * typed. It is kept in place (never a toast) so the instruction they did type
   * is never lost, and the fix (type something) is right where they're looking.
   */
  const [emptyHint, setEmptyHint] = useState("");
  /**
   * Run the targeted apply (or its preview) after validating the box isn't
   * empty. Sending an empty instruction would just 400 server-side, so it is
   * caught here — the text is kept and the reason is shown inline.
   */
  function submitInstruction(action: "preview" | "apply") {
    if (!notes.trim()) {
      setEmptyHint("Enter an instruction.");
      return;
    }
    setEmptyHint("");
    setRunning(action);
    if (action === "preview") onPreview?.();
    else onApplyDirect();
  }
  /**
   * Local phase for the "AI is working" indicator shown over the instruction box:
   * `working` while a request is in flight, then a brief `done` check that fades
   * away on its own, then back to `idle`. A failure skips straight to idle (the
   * error banner already reports it), so "Done" only ever means it succeeded.
   */
  const [aiPhase, setAiPhase] = useState<"idle" | "working" | "done">("idle");
  const wasSubmittingRef = useRef(false);
  // When the "working" phase began, so a demo/instant request can't blink the
  // indicator on and off faster than the eye can register it.
  const workingStartedRef = useRef(0);
  const MIN_WORKING_MS = 700;
  useEffect(() => {
    const justStarted = submitting && !wasSubmittingRef.current;
    const justEnded = !submitting && wasSubmittingRef.current;
    wasSubmittingRef.current = submitting;

    if (justStarted) {
      workingStartedRef.current = Date.now();
      setAiPhase("working");
      return undefined;
    }
    if (justEnded) {
      // A failure skips straight to idle (the error banner already reports it),
      // so "Done" only ever means it genuinely succeeded.
      if (error) {
        setAiPhase("idle");
        return undefined;
      }
      const elapsed = Date.now() - workingStartedRef.current;
      const remaining = Math.max(0, MIN_WORKING_MS - elapsed);
      if (remaining <= 0) {
        setAiPhase("done");
        return undefined;
      }
      const timer = window.setTimeout(() => setAiPhase("done"), remaining);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [submitting, error]);
  useEffect(() => {
    if (aiPhase !== "done") return undefined;
    const timer = window.setTimeout(() => setAiPhase("idle"), 2400);
    return () => window.clearTimeout(timer);
  }, [aiPhase]);
  const showHistory =
    Boolean(onRerunHistory && onRemoveHistory) && historyEntries.length > 0;
  const showAddContent = Boolean(addContentSlot || onWorkHighlights || addContentHint);
  // Inputs that still need attention (everything not yet implemented) — surfaced
  // on the panel header so the user sees at a glance how much is still waiting.
  const waitingCount = historyEntries.filter((e) => e.status !== "implemented").length;

  /**
   * Load a remembered command back into the instruction box so it can be tweaked
   * before running — clicking a recent chip only fills the box, it never sends.
   * (The chip's separate play button is what runs it straight away.)
   */
  function loadRecentInstruction(instruction: string) {
    onNotesChange(instruction);
    requestAnimationFrame(() => {
      const el = notesRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  /**
   * Plain Enter previews the instruction straight away (it goes to the AI
   * backend as a diff preview); Shift + Enter keeps the usual newline.
   */
  function handleNotesKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    // Ignore the Enter that commits an in-progress IME composition.
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (submitting) return;
    submitInstruction(onPreview ? "preview" : "apply");
  }

  const heading = (
    <div className={embedded ? "mb-3" : "px-5 py-4 border-b border-foreground-200"}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2
            className={`${
              embedded ? "text-sm" : "text-lg"
            } font-heading font-medium text-foreground-950 flex items-center gap-2`}
          >
            <i className="ri-magic-line text-primary-600"></i>
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500"></span>
            Ask AI to change it
            {waitingCount > 0 && (
              <span
                title="Inputs still waiting to be implemented"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-900 bg-accent-100 px-2 py-0.5 rounded-full whitespace-nowrap"
              >
                <i className="ri-time-line"></i>
                {waitingCount} waiting
              </span>
            )}
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5 max-w-[52ch]">
            Describe the change in plain words — the AI rewrites what&apos;s already in your{" "}
            {kindLabel}. Your command steers the AI and is never written into the {kindLabel}.
          </p>
        </div>
        {quickActions && <div className="flex items-center gap-2 flex-wrap">{quickActions}</div>}
      </div>
    </div>
  );

  /** Action 1 — the runnable instruction box. */
  const instructionBlock = (
    <div className="rounded-xl border border-primary-300 bg-primary-50/70 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-primary-200/80 bg-primary-100/50">
        <label
          htmlFor={fieldId}
          className="flex items-center gap-2 text-sm font-heading font-medium text-foreground-950 cursor-pointer"
        >
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-primary-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-flashlight-line"></i>
          </span>
          Your instruction
        </label>
        <span className="text-xs text-foreground-500 tabular-nums">{notes.length}/500</span>
      </div>
      <div className="p-3.5 space-y-2.5">
        <div className="relative">
          <textarea
            id={fieldId}
            ref={notesRef}
            value={notes}
            onKeyDown={handleNotesKeyDown}
            onChange={(e) => {
              onNotesChange(e.target.value);
              if (emptyHint) setEmptyHint("");
            }}
            maxLength={500}
            rows={3}
            aria-busy={aiPhase === "working"}
            placeholder="e.g. make my summary punchier, or use present tense for my current role."
            className="w-full px-3 py-2.5 rounded-lg bg-background-50 border border-foreground-200 text-sm text-foreground-900 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-300 resize-y"
          />
          {/* AI status over the command input — working spinner, then a fading "Done". */}
          {aiPhase !== "idle" && (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              {aiPhase === "working" ? (
                <span className="animate-pop inline-flex items-center gap-2 rounded-full bg-primary-600 text-background-50 dark:text-foreground-950 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap">
                  <i className="ri-loader-4-line animate-spin text-sm"></i>
                  Making Improvements
                </span>
              ) : (
                <span className="toast-fade inline-flex items-center gap-2 rounded-full bg-primary-500 text-background-50 dark:text-foreground-950 px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap">
                  <i className="ri-check-line text-sm"></i>
                  Done
                </span>
              )}
            </div>
          )}
        </div>
        {/* In-flight reassurance: shown the moment a submit leaves the box, so a
            slow AI call never looks like a dead button. Sits right under the box. */}
        {submitting && (
          <p
            className="text-xs text-foreground-600 flex items-center gap-1.5"
            role="status"
            aria-live="polite"
          >
            <i className="ri-loader-4-line animate-spin text-primary-600"></i>
            Sent — waiting for the document…
          </p>
        )}
        {emptyHint && (
          <p className="text-xs text-accent-700 flex items-center gap-1.5" role="alert">
            <i className="ri-error-warning-line"></i>
            {emptyHint}
          </p>
        )}
        {notesNotice && (
          <p className="text-xs text-accent-700 flex items-center gap-1.5" role="status">
            <i className="ri-information-line"></i>
            {notesNotice}
          </p>
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-foreground-500 flex items-center gap-1.5">
            <i className="ri-corner-down-left-line"></i>
            Press <span className="font-medium text-foreground-700">Enter</span> to{" "}
            {onPreview ? "preview" : "apply"} ·{" "}
            <span className="font-medium text-foreground-700">Shift + Enter</span> for a new line
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {onPreview && (
              <button
                type="button"
                onClick={() => submitInstruction("preview")}
                disabled={submitting}
                title="Send the instruction and review the changes as a diff before saving"
                className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-primary-500 text-background-50 dark:text-foreground-950 px-4 py-2 rounded-md hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                {submitting && running === "preview" ? (
                  <>
                    <i className="ri-loader-4-line animate-spin"></i>
                    Working…
                  </>
                ) : (
                  <>
                    <i className="ri-eye-line"></i>
                    Preview changes
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => submitInstruction("apply")}
              disabled={submitting}
              title="Apply the change now and save it as a new version — with one-click Undo"
              className={`inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                onPreview
                  ? "bg-background-50 border border-foreground-200 text-foreground-900 hover:bg-background-100 hover:border-foreground-300"
                  : "bg-primary-500 text-background-50 dark:text-foreground-950 hover:bg-primary-600"
              }`}
            >
              {submitting && running === "apply" ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Working…
                </>
              ) : (
                <>
                  <i className="ri-flashlight-line"></i>
                  {onPreview ? "Apply now" : "Apply change"}
                </>
              )}
            </button>
          </div>
        </div>
        {onImproveEverything && (
          <div className="flex items-center justify-between gap-2 flex-wrap pt-2.5 border-t border-primary-200/70">
            <span className="text-[11px] text-foreground-500 flex items-center gap-1.5 min-w-0">
              <i className="ri-sparkling-line flex-shrink-0"></i>
              <span className="min-w-0">{IMPROVE_EVERYTHING_HINT}</span>
            </span>
            <button
              type="button"
              onClick={onImproveEverything}
              disabled={submitting}
              title="Rewrite the whole document in one pass \u2014 review every change before anything is saved"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold bg-background-50 border border-primary-300 text-primary-700 hover:bg-primary-100 hover:border-primary-400 transition-colors px-3.5 py-2 rounded-md disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {improvingEverything ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  Working\u2026
                </>
              ) : (
                <>
                  <i className="ri-magic-line"></i>
                  Improve everything
                </>
              )}
            </button>
          </div>
        )}
        {recentInstructions.length > 0 && onRunRecentInstruction && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-primary-200/70">
            <span className="text-[11px] font-medium text-foreground-500 inline-flex items-center gap-1">
              <i className="ri-history-line"></i>
              Recent
              <span className="text-foreground-400 font-normal hidden sm:inline">
                · click to edit, ▶ to run
              </span>
            </span>
            {recentInstructions.map((ins) => (
              <div
                key={ins}
                className="inline-flex items-center max-w-[260px] rounded-full border border-primary-200 bg-primary-100 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => loadRecentInstruction(ins)}
                  disabled={submitting}
                  title={`Load into the box to tweak: ${ins}`}
                  className="inline-flex items-center gap-1 min-w-0 pl-2 pr-1.5 py-0.5 text-[11px] font-medium text-primary-900 hover:bg-primary-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className="ri-edit-2-line flex-shrink-0"></i>
                  <span className="truncate">{ins}</span>
                </button>
                <span className="w-px self-stretch bg-primary-200" aria-hidden="true"></span>
                <button
                  type="button"
                  onClick={() => onRunRecentInstruction(ins)}
                  disabled={submitting}
                  title={`Run this command now: ${ins}`}
                  aria-label={`Run instruction: ${ins}`}
                  className="inline-flex items-center justify-center w-6 h-5 text-primary-900 hover:bg-primary-500 hover:text-background-50 dark:hover:text-foreground-950 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <i className="ri-play-fill text-[10px]"></i>
                </button>
              </div>
            ))}
            {onClearRecentInstructions && (
              <button
                type="button"
                onClick={onClearRecentInstructions}
                disabled={submitting}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground-400 hover:text-foreground-700 cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <i className="ri-close-line"></i>
                Clear
              </button>
            )}
          </div>
        )}

        {notesHint}
      </div>
    </div>
  );

  /** Action 2 — the paths that actually write content into the document. */
  const addContentBlock = showAddContent ? (
    <div className="rounded-xl border border-accent-200 bg-accent-50/50 overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-accent-200/70 bg-accent-100/50">
        <h3 className="flex items-center gap-2 text-sm font-heading font-medium text-foreground-950">
          <span className="w-6 h-6 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
            <i className="ri-add-line"></i>
          </span>
          Add my own content
        </h3>
        <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
          Real accomplishments, written into your {kindLabel} exactly as you type them. The AI
          only rewrites what&apos;s already there — it never invents new facts.
        </p>
      </div>
      <div className="p-3.5 space-y-3">
        {addContentSlot}
        {onWorkHighlights && (
          <button
            type="button"
            onClick={onWorkHighlights}
            title="Pull real accomplishments from your work email & chat into polished bullets"
            className="group w-full flex items-start gap-3 rounded-xl border border-accent-300 bg-accent-500 text-background-50 dark:text-foreground-950 px-4 py-3 hover:bg-accent-600 transition-colors cursor-pointer text-left"
          >
            <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-background-50/20 flex-shrink-0">
              <i className="ri-sparkling-2-line text-lg"></i>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">My Work Highlights</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-background-50/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <i className="ri-star-line"></i>
                  Recommended
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-background-50/90 dark:text-foreground-950/80 leading-relaxed">
                Pull real accomplishments from your work email &amp; chat into polished bullets.
              </span>
            </span>
            <span className="w-5 h-5 flex items-center justify-center flex-shrink-0 self-center transition-transform group-hover:translate-x-0.5">
              <i className="ri-arrow-right-line"></i>
            </span>
          </button>
        )}
        {addContentHint && (
          <p className="text-xs text-foreground-600 leading-relaxed flex items-start gap-1.5">
            <i className="ri-information-line mt-0.5 flex-shrink-0 text-accent-700"></i>
            <span>{addContentHint}</span>
          </p>
        )}
      </div>
    </div>
  ) : null;

  const fields = (
    <>
      {/* Action 1 — Ask AI to change it. */}
      {instructionBlock}

      {/* Action 2 — Add my own content. */}
      {addContentBlock}

      {error && (
        <div className="rounded-lg bg-accent-50 border border-accent-200 border-l-4 border-l-accent-500 px-3.5 py-3 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <span className="w-7 h-7 flex items-center justify-center rounded-md bg-accent-500 text-background-50 dark:text-foreground-950 flex-shrink-0">
              <i className="ri-error-warning-line"></i>
            </span>
            <p className="min-w-0 flex-1 text-sm text-foreground-800 leading-relaxed">
              {error}
            </p>
          </div>
        </div>
      )}

      {showHistory && (
        <PastInputsPanel
          entries={historyEntries}
          busy={submitting}
          onRerun={onRerunHistory!}
          onRerunOne={onRerunOneHistory}
          onViewImpact={onViewImpactHistory}
          onRemove={onRemoveHistory!}
          onClear={onClearHistory}
          rerunRoleLabel={rerunRoleLabel}
          memoryKey={memoryKey}
        />
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-4">
        {heading}
        {fields}
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-background-100/60 border border-foreground-200 overflow-hidden">
      {heading}
      <div className="p-5 space-y-4">{fields}</div>
    </section>
  );
}