import { useMemo } from "react";
import { splitSentences, toPlainSpeech } from "@/lib/narration";
import GlossaryText from "./GlossaryText";
import { useNarration } from "./NarrationProvider";

/**
 * Renders pre-split sentences and highlights the one at `activeIndex` with the
 * shared karaoke treatment (accent background). Glossary tooltips stay intact.
 * Used by the read-aloud summaries and the practice Study model answer so both
 * read and highlight identically.
 */
export function KaraokeSentences({
  sentences,
  activeIndex,
  className = "",
}: {
  sentences: string[];
  activeIndex: number;
  className?: string;
}) {
  return (
    <span className={className}>
      {sentences.map((sentence, index) => {
        const active = index === activeIndex;
        return (
          <span key={index}>
            <span
              className={`rounded transition-colors duration-200 ${
                active ? "bg-accent-100 text-accent-900" : "bg-transparent"
              }`}
            >
              <GlossaryText text={sentence} />
            </span>
            {index < sentences.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
}

interface NarrationTextProps {
  /** Must match the id of the ReadAloudControl reading this text. */
  id: string;
  /** The summary text (markdown/HTML ok — it's normalized before rendering). */
  text?: string | null;
  className?: string;
}

/**
 * Renders a summary split into sentences and highlights the one currently being
 * read aloud (karaoke-style). Falls back to plain prose when nothing is playing,
 * and keeps glossary term tooltips intact.
 */
export default function NarrationText({ id, text, className = "" }: NarrationTextProps) {
  const { activeId, spokenIndex } = useNarration();
  const plain = useMemo(() => toPlainSpeech(text ?? ""), [text]);
  const sentences = useMemo(() => splitSentences(plain), [plain]);

  if (!plain) return null;

  return (
    <KaraokeSentences
      sentences={sentences}
      activeIndex={activeId === id ? spokenIndex : -1}
      className={className}
    />
  );
}