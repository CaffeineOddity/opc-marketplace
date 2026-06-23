import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import { atomicWrite, withFileLock } from "@opc/memory-store";

import {
  buildIndex,
  correctionsRoot,
  listAllCorrections,
  listCorrectionsByStep,
  loadCorrectionById,
  saveCorrection,
  saveCorrectionIndex,
  type AppliesWhen,
  type Correction,
  type CorrectionSource,
  type CorrectionTrigger,
  type LinkedIntervention,
} from "./corrections-store.js";
import { loadSeedCorrections } from "./seed-loader.js";
import { promoteToGlobal } from "./global-corrections-store.js";
import { similarity, SIM_MERGE_THRESHOLD } from "./similarity.js";
import type { StepId } from "./store.js";

export interface CorrectionsServerOptions {
  root: string;
  now?: () => Date;
  uuid?: () => string;
  perSectionCap?: number;
  hotnessCap?: number;
  autoDecay?: boolean;
  globalCorrectionsRoot?: string;
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

export interface PromoteRequest {
  action: "promote";
  correction_id: string;
  session_id: string;
  source_project?: string;
}

export type CorrectionsActionRequest =
  | ({ action: "query" } & CorrectionsQueryRequest)
  | ({ action: "record" } & CorrectionsUpsertRequest)
  | { action: "unlearn"; correction_id: string; reason?: string }
  | { action: "reindex"; scope?: "all" | { step: StepId } }
  | PromoteRequest
  | { action: "migrate"; source_step?: StepId; target_step?: StepId; correction_ids?: string[] }
  | { action: "endorse"; correction_id: string; endorser?: string }
  | { action: "freeze"; correction_id: string; reason?: string }
  | { action: "delete"; correction_id: string; reason?: string };

export interface UnlearnResponse {
  tombstoned_id: string;
  frozen: boolean;
  reason: string;
}

export interface ReindexResponse {
  indexed: number;
  duration_ms: number;
}

export interface PromoteResponse {
  promoted_id: string;
  l2_source_id: string;
}

export interface MigrateResponse {
  migrated: number;
  source_step?: string;
  target_step?: string;
}

export interface EndorseResponse {
  correction_id: string;
  endorsed: boolean;
  endorsed_by?: string;
}

export interface FreezeResponse {
  correction_id: string;
  frozen: boolean;
  reason: string;
}

export interface DeleteResponse {
  correction_id: string;
  deleted: boolean;
}

export type CorrectionsActionResponse =
  | ({ action: "query" } & CorrectionsQueryResponse)
  | ({ action: "record" } & CorrectionsUpsertResponse)
  | ({ action: "unlearn" } & UnlearnResponse)
  | ({ action: "reindex" } & ReindexResponse)
  | ({ action: "promote" } & PromoteResponse)
  | ({ action: "migrate" } & MigrateResponse)
  | ({ action: "endorse" } & EndorseResponse)
  | ({ action: "freeze" } & FreezeResponse)
  | ({ action: "delete" } & DeleteResponse);

const DEFAULT_PER_SECTION_CAP = 5;
const DEFAULT_HOTNESS_CAP = 50;
const DECAY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DECAY_FACTOR = 0.9;
const DECAY_FREEZE_THRESHOLD = 3;
const DECAY_META_FILENAME = "decay-meta.json";

interface DecayMeta {
  last_decay_at: string;
  decayed_count: number;
  frozen_count: number;
}

export class CorrectionsServer {
  readonly root: string;
  private readonly now: () => Date;
  private readonly uuid: () => string;
  private readonly perSectionCap: number;
  private readonly hotnessCap: number;
  private readonly autoDecay: boolean;
  private readonly globalCorrectionsRoot: string | undefined;

  constructor(opts: CorrectionsServerOptions) {
    this.root = opts.root;
    this.now = opts.now ?? ((): Date => new Date());
    this.uuid = opts.uuid ?? ((): string => randomUUID());
    this.perSectionCap = opts.perSectionCap ?? DEFAULT_PER_SECTION_CAP;
    this.hotnessCap = opts.hotnessCap ?? DEFAULT_HOTNESS_CAP;
    this.autoDecay = opts.autoDecay ?? true;
    this.globalCorrectionsRoot = opts.globalCorrectionsRoot;
  }

  async query(req: CorrectionsQueryRequest): Promise<CorrectionsQueryResponse> {
    // Auto-trigger decay if due (non-blocking, errors swallowed)
    if (this.autoDecay) {
      try {
        await this.runDecayIfDue();
      } catch {
        // Decay failure must not block query
      }
    }

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
      ...(inc.endorsed_by !== undefined ? { endorsed_by: inc.endorsed_by } : {}),
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
    let toFreezeCount = peers.length - this.perSectionCap;
    for (let i = 0; i < sorted.length && toFreezeCount > 0; i += 1) {
      const target = sorted[i];
      if (!target || target.id === seed.id) continue;
      const frozen: Correction = {
        ...target,
        frozen: true,
        updated_at: this.now().toISOString(),
      };
      await saveCorrection(this.root, frozen);
      resp.frozen_ids.push(frozen.id);
      toFreezeCount -= 1;
    }
  }

  /**
   * Tool (M17.f): opc_corrections — unified facade for query/record/unlearn/reindex.
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
      case "unlearn": {
        const { action, ...params } = req;
        void action;
        const resp = await this.unlearn(params);
        return { action: "unlearn", ...resp };
      }
      case "reindex": {
        const { action, ...params } = req;
        void action;
        const resp = await this.reindex(params);
        return { action: "reindex", ...resp };
      }
      case "promote": {
        const { correction_id, session_id, source_project } = req;
        const { correction } = await loadCorrectionById(
          this.root,
          correction_id,
        );
        const entry = await promoteToGlobal(correction, {
          session_id,
          ...(source_project !== undefined ? { source_project } : {}),
          ...(this.globalCorrectionsRoot !== undefined ? { root: this.globalCorrectionsRoot } : {}),
          now: this.now,
        });
        return {
          action: "promote",
          promoted_id: entry.id,
          l2_source_id: correction_id,
        };
      }
      case "migrate": {
        const { action: _m, ...params } = req;
        void _m;
        const resp = await this.migrate(params);
        return { action: "migrate", ...resp };
      }
      case "endorse": {
        const { action: _e, ...params } = req;
        void _e;
        const resp = await this.endorse(params);
        return { action: "endorse", ...resp };
      }
      case "freeze": {
        const { action: _f, ...params } = req;
        void _f;
        const resp = await this.freezeCorrection(params);
        return { action: "freeze", ...resp };
      }
      case "delete": {
        const { action: _d, ...params } = req;
        void _d;
        const resp = await this.deleteCorrection(params);
        return { action: "delete", ...resp };
      }
      default: {
        const _exhaustive: never = req;
        throw new CorrectionsServerError(
          `opc_corrections: unknown action=${String((_exhaustive as { action?: string }).action)}`,
        );
      }
    }
  }

  private async unlearn(params: {
    correction_id: string;
    reason?: string;
  }): Promise<{ tombstoned_id: string; frozen: boolean; reason: string }> {
    const { correction, path: _path } = await loadCorrectionById(
      this.root,
      params.correction_id,
    );
    void _path;

    const now = this.now().toISOString();
    const tombstoned: Correction = {
      ...correction,
      frozen: true,
      deprecated_by: `unlearned: ${params.reason ?? "manual unlearn"}`,
      updated_at: now,
    };
    await saveCorrection(this.root, tombstoned);

    return {
      tombstoned_id: tombstoned.id,
      frozen: true,
      reason: params.reason ?? "manual unlearn",
    };
  }

  private async reindex(params: {
    scope?: "all" | { step: StepId };
  }): Promise<{ indexed: number; duration_ms: number }> {
    const start = performance.now();
    const all = await listAllCorrections(this.root);
    const scope = params.scope ?? "all";

    const filtered =
      scope === "all"
        ? all
        : all.filter((x) => x.correction.step === scope.step);

    const index = buildIndex(filtered.map((x) => x.correction));
    await saveCorrectionIndex(this.root, index);

    const duration_ms = Math.round(performance.now() - start);
    return { indexed: filtered.length, duration_ms };
  }

  private async migrate(params: {
    source_step?: StepId;
    target_step?: StepId;
    correction_ids?: string[];
  }): Promise<MigrateResponse> {
    if (!params.target_step) {
      throw new CorrectionsServerError("target_step required for migrate");
    }
    const all = await listAllCorrections(this.root);
    let candidates = all.map((x) => x.correction);
    if (params.source_step) {
      candidates = candidates.filter((c) => c.step === params.source_step);
    }
    if (params.correction_ids && params.correction_ids.length > 0) {
      const idSet = new Set(params.correction_ids);
      candidates = candidates.filter((c) => idSet.has(c.id));
    }
    const now = this.now().toISOString();
    for (const c of candidates) {
      const updated: Correction = { ...c, step: params.target_step, updated_at: now };
      await saveCorrection(this.root, updated);
    }
    return {
      migrated: candidates.length,
      ...(params.source_step !== undefined ? { source_step: params.source_step } : {}),
      target_step: params.target_step,
    };
  }

  private async endorse(params: {
    correction_id: string;
    endorser?: string;
  }): Promise<EndorseResponse> {
    const { correction } = await loadCorrectionById(this.root, params.correction_id);
    const endorser = params.endorser ?? "system";
    const updated: Correction = {
      ...correction,
      endorsed_by: endorser,
      updated_at: this.now().toISOString(),
    };
    await saveCorrection(this.root, updated);
    return { correction_id: updated.id, endorsed: true, endorsed_by: endorser };
  }

  private async freezeCorrection(params: {
    correction_id: string;
    reason?: string;
  }): Promise<FreezeResponse> {
    const { correction } = await loadCorrectionById(this.root, params.correction_id);
    const updated: Correction = {
      ...correction,
      frozen: true,
      updated_at: this.now().toISOString(),
    };
    await saveCorrection(this.root, updated);
    return { correction_id: updated.id, frozen: true, reason: params.reason ?? "manual freeze" };
  }

  private async deleteCorrection(params: {
    correction_id: string;
    reason?: string;
  }): Promise<DeleteResponse> {
    const { correction } = await loadCorrectionById(this.root, params.correction_id);
    const updated: Correction = {
      ...correction,
      frozen: true,
      deprecated_by: `deleted: ${params.reason ?? "manual delete"}`,
      updated_at: this.now().toISOString(),
    };
    await saveCorrection(this.root, updated);
    return { correction_id: updated.id, deleted: true };
  }

  async runDecayIfDue(): Promise<DecayMeta | null> {
    const meta = await this.loadDecayMeta();
    const now = this.now();
    const lastDecay = Date.parse(meta?.last_decay_at ?? "0");
    if (!Number.isFinite(lastDecay)) return null;
    if (now.getTime() - lastDecay < DECAY_INTERVAL_MS) return null;

    return this.runDecay();
  }

  async runDecay(): Promise<DecayMeta> {
    const all = await listAllCorrections(this.root);
    let decayedCount = 0;
    let frozenCount = 0;

    for (const { correction: c } of all) {
      if (c.frozen || c.deprecated_by) continue;

      const newHotness = Math.round(c.hotness * DECAY_FACTOR * 10) / 10;
      const shouldFreeze = newHotness < DECAY_FREEZE_THRESHOLD;

      if (newHotness !== c.hotness || shouldFreeze) {
        const updated: Correction = {
          ...c,
          hotness: newHotness,
          frozen: c.frozen || shouldFreeze,
          updated_at: this.now().toISOString(),
        };
        await saveCorrection(this.root, updated);
        decayedCount += 1;
        if (shouldFreeze) frozenCount += 1;
      }
    }

    const meta: DecayMeta = {
      last_decay_at: this.now().toISOString(),
      decayed_count: decayedCount,
      frozen_count: frozenCount,
    };
    await this.saveDecayMeta(meta);
    return meta;
  }

  private decayMetaPath(): string {
    return join(correctionsRoot(this.root), DECAY_META_FILENAME);
  }

  private async loadDecayMeta(): Promise<DecayMeta | null> {
    try {
      const raw = await readFile(this.decayMetaPath(), "utf8");
      return JSON.parse(raw) as DecayMeta;
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "ENOENT"
      ) {
        return null;
      }
      throw err;
    }
  }

  private async saveDecayMeta(meta: DecayMeta): Promise<void> {
    const path = this.decayMetaPath();
    await mkdir(dirname(path), { recursive: true });
    await withFileLock(path, async () => {
      await atomicWrite(path, `${JSON.stringify(meta, null, 2)}\n`);
    });
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
    ...(partial.endorsed_by !== undefined ? { endorsed_by: partial.endorsed_by } : {}),
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
