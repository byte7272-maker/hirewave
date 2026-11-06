import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "../accent";
import { DEFAULT_ACCENT } from "../accent";
import SectionImprove from "../SectionImprove";
import { PAPER_MIN_HEIGHT } from "../themes/paper";

// Minimal — matches the Minimal résumé: airy, sans-serif, left-aligned, quiet
// accent label, tight but roomy line spacing.
const INK = "#111827";
const MUTED = "#6b7280";

export default function CoverLetterMinimal({
  data,
  accent = DEFAULT_ACCENT,
  onImproveSection,
}: {
  data: CoverLetterStructured;
  accent?: AccentColor;
  onImproveSection?: (instruction: string, label: string) => void;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        padding: "68px 68px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.7,
      }}
    >
      <header style={{ marginBottom: 40 }}>
        {data.name && (
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>
            {data.name}
          </h1>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginTop: 10 }}>
          {data.contact.length > 0 && (
            <span style={{ fontSize: 12, color: MUTED }}>{data.contact.join("   ·   ")}</span>
          )}
          {data.date && <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{data.date}</span>}
        </div>
      </header>

      <p
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: accent.value,
          margin: "0 0 14px",
        }}
      >
        Cover Letter
      </p>

      {(data.company || data.role) && (
        <div style={{ marginBottom: 22 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{data.role || "Hiring Team"}</p>
          {data.company && <p style={{ margin: 0, color: MUTED }}>{data.company}</p>}
        </div>
      )}

      {data.salutation && <p style={{ margin: "0 0 16px" }}>{data.salutation}</p>}

      <div
        className={onImproveSection ? "group" : undefined}
        style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}
      >
        <SectionImprove
          instruction="improve the body paragraphs"
          label="Body"
          onImprove={onImproveSection}
        />
        {data.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0 }}>{p}</p>
        ))}
      </div>

      {(data.closing || data.signature) && (
        <div
          className={onImproveSection ? "group" : undefined}
          style={{ marginTop: 28, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the closing paragraph"
            label="Closing"
            onImprove={onImproveSection}
          />
          {data.closing && <p style={{ margin: 0, color: MUTED }}>{data.closing}</p>}
          {data.signature && (
            <p style={{ margin: "14px 0 0", fontWeight: 600, color: INK }}>{data.signature}</p>
          )}
        </div>
      )}
    </div>
  );
}