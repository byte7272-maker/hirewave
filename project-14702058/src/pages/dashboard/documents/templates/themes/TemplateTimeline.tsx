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

// Timeline — a two-column rhythm: a fixed date gutter beside a content column,
// joined by a vertical rail with an accent node per entry. The rail makes the
// career progression read at a glance.
const INK = "#111827";
const MUTED = "#6b7280";
const RAIL = "#e5e7eb";

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
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 700,
          color: accent,
          margin: "0 0 16px",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One timeline entry: date in the gutter, a rail node, and the content. */
function Entry({
  date,
  accent,
  children,
  last,
}: {
  date: string;
  accent: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 18 }}>
      <div style={{ width: 104, flexShrink: 0, textAlign: "right", paddingTop: 1 }}>
        <span style={{ fontSize: 11, color: MUTED, letterSpacing: "0.02em" }}>{date}</span>
      </div>
      <div style={{ position: "relative", width: 14, flexShrink: 0 }}>
        {!last && (
          <span
            style={{
              position: "absolute",
              left: 6,
              top: 14,
              bottom: -18,
              width: 1.5,
              background: RAIL,
            }}
          />
        )}
        <span
          style={{
            position: "absolute",
            left: 1,
            top: 4,
            width: 11,
            height: 11,
            borderRadius: 999,
            background: "#ffffff",
            border: `2.5px solid ${accent}`,
          }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>{children}</div>
    </div>
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
    <ul style={{ listStyle: "disc", margin: "6px 0 0", paddingLeft: 16, fontSize: 12.5, lineHeight: 1.6, color: INK }}>
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

export default function TemplateTimeline({
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
  const work = resume.work ?? [];
  const education = resume.education ?? [];

  const improve = (instruction: string, label: string): ImproveConfig | undefined =>
    onImproveSection ? { instruction, label, onImprove: onImproveSection } : undefined;

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
        padding: "56px 60px",
        minHeight: PAPER_MIN_HEIGHT,
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: 34, paddingBottom: 20, borderBottom: `1px solid ${RAIL}` }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", margin: 0, color: INK }}>
          {resumeName(resume)}
        </h1>
        {b.label && (
          <p style={{ fontSize: 13.5, fontWeight: 600, color: accent.value, margin: "7px 0 0" }}>
            {b.label}
          </p>
        )}
        {contacts.length > 0 && (
          <p style={{ fontSize: 12, color: MUTED, margin: "12px 0 0", lineHeight: 1.7 }}>
            {contacts.join("   ·   ")}
          </p>
        )}
      </header>

      {b.summary && (
        <Section title="Profile" accent={accent.value} improve={improve("improve the summary", "Summary")}>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: INK }}>
            {renderMetricText(b.summary, "basics.summary", flags)}
          </p>
        </Section>
      )}

      {work.length > 0 && (
        <Section
          title="Experience"
          accent={accent.value}
          improve={improve("improve the experience section", "Experience")}
        >
          <div>
            {work.map((w, i) => (
              <Entry
                key={i}
                accent={accent.value}
                date={formatRange(w.startDate, w.endDate)}
                last={i === work.length - 1}
              >
                <p style={{ fontSize: 13.5, fontWeight: 700, margin: 0, color: INK }}>{w.position}</p>
                {w.name && (
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: MUTED, margin: "2px 0 0" }}>{w.name}</p>
                )}
                {w.summary && (
                  <p style={{ fontSize: 12.5, lineHeight: 1.6, color: INK, margin: "6px 0 0" }}>
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
              </Entry>
            ))}
          </div>
        </Section>
      )}

      {education.length > 0 && (
        <Section
          title="Education"
          accent={accent.value}
          improve={improve("improve the education section", "Education")}
        >
          <div>
            {education.map((e, i) => (
              <Entry
                key={i}
                accent={accent.value}
                date={formatRange(e.startDate, e.endDate)}
                last={i === education.length - 1}
              >
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>
                  {[e.studyType, e.area].filter(Boolean).join(", ")}
                </p>
                <p style={{ fontSize: 12.5, color: MUTED, margin: "2px 0 0" }}>
                  {e.institution}
                  {e.score ? ` · ${e.score}` : ""}
                </p>
              </Entry>
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
            <ul style={{ listStyle: "disc", margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, color: INK }}>
              {skillsToItems(resume.skills).map((item, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{item}</li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: 12.5, lineHeight: 1.7, margin: 0, color: INK }}>
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
          <div>
            {(resume.projects ?? []).map((p, i) => (
              <Entry
                key={i}
                accent={accent.value}
                date={formatRange(p.startDate, p.endDate)}
                last={i === (resume.projects ?? []).length - 1}
              >
                <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: INK }}>{p.name}</p>
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
              </Entry>
            ))}
          </div>
        </Section>
      )}

      {((resume.languages ?? []).length > 0 || (resume.certificates ?? []).length > 0) && (
        <Section title="Additional" accent={accent.value}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(resume.languages ?? []).map((l, i) => (
              <p key={`l-${i}`} style={{ fontSize: 12.5, margin: 0, color: INK }}>
                <span style={{ fontWeight: 600 }}>{l.language}</span>
                {l.fluency ? <span style={{ color: MUTED }}> — {l.fluency}</span> : null}
              </p>
            ))}
            {(resume.certificates ?? []).map((c, i) => (
              <p key={`c-${i}`} style={{ fontSize: 12.5, margin: 0, color: INK }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.issuer ? <span style={{ color: MUTED }}> · {c.issuer}</span> : null}
                {c.date ? <span style={{ color: MUTED }}> · {c.date}</span> : null}
              </p>
            ))}
            {renderCertificateActions?.()}
          </div>
        </Section>
      )}
    </div>
  );
}