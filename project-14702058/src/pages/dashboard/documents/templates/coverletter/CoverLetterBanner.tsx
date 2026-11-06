import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import SectionImprove from "@/pages/dashboard/documents/templates/SectionImprove";
import { PAPER_MIN_HEIGHT } from "@/pages/dashboard/documents/templates/themes/paper";

// Banner — a full-bleed accent band carries the identity block across the top
// of the page, with the letter body sitting clean and open beneath it.
const INK = "#111827";
const MUTED = "#6b7280";

export default function CoverLetterBanner({
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
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.75,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          background: accent.dark,
          color: "#ffffff",
          padding: "42px 56px",
          boxSizing: "border-box",
        }}
      >
        {data.name && (
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em", margin: 0 }}>
            {data.name}
          </h1>
        )}
        {data.label && (
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "#ffffffd9", margin: "6px 0 0" }}>
            {data.label}
          </p>
        )}
        {data.contact.length > 0 && (
          <p style={{ fontSize: 12, color: "#ffffffcc", margin: "14px 0 0", lineHeight: 1.7 }}>
            {data.contact.join("   ·   ")}
          </p>
        )}
      </header>

      <main style={{ flex: 1, padding: "44px 56px", boxSizing: "border-box" }}>
        {(data.company || data.role || data.date) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 26,
              paddingBottom: 18,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: INK }}>{data.role || "Hiring Team"}</p>
              {data.company && (
                <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>{data.company}</p>
              )}
            </div>
            {data.date && (
              <span style={{ fontSize: 12.5, color: MUTED, whiteSpace: "nowrap" }}>{data.date}</span>
            )}
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