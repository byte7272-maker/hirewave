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

// Minimal — lots of whitespace, sans-serif, left-aligned, thin gray section
// labels, tight line spacing, skills as a simple wrapped list.
const INK = "#111827";
const MUTED = "#6b7280";
const RULE = "#f1f1f1";

function Label({ children, accent }: { children: string; accent: string }) {
  return (
    <h2
      style={{
        fontSize: 10.5,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        fontWeight: 600,
        color: accent,
        margin: "0 0 14px",
      }}
    >
      {children}
    </h2>
  );
}

function Bullets({
  items,
  fieldPrefix,
  group,
  ownerIndex,
  flags,
  renderBullet,
}: {
  items: string[];
  fieldPrefix: string;
  group: BulletGroup;
  ownerIndex: number;
  flags?: FlaggedMetric[];
  renderBullet?: RenderBullet;
}) {
  if (items.length === 0) return null;
  return (
    <ul style={{ listStyle: "disc", margin: "7px 0 0", paddingLeft: 16, fontSize: 13, lineHeight: 1.6, color: INK }}>
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

export default function TemplateMinimal({
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

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        padding: "68px 68px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 36, fontWeight: 400, letterSpacing: "-0.01em", margin: 0, color: INK }}>
          {resumeName(resume)}
        </h1>
        {b.label && (
          <p style={{ fontSize: 13.5, color: MUTED, margin: "8px 0 0", fontWeight: 400 }}>{b.label}</p>
        )}
        {contact.length > 0 && (
          <p style={{ fontSize: 12, color: MUTED, margin: "14px 0 0", lineHeight: 1.6 }}>
            {contact.join("   ·   ")}
          </p>
        )}
      </header>

      {b.summary && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 36, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the summary"
            label="Summary"
            onImprove={onImproveSection}
          />
          <Label accent={accent.value}>About</Label>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: INK, margin: 0, maxWidth: 600 }}>
            {renderMetricText(b.summary, "basics.summary", flags)}
          </p>
        </section>
      )}

      {(resume.work ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 36, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the experience section"
            label="Experience"
            onImprove={onImproveSection}
          />
          <Label accent={accent.value}>Experience</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {(resume.work ?? []).map((w, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: INK }}>{w.position}</h3>
                  <span style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap" }}>
                    {formatRange(w.startDate, w.endDate)}
                  </span>
                </div>
                {w.name && (
                  <p style={{ fontSize: 12.5, color: MUTED, margin: "3px 0 0" }}>{w.name}</p>
                )}
                {w.summary && (
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: INK, margin: "8px 0 0" }}>
                    {renderMetricText(w.summary, `work[${i}].summary`, flags)}
                  </p>
                )}
                <Bullets
                  items={w.highlights ?? []}
                  fieldPrefix={`work[${i}].highlights`}
                  group="work"
                  ownerIndex={i}
                  flags={flags}
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
          style={{ marginBottom: 36, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the education section"
            label="Education"
            onImprove={onImproveSection}
          />
          <Label accent={accent.value}>Education</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(resume.education ?? []).map((e, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                  <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: 0, color: INK }}>
                    {[e.studyType, e.area].filter(Boolean).join(", ")}
                  </h3>
                  <span style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap" }}>
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
          style={{ marginBottom: 36, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the skills section"
            label="Skills"
            onImprove={onImproveSection}
          />
          <Label accent={accent.value}>Skills</Label>
          {skillsLayout === "bullets" ? (
            <ul style={{ listStyle: "disc", margin: "4px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: INK }}>
              {skillsToItems(resume.skills).map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 13, lineHeight: 1.7, color: INK, margin: 0 }}>
              {skillsInlineText(resume.skills)}
            </p>
          )}
        </section>
      )}

      {(resume.projects ?? []).length > 0 && (
        <section
          className={onImproveSection ? "group" : undefined}
          style={{ marginBottom: 36, position: "relative" }}
        >
          <SectionImprove
            instruction="improve the projects section"
            label="Projects"
            onImprove={onImproveSection}
          />
          <Label accent={accent.value}>Projects</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {(resume.projects ?? []).map((p, i) => (
              <div key={i}>
                <h3 style={{ fontSize: 13.5, fontWeight: 600, margin: 0, color: INK }}>{p.name}</h3>
                {p.description && (
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: INK, margin: "4px 0 0" }}>
                    {renderMetricText(p.description, `projects[${i}].description`, flags)}
                  </p>
                )}
                <Bullets
                  items={p.highlights ?? []}
                  fieldPrefix={`projects[${i}].highlights`}
                  group="projects"
                  ownerIndex={i}
                  flags={flags}
                  renderBullet={renderBullet}
                />
                {renderProjectActions?.(i)}
              </div>
            ))}
          </div>
        </section>
      )}

      {(resume.certificates ?? []).length > 0 && (
        <section style={{ borderTop: `1px solid ${RULE}`, paddingTop: 20, marginBottom: 36 }}>
          <Label accent={accent.value}>Certifications</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(resume.certificates ?? []).map((c, i) => (
              <p key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: INK, margin: 0 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.issuer ? ` · ${c.issuer}` : ""}
                {c.date ? ` · ${c.date}` : ""}
              </p>
            ))}
            {renderCertificateActions?.()}
          </div>
        </section>
      )}

      {(resume.languages ?? []).length > 0 && (
        <section style={{ borderTop: `1px solid ${RULE}`, paddingTop: 20 }}>
          <Label accent={accent.value}>Languages</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 28px" }}>
            {(resume.languages ?? []).map((l, i) => (
              <span key={i} style={{ fontSize: 12.5, color: INK }}>
                <span style={{ fontWeight: 600 }}>{l.language}</span>
                {l.fluency ? <span style={{ color: MUTED }}> — {l.fluency}</span> : null}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}