import type { CSSProperties, ReactNode } from "react";
import type { FlaggedMetric } from "@/lib/documents";
import { escapeRegExp, flagsForField } from "./metricFlags";

/**
 * Highlighter-pen style for a figure the AI added that isn't in the original
 * résumé. Deliberately a distinct yellow so it can't be mistaken for authored
 * content — this is the safeguard against invented metrics.
 */
const MARK_STYLE: CSSProperties = {
  background: "#fef08a",
  borderBottom: "2px solid #eab308",
  borderRadius: 2,
  padding: "0 2px",
  color: "#713f12",
  fontWeight: 600,
};

/**
 * Render a single résumé field, highlighting any substring that the AI
 * introduced (a flagged metric) at its exact location. When there's nothing
 * flagged for this field the original string is returned unchanged, so this is
 * a no-op in the normal saved preview.
 */
export function renderMetricText(
  text: string | undefined,
  field: string,
  flags?: FlaggedMetric[]
): ReactNode {
  const value = text ?? "";
  if (!value) return value;
  const flagged = flagsForField(flags, field);
  if (flagged.length === 0) return value;

  const pattern = new RegExp(`(${flagged.map(escapeRegExp).join("|")})`, "g");
  const parts = value.split(pattern);
  if (parts.length <= 1) return value;

  return (
    <>
      {parts.map((part, index) =>
        flagged.includes(part) ? (
          <mark key={index} style={MARK_STYLE} title="Added by AI — verify this figure">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
}

export default renderMetricText;