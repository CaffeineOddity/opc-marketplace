import { randomUUID } from "node:crypto";

import {
  listAllCorrections,
  listCorrectionsByStep,
  loadCorrectionById,
  saveCorrection,
  type AppliesWhen,
  type Correction,
  type CorrectionSource,
  type CorrectionTrigger,
  type LinkedIntervention,
} from "./corrections-store.js";
import { loadSeedCorrections } from "./seed-loader.js";
import { similarity, SIM_MERGE_THRESHOLD } from "./similarity.js";
import type { StepId } from "./store.js";

export interface CorrectionsServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  perSectionCap?: number;
  hotnessCap?: number;
}

export class CorrectionsServerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorrectionsServerError";
  }
}

export interface CorrectionsQueryRequest {
  step: StepId;
  keywords?: string[];
  limit?: number;
}

export interface CorrectionsQueryResponse {
  items: Correction[];
  total: number;
}

export interface CorrectionUpsertItem {
  operation: "create" | "merge";
  match_id?: string;
  correction: Omit<Correction, "id" | "created_at" | "updated_at"> & {
    id?: string;
    created_at?: string;
    updated_at?: string;
  };
}

export interface CorrectionsUpsertRequest {
  batch: CorrectionUpsertItem[];
}

export interface CorrectionsUpsertResponse {
  new_count: number;
  merged_count: number;
  skipped_count: number;
  skip_reasons: string[];
  warnings: string[];
  written_ids: string[];
  frozen_ids: string[];
}

// ---- M17.f: unified `opc_corrections` facade (query/record/unlearn/reindex) ----

export type CorrectionsActionRequest =
  | ({ action: "query" } & CorrectionsQueryRequest)
  | ({ action: "record" } & CorrectionsUpsertRequest)
  | { action: "unlearn"; correction_id: string; reason?: string }
  | { action: "reindex"; scope?: "all" | { step: StepId } };

export type CorrectionsActionResponse =
  | ({ action: "query" } & CorrectionsQueryResponse)
  | ({ action: "record" } & CorrectionsUpsertResponse)
  | { action: "unlearn" | "reindex"; not_implemented: true; reason: string };

const DEFAULT_PER_SECTION_CAP = 5;
const DEFAULT_HOTNESS_CAP = 50;

export class CorrectionsServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly perSectionCap: number;
  private readonly hotnessCap: number;

  constructor(opts: CorrectionsServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.perSectionCap = opts.perSectionCap ?? DEFAULT_PER_SECTION_CAP;
    this.hotnessCap = opts.hotnessCap ?? DEFAULT_HOTNESS_CAP;
  }

  async query(req: CorrectionsQueryRequest): Promise<CorrectionsQueryResponse> {
    const projectCorrections = await listCorrectionsByStep(this.root, req.step);

    // If project has corrections for this step, use them (project-first per spec §五).
    // Otherwise fall back to seed corrections for cold-start.
    const all =
      projectCorrections.length > 0
        ? projectCorrections
        : (await loadSeedCorrections()).filter((c) => c.step === req.step);

    const kw = (req.keywords ?? []).map((s) => s.toLowerCase());
    const scored = all.map((c) => {
      const overlap =
        kw.length === 0
          ? 0
          : c.applies_when.keywords.filter((k) => kw.includes(k.toLowerCase())).length;
      return { c, overlap, hotness: c.hotness };
    });
    scored.sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return b.hotness - a.hotness;
    });
    const limit = req.limit ?? 10;
    return {
      items: scored.slice(0, limit).map((s) => s.c),
      total: all.length,
    };
  }

  async upsert(req: CorrectionsUpsertRequest): Promise<CorrectionsUpsertResponse> {
    const resp: CorrectionsUpsertResponse = {
      new_count: 0,
      merged_count: 0,
      skipped_count: 0,
      skip_reasons: [],
      warnings: [],
      written_ids: [],
      frozen_ids: [],
    };

    for (const item of req.batch) {
      try {
        if (item.operation === "merge") {
          await this.applyMerge(item, resp);
        } else {
          await this.applyCreate(item, resp);
        }
      } catch (err) {
        resp.skipped_count += 1;
        resp.skip_reasons.push(
          `${item.correction.id ?? "<no-id>"}: ${(err as Error).message}`,
        );
      }
    }
    return resp;
  }

  private async applyMerge(
    item: CorrectionUpsertItem,
    resp: CorrectionsUpsertResponse,
  ): Promise<void> {
    if (!item.match_id) {
      throw new CorrectionsServerError("merge requires match_id");
    }
    const { correction: existing } = await loadCorrectionById(this.root, item.match_id);
    const incoming = item.correction;
    const updated: Correction = {
      ...existing,
      lesson: existing.lesson,
      applies_when: mergeAppliesWhen(existing.applies_when, incoming.applies_when),
      linked_interventions: dedupeInterventions([
        ...existing.linked_interventions,
        ...(incoming.linked_interventions ?? []),
      ]),
      linked_reflection_artifacts: dedupeStrings([
        ...existing.linked_reflection_artifacts,
        ...(incoming.linked_reflection_artifacts ?? []),
      ]),
      hotness: existing.frozen
        ? existing.hotness + 1
        : Math.min(existing.hotness + 1, this.hotnessCap),
      source:
        existing.source === "seed" && incoming.source === "user"
          ? "user"
          : existing.source,
      updated_at: this.now().toISOString(),
    };
    await saveCorrection(this.root, updated);
    resp.merged_count += 1;
    resp.written_ids.push(updated.id);
  }

  private async applyCreate(
    item: CorrectionUpsertItem,
    resp: CorrectionsUpsertResponse,
  ): Promise<void> {
    const inc = item.correction;
    if (!inc.lesson || inc.lesson.length === 0) {
      throw new CorrectionsServerError("lesson required");
    }
    if (!inc.unit || !inc.section || !inc.subsection) {
      throw new CorrectionsServerError("unit/section/subsection required");
    }
    const now = this.now().toISOString();
    const created: Correction = {
      id: inc.id ?? `corr-${this.uuid()}`,
      step: inc.step,
      unit: inc.unit,
      section: inc.section,
      subsection: inc.subsection,
      lesson: inc.lesson,
      ...(inc.rationale !== undefined ? { rationale: inc.rationale } : {}),
      applies_when: inc.applies_when,
      source: inc.source,
      ...(inc.trigger !== undefined ? { trigger: inc.trigger } : {}),
      linked_reflection_artifacts: inc.linked_reflection_artifacts ?? [],
      linked_interventions: inc.linked_interventions ?? [],
      hotness: inc.hotness ?? 1,
      frozen: inc.frozen ?? false,
      schema_version: inc.schema_version ?? 2,
      created_at: now,
      updated_at: now,
      related: inc.related ?? [],
      deprecated_by: inc.deprecated_by ?? null,
    };
    await saveCorrection(this.root, created);
    resp.new_count += 1;
    resp.written_ids.push(created.id);

    await this.enforceSectionCap(created, resp);
  }

  private async enforceSectionCap(
    seed: Correction,
    resp: CorrectionsUpsertResponse,
  ): Promise<void> {
    const all = await listAllCorrections(this.root);
    const peers = all
      .map((x) => x.correction)
      .filter(
        (c) =>
          c.step === seed.step &&
          c.unit === seed.unit &&
          c.section === seed.section &&
          !c.frozen &&
          !c.deprecated_by,
      );
    if (peers.length <= this.perSectionCap) return;
    const sorted = [...peers].sort((a, b) => a.hotness - b.hotness);
    const toFreezeCount = peers.length - this.perSectionCap;
    for (let i = 0; i < toFreezeCount; i += 1) {
      const target = sorted[i];
      if (!target || target.id === seed.id) continue;
      const frozen: Correction = {
        ...target,
        frozen: true,
        updated_at: this.now().toISOString(),
      };
      await saveCorrection(this.root, frozen);
      resp.frozen_ids.push(frozen.id);
    }
  }

  /**
   * Tool (M17.f): opc_corrections — unified facade for query/record/unlearn/reindex.
   * `record` delegates to upsert(); `query` to query(); `unlearn`/`reindex`
   * return not_implemented (M18: tombstone + reindex worker).
   */
  async crud(req: CorrectionsActionRequest): Promise<CorrectionsActionResponse> {
    switch (req.action) {
      case "query": {
        const { action: _a, ...inner } = req;
        void _a;
        const resp = await this.query(inner);
        return { action: "query", ...resp };
      }
      case "record": {
        const { action: _a, ...inner } = req;
        void _a;
        const resp = await this.upsert(inner);
        return { action: "record", ...resp };
      }
      case "unlearn":
      case "reindex":
        return {
          action: req.action,
          not_implemented: true,
          reason: `opc_corrections.${req.action} deferred to M18 (tombstone + reindex worker)`,
        };
      default: {
        const _exhaustive: never = req;
        throw new CorrectionsServerError(
          `opc_corrections: unknown action=${String((_exhaustive as { action?: string }).action)}`,
        );
      }
    }
  }

  async findSimilar(
    step: StepId,
    candidate: { keywords: string[]; lesson: string; applies_when: AppliesWhen },
  ): Promise<{ match: Correction; score: number } | null> {
    const peers = await listCorrectionsByStep(this.root, step);
    let best: { match: Correction; score: number } | null = null;
    for (const p of peers) {
      const s = similarity(candidate, p);
      if (s.score >= SIM_MERGE_THRESHOLD) {
        if (!best || s.score > best.score) best = { match: p, score: s.score };
      }
    }
    return best;
  }
}

export function buildCorrection(
  partial: Partial<Correction> &
    Pick<Correction, "step" | "unit" | "section" | "subsection" | "lesson"> & {
      applies_when?: AppliesWhen;
      source?: CorrectionSource;
      trigger?: CorrectionTrigger;
    },
): Omit<Correction, "id" | "created_at" | "updated_at"> {
  return {
    step: partial.step,
    unit: partial.unit,
    section: partial.section,
    subsection: partial.subsection,
    lesson: partial.lesson,
    ...(partial.rationale !== undefined ? { rationale: partial.rationale } : {}),
    applies_when: partial.applies_when ?? { keywords: [] },
    source: partial.source ?? "distiller",
    ...(partial.trigger !== undefined ? { trigger: partial.trigger } : {}),
    linked_reflection_artifacts: partial.linked_reflection_artifacts ?? [],
    linked_interventions: partial.linked_interventions ?? [],
    hotness: partial.hotness ?? 1,
    frozen: partial.frozen ?? false,
    schema_version: partial.schema_version ?? 2,
    related: partial.related ?? [],
    deprecated_by: partial.deprecated_by ?? null,
  };
}

function mergeAppliesWhen(a: AppliesWhen, b?: AppliesWhen): AppliesWhen {
  if (!b) return a;
  const out: AppliesWhen = {
    keywords: dedupeStrings([...a.keywords, ...b.keywords]),
  };
  const phase = dedupeStrings([...(a.phase_id ?? []), ...(b.phase_id ?? [])]);
  if (phase.length) out.phase_id = phase;
  if (a.modify_unit_pattern) out.modify_unit_pattern = a.modify_unit_pattern;
  if (a.step) out.step = a.step;
  const sig = dedupeStrings([
    ...(a.intent_signals_contains ?? []),
    ...(b.intent_signals_contains ?? []),
  ]);
  if (sig.length) out.intent_signals_contains = sig;
  return out;
}

function dedupeStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function dedupeInterventions(arr: LinkedIntervention[]): LinkedIntervention[] {
  const seen = new Set<string>();
  const out: LinkedIntervention[] = [];
  for (const i of arr) {
    const k = `${i.ts}|${i.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}
