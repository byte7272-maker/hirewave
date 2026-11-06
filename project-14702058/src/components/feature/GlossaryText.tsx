import { useMemo, type ReactNode } from "react";
import { findGlossaryMatches } from "@/lib/glossary";
import TermTooltip from "./TermTooltip";

interface GlossaryTextProps {
  /** The prose to render — any known technical terms become hoverable links. */
  text: string;
  className?: string;
  /** Set false when rendered inside another interactive element (e.g. a chip button). */
  interactive?: boolean;
}

/**
 * Renders a string with every known résumé/ATS jargon term wrapped in a
 * hoverable term link. Plain text is left untouched.
 */
export default function GlossaryText({
  text,
  className,
  interactive = true,
}: GlossaryTextProps) {
  const matches = useMemo(() => findGlossaryMatches(text ?? ""), [text]);

  if (!text || matches.length === 0) {
    return className ? <span className={className}>{text}</span> : <>{text}</>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    if (match.start > cursor) {
      nodes.push(<span key={`plain-${index}`}>{text.slice(cursor, match.start)}</span>);
    }
    nodes.push(
      <TermTooltip
        key={`term-${index}`}
        entry={match.entry}
        label={text.slice(match.start, match.end)}
        interactive={interactive}
      />
    );
    cursor = match.end;
  });

  if (cursor < text.length) {
    nodes.push(<span key="plain-tail">{text.slice(cursor)}</span>);
  }

  return className ? <span className={className}>{nodes}</span> : <>{nodes}</>;
}