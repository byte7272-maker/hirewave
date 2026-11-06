import type { ReactNode } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import { contactDetails, formatRange, resumeName } from "@/lib/jsonResume";
import type { FlaggedMetric } from "@/lib/documents";
import type { AccentColor } from "../accent";
import { DEFAULT_ACCENT } from "../accent";
import { renderMetricText } from "../metricText";
import { skillsInlineText, skillsToItems } from "../skillsList";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import type { BulletGroup, RenderBullet } from "../bulletRender";
import SectionImprove from "../SectionImprove";
import { PAPER_MIN_HEIGHT } from "./paper";

// Modern — single column: bold name + label header with a colored accent rule,
// uppercase small-caps section headers with an underline, inline skill pills.
const INK = "#111827";
const MUTED = "#6b7280";

interface ImproveConfig {
  instruction: string;
  label: string;
  onImprove: (instruction: string, label: string) => void;
}

function Section({
  title,
  accent,
  improve,
  children,
}: {
  title: string;
  accent: string;
  improve?: ImproveConfig;
  children: ReactNode;
}) {
  return (
    <section
      className={improve ? "group" : undefined}
      style={{ marginBottom: 26, position: "relative" }}
    >
      <SectionImprove
        instruction={improve?.instruction ?? ""}
        label={improve?.label ?? title}
        onImprove={improve?.onImprove}
      />
      <h2
        style={{
          fontSize: 12,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          fontVariant: "small-caps",
          fontWeight: 700,
          color: INK,
          borderBottom: `2px solid ${accent}`,
          paddingBottom: 6,
          margin: "0 0 14px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Bullets({
  items,
  fieldPrefix,
  flags,
  group,
  ownerIndex,
  renderBullet,
}: {
  items: string[];
  fieldPrefix: string;
  flags?: FlaggedMetric[];
  group: BulletGroup;
  ownerIndex: number;
  renderBullet?: RenderBullet;
}) {
  if (items.length === 0) return null;
  return (
    <ul style={{ listStyle: "disc", margin: "7px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: INK }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 3 }}>
          {renderBullet
            ? renderBullet({ group, ownerIndex, bulletIndex: i, text: item, fieldPrefix: `${fieldPrefix}[${i}]`, flags })
            : renderMetricText(item, `${fieldPrefix}[${i}]`, flags)}
        </li>
      ))}
    </ul>
  );
}

export default function TemplateModern({
  resume,
  accent = DEFAULT_ACCENT,
  flags,
  onImproveSection,
  renderRoleActions,
  renderProjectActions,
  renderCertificateActions,
  renderBullet,
  skillsLayout = "comma",
}: {
  resume: JsonResume;
  accent?: AccentColor;
  flags?: FlaggedMetric[];
  onImproveSection?: (instruction: string, label: string) => void;
  renderRoleActions?: (workIndex: number) => ReactNode;
  renderProjectActions?: (projectIndex: number) => ReactNode;
  renderCertificateActions?: () => ReactNode;
  renderBullet?: RenderBullet;
  skillsLayout?: SkillsLayout;
}) {
  const b = resume.basics ?? {};
  const contacts = contactDetails(resume);
  const profiles = (b.profiles ?? [])
    .map((p) => [p.network, p.username || p.url].filter(Boolean).join(": "))
    .filter(Boolean);
  const contactLine = [...contacts, ...profiles];

  const improve = (instruction: string, label: string): ImproveConfig | undefined =>
    onImproveSection ? { instruction, label, onImprove: onImproveSection } : undefined;

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        padding: "54px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.01em", margin: 0, color: INK }}>
          {resumeName(resume)}
        </h1>
        {b.label && (
          <p style={{ fontSize: 14, fontWeight: 600, color: accent.value, margin: "6px 0 0" }}>{b.label}</p>
        )}
        <div style={{ height: 3, width: 64, background: accent.value, borderRadius: 2, margin: "14px 0 0" }} />
        {contactLine.length > 0 && (
          <p style={{ fontSize: 12.5, color: MUTED, margin: "13px 0 0", lineHeight: 1.7 }}>
            {contactLine.join("   ·   ")}
          </p>
        )}
      </header>

      {b.summary && (
        <Section title="Profile" accent={accent.value} improve={improve("improve the summary", "Summary")}>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: INK }}>
            {renderMetricText(b.summary, "basics.summary", flags)}
          </p>
        </Section>
      )}

      {(resume.work ?? []).length > 0 && (
        <Section
          title="Experience"
          accent={accent.value}
          improve={improve("improve the experience section", "Experience")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {(resume.work ?? []).map((w, i) => (
              <div key={i}>
                <p style={{ fontSize: 13.5, margin: 0, color: INK }}>
                  <span style={{ fontWeight: 700 }}>{w.position}</span>
                  {w.position && (w.name || w.startDate || w.endDate) ? " · " : ""}
                  {w.name}
                  {w.startDate || w.endDate ? ` · ${formatRange(w.startDate, w.endDate)}` : ""}
                </p>
                {w.summary && (
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: MUTED, margin: "5px 0 0" }}>
                    {renderMetricText(w.summary, `work[${i}].summary`, flags)}
                  </p>
                )}
                <Bullets
                  items={w.highlights ?? []}
                  fieldPrefix={`work[${i}].highlights`}
                  flags={flags}
                  group="work"
                  ownerIndex={i}
                  renderBullet={renderBullet}
                />
                {renderRoleActions?.(i)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(resume.education ?? []).length > 0 && (
        <Section
          title="Education"
          accent={accent.value}
          improve={improve("improve the education section", "Education")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(resume.education ?? []).map((e, i) => (
              <div key={i}>
                <p style={{ fontSize: 13.5, margin: 0, color: INK }}>
                  <span style={{ fontWeight: 700 }}>
                    {[e.studyType, e.area].filter(Boolean).join(", ")}
                  </span>
                  {e.institution ? ` · ${e.institution}` : ""}
                  {e.startDate || e.endDate ? ` · ${formatRange(e.startDate, e.endDate)}` : ""}
                </p>
                {e.score && (
                  <p style={{ fontSize: 12.5, color: MUTED, margin: "3px 0 0" }}>{e.score}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {(resume.skills ?? []).length > 0 && (
        <Section
          title="Skills"
          accent={accent.value}
          improve={improve("improve the skills section", "Skills")}
        >
          {skillsLayout === "bullets" ? (
            <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: INK }}>
              {skillsToItems(resume.skills).map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: INK }}>
              {skillsInlineText(resume.skills)}
            </p>
          )}
        </Section>
      )}

      {(resume.projects ?? []).length > 0 && (
        <Section
          title="Projects"
          accent={accent.value}
          improve={improve("improve the projects section", "Projects")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(resume.projects ?? []).map((p, i) => (
              <div key={i}>
                <p style={{ fontSize: 13.5, margin: 0, color: INK }}>
                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                  {p.url ? ` · ${p.url}` : ""}
                </p>
                {p.description && (
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: INK, margin: "4px 0 0" }}>
                    {renderMetricText(p.description, `projects[${i}].description`, flags)}
                  </p>
                )}
                <Bullets
                  items={p.highlights ?? []}
                  fieldPrefix={`projects[${i}].highlights`}
                  flags={flags}
                  group="projects"
                  ownerIndex={i}
                  renderBullet={renderBullet}
                />
                {renderProjectActions?.(i)}
              </div>
            ))}
          </div>
        </Section>
      )}

      {((resume.certificates ?? []).length > 0 || (resume.languages ?? []).length > 0) && (
        <Section title="Certifications & Languages" accent={accent.value}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(resume.certificates ?? []).map((c, i) => (
              <p key={`c-${i}`} style={{ fontSize: 13, margin: 0, color: INK }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.issuer ? ` · ${c.issuer}` : ""}
                {c.date ? ` · ${c.date}` : ""}
              </p>
            ))}
            {renderCertificateActions?.()}
            {(resume.languages ?? []).map((l, i) => (
              <p key={`l-${i}`} style={{ fontSize: 13, margin: 0, color: INK }}>
                <span style={{ fontWeight: 600 }}>{l.language}</span>
                {l.fluency ? ` · ${l.fluency}` : ""}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}