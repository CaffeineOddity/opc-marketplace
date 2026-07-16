import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type {
  NodeDefinition,
  NodeInputSpec,
  NodeMode,
  NodeOutputSpec,
  QualityGate,
} from "./state-json.js";

/**
 * Node md frontmatter uses a small YAML subset. The node files share this shape:
 *
 *   ---
 *   name: <id>
 *   tags: [a, b]
 *   description: <text>
 *   agents:
 *     primary: [agent-a]
 *     fallback: [agent-b]
 *   input:
 *     - path: <unit>/<feature>/x
 *       type: knowledge | artifact
 *   output:
 *     - path: <unit>/<feature>/y
 *       type: knowledge | artifact
 *   quality_gates:
 *     L1: [build, lint, unit-test]
 *     L2: [test_pass, lint_pass]
 *   always_show: true
 *   ---
 *
 * NodeInputSpec / NodeOutputSpec (state-json.ts) use `{knowledge}` /
 * `{artifacts[], knowledge}`, so we map the md `path`+`type` accordingly:
 *   type=knowledge  → input.knowledge = path
 *   type=artifact   → output.artifacts = [path]
 *   output with type=knowledge → output.knowledge = path (and vice-versa)
 *
 * quality_gates from md is keyed by layer (L1/L2) holding gate-name strings.
 * NodeDefinition.quality_gates is a flat QualityGate[]. We merge both layers
 * into a single ordered list, mapping unknown names to themselves (the gates
 * are validated elsewhere; here we only forward them).
 */

export interface ParsedNodeMd {
  definition: NodeDefinition;
  body: string;
}

export class NodeLoaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NodeLoaderError";
  }
}

const DELIMITER = "---";

/** Parse the raw text of a single node .md file into a NodeDefinition + body. */
export function parseNodeMd(
  raw: string,
  sourcePath: string,
): ParsedNodeMd {
  if (!raw.startsWith(`${DELIMITER}\n`) && !raw.startsWith(`${DELIMITER}\r\n`)) {
    throw new NodeLoaderError(`node md ${sourcePath}: missing opening --- delimiter`);
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
    throw new NodeLoaderError(`node md ${sourcePath}: missing closing --- delimiter`);
  }
  const fm = parseYamlSubset(lines.slice(1, end), sourcePath);
  const bodyLines = lines.slice(end + 1);
  if (bodyLines[0] === "") bodyLines.shift();

  const def = fmToNodeDefinition(fm, sourcePath);
  def.body = bodyLines.join("\n");
  def.source_path = sourcePath;
  return { definition: def, body: def.body ?? "" };
}

function fmToNodeDefinition(
  fm: YamlValue,
  sourcePath: string,
): NodeDefinition {
  const name = asString(fm.name, "name", sourcePath);
  const tags = asStringArray(fm.tags, "tags");
  const description = typeof fm.description === "string" ? fm.description : "";

  const agentsObj = isMap(fm.agents) ? fm.agents : {};
  const primary = asStringArray(agentsObj.primary, "agents.primary");
  const fallback = asStringArray(agentsObj.fallback, "agents.fallback");

  const input = toInputSpecs(fm.input, sourcePath);
  const output = toOutputSpecs(fm.output, sourcePath);

  const mode: NodeMode = fm.mode === "parallel" ? "parallel" : "sequential";

  const qualityGates = toQualityGates(fm.quality_gates);

  const def: NodeDefinition = {
    name,
    phase: "",
    description,
    tags,
    mode,
    agents: {
      primary: primary.length > 0 ? primary : ["claude"],
      ...(fallback.length > 0 ? { optional: fallback } : {}),
    },
  };
  if (input.length > 0) def.input = input;
  if (output.length > 0) def.output = output;
  if (qualityGates.length > 0) def.quality_gates = qualityGates;
  if (typeof fm.timeout_minutes === "number") def.timeout_minutes = fm.timeout_minutes;
  if (typeof fm.max_retries === "number") def.max_retries = fm.max_retries;
  if (Array.isArray(fm.skills)) def.skills = asStringArray(fm.skills, "skills");
  return def;
}

function toInputSpecs(value: YamlValue, sourcePath: string): NodeInputSpec[] {
  if (!Array.isArray(value)) return [];
  const out: NodeInputSpec[] = [];
  for (const item of value) {
    if (!isMap(item)) continue;
    const path = asString(item.path, "input[].path", sourcePath);
    const spec: NodeInputSpec = { knowledge: path };
    if (typeof item.min_version === "number") spec.min_version = item.min_version;
    out.push(spec);
  }
  return out;
}

function toOutputSpecs(value: YamlValue, sourcePath: string): NodeOutputSpec[] {
  if (!Array.isArray(value)) return [];
  const out: NodeOutputSpec[] = [];
  for (const item of value) {
    if (!isMap(item)) continue;
    const path = asString(item.path, "output[].path", sourcePath);
    const type = typeof item.type === "string" ? item.type : "knowledge";
    if (type === "artifact") {
      // artifact-typed output → carry the path as an artifact; knowledge stays "".
      out.push({ artifacts: [path], knowledge: "" });
    } else {
      // knowledge-typed (default) → carry the path as knowledge.
      out.push({ artifacts: [], knowledge: path });
    }
  }
  return out;
}

function toQualityGates(value: YamlValue): QualityGate[] {
  if (!isMap(value)) return [];
  const l1 = asStringArray(value.L1, "quality_gates.L1");
  const l2 = asStringArray(value.L2, "quality_gates.L2");
  // Dedup, preserve order (L1 first then L2). Unknown strings are forwarded as-is;
  // NodeState.quality_gates is typed QualityGate[] but the runtime validators
  // (node-server) only act on the known ones and ignore the rest.
  const seen = new Set<string>();
  const out: QualityGate[] = [];
  for (const g of [...l1, ...l2]) {
    if (seen.has(g)) continue;
    seen.add(g);
    out.push(g as QualityGate);
  }
  return out;
}

// --- minimal YAML subset parser (key: scalar | flow-seq | nested map | list of maps) ---

type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [k: string]: YamlValue };

function isMap(v: YamlValue): v is { [k: string]: YamlValue } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseYamlSubset(lines: string[], sourcePath: string): YamlValue {
  // Root is a map. We parse into a nested structure by indentation.
  const ctx: ParseCtx = { lines, idx: 0, sourcePath };
  const result = parseBlock(ctx, 0);
  if (!isMap(result)) {
    throw new NodeLoaderError(`node md ${sourcePath}: frontmatter is not a map`);
  }
  return result;
}

interface ParseCtx {
  lines: string[];
  idx: number;
  sourcePath: string;
}

function indentOf(line: string): number {
  let i = 0;
  while (line[i] === " ") i += 1;
  return i;
}

function parseBlock(ctx: ParseCtx, minIndent: number): YamlValue {
  // Peek: is the first non-blank line a "- " list entry or a "key: ..." map entry?
  while (ctx.idx < ctx.lines.length && ctx.lines[ctx.idx].trim() === "") {
    ctx.idx += 1;
  }
  if (ctx.idx >= ctx.lines.length) return null;
  const firstLine = ctx.lines[ctx.idx];
  const firstIndent = indentOf(firstLine);
  if (firstIndent < minIndent) return null;
  if (firstLine.trimStart().startsWith("- ")) {
    return parseList(ctx, firstIndent);
  }
  return parseMap(ctx, firstIndent);
}

function parseMap(ctx: ParseCtx, indent: number): { [k: string]: YamlValue } {
  const out: { [k: string]: YamlValue } = {};
  while (ctx.idx < ctx.lines.length) {
    const line = ctx.lines[ctx.idx];
    if (line.trim() === "") {
      ctx.idx += 1;
      continue;
    }
    const cur = indentOf(line);
    if (cur < indent) break;
    if (cur > indent) {
      // stray indented line without a parent key; skip defensively
      ctx.idx += 1;
      continue;
    }
    const trimmed = line.trimStart();
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      ctx.idx += 1;
      continue;
    }
    const key = trimmed.slice(0, colon).trim();
    const rest = trimmed.slice(colon + 1).trim();
    ctx.idx += 1;
    if (rest === "") {
      // nested block (map or list) on following lines
      const child = parseBlock(ctx, indent + 1);
      out[key] = child;
    } else {
      out[key] = parseScalarOrFlow(rest);
    }
  }
  return out;
}

function parseList(ctx: ParseCtx, indent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (ctx.idx < ctx.lines.length) {
    const line = ctx.lines[ctx.idx];
    if (line.trim() === "") {
      ctx.idx += 1;
      continue;
    }
    const cur = indentOf(line);
    if (cur < indent) break;
    if (cur > indent) {
      ctx.idx += 1;
      continue;
    }
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("- ")) {
      break;
    }
    const itemInline = trimmed.slice(2).trim();
    ctx.idx += 1;
    if (itemInline === "") {
      out.push(parseBlock(ctx, indent + 1));
      continue;
    }
    // Inline item may be "key: value" (start of a map) or a scalar.
    const colon = itemInline.indexOf(":");
    if (colon !== -1 && /^[A-Za-z_][A-Za-z0-9_\- ]*$/.test(itemInline.slice(0, colon).trim())) {
      // It's a map whose first key is on the dash line. Reconstruct as a map.
      const map: { [k: string]: YamlValue } = {};
      const firstKey = itemInline.slice(0, colon).trim();
      const firstRest = itemInline.slice(colon + 1).trim();
      if (firstRest === "") {
        map[firstKey] = parseBlock(ctx, indent + 2);
      } else {
        map[firstKey] = parseScalarOrFlow(firstRest);
      }
      // Continue consuming further keys at indent+2.
      while (ctx.idx < ctx.lines.length) {
        const nl = ctx.lines[ctx.idx];
        if (nl.trim() === "") {
          ctx.idx += 1;
          continue;
        }
        const ni = indentOf(nl);
        if (ni <= indent) break;
        const nt = nl.trimStart();
        const nc = nt.indexOf(":");
        if (nc === -1) {
          ctx.idx += 1;
          continue;
        }
        const k2 = nt.slice(0, nc).trim();
        const r2 = nt.slice(nc + 1).trim();
        ctx.idx += 1;
        if (r2 === "") {
          map[k2] = parseBlock(ctx, ni + 1);
        } else {
          map[k2] = parseScalarOrFlow(r2);
        }
      }
      out.push(map);
    } else {
      out.push(parseScalarOrFlow(itemInline));
    }
  }
  return out;
}

function parseScalarOrFlow(rest: string): YamlValue {
  // flow sequence: [a, b, c]
  if (rest.startsWith("[") && rest.endsWith("]")) {
    const inner = rest.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((p) => parseScalarOrFlow(p.trim()));
  }
  if (rest === "" || rest === "null" || rest === "~") return null;
  if (rest === "true") return true;
  if (rest === "false") return false;
  if (/^-?\d+$/.test(rest)) return Number.parseInt(rest, 10);
  if (/^-?\d+\.\d+$/.test(rest)) return Number.parseFloat(rest);
  if (
    (rest.startsWith('"') && rest.endsWith('"')) ||
    (rest.startsWith("'") && rest.endsWith("'"))
  ) {
    return rest.slice(1, -1);
  }
  return rest;
}

function asString(v: YamlValue, field: string, sourcePath: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  throw new NodeLoaderError(`node md ${sourcePath}: field ${field} must be a string, got ${JSON.stringify(v)}`);
}

function asStringArray(v: YamlValue, field: string): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => (typeof item === "string" ? item : typeof item === "number" || typeof item === "boolean" ? String(item) : null))
    .filter((x): x is string => x !== null);
}

/**
 * Load every `*.md` node definition for a phase from disk.
 * Returns [] if the phase dir or nodes/ subdir does not exist.
 * Files that fail to parse are skipped (logged via console.warn) so a single
 * bad node file never breaks phase materialization.
 */
export function loadPhaseNodesFromDisk(
  root: string,
  phase: string,
): ParsedNodeMd[] {
  const dir = join(root, ".opc", "phases", phase, "nodes");
  if (!existsSync(dir)) return [];
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
  const out: ParsedNodeMd[] = [];
  for (const name of entries) {
    const full = join(dir, name);
    let raw: string;
    try {
      raw = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    try {
      out.push(parseNodeMd(raw, full));
    } catch (err) {
      console.warn(`[opc] skipping node file ${full}: ${(err as Error).message}`);
    }
  }
  return out;
}
