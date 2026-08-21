import { describe, it, expect } from "vitest";
import { buildShortlistHtml, escapeHtml } from "./pdfShortlist";
import type { ExportRow } from "./exportMatches";

const ROW: ExportRow = {
  rank: 1,
  title: "Senior Backend Engineer",
  company: "Globex",
  location: "Remote",
  remote: true,
  salary_min: 170000,
  salary_max: 210000,
  currency: "USD",
  fit_score: 82,
  authenticity_score: 95,
  matching_skills: ["Python", "PostgreSQL"],
  gap_skills: ["Kubernetes"],
  url: "https://jobs/globex",
  job_id: "job_1",
};

describe("pdf shortlist", () => {
  it("escapes HTML in untrusted fields", () => {
    expect(escapeHtml('<img src=x onerror="1">')).toBe("&lt;img src=x onerror=&quot;1&quot;&gt;");
  });

  it("renders a role card with fit, salary, skills and apply link", () => {
    const html = buildShortlistHtml([ROW], { generated: "Aug 14, 2026" });
    expect(html).toContain("Job recommendations");
    expect(html).toContain("Senior Backend Engineer");
    expect(html).toContain("Globex");
    expect(html).toContain(">82<"); // fit score
    expect(html).toContain("USD 170k–210k"); // formatted salary
    expect(html).toContain("Python");
    expect(html).toContain("Kubernetes"); // gap skill
    expect(html).toContain("https://jobs/globex"); // apply link
    expect(html).toContain("1 role"); // count in header
  });

  it("titles the sheet for saved scope and handles empty", () => {
    const html = buildShortlistHtml([], { generated: "Aug 14, 2026", scope: "saved" });
    expect(html).toContain("Saved jobs shortlist");
    expect(html).toContain("No recommendations to show.");
  });

  it("escapes a malicious job title so it can't inject markup", () => {
    const evil = { ...ROW, title: '<script>alert(1)</script>' };
    const html = buildShortlistHtml([evil], { generated: "x" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
