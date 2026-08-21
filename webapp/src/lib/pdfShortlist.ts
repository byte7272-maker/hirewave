// A print-ready "shortlist" of job recommendations. Builds a self-contained,
// nicely-typeset HTML document and opens it in its own window for the browser's
// native "Save as PDF" / print. Zero dependencies; the builder is a pure
// function so it can be unit-tested.
import type { ExportRow } from "./exportMatches";

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function salary(row: ExportRow): string {
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`);
  const cur = row.currency || "USD";
  if (row.salary_min && row.salary_max) return `${cur} ${fmt(row.salary_min)}–${fmt(row.salary_max)}`;
  if (row.salary_min) return `${cur} ${fmt(row.salary_min)}+`;
  if (row.salary_max) return `up to ${cur} ${fmt(row.salary_max)}`;
  return "Salary not listed";
}

function fitClass(v: number): string {
  if (v >= 80) return "hi";
  if (v >= 60) return "mid";
  return "lo";
}

function card(row: ExportRow): string {
  const loc = [row.location, row.remote ? "Remote" : ""].filter(Boolean).join(" · ") || "—";
  const chips = (skills: string[], cls: string) =>
    skills.slice(0, 12).map((s) => `<span class="chip ${cls}">${escapeHtml(s)}</span>`).join("");
  const link = row.url
    ? `<a class="link" href="${escapeHtml(row.url)}">${escapeHtml(row.url)}</a>`
    : "";
  const auth = row.authenticity_score != null
    ? `<span class="auth">Authenticity ${row.authenticity_score}/100</span>` : "";
  return `
  <article class="card">
    <div class="row">
      <div class="lead">
        <span class="rank">#${row.rank}</span>
        <div>
          <h2>${escapeHtml(row.title)}</h2>
          <p class="meta">${escapeHtml(row.company)} &middot; ${escapeHtml(loc)}</p>
        </div>
      </div>
      <div class="fit ${fitClass(row.fit_score)}">${row.fit_score}<small>fit</small></div>
    </div>
    <p class="salary">${escapeHtml(salary(row))} ${auth}</p>
    ${row.matching_skills.length ? `<div class="chips"><span class="lbl">Matches</span>${chips(row.matching_skills, "match")}</div>` : ""}
    ${row.gap_skills.length ? `<div class="chips"><span class="lbl">Gaps</span>${chips(row.gap_skills, "gap")}</div>` : ""}
    ${link ? `<p class="apply">Apply: ${link}</p>` : ""}
  </article>`;
}

export function buildShortlistHtml(rows: ExportRow[], meta: { generated: string; scope?: string }): string {
  const heading = meta.scope === "saved" ? "Saved jobs shortlist" : "Job recommendations";
  const body = rows.length
    ? rows.map(card).join("\n")
    : `<p class="empty">No recommendations to show.</p>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a2233; margin: 0; padding: 32px; background: #fff; }
  header { border-bottom: 2px solid #2f6df6; padding-bottom: 12px; margin-bottom: 20px; display: flex; align-items: baseline; justify-content: space-between; }
  header h1 { font-size: 22px; margin: 0; }
  header .sub { color: #6b7688; font-size: 12px; }
  .card { border: 1px solid #e3e8f0; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .lead { display: flex; gap: 10px; align-items: flex-start; }
  .rank { font-size: 12px; font-weight: 700; color: #2f6df6; padding-top: 3px; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  .meta { margin: 0; color: #6b7688; font-size: 12px; }
  .fit { text-align: center; font-size: 20px; font-weight: 700; line-height: 1; padding: 6px 10px; border-radius: 8px; min-width: 46px; }
  .fit small { display: block; font-size: 9px; font-weight: 600; text-transform: uppercase; opacity: .8; }
  .fit.hi { background: #e7f3ec; color: #1a7f42; }
  .fit.mid { background: #fdf3e0; color: #a5701a; }
  .fit.lo { background: #eef1f5; color: #6b7688; }
  .salary { font-size: 13px; font-weight: 600; margin: 10px 0 8px; }
  .auth { font-weight: 400; color: #6b7688; font-size: 11px; margin-left: 8px; }
  .chips { font-size: 11px; margin: 4px 0; }
  .lbl { color: #6b7688; text-transform: uppercase; font-size: 9px; margin-right: 6px; letter-spacing: .04em; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 999px; margin: 2px 3px 2px 0; }
  .chip.match { background: #e7eeff; color: #274690; }
  .chip.gap { background: #f3f0fb; color: #5b4b8a; }
  .apply { font-size: 11px; margin: 8px 0 0; color: #6b7688; word-break: break-all; }
  .link { color: #2f6df6; text-decoration: none; }
  .empty { color: #6b7688; }
  footer { margin-top: 18px; color: #9aa4b5; font-size: 10px; text-align: center; }
  @media print { body { padding: 0; } @page { margin: 16mm; } }
</style></head>
<body>
  <header>
    <h1>${escapeHtml(heading)}</h1>
    <span class="sub">${rows.length} role${rows.length === 1 ? "" : "s"} &middot; ${escapeHtml(meta.generated)}</span>
  </header>
  ${body}
  <footer>Generated by Hirewave · ranked by fit across skills, salary and location</footer>
</body></html>`;
}

/** Open the shortlist in a new window and trigger the print / Save-as-PDF flow. */
export function openPrintShortlist(rows: ExportRow[], meta: { generated: string; scope?: string }): boolean {
  const win = window.open("", "_blank", "noopener,width=900,height=1000");
  if (!win) return false; // popup blocked
  win.document.open();
  win.document.write(buildShortlistHtml(rows, meta));
  win.document.close();
  win.focus();
  // Give the new document a tick to lay out before invoking print.
  setTimeout(() => { try { win.print(); } catch { /* user can print manually */ } }, 350);
  return true;
}
