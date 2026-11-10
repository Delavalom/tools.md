export type Strength = "locked" | "preferred" | "open";
export type Budget = "free" | "low" | "flexible";

export interface NeedEntry {
  /** ToolDB slug of the chosen product; absent only when strength is "open". */
  pick?: string;
  /** The pick's display name, for people and messages. */
  name?: string;
  strength: Strength;
  /** The pick's packages. */
  packages: string[];
  /** Packages of other tools that do this job. Blocked when strength is "locked". */
  competitors: string[];
}

export interface ToolsMd {
  version: 1;
  generated?: string;
  budget?: Budget;
  project?: string;
  needs: Record<string, NeedEntry>;
  /** Everything after the frontmatter. */
  body: string;
}

export interface LockRule {
  need: string;
  pick: string;
  name?: string;
  packages: string[];
}

export const FORMAT_VERSION: 1;
export const STRENGTHS: readonly Strength[];
export const BUDGETS: readonly Budget[];
export const MAX_COMPETITORS: number;

export class ToolsMdError extends Error {}

export function splitToolsMd(text: string): { frontmatter: string; body: string };
export function parseFrontmatter(text: string): Record<string, unknown>;
export function parseToolsMd(text: string): ToolsMd;
export function serializeToolsMd(doc: Omit<ToolsMd, "version"> & { version?: 1 }): string;
export function lockedCompetitors(doc: ToolsMd): Map<string, LockRule>;
export function packageBase(spec: string): string | null;
export function packagesAddedByCommand(command: string): string[];
export function isSourceFile(path: string): boolean;
export function importedPackages(source: string): Set<string>;
export function blockMessage(name: string, rule: LockRule): string;
export function needTitle(keyOrName: string): string;
