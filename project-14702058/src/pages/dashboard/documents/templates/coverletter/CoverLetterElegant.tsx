import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import SectionImprove from "@/pages/dashboard/documents/templates/SectionImprove";
import { PAPER_MIN_HEIGHT } from "@/pages/dashboard/documents/templates/themes/paper";

// Elegant — pairs with the Elegant résumé: a letterspaced serif name centered
// over a hairline rule with a small accent diamond, justified body text.
const INK = "#1a1a1a";
const MUTED = "#6b6357";

export default function CoverLetterElegant({
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
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: "60px 64px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.8,
      }}
    >
      {data.name && (
        <header style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 25,
              fontWeight: 400,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              margin: 0,
              color: INK,
            }}
          >
            {data.name}
          </h1>
          {data.label && (
            <p style={{ fontSize: 13, fontStyle: "italic", color: accent.value, margin: "9px 0 0" }}>
              {data.label}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "16px 0 0" }}>
            <span style={{ width: 54, height: 1, background: `${accent.value}66` }} />
            <span style={{ width: 6, height: 6, transform: "rotate(45deg)", background: accent.value }} />
            <span style={{ width: 54, height: 1, background: `${accent.value}66` }} />
          </div>
          {data.contact.length > 0 && (
            <p style={{ fontSize: 11.5, color: MUTED, margin: "14px 0 0", letterSpacing: "0.02em" }}>
              {data.contact.join("  ·  ")}
            </p>
          )}
        </header>
      )}

      <div style={{ marginBottom: 24 }}>
        {data.date && (
          <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED }}>
            {data.date}
          </p>
        )}
        {(data.company || data.role) && (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>{data.role || "Hiring Team"}</p>
            {data.company && <p style={{ margin: 0, color: MUTED }}>{data.company}</p>}
          </div>
        )}
      </div>

      {data.salutation && <p style={{ margin: "0 0 14px" }}>{data.salutation}</p>}

      <div
        className={onImproveSection ? "group" : undefined}
        style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative" }}
      >
        <SectionImprove
          instruction="improve the body paragraphs"
          label="Body"
          onImprove={onImproveSection}
        />
        {data.paragraphs.map((p, i) => (
          <p key={i} style={{ margin: 0, textAlign: "justify" }}>{p}</p>
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
          {data.closing && <p style={{ margin: 0 }}>{data.closing}</p>}
          {data.signature && (
            <p style={{ margin: "18px 0 0", fontWeight: 700, letterSpacing: "0.04em" }}>{data.signature}</p>
          )}
        </div>
      )}
    </div>
  );
}