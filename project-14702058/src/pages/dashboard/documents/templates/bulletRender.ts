import type { ReactNode } from "react";
import type { FlaggedMetric } from "@/lib/documents";

/** Which bullet list a rendered bullet belongs to. */
export type BulletGroup = "work" | "projects";

export interface RenderBulletArgs {
  /** Which list this bullet lives in. */
  group: BulletGroup;
  /** Index of the owning work role / project. */
  ownerIndex: number;
  /** Index of the bullet within its list. */
  bulletIndex: number;
  /** The bullet's text. */
  text: string;
  /** Metric-flag field path for this bullet, e.g. `work[0].highlights[2]`. */
  fieldPrefix: string;
  /** Figures the AI added — highlighted inline at their field location. */
  flags?: FlaggedMetric[];
}

/**
 * Renders a single bullet's content. When provided, a theme renders the node
 * returned here in place of the plain metric-highlighted text — letting the host
 * wrap each existing bullet with inline edit / remove / polish affordances.
 */
export type RenderBullet = (args: RenderBulletArgs) => ReactNode;