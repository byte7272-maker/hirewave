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

// Sidebar — two column: a tinted left rail (identity, contact, skills,
// education, languages) beside a roomy main column (profile, experience,
// projects, certifications). The accent tints the rail and the column rules.
const INK = "#111827";
const MUTED = "#6b7280";

interface ImproveConfig {
  instruction: string;
  label: string;
  onImprove: (instruction: string, label: string) => void;
}

function Heading({ title, color }: { title: string; color: string }) {
  return (
    <h3
      style={{
        fontSize: 10.5,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        fontWeight: 700,
        color,
        margin: "0 0 10px",
      }}
    >
      {title}
    </h3>
  );
}

function RailSection({
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
      style={{ marginBottom: 22, position: "relative" }}
    >
      <SectionImprove
        instruction={improve?.instruction ?? ""}
        label={improve?.label ?? title}
        onImprove={improve?.onImprove}
      />
      <Heading title={title} color={accent} />
      {children}
    </section>
  );
}

function MainSection({
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
      <h2
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: INK,
          borderBottom: `2px solid ${accent}`,
          paddingBottom: 5,
          margin: "0 0 12px",
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
    <ul style={{ listStyle: "disc", margin: "6px 0 0", paddingLeft: 17, fontSize: 12.5, lineHeight: 1.6, color: INK }}>
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

export default function TemplateSidebar({
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
        display: "flex",
        background: "#ffffff",
        color: INK,
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <aside
        style={{
          width: 262,
          flexShrink: 0,
          background: accent.soft,
          padding: "50px 26px",
          boxSizing: "border-box",
          borderRight: `1px solid ${accent.value}33`,
        }}
      >
        <header style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em", margin: 0, color: INK }}>
            {resumeName(resume)}
          </h1>
          {b.label && (
            <p style={{ fontSize: 12.5, fontWeight: 600, color: accent.dark, margin: "6px 0 0", lineHeight: 1.5 }}>
              {b.label}
            </p>
          )}
        </header>

        <RailSection title="Contact" accent={accent.dark}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {contactLine.length === 0 && (
              <span style={{ fontSize: 12, color: MUTED }}>—</span>
            )}
            {contactLine.map((c, i) => (
              <span key={i} style={{ fontSize: 12, color: INK, lineHeight: 1.5, wordBreak: "break-word" }}>
                {c}
              </span>
            ))}
          </div>
        </RailSection>

        {(resume.skills ?? []).length > 0 && (
          <RailSection
            title="Skills"
            accent={accent.dark}
            improve={improve("improve the skills section", "Skills")}
          >
            {skillsLayout === "bullets" ? (
              <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 15, fontSize: 11.5, color: INK, lineHeight: 1.6 }}>
                {skillsToItems(resume.skills).map((item, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>{item}</li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 11.5, color: INK, lineHeight: 1.6, margin: 0, wordBreak: "break-word" }}>
                {skillsInlineText(resume.skills)}
              </p>
            )}
          </RailSection>
        )}

        {(resume.education ?? []).length > 0 && (
          <RailSection
            title="Education"
            accent={accent.dark}
            improve={improve("improve the education section", "Education")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {(resume.education ?? []).map((e, i) => (
                <div key={i}>
                  <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: INK, lineHeight: 1.45 }}>
                    {[e.studyType, e.area].filter(Boolean).join(", ")}
                  </p>
                  {e.institution && (
                    <p style={{ fontSize: 11.5, color: MUTED, margin: "2px 0 0" }}>{e.institution}</p>
                  )}
                  {(e.startDate || e.endDate) && (
                    <p style={{ fontSize: 11, color: MUTED, margin: "2px 0 0" }}>
                      {formatRange(e.startDate, e.endDate)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </RailSection>
        )}

        {(resume.languages ?? []).length > 0 && (
          <RailSection title="Languages" accent={accent.dark}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {(resume.languages ?? []).map((l, i) => (
                <p key={i} style={{ fontSize: 12, margin: 0, color: INK }}>
                  <span style={{ fontWeight: 600 }}>{l.language}</span>
                  {l.fluency ? <span style={{ color: MUTED }}> — {l.fluency}</span> : null}
                </p>
              ))}
            </div>
          </RailSection>
        )}

        {(resume.certificates ?? []).length > 0 && (
          <RailSection title="Certifications" accent={accent.dark}>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {(resume.certificates ?? []).map((c, i) => (
                <div key={i}>
                  <p style={{ fontSize: 12, margin: 0, color: INK, fontWeight: 600 }}>{c.name}</p>
                  {(c.issuer || c.date) && (
                    <p style={{ fontSize: 11, color: MUTED, margin: "1px 0 0" }}>
                      {[c.issuer, c.date].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
              {renderCertificateActions?.()}
            </div>
          </RailSection>
        )}
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: "50px 44px", boxSizing: "border-box" }}>
        {b.summary && (
          <MainSection
            title="Profile"
            accent={accent.value}
            improve={improve("improve the summary", "Summary")}
          >
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: INK }}>
              {renderMetricText(b.summary, "basics.summary", flags)}
            </p>
          </MainSection>
        )}

        {(resume.work ?? []).length > 0 && (
          <MainSection
            title="Experience"
            accent={accent.value}
            improve={improve("improve the experience section", "Experience")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {(resume.work ?? []).map((w, i) => (
                <div key={i}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: INK }}>
                    {w.position}
                  </p>
                  <p style={{ fontSize: 12, color: accent.dark, fontWeight: 600, margin: "2px 0 0" }}>
                    {w.name}
                    {w.name && (w.startDate || w.endDate) ? " · " : ""}
                    {w.startDate || w.endDate ? formatRange(w.startDate, w.endDate) : ""}
                  </p>
                  {w.summary && (
                    <p style={{ fontSize: 12.5, lineHeight: 1.6, color: MUTED, margin: "5px 0 0" }}>
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
          </MainSection>
        )}

        {(resume.projects ?? []).length > 0 && (
          <MainSection
            title="Projects"
            accent={accent.value}
            improve={improve("improve the projects section", "Projects")}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(resume.projects ?? []).map((p, i) => (
                <div key={i}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>
                    {p.name}
                    {p.url ? <span style={{ fontWeight: 400, color: MUTED }}> · {p.url}</span> : null}
                  </p>
                  {p.description && (
                    <p style={{ fontSize: 12.5, lineHeight: 1.6, color: INK, margin: "4px 0 0" }}>
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
          </MainSection>
        )}

        {(resume.awards ?? []).length > 0 && (
          <MainSection title="Awards" accent={accent.value}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(resume.awards ?? []).map((a, i) => (
                <p key={i} style={{ fontSize: 12.5, margin: 0, color: INK }}>
                  <span style={{ fontWeight: 600 }}>{a.title}</span>
                  {a.awarder ? ` · ${a.awarder}` : ""}
                  {a.date ? ` · ${a.date}` : ""}
                </p>
              ))}
            </div>
          </MainSection>
        )}
      </main>
    </div>
  );
}