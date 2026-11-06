import type { ReactNode } from "react";
import type { JsonResume } from "@/lib/jsonResume";
import { formatRange, resumeName } from "@/lib/jsonResume";
import type { FlaggedMetric } from "@/lib/documents";
import type { AccentColor } from "../accent";
import { DEFAULT_ACCENT } from "../accent";
import { renderMetricText } from "../metricText";
import { skillsInlineText, skillsToItems } from "../skillsList";
import type { BulletGroup, RenderBullet } from "../bulletRender";
import type { SkillsLayout } from "@/lib/skillsLayoutMemory";
import SectionImprove from "../SectionImprove";
import { PAPER_MIN_HEIGHT } from "./paper";

// Classic — traditional serif, centered name + contact line, horizontal-rule
// section dividers, two-line-per-entry work/education, comma-joined skills.
const INK = "#000000";
const MUTED = "#4b5563";

function Heading({ children, accent }: { children: string; accent: string }) {
  return (
    <h2
      style={{
        fontSize: 12,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        fontWeight: 700,
        color: INK,
        borderBottom: `1px solid ${accent}`,
        paddingBottom: 5,
        margin: "0 0 12px",
      }}
    >
      {children}
    </h2>
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
        <li key={i} style={{ marginBottom: 2 }}>
          {renderBullet
            ? renderBullet({ group, ownerIndex, bulletIndex: i, text: item, fieldPrefix: `${fieldPrefix}[${i}]`, flags })
            : renderMetricText(item, `${fieldPrefix}[${i}]`, flags)}
        </li>
      ))}
    </ul>
  );
}

export default function TemplateClassic({
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
  const loc = b.location ?? {};
  const location = [loc.city, loc.region].filter(Boolean).join(", ");
  const contact = [
    b.email,
    b.phone,
    location,
    ...(b.profiles ?? []).map((p) => p.username || p.url || p.network || ""),
  ].filter((v): v is string => Boolean(v && v.trim()));

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "Georgia, 'Times New Roman', serif",
        padding: "56px 62px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "0.02em", margin: 0, color: INK }}>
          {resumeName(resume)}
        </h1>
        {b.label && (
          <p style={{ fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: "8px 0 0" }}>
            {b.label}
          </p>
        )}
        {contact.length > 0 && (
          <p style={{ fontSize: 12.5, color: MUTED, margin: "10px 0 0" }}>{contact.join("  ·  ")}</p>
        )}
        <div style={{ height: 2, width: 46, background: accent.value, margin: "14px auto 0" }} />
      </header>

      {b.summary && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the summary"
            label="Summary"
            onImprove={onImproveSection}
          />
          <Heading accent={accent.value}>Summary</Heading>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: INK, margin: 0 }}>
            {renderMetricText(b.summary, "basics.summary", flags)}
          </p>
        </section>
      )}

      {(resume.work ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the experience section"
            label="Experience"
            onImprove={onImproveSection}
          />
          <Heading accent={accent.value}>Experience</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {(resume.work ?? []).map((w, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: INK }}>
                    {w.position}
                    {w.position && w.name ? " — " : ""}
                    {w.name}
                  </h3>
                  <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                    {formatRange(w.startDate, w.endDate)}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.65, color: MUTED, margin: "4px 0 0" }}>
                  {renderMetricText(w.summary, `work[${i}].summary`, flags)}
                </p>
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
        </section>
      )}

      {(resume.education ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the education section"
            label="Education"
            onImprove={onImproveSection}
          />
          <Heading accent={accent.value}>Education</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(resume.education ?? []).map((e, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>
                    {[e.studyType, e.area].filter(Boolean).join(", ")}
                  </h3>
                  <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>
                    {formatRange(e.startDate, e.endDate)}
                  </span>
                </div>
                <p style={{ fontSize: 12.5, color: MUTED, margin: "3px 0 0" }}>
                  {e.institution}
                  {e.score ? ` · ${e.score}` : ""}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {(resume.skills ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the skills section"
            label="Skills"
            onImprove={onImproveSection}
          />
          <Heading accent={accent.value}>Skills</Heading>
          {skillsLayout === "bullets" ? (
            <ul style={{ listStyle: "disc", margin: "6px 0 0", paddingLeft: 17, fontSize: 12.5, lineHeight: 1.6, color: INK }}>
              {skillsToItems(resume.skills).map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: INK, margin: 0 }}>
              {skillsInlineText(resume.skills)}
            </p>
          )}
        </section>
      )}

      {(resume.projects ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 24, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the projects section"
            label="Projects"
            onImprove={onImproveSection}
          />
          <Heading accent={accent.value}>Projects</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(resume.projects ?? []).map((p, i) => (
              <div key={i}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>{p.name}</h3>
                {p.description && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.65, color: INK, margin: "4px 0 0" }}>
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
        </section>
      )}

      {((resume.certificates ?? []).length > 0 || (resume.languages ?? []).length > 0) && (
        <section>
          <Heading accent={accent.value}>Certifications & Languages</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(resume.certificates ?? []).map((c, i) => (
              <p key={`c-${i}`} style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, color: INK }}>
                <span style={{ fontWeight: 700 }}>{c.name}</span>
                {c.issuer ? `, ${c.issuer}` : ""}
                {c.date ? ` · ${c.date}` : ""}
              </p>
            ))}
            {renderCertificateActions?.()}
            {(resume.languages ?? []).map((l, i) => (
              <p key={`l-${i}`} style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0, color: INK }}>
                <span style={{ fontWeight: 700 }}>{l.language}</span>
                {l.fluency ? ` — ${l.fluency}` : ""}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}