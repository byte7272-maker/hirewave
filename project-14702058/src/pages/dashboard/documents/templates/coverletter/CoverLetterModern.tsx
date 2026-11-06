import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "../accent";
import { DEFAULT_ACCENT } from "../accent";
import SectionImprove from "../SectionImprove";
import { PAPER_MIN_HEIGHT } from "../themes/paper";

// Modern — matches the Modern résumé layout: bold sans name header with an
// accent rule + label, a date/recipient meta block, then the letter body.
const INK = "#111827";
const MUTED = "#6b7280";

export default function CoverLetterModern({
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
        padding: "54px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13.5,
        lineHeight: 1.75,
      }}
    >
      {data.name && (
        <header style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em", margin: 0, color: INK }}>
            {data.name}
          </h1>
          {data.label && (
            <p style={{ fontSize: 13.5, fontWeight: 600, color: accent.value, margin: "6px 0 0" }}>{data.label}</p>
          )}
          <div style={{ height: 3, width: 60, background: accent.value, borderRadius: 2, margin: "13px 0 0" }} />
          {data.contact.length > 0 && (
            <p style={{ fontSize: 12, color: MUTED, margin: "12px 0 0", lineHeight: 1.7 }}>
              {data.contact.join("   ·   ")}
            </p>
          )}
        </header>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 22 }}>
        {data.date && (
          <span style={{ fontSize: 12.5, color: MUTED }}>{data.date}</span>
        )}
        {(data.company || data.role) && (
          <div style={{ marginTop: 6 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: INK }}>
              {data.role || "Hiring Team"}
            </p>
            {data.company && (
              <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>{data.company}</p>
            )}
          </div>
        )}
      </div>

      {data.salutation && (
        <p style={{ margin: "0 0 14px", fontWeight: 600 }}>{data.salutation}</p>
      )}

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
          style={{ marginTop: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the closing paragraph"
            label="Closing"
            onImprove={onImproveSection}
          />
          {data.closing && <p style={{ margin: 0 }}>{data.closing}</p>}
          {data.signature && (
            <p style={{ margin: "14px 0 0", fontWeight: 700, color: INK }}>{data.signature}</p>
          )}
        </div>
      )}
    </div>
  );
}