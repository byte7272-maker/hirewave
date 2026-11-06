import { useMemo } from "react";
import { detectLiteralReplacement } from "@/lib/findReplace";

interface LiteralReplaceHintProps {
  /** The user's free-text instruction, as typed in the improve / points box. */
  instruction: string;
  /** Route the detected literal replacement into the Find & Replace tool. */
  onUse?: (find: string, replace: string) => void;
}

/**
 * A small, dismissible nudge shown under a free-text instruction box when the
 * text reads as a literal replacement ("replace X with Y" / "change X to Y").
 * The AI rewrite often declines a verbatim swap, so this points the user at the
 * deterministic Find & Replace tool instead — without hijacking stylistic asks.
 *
 * Renders nothing when the instruction isn't a clear literal replacement.
 */
export default function LiteralReplaceHint({
  instruction,
  onUse,
}: LiteralReplaceHintProps) {
  const suggestion = useMemo(
    () => detectLiteralReplacement(instruction),
    [instruction]
  );
  if (!suggestion) return null;
  return (
    <span className="mt-2 flex items-start gap-2 rounded-lg bg-secondary-100 text-secondary-900 px-3 py-2 text-xs leading-relaxed">
      <i className="ri-find-replace-line mt-0.5 flex-shrink-0"></i>
      <span className="min-w-0">
        This reads like an exact replacement. For a guaranteed literal swap, use{" "}
        <span className="font-semibold">Find &amp; replace</span> instead of the AI
        {onUse && (
          <>
            {" — "}
            <button
              type="button"
              onClick={() => onUse(suggestion.find, suggestion.replace)}
              className="font-semibold underline hover:text-foreground-950 cursor-pointer whitespace-nowrap"
            >
              open it pre-filled
            </button>
          </>
        )}
        .
      </span>
    </span>
  );
}