import type { ReactNode } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import { contactDetails, formatRange, resumeName } from "@/lib/jsonResume";
import type { FlaggedMetric } from "@/lib/documents";
import type { AccentColor } from "@/pages/dashboard/documents/templates/accent";
import { DEFAULT_ACCENT } from "@/pages/dashboard/documents/templates/accent";
import { renderMetricText } from "@/pages/dashboard/documents/templates/metricText";
import { skillsInlineText, skillsToItems } from "@/pages/dashboard/documents/templates/skillsList";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import type { BulletGroup, RenderBullet } from "@/pages/dashboard/documents/templates/bulletRender";
import SectionImprove from "@/pages/dashboard/documents/templates/SectionImprove";
import { PAPER_MIN_HEIGHT } from "@/pages/dashboard/documents/templates/themes/paper";

// Elegant — a refined serif piece: a letterspaced name, an italic title line, a
// hairline rule with a small accent diamond, and centered small-caps section
// headings flanked by rules. Quieter and more formal than Classic.
const INK = "#1a1a1a";
const MUTED = "#6b6357";

interface ImproveConfig {
  instruction: string;
  label: string;
  onImprove: (instruction: string, label: string) => void;
}

function OrnamentHeading({ title, accent }: { title: string; accent: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: "0 0 14px",
        borderTop: `1px solid ${accent}44`,
        paddingTop: 14,
      }}
    >
      <span style={{ flex: 1, height: 1, background: `${accent}44` }} />
      <span
        style={{
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: accent,
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <span style={{ flex: 1, height: 1, background: `${accent}44` }} />
    </div>
  );
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
      style={{ marginBottom: 24, position: "relative" }}
    >
      <SectionImprove
        instruction={improve?.instruction ?? ""}
        label={improve?.label ?? title}
        onImprove={improve?.onImprove}
      />
      <OrnamentHeading title={title} accent={accent} />
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
    <ul style={{ listStyle: "disc", margin: "6px 0 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: INK }}>
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

export default function TemplateElegant({
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
  const contact = contactDetails(resume);

  const improve = (instruction: string, label: string): ImproveConfig | undefined =>
    onImproveSection ? { instruction, label, onImprove: onImproveSection } : undefined;

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: "60px 64px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 30 }}>
        <h1
          style={{
            fontSize: 27,
            fontWeight: 400,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            margin: 0,
            color: INK,
          }}
        >
          {resumeName(resume)}
        </h1>
        {b.label && (
          <p style={{ fontSize: 13.5, fontStyle: "italic", color: accent.value, margin: "10px 0 0" }}>
            {b.label}
          </p>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, margin: "16px 0 0" }}>
          <span style={{ width: 54, height: 1, background: `${accent.value}66` }} />
          <span style={{ width: 6, height: 6, transform: "rotate(45deg)", background: accent.value }} />
          <span style={{ width: 54, height: 1, background: `${accent.value}66` }} />
        </div>
        {contact.length > 0 && (
          <p style={{ fontSize: 12, color: MUTED, margin: "14px 0 0", letterSpacing: "0.02em" }}>
            {contact.join("  ·  ")}
          </p>
        )}
      </header>

      {b.summary && (
        <Section title="Profile" accent={accent.value} improve={improve("improve the summary", "Summary")}>
          <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: INK, textAlign: "justify" }}>
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
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: INK }}>
                    {w.position}
                    {w.position && w.name ? " — " : ""}
                    {w.name}
                  </p>
                  <p style={{ fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, margin: "3px 0 0" }}>
                    {formatRange(w.startDate, w.endDate)}
                  </p>
                </div>
                {w.summary && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.75, color: INK, margin: "8px 0 0", textAlign: "justify" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(resume.education ?? []).map((e, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>
                  {[e.studyType, e.area].filter(Boolean).join(", ")}
                </p>
                <p style={{ fontSize: 12, color: MUTED, margin: "3px 0 0" }}>
                  {e.institution}
                  {e.score ? ` · ${e.score}` : ""}
                  {e.startDate || e.endDate ? ` · ${formatRange(e.startDate, e.endDate)}` : ""}
                </p>
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
            <ul style={{ listStyle: "disc", margin: "4px auto 0", paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: INK, display: "inline-block", textAlign: "left" }}>
              {skillsToItems(resume.skills).map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0, color: INK, textAlign: "center" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(resume.projects ?? []).map((p, i) => (
              <div key={i}>
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK, textAlign: "center" }}>
                  {p.name}
                </p>
                {p.description && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.7, color: INK, margin: "5px 0 0", textAlign: "justify" }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "center" }}>
            {(resume.certificates ?? []).map((c, i) => (
              <p key={`c-${i}`} style={{ fontSize: 12.5, margin: 0, color: INK }}>
                <span style={{ fontWeight: 700 }}>{c.name}</span>
                {c.issuer ? ` — ${c.issuer}` : ""}
                {c.date ? ` · ${c.date}` : ""}
              </p>
            ))}
            {renderCertificateActions?.()}
            {(resume.languages ?? []).map((l, i) => (
              <p key={`l-${i}`} style={{ fontSize: 12.5, margin: 0, color: INK }}>
                <span style={{ fontWeight: 700 }}>{l.language}</span>
                {l.fluency ? ` — ${l.fluency}` : ""}
              </p>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}