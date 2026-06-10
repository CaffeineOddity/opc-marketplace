import { readTelemetry, type TelemetryEntry } from "./telemetry.js";
import type { ReflectionMethod, StepId } from "./store.js";

export interface QueryStatsRequest {
  session_id: string;
  window?: string;
  flow_state_path?: string;
  now?: () => Date;
}

export interface PerMethodStepStats {
  method: ReflectionMethod;
  step: StepId;
  runs: number;
  objections_raised_total: number;
  objections_kept_total: number;
  fp_rate: number;
  evidence_diff_count: number;
  evidence_diff_conversion: number;
  total_latency_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
  rounds_exceeded_count: number;
  fallback_triggered_count: number;
}

export interface QueryStatsTotals {
  runs: number;
  objections_raised: number;
  objections_kept: number;
  rounds_exceeded: number;
  fallback_triggered: number;
  total_latency_ms: number;
  total_tokens_in: number;
  total_tokens_out: number;
}

export interface ExpiryMetrics {
  expired_pending_count_24h: number;
  expired_resumed_count_24h: number;
  expired_discarded_count_24h: number;
  expired_skipped_count_24h: number;
  artifact_purged_7d_count: number;
}

export interface QueryStatsResponse {
  session_id: string;
  window: string | null;
  window_started_at: string | null;
  runs_total: number;
  per_method_step: PerMethodStepStats[];
  totals: QueryStatsTotals;
  expiry_metrics: ExpiryMetrics;
  expiry_metrics_source: "flow_state" | "unavailable_zeroed";
}

const ZERO_EXPIRY: ExpiryMetrics = Object.freeze({
  expired_pending_count_24h: 0,
  expired_resumed_count_24h: 0,
  expired_discarded_count_24h: 0,
  expired_skipped_count_24h: 0,
  artifact_purged_7d_count: 0,
});

export function parseWindow(window: string | undefined): number | null {
  if (!window) return null;
  const m = /^(\d+)\s*(s|m|h|d)$/i.exec(window.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "m").toLowerCase();
  const mult =
    unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return n * mult;
}

export async function aggregateTelemetry(
  root: string,
  req: QueryStatsRequest,
): Promise<QueryStatsResponse> {
  const all = await readTelemetry(root, req.session_id);
  const now = req.now ? req.now() : new Date();
  const windowMs = parseWindow(req.window);
  let windowStart: Date | null = null;
  let filtered = all;
  if (windowMs !== null) {
    windowStart = new Date(now.getTime() - windowMs);
    const cutoff = windowStart.getTime();
    filtered = all.filter((e) => {
      const t = Date.parse(e.ts);
      return Number.isFinite(t) && t >= cutoff;
    });
  }

  const bucketMap = new Map<string, PerMethodStepStats>();
  const totals: QueryStatsTotals = {
    runs: 0,
    objections_raised: 0,
    objections_kept: 0,
    rounds_exceeded: 0,
    fallback_triggered: 0,
    total_latency_ms: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
  };

  for (const e of filtered) {
    const key = `${e.method}::${e.step}`;
    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        method: e.method,
        step: e.step,
        runs: 0,
        objections_raised_total: 0,
        objections_kept_total: 0,
        fp_rate: 0,
        evidence_diff_count: 0,
        evidence_diff_conversion: 0,
        total_latency_ms: 0,
        total_tokens_in: 0,
        total_tokens_out: 0,
        rounds_exceeded_count: 0,
        fallback_triggered_count: 0,
      };
      bucketMap.set(key, bucket);
    }
    accumulate(bucket, e);
    totals.runs += 1;
    totals.objections_raised += e.objections_raised;
    totals.objections_kept += e.objections_kept;
    if (e.verdict === "rounds_exceeded") totals.rounds_exceeded += 1;
    if (e.fallback_triggered) totals.fallback_triggered += 1;
    if (typeof e.latency_ms === "number") totals.total_latency_ms += e.latency_ms;
    if (typeof e.tokens_in === "number") totals.total_tokens_in += e.tokens_in;
    if (typeof e.tokens_out === "number") totals.total_tokens_out += e.tokens_out;
  }

  for (const bucket of bucketMap.values()) {
    bucket.fp_rate =
      bucket.objections_raised_total === 0
        ? 0
        : round4(bucket.objections_kept_total / bucket.objections_raised_total);
    bucket.evidence_diff_conversion =
      bucket.objections_kept_total === 0
        ? 0
        : round4(bucket.evidence_diff_count / bucket.objections_kept_total);
  }

  const per_method_step = Array.from(bucketMap.values()).sort((a, b) => {
    if (a.step !== b.step) return a.step < b.step ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });

  return {
    session_id: req.session_id,
    window: req.window ?? null,
    window_started_at: windowStart ? windowStart.toISOString() : null,
    runs_total: totals.runs,
    per_method_step,
    totals,
    expiry_metrics: { ...ZERO_EXPIRY },
    expiry_metrics_source: "unavailable_zeroed",
  };
}

function accumulate(bucket: PerMethodStepStats, e: TelemetryEntry): void {
  bucket.runs += 1;
  bucket.objections_raised_total += e.objections_raised;
  bucket.objections_kept_total += e.objections_kept;
  if (e.evidence_diff) bucket.evidence_diff_count += 1;
  if (typeof e.latency_ms === "number") bucket.total_latency_ms += e.latency_ms;
  if (typeof e.tokens_in === "number") bucket.total_tokens_in += e.tokens_in;
  if (typeof e.tokens_out === "number") bucket.total_tokens_out += e.tokens_out;
  if (e.verdict === "rounds_exceeded") bucket.rounds_exceeded_count += 1;
  if (e.fallback_triggered) bucket.fallback_triggered_count += 1;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
