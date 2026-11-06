import type { FlaggedMetric } from "@/lib/documents";
import { normalizeFieldPath } from "./metricFlags";

/**
 * Persisted memory for the structured preview's "this figure is accurate"
 * decisions. Mirrors the text preview's keep/revert memory: a decision made once
 * is recognized again when the same figure reappears, so re-opening a preview
 * doesn't ask the user to re-verify figures they've already checked.
 */

/** A stable identity for one flagged figure: its location plus the value itself. */
export function metricSignature(flag: FlaggedMetric): string {
  return `${normalizeFieldPath(flag.field)}\u0000${flag.value}`;
}

/**
 * Read the remembered verified figures for one document + version. Returns an
 * empty set when nothing is stored or storage is unavailable.
 */
export function readVerifiedMetrics(key: string): Set<string> {
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/** Persist the verified figures for one document + version. */
export function writeVerifiedMetrics(key: string, signatures: Iterable<string>): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify([...signatures]));
  } catch {
    // Ignore storage failures — the decisions still apply for this session.
  }
}

/**
 * Build the storage key for a document's verified-metric decisions, scoped by
 * document type + id + active version so each saved version remembers its own.
 */
export function metricMemoryKey(
  docType: string,
  docId: string | number,
  version?: string | number
): string {
  const v =
    version === undefined || version === null || version === "" ? "current" : version;
  return `hirewave_metric_verified_${docType}_${docId}_${v}`;
}

// ---- Per-version figure manifest ------------------------------------------
// Verified decisions live under the version they were made *from*. The manifest
// below records, for each *saved* version, how many AI-introduced figures it
// carries and how many the user confirmed — so the version switcher can show
// which versions still have unchecked figures.

/** One saved version's AI-figure tally: how many landed, how many were verified. */
export interface VersionMetricEntry {
  /** Figures the improvement introduced that survived into the saved version. */
  total: number;
  /** How many of those the user marked accurate (unchecked = total - verified). */
  verified: number;
}

export type VersionMetricMap = Record<string, VersionMetricEntry>;

const VERSION_METRIC_PREFIX = "hirewave_version_metrics_";

function versionMetricStorageKey(docType: string, docId: string | number): string {
  return `${VERSION_METRIC_PREFIX}${docType}_${docId}`;
}

/** Read every saved version's figure tally for one document (safe against bad data). */
export function readVersionMetricMap(
  docType: string,
  docId: string | number
): VersionMetricMap {
  try {
    const raw = localStorage.getItem(versionMetricStorageKey(docType, docId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as VersionMetricMap;
  } catch {
    return {};
  }
}

/** Record a version's figure tally and return the updated map. */
export function saveVersionMetric(
  docType: string,
  docId: string | number,
  version: string | number,
  entry: VersionMetricEntry
): VersionMetricMap {
  const map = readVersionMetricMap(docType, docId);
  map[String(version)] = entry;
  try {
    localStorage.setItem(versionMetricStorageKey(docType, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}

/**
 * Carry verified-figure decisions from one version's scope to another.
 *
 * When an improvement is accepted, the just-saved version inherits the content
 * the user was looking at — so the figures they already marked accurate should
 * stay accurate when they re-open a preview of that new version. Merges (never
 * overwrites) so any decisions already recorded for the target are preserved.
 */
export function migrateVerifiedMetrics(fromKey: string, toKey: string): void {
  if (!fromKey || !toKey || fromKey === toKey) return;
  const source = readVerifiedMetrics(fromKey);
  if (source.size === 0) return;
  const target = readVerifiedMetrics(toKey);
  for (const sig of source) target.add(sig);
  writeVerifiedMetrics(toKey, target);
}

/**
 * Wipe every figure-verification trace for one document at once: the per-version
 * figure tally (the badge data) plus each version's verified-figure decisions.
 */
export function clearDocumentMetricMemory(docType: string, docId: string | number): void {
  try {
    localStorage.removeItem(versionMetricStorageKey(docType, docId));
    const verifiedPrefix = `hirewave_metric_verified_${docType}_${docId}_`;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(verifiedPrefix)) stale.push(key);
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    /* storage may be unavailable — non-fatal */
  }
}

/**
 * Wipe the figure-verification trace for a single version: its entry in the
 * per-version tally (the badge data) plus its remembered verified-figure
 * decisions. Every other version is left untouched.
 */
export function clearVersionMetricMemory(
  docType: string,
  docId: string | number,
  version: string | number
): VersionMetricMap {
  const map = readVersionMetricMap(docType, docId);
  delete map[String(version)];
  try {
    localStorage.setItem(versionMetricStorageKey(docType, docId), JSON.stringify(map));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  try {
    localStorage.removeItem(metricMemoryKey(docType, docId, version));
  } catch {
    /* storage may be unavailable — non-fatal */
  }
  return map;
}