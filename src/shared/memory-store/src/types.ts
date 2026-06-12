export const PACKAGE_NAME = "@opc/memory-store" as const;

export type FrontmatterValue = string | number | boolean | null;

export interface Frontmatter {
  version: number;
  updated_at: string;
  pipeline_id?: string;
  node?: string;
  [key: string]: FrontmatterValue | undefined;
}

export interface ParsedFile {
  frontmatter: Frontmatter;
  body: string;
}

export interface Address {
  unit: string;
  section: string;
  sub: string;
}

export interface ReadResult extends ParsedFile {
  path: string;
}

export interface WriteInput {
  body: string;
  base_version?: number;
  pipeline_id?: string;
  node?: string;
  extra?: Record<string, FrontmatterValue>;
}

export type MergeStatus = "clean" | "merged" | "conflict";

export interface WriteResult {
  path: string;
  version: number;
  merge_status: MergeStatus;
  conflicts?: string[];
}

export interface IndexEntry {
  unit: string;
  section: string;
  sub: string;
  version: number;
  updated_at: string;
  size: number;
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontmatterError";
  }
}

export class VersionConflictError extends Error {
  readonly base_version: number;
  readonly current_version: number;
  constructor(base: number, current: number) {
    super(`base_version ${base} does not match current_version ${current}`);
    this.name = "VersionConflictError";
    this.base_version = base;
    this.current_version = current;
  }
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`memory-store: file not found at ${path}`);
    this.name = "NotFoundError";
  }
}
