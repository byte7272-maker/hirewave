import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import type { ReplaceTextInput, ReplaceTextResult } from "@/lib/documents";
import {
  applyReplacement,
  countWords,
  replacementLineChanges,
  type ReplacementLineChange,
} from "@/lib/findReplace";
import { readFindReplaceSettings, writeFindReplaceSettings } from "@/lib/findReplaceMemory";

export interface FindReplaceNotice {
  tone: "success" | "info";
  message: string;
}

/**
 * A matched swap held for confirmation. It carries the before/after snapshot
 * (occurrence count + word counts) shown BEFORE the version is saved, plus the
 * already-rendered text that will be persisted once the user confirms.
 */
export interface FindReplacePreview {
  find: string;
  replace: string;
  count: number;
  /** The document text after the swap — applied only on confirm. */
  renderedText: string;
  /** Word count before the swap. */
  beforeWords: number;
  /** Word count after the swap. */
  afterWords: number;
  /** The lines that actually change, so the preview reads as a real diff. */
  lineChanges: ReplacementLineChange[];
}

interface UseFindReplaceArgs {
  /**
   * The literal-replace API for this document type (résumé or cover letter).
   * Keeps the tool document-agnostic so both editors share it.
   */
  replaceFn: (input: ReplaceTextInput) => Promise<ReplaceTextResult>;
  /**
   * The document text exactly as it reads on screen right now. Used only for the
   * offline/preview fallback, so the tool still works without a backend.
   */
  getText: () => string;
  /**
   * Persist the replaced text and re-render the editor from the server's copy.
   * It must throw when the save fails, so the tool can show a retryable error.
   */
  onApply: (renderedText: string) => Promise<void>;
  /**
   * Stable per-document key (e.g. `resume_42`). When set, the Match case and
   * First only toggles are remembered per document, so the tool reopens exactly
   * as the user left it.
   */
  memoryKey?: string;
  /** "résumé" / "cover letter" — used only in the error toast copy. */
  kindLabel?: string;
}

/**
 * Drives the deterministic Find & Replace tool: it calls the dedicated
 * `…/replace` endpoint (never the AI), then holds the swap for confirmation —
 * showing the before/after count — before anything is saved. On confirm it
 * renders the returned text and persists it through the version flow; when
 * nothing matches it reports a clear "no matches" message instead of a silent
 * no-op.
 *
 * All of the tool's transient state (inputs, toggles, spinner, error, pending
 * preview, result notice) lives here so the editors stay lean.
 */
export default function useFindReplace({
  replaceFn,
  getText,
  onApply,
  memoryKey,
  kindLabel = "document",
}: UseFindReplaceArgs) {
  const { reportError } = useChangeFeedback();
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState(() => readFindReplaceSettings(memoryKey ?? "").find);
  const [replace, setReplace] = useState(
    () => readFindReplaceSettings(memoryKey ?? "").replace
  );
  const [matchCase, setMatchCase] = useState(
    () => readFindReplaceSettings(memoryKey ?? "").matchCase
  );
  const [firstOnly, setFirstOnly] = useState(
    () => readFindReplaceSettings(memoryKey ?? "").firstOnly
  );
  /** Which match is currently "focused" while stepping through them. */
  const [activeMatch, setActiveMatch] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<FindReplaceNotice | null>(null);
  /** A matched, not-yet-saved swap awaiting the user's confirmation. */
  const [preview, setPreview] = useState<FindReplacePreview | null>(null);
  /** The last submitted request, so a failed run can be retried verbatim. */
  const [lastRun, setLastRun] = useState<{
    find: string;
    replace: string;
    all: boolean;
    caseSensitive: boolean;
  } | null>(null);

  // Reopen the tool exactly as the user left it for THIS document — the toggles
  // AND the Find / Replace-with text, so a swapped-in query is ready to go.
  useEffect(() => {
    const saved = readFindReplaceSettings(memoryKey ?? "");
    setMatchCase(saved.matchCase);
    setFirstOnly(saved.firstOnly);
    setFind(saved.find ?? "");
    setReplace(saved.replace ?? "");
    setActiveMatch(0);
  }, [memoryKey]);

  // Remember the toggles and the query per document, so a reopened document
  // keeps them (a query routed in from a literal "replace X with Y" survives).
  useEffect(() => {
    if (!memoryKey) return;
    writeFindReplaceSettings(memoryKey, { matchCase, firstOnly, find, replace });
  }, [memoryKey, matchCase, firstOnly, find, replace]);

  // A new query (or case toggle) restarts stepping at the first match.
  useEffect(() => {
    setActiveMatch(0);
  }, [find, matchCase]);

  const run = useCallback(
    async (findText: string, replaceWith: string, all: boolean, caseSensitive: boolean) => {
      if (!findText.trim()) {
        setError("Enter the text to find first.");
        return;
      }
      setReplacing(true);
      setError("");
      setNotice(null);
      setPreview(null);
      try {
        const before = getText();
        const result = __IS_PREVIEW__
          ? applyReplacement(before, findText, replaceWith, all, caseSensitive)
          : await replaceFn({
              find: findText,
              replace: replaceWith,
              all,
              case_sensitive: caseSensitive,
            });
        if (!result.count) {
          // Nothing matched — leave the document untouched and say so clearly.
          setNotice({
            tone: "info",
            message: `No matches for “${findText}”. Nothing was changed.`,
          });
          return;
        }
        // Hold the swap for confirmation — show the before/after count before
        // anything is saved, so the user sees exactly what will change.
        setPreview({
          find: findText,
          replace: replaceWith,
          count: result.count,
          renderedText: result.rendered_text,
          beforeWords: countWords(before),
          afterWords: countWords(result.rendered_text),
          lineChanges: replacementLineChanges(before, result.rendered_text),
        });
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not run Find & Replace. Please try again."
        );
        reportError(err, kindLabel);
      } finally {
        setReplacing(false);
      }
    },
    [getText, replaceFn, reportError, kindLabel]
  );

  const submit = useCallback(() => {
    const payload = { find, replace, all: !firstOnly, caseSensitive: matchCase };
    setLastRun(payload);
    void run(payload.find, payload.replace, payload.all, payload.caseSensitive);
  }, [find, replace, firstOnly, matchCase, run]);

  /** Confirm the previewed swap: render it and persist it as a new version. */
  const confirm = useCallback(async () => {
    if (!preview) return;
    setReplacing(true);
    setError("");
    try {
      await onApply(preview.renderedText);
      setNotice({
        tone: "success",
        message: `Replaced ${preview.count} occurrence${
          preview.count === 1 ? "" : "s"
        } and saved a new version.`,
      });
      setPreview(null);
    } catch (err) {
      // Keep the preview so the user can retry the save from the error banner.
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save the replacement. Please try again."
      );
      reportError(err, kindLabel);
    } finally {
      setReplacing(false);
    }
  }, [preview, onApply, reportError, kindLabel]);

  /** Drop the preview without saving anything — the document is left untouched. */
  const cancelPreview = useCallback(() => setPreview(null), []);

  /** Re-run the last request after a failure (retries the save when one is pending). */
  const retry = useCallback(() => {
    if (preview) {
      void confirm();
      return;
    }
    if (!lastRun) return;
    void run(lastRun.find, lastRun.replace, lastRun.all, lastRun.caseSensitive);
  }, [preview, confirm, lastRun, run]);

  /** Open the tool pre-filled with a detected literal replacement. */
  const openWith = useCallback((nextFind: string, nextReplace: string) => {
    setFind(nextFind);
    setReplace(nextReplace);
    setActiveMatch(0);
    setError("");
    setNotice(null);
    setPreview(null);
    setOpen(true);
  }, []);

  /**
   * Open the tool AND run the swap immediately — used when a free-text
   * instruction is recognised as a literal replacement, so it takes the exact,
   * deterministic path instead of the AI rewrite. Every occurrence is replaced by
   * default; the user still confirms on the match-count preview before anything
   * is saved (and sees the clear "No matches for 'X'." message when it isn't found).
   */
  const runWith = useCallback(
    (findText: string, replaceWith: string) => {
      setFind(findText);
      setReplace(replaceWith);
      setActiveMatch(0);
      setError("");
      setNotice(null);
      setPreview(null);
      setOpen(true);
      const payload = {
        find: findText,
        replace: replaceWith,
        all: true,
        caseSensitive: false,
      };
      setLastRun(payload);
      void run(payload.find, payload.replace, payload.all, payload.caseSensitive);
    },
    [run]
  );

  const clearNotice = useCallback(() => setNotice(null), []);

  /** Step to the next / previous match (wraps around) among `count` matches. */
  const stepMatch = useCallback((delta: number, count: number) => {
    if (count <= 0) {
      setActiveMatch(0);
      return;
    }
    setActiveMatch((current) => (((current + delta) % count) + count) % count);
  }, []);

  return {
    open,
    setOpen,
    find,
    setFind,
    replace,
    setReplace,
    matchCase,
    setMatchCase,
    firstOnly,
    setFirstOnly,
    replacing,
    error,
    notice,
    preview,
    activeMatch,
    setActiveMatch,
    stepMatch,
    canReplace: find.trim().length > 0 && !replacing,
    submit,
    retry,
    confirm,
    cancelPreview,
    openWith,
    runWith,
    clearNotice,
  };
}