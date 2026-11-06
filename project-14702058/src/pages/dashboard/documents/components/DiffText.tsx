import { diffWords } from "@/lib/diffHighlight";

interface DiffTextProps {
  /** The current document text (before the change). */
  current: string;
  /** The proposed text — new words are highlighted. */
  next: string;
  className?: string;
  /**
   * When provided, each highlighted (new) word becomes clickable and calls this
   * with the nearest preceding anchor word plus the added word itself, so the
   * editor can jump/scroll to that spot.
   */
  onJump?: (anchor: string, addedText: string) => void;
}

/**
 * Renders proposed text with words that are new (vs the current text) highlighted,
 * so users can immediately see what a revision inserted. When `onJump` is provided,
 * each new word is clickable and jumps the editor to that location.
 */
export default function DiffText({
  current,
  next,
  className = "",
  onJump,
}: DiffTextProps) {
  const tokens = diffWords(current, next);
  const interactive = typeof onJump === "function";

  // Track the most recent non-added word so an added token knows its context anchor.
  let lastAnchor = "";

  return (
    <div className={className}>
      {tokens.map((t, i) => {
        if (t.added) {
          if (interactive) {
            return (
              <mark
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => onJump?.(lastAnchor, t.text)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onJump?.(lastAnchor, t.text);
                  }
                }}
                title="Jump to this spot in the editor"
                className="bg-accent-200 text-accent-900 rounded-sm px-0.5 cursor-pointer underline decoration-accent-400 decoration-dotted underline-offset-2 hover:bg-accent-300 transition-colors"
              >
                {t.text}
              </mark>
            );
          }
          return (
            <mark key={i} className="bg-accent-200 text-accent-900 rounded-sm px-0.5">
              {t.text}
            </mark>
          );
        }

        if (t.text.trim().length > 0) {
          lastAnchor = t.text;
        }
        return <span key={i}>{t.text}</span>;
      })}
    </div>
  );
}