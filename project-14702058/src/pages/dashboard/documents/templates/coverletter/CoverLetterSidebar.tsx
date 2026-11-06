import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import SectionImprove from "@/pages/dashboard/documents/templates/SectionImprove";
import { PAPER_MIN_HEIGHT } from "@/pages/dashboard/documents/templates/themes/paper";

// Sidebar — pairs with the Sidebar résumé: a tinted identity rail on the left,
// the letter body in a roomy right column with an accent rule under the intro.
const INK = "#111827";
const MUTED = "#6b7280";

export default function CoverLetterSidebar({
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
        display: "flex",
        background: "#ffffff",
        color: INK,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.72,
      }}
    >
      <aside
        style={{
          width: 246,
          flexShrink: 0,
          background: accent.soft,
          padding: "54px 26px",
          boxSizing: "border-box",
          borderRight: `1px solid ${accent.value}33`,
        }}
      >
        {data.name && (
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.01em", margin: 0, color: INK }}>
            {data.name}
          </h1>
        )}
        {data.label && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: accent.dark, margin: "6px 0 0", lineHeight: 1.5 }}>
            {data.label}
          </p>
        )}
        <div style={{ width: 40, height: 3, background: accent.value, borderRadius: 2, margin: "16px 0 20px" }} />
        {data.contact.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: accent.dark,
              }}
            >
              Contact
            </span>
            {data.contact.map((c, i) => (
              <span key={i} style={{ fontSize: 12, color: INK, lineHeight: 1.5, wordBreak: "break-word" }}>
                {c}
              </span>
            ))}
          </div>
        )}
        {data.date && (
          <div>
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: accent.dark,
              }}
            >
              Date
            </span>
            <p style={{ fontSize: 12, color: INK, margin: "4px 0 0" }}>{data.date}</p>
          </div>
        )}
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "54px 48px", boxSizing: "border-box" }}>
        {(data.company || data.role) && (
          <div style={{ marginBottom: 24 }}>
            <p style={{ margin: 0, fontWeight: 700, color: INK }}>{data.role || "Hiring Team"}</p>
            {data.company && <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>{data.company}</p>}
          </div>
        )}

        {data.salutation && <p style={{ margin: "0 0 14px", fontWeight: 600 }}>{data.salutation}</p>}

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
            <p key={i} style={{ margin: 0 }}>{p}</p>
          ))}
        </div>

        {(data.closing || data.signature) && (
          <div
            className={onImproveSection ? "group" : undefined}
            style={{ marginTop: 26, position: "relative" }}
          >
            <SectionImprove
              instruction="improve the closing paragraph"
              label="Closing"
              onImprove={onImproveSection}
            />
            {data.closing && <p style={{ margin: 0 }}>{data.closing}</p>}
            {data.signature && <p style={{ margin: "16px 0 0", fontWeight: 700 }}>{data.signature}</p>}
          </div>
        )}
      </main>
    </div>
  );
}