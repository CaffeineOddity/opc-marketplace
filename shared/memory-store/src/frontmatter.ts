import type { Frontmatter, FrontmatterValue, ParsedFile } from "./types.js";
import { FrontmatterError } from "./types.js";

const DELIMITER = "---";

export function parse(raw: string): ParsedFile {
  if (!raw.startsWith(`${DELIMITER}\n`) && !raw.startsWith(`${DELIMITER}\r\n`)) {
    throw new FrontmatterError("missing opening --- delimiter");
  }
  const lines = raw.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === DELIMITER) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    throw new FrontmatterError("missing closing --- delimiter");
  }
  const fmLines = lines.slice(1, end);
  const fm = parseFrontmatterBlock(fmLines);
  const bodyLines = lines.slice(end + 1);
  // Drop one leading blank line if present (cosmetic), preserve rest verbatim.
  if (bodyLines[0] === "") bodyLines.shift();
  return { frontmatter: fm, body: bodyLines.join("\n") };
}

export function serialize(parsed: ParsedFile): string {
  const fmBlock = serializeFrontmatter(parsed.frontmatter);
  return `${DELIMITER}\n${fmBlock}${DELIMITER}\n\n${parsed.body}`;
}

function parseFrontmatterBlock(lines: string[]): Frontmatter {
  const out: Record<string, FrontmatterValue> = {};
  for (const raw of lines) {
    if (raw.trim() === "") continue;
    const idx = raw.indexOf(":");
    if (idx === -1) {
      throw new FrontmatterError(`invalid line in frontmatter: ${raw}`);
    }
    const key = raw.slice(0, idx).trim();
    const rest = raw.slice(idx + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new FrontmatterError(`invalid frontmatter key: ${key}`);
    }
    out[key] = parseScalar(rest);
  }
  if (typeof out.version !== "number") {
    throw new FrontmatterError("frontmatter.version must be a number");
  }
  if (typeof out.updated_at !== "string") {
    throw new FrontmatterError("frontmatter.updated_at must be a string");
  }
  return out as Frontmatter;
}

function parseScalar(value: string): FrontmatterValue {
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  return value;
}

function serializeFrontmatter(fm: Frontmatter): string {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const orderedKeys = ["version", "updated_at", "pipeline_id", "node"] as const;
  for (const key of orderedKeys) {
    if (fm[key] !== undefined) {
      ordered.push(formatLine(key, fm[key] as FrontmatterValue));
      seen.add(key);
    }
  }
  for (const key of Object.keys(fm)) {
    if (seen.has(key)) continue;
    const v = fm[key];
    if (v === undefined) continue;
    ordered.push(formatLine(key, v));
  }
  return `${ordered.join("\n")}\n`;
}

function formatLine(key: string, value: FrontmatterValue): string {
  return `${key}: ${formatScalar(value)}`;
}

function formatScalar(value: FrontmatterValue): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (/^[A-Za-z0-9_\-:.\/+]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}
