import type { CoverLetterStructured } from "@/lib/coverLetterTemplate";
import type { AccentColor } from "../accent";
import { DEFAULT_ACCENT } from "../accent";
import SectionImprove from "../SectionImprove";
import { PAPER_MIN_HEIGHT } from "../themes/paper";

// Classic — matches the Classic résumé: serif throughout, centered name +
// contact line with a thin accent rule, formal date and recipient block.
const INK = "#000000";
const MUTED = "#4b5563";

export default function CoverLetterClassic({
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
        padding: "56px 62px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
        fontSize: 13,
        lineHeight: 1.75,
      }}
    >
      {data.name && (
        <header style={{ textAlign: "center", marginBottom: 30 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: "0.02em", margin: 0 }}>
            {data.name}
          </h1>
          {data.contact.length > 0 && (
            <p style={{ fontSize: 12, color: MUTED, margin: "10px 0 0" }}>
              {data.contact.join("  ·  ")}
            </p>
          )}
          <div style={{ height: 2, width: 46, background: accent.value, margin: "14px auto 0" }} />
        </header>
      )}

      <div style={{ marginBottom: 24 }}>
        {data.date && (
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>{data.date}</p>
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
          {data.signature && (
            <p style={{ margin: "16px 0 0", fontWeight: 700 }}>{data.signature}</p>
          )}
        </div>
      )}
    </div>
  );
}