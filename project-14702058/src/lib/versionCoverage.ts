/**
 * Per-version keyword coverage memory.
 *
 * When a tailored version is saved we record which job gaps it was measured
 * against (plus how many it covered at save time). That lets us re-show a
 * version's own "X of Y covered" badge/summary when the user switches back to
 * it later, even after a reload.
 */

export interface StoredVersionCoverage {
  /** The job gaps this version was tailored against. */
  gaps: string[];
  /** Optional display label for the job the version was tailored to. */
  jobLabel: string | null;
  /** The id of the job the version was tailored to (used to match against job lists). */
  jobId?: string | number | null;
  /** How many gaps were covered at save time. */
  covered: number;
  /** Total gaps measured. */
  total: number;
  /** Optional one-line note the user pinned to this version. */
  note?: string | null;
  /** The résumé's ATS score captured when the version was saved (when known). */
  atsScore?: number | null;
}

export type VersionCoverageMap = Record<string, StoredVersionCoverage>;

/** The best coverage found for a single job, resolved across all documents. */
export interface JobCoverage {
  covered: number;
  total: number;
  jobLabel: string | null;
}

const PREFIX = "hirewave_version_coverage_";

function storageKey(kind: string, docId: string | number): string {
  return `${PREFIX}${kind}_${docId}`;
}

/** Count how many of the gaps appear in the given text. */
export function computeCoverage(gaps: string[], text: string): { covered: number; total: number } {
  const haystack = (text ?? "").toLowerCase();
  let covered = 0;
  for (const gap of gaps) {
    if (haystack.includes(gap.toLowerCase())) covered += 1;
  }
  return { covered, total: gaps.length };
}

/** Read the full version -> coverage map for a document (safe against bad/absent data). */
export function readVersionCoverageMap(
  kind: string,
  docId: string | number
): VersionCoverageMap {
  try {
    const raw = localStorage.getItem(storageKey(kind, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as VersionCoverageMap;
  } catch {
    return {};
  }
}

/** Persist a single version's coverage and return the updated map. */
export function saveVersionCoverage(
  kind: string,
  docId: string | number,
  version: string | number,
  entry: StoredVersionCoverage
): VersionCoverageMap {
  const map = readVersionCoverageMap(kind, docId);
  map[String(version)] = entry;
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/** Look up one version's stored coverage, or null when it has none. */
export function getVersionCoverage(
  kind: string,
  docId: string | number,
  version: string | number | null | undefined
): StoredVersionCoverage | null {
  if (version === null || version === undefined) return null;
  const map = readVersionCoverageMap(kind, docId);
  return map[String(version)] ?? null;
}

/**
 * Attach a one-line note to an existing version's coverage entry. No-op when the
 * version has no coverage recorded yet (nothing to pin the note to).
 */
export function saveVersionNote(
  kind: string,
  docId: string | number,
  version: string | number,
  note: string
): VersionCoverageMap {
  const map = readVersionCoverageMap(kind, docId);
  const existing = map[String(version)];
  if (!existing) return map;
  map[String(version)] = { ...existing, note };
  try {
    localStorage.setItem(storageKey(kind, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/**
 * Scan every document's coverage memory and return the best coverage found for
 * each job — keyed by both the job id and its display label, so a job list can
 * look a posting up by either. Used by the Job Matches coverage sort/badge.
 */
export function getCoverageByJob(): Record<string, JobCoverage> {
  const result: Record<string, JobCoverage> = {};
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const map = JSON.parse(raw) as VersionCoverageMap;
      if (!map || typeof map !== "object") continue;
      for (const entry of Object.values(map)) {
        if (!entry || !entry.total) continue;
        const identifiers = [
          entry.jobId !== null && entry.jobId !== undefined ? String(entry.jobId) : null,
          entry.jobLabel || null,
        ].filter((v): v is string => Boolean(v));
        for (const id of identifiers) {
          const prev = result[id];
          const better =
            !prev ||
            entry.covered > prev.covered ||
            (entry.covered === prev.covered && entry.total < prev.total);
          if (better) {
            result[id] = {
              covered: entry.covered,
              total: entry.total,
              jobLabel: entry.jobLabel ?? null,
            };
          }
        }
      }
    }
  } catch {
    /* storage unavailable — non-fatal */
  }
  return result;
}

/**
 * The role a single document was *last* tailored to — the job label recorded on
 * its most recent version's coverage entry. Scans the document's coverage map
 * (newest version first when versions are numeric) so a document list can show
 * a glanceable "last aimed at" role chip. Returns null when nothing is recorded.
 */
export function readLatestTailoredRole(
  kind: string,
  docId: string | number
): string | null {
  const map = readVersionCoverageMap(kind, docId);
  const entries = Object.entries(map).filter(
    (entry): entry is [string, StoredVersionCoverage] =>
      Boolean(entry[1] && entry[1].jobLabel)
  );
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return String(b[0]).localeCompare(String(a[0]));
  });
  return entries[0][1].jobLabel ?? null;
}

/**
 * The role a document was last tailored to, resolved to both its stable job id
 * (when recorded) and its display label. Lets a document-row role chip link into
 * the Templates view pre-selecting the exact job that version was aimed at.
 * Returns null when nothing is recorded.
 */
export function readLatestTailoredTarget(
  kind: string,
  docId: string | number
): { jobId: string | number | null; label: string | null } | null {
  const map = readVersionCoverageMap(kind, docId);
  const entries = Object.entries(map).filter(([, e]) =>
    Boolean(e && (e.jobLabel || (e.jobId !== null && e.jobId !== undefined)))
  );
  if (entries.length === 0) return null;
  entries.sort((a, b) => {
    const na = Number(a[0]);
    const nb = Number(b[0]);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return String(b[0]).localeCompare(String(a[0]));
  });
  const entry = entries[0][1];
  return { jobId: entry.jobId ?? null, label: entry.jobLabel ?? null };
}

/** The best tailored résumé version found for a single job. */
export interface TailoredResumeInfo {
  /** The résumé id the tailored version lives on. */
  docId: string;
  /** The saved version tailored to the job. */
  version: string;
  /** The job label recorded on the version, if any. */
  jobLabel: string | null;
  /** The gaps measured when the version was saved. */
  gaps: string[];
  /** How many gaps that version covered. */
  covered: number;
  /** Total gaps measured for the job. */
  total: number;
  /** The résumé's ATS score captured at save time (when known). */
  atsScore: number | null;
}

const RESUME_COVERAGE_PREFIX = `${PREFIX}resume_`;

/** Is `a` a newer saved version than `b` (numeric versions compared as numbers)? */
function isNewerTailored(a: TailoredResumeInfo, b: TailoredResumeInfo): boolean {
  const na = Number(a.version);
  const nb = Number(b.version);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na > nb;
  if (!Number.isNaN(na)) return true;
  if (!Number.isNaN(nb)) return false;
  return String(a.version).localeCompare(String(b.version)) > 0;
}

/**
 * Scan every résumé's saved-version coverage memory and return the newest
 * tailored version found for each job — keyed by both the job id and its display
 * label, so a job list can look a posting up by either. Used by the pipeline to
 * show a "ready résumé" badge (version + ATS score) on each row.
 */
export function getTailoredResumeByJob(): Record<string, TailoredResumeInfo> {
  const result: Record<string, TailoredResumeInfo> = {};
  const consider = (id: string | null, info: TailoredResumeInfo) => {
    if (!id) return;
    const prev = result[id];
    if (!prev || isNewerTailored(info, prev)) result[id] = info;
  };
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(RESUME_COVERAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const docId = key.slice(RESUME_COVERAGE_PREFIX.length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const map = JSON.parse(raw) as VersionCoverageMap;
      if (!map || typeof map !== "object") continue;
      for (const [version, entry] of Object.entries(map)) {
        if (!entry) continue;
        const info: TailoredResumeInfo = {
          docId,
          version,
          jobLabel: entry.jobLabel ?? null,
          gaps: Array.isArray(entry.gaps) ? entry.gaps : [],
          covered: entry.covered ?? 0,
          total: entry.total ?? 0,
          atsScore: typeof entry.atsScore === "number" ? entry.atsScore : null,
        };
        const jobId = entry.jobId;
        if (jobId !== null && jobId !== undefined && jobId !== "") {
          consider(String(jobId), info);
        }
        if (entry.jobLabel) consider(entry.jobLabel, info);
      }
    }
  } catch {
    /* storage unavailable — non-fatal */
  }
  return result;
}