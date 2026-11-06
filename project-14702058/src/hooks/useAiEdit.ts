import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/base/ToastProvider";
import useChangeFeedback from "@/hooks/useChangeFeedback";
import { changeErrorMessage } from "@/lib/changeFeedback";
import { runAiEdit, type RunAiEditArgs } from "@/lib/directImprove";
import type { CoverLetter, Resume } from "@/lib/documents";

export type AiEditKind = "resume" | "cover-letter";

/** The single message shown when an immediate AI edit matched nothing to change. */
export const AI_EDIT_NO_CHANGE_MESSAGE =
  "No change made — try rephrasing (e.g. name the exact text to change), or use Find & replace.";

/**
 * The inline message a host shows under the instruction box when an edit made NO
 * change to the document. The instruction is kept in the box — this only explains
 * why nothing landed, so a no-op is never a silent "the box just cleared".
 */
export const AI_EDIT_NO_CHANGE_INLINE_MESSAGE =
  "No change was made — try rewording.";

interface UseAiEditArgs {
  kind: AiEditKind;
  docId: string | number;
  /** The document text exactly as it reads on screen right now (unsaved edits included). */
  getContent?: () => string | undefined;
  /** The active version BEFORE the edit — remembered for one-click Undo. */
  getPreviousVersion?: () => string | number | undefined;
  /** Re-render the surface from the updated document (the new source of truth). */
  onApplied?: (updated: Resume | CoverLetter) => void | Promise<void>;
  /** Re-activate a version (the Undo action): POST …/versions/{version}/activate. */
  activateVersion?: (version: string | number) => Promise<void> | void;
  /** Refresh any derived data (structured doc, review) after a change. */
  reload?: () => void | Promise<void>;
  /** Clear the instruction box once the change actually applied. */
  onAppliedClear?: () => void;
  /** Remember the applied command so it can be re-run in one click. */
  rememberInstruction?: (instruction: string) => void;
  /**
   * Tag the freshly-saved version (mark improved + store the applied
   * instruction), and record the inline "N edit → vN" trace. `editCount` is how
   * many edits the change applied (>= 1 when it landed).
   */
  onVersionTagged?: (
    version: string | number,
    instruction: string,
    editCount: number
  ) => void;
  /**
   * Open the deterministic Find & replace tool. When provided, the
   * "no change made" notice offers a one-tap "Open Find & replace" action, so
   * the suggested fallback is a single click away (instead of a dead-end hint).
   */
  onOpenFindReplace?: () => void;
  /**
   * Called when the instruction reached the endpoint but made NO change to the
   * document, so the host can surface an inline notice right under the box (the
   * instruction text is kept). Runs alongside the "no change" toast.
   */
  onNoChange?: (instruction: string) => void;
}

/**
 * The one implementation of the "Ask AI to change it" immediate action:
 *
 *  - sends the instruction to `…/ai-edit` (which makes ONLY the requested change
 *    and saves it as a new active version — no preview, no Apply-all, no Accept);
 *  - remembers the previous active version so the success toast offers one-click
 *    Undo (POST …/versions/{prevVersion}/activate);
 *  - reports "Applied ✓ — Undo", a clear "no change made" notice, or a retryable
 *    error toast — always ending visibly.
 *
 * Shared by every surface that renders the instruction box (both editors via
 * `useStructuredImprove`, and the two template panels), so the behaviour can't
 * drift between them.
 */
export default function useAiEdit({
  kind,
  docId,
  getContent,
  getPreviousVersion,
  onApplied,
  activateVersion,
  reload,
  onAppliedClear,
  rememberInstruction,
  onVersionTagged,
  onOpenFindReplace,
  onNoChange,
}: UseAiEditArgs) {
  const { showToast } = useToast();
  const { reportError } = useChangeFeedback();
  const [running, setRunning] = useState(false);
  // A synchronous gate so a double Enter / fast double-click can't fire twice.
  const busyRef = useRef(false);
  // Hold the latest `run` so the error toast's Retry action can re-invoke it.
  const runRef = useRef<(instruction: string) => void>(() => {});
  const kindLabel = kind === "resume" ? "résumé" : "cover letter";

  const run = useCallback(
    async (instruction: string) => {
      const text = (instruction ?? "").trim();
      if (!text || busyRef.current) return;
      busyRef.current = true;
      setRunning(true);
      const prevVersion = getPreviousVersion?.();
      const args: RunAiEditArgs = {
        kind,
        docId,
        instruction: text,
        content: getContent?.(),
        prevVersion,
      };
      try {
        const { applied, updated, newVersion, editCount } = await runAiEdit(args);
        if (!applied) {
          // The active version didn't move — nothing matched, so say so plainly,
          // and put the suggested fallback (Find & replace) one tap away. Also
          // notify the host so it can show an inline notice under the box (the
          // instruction text is intentionally KEPT — a no-op is never silent).
          onNoChange?.(text);
          showToast(
            AI_EDIT_NO_CHANGE_MESSAGE,
            "info",
            onOpenFindReplace
              ? { label: "Open Find & replace", onUndo: onOpenFindReplace }
              : undefined
          );
          return;
        }
        // Applied and saved as a new active version — tag it for traceability.
        if (newVersion !== undefined && newVersion !== null && newVersion !== "") {
          onVersionTagged?.(newVersion, text, editCount);
        }
        rememberInstruction?.(text);
        onAppliedClear?.();
        await onApplied?.(updated);
        await reload?.();
        const canUndo =
          Boolean(activateVersion) &&
          prevVersion !== undefined &&
          prevVersion !== null &&
          prevVersion !== "";
        showToast(
          "Applied ✓",
          "success",
          canUndo
            ? {
                label: "Undo",
                onUndo: async () => {
                  await activateVersion?.(prevVersion as string | number);
                  await reload?.();
                },
              }
            : undefined
        );
      } catch (err) {
        // A 401 has already been through the API wrapper's refresh-and-retry; if it
        // still fails the session is gone — report it the shared way (→ sign in).
        // Anything else gets a retryable toast that re-runs the same instruction.
        const isAuth = Boolean(
          err && typeof err === "object" && "status" in err && (err as { status?: number }).status === 401
        );
        if (isAuth) {
          reportError(err, kindLabel);
          return;
        }
        showToast(changeErrorMessage(err, kindLabel), "error", {
          label: "Retry",
          onUndo: () => runRef.current(text),
        });
      } finally {
        busyRef.current = false;
        setRunning(false);
      }
    },
    [
      kind,
      docId,
      getContent,
      getPreviousVersion,
      onApplied,
      activateVersion,
      reload,
      onAppliedClear,
      rememberInstruction,
      onVersionTagged,
      onOpenFindReplace,
      onNoChange,
      showToast,
      reportError,
      kindLabel,
    ]
  );

  runRef.current = run;

  return { running, run };
}