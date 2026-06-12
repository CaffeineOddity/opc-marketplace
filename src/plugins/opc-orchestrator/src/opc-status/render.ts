/**
 * opc-status terminal renderer (M18.h).
 *
 * Reads a SessionSnapshot and produces the human-readable layout per
 * `doc/feature/02-opc-state-server/02-pipeline/08_status-display.md` (symbol
 * set `✓ ⟳ ○ ✗ ⊘ ←`). Multi-sub layouts collapse pending subs to one line and
 * expand only the active sub. Single-sub layouts show every phase/node.
 *
 * Pure function: no I/O, no ANSI colors (so output stays grep-friendly and the
 * `--json` mode is the source of truth for machine readers).
 */

import type {
  SessionSnapshot,
  SubPipelineSnapshot,
  PhaseSnapshot,
  NodeSnapshot,
  PipelineSnapshot,
} from "./snapshot.js";

const SYM = {
  completed: "✓",
  in_progress: "⟳",
  pending: "○",
  failed: "✗",
  aborted: "⊘",
} as const;

type StatusKey = keyof typeof SYM;

function sym(status: string): string {
  return status in SYM ? SYM[status as StatusKey] : "?";
}

export function renderSnapshot(s: SessionSnapshot): string {
  const lines: string[] = [];

  lines.push(`会话: ${s.session_id}`);
  lines.push(
    `状态: ${s.status}  当前步: ${s.current_step}${
      s.current_step_round != null ? ` (round ${s.current_step_round})` : ""
    }`,
  );
  lines.push(`最后活动: ${s.last_active_at}`);
  lines.push("");

  if (s.pipeline) {
    lines.push(...renderPipeline(s.pipeline));
    lines.push("");
  } else {
    lines.push("管线: <未创建>");
    lines.push("");
  }

  if (s.pending_reflections.length > 0) {
    lines.push("待办反思:");
    for (const p of s.pending_reflections) {
      const flag = p.status === "expired_pending_decision" ? " [EXPIRED]" : "";
      lines.push(
        `  · ${p.reflection_id}  step=${p.step_id}  expires=${p.expires_at}${flag}`,
      );
    }
    lines.push("");
  }

  if (s.pending_user_question) {
    const q = s.pending_user_question;
    lines.push("待回复问题:");
    lines.push(`  · ${q.question_id}  step=${q.step_id}  expires=${q.expires_at}`);
    lines.push(`    → 通过 opc_flow_user_reply 回复`);
    lines.push("");
  }

  if (s.reflection_log_tail.length > 0) {
    lines.push(`反思日志 (近 ${s.reflection_log_tail.length} 条):`);
    for (const e of s.reflection_log_tail) {
      lines.push(
        `  · ${e.at}  step=${e.step_id}  verdict=${e.verdict ?? "?"}${
          e.method ? `  method=${e.method}` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (s.user_interventions_tail.length > 0) {
    lines.push(`用户干预 (近 ${s.user_interventions_tail.length} 条):`);
    for (const iv of s.user_interventions_tail) {
      lines.push(
        `  · ${iv.at}  step=${iv.step_id}  trigger=${iv.trigger}${
          iv.question_id ? `  q=${iv.question_id}` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (s.validator_artifacts_tail.length > 0) {
    lines.push(`Validator 产物 (近 ${s.validator_artifacts_tail.length} 条):`);
    for (const v of s.validator_artifacts_tail) {
      const ref = v.node ? `${v.phase}/${v.node}` : v.phase;
      lines.push(`  · ${v.ran_at}  ${v.step}@${ref}  ${v.outcome_summary}`);
    }
    lines.push("");
  }

  lines.push("过期指标 (24h / 7d 窗口):");
  const m = s.expiry_metrics;
  lines.push(
    `  expired_pending=${m.expired_pending_count_24h}  resumed=${m.expired_resumed_count_24h}  ` +
      `discarded=${m.expired_discarded_count_24h}  skipped=${m.expired_skipped_count_24h}  ` +
      `purged_7d=${m.artifact_purged_7d_count}`,
  );

  if (s.warnings.length > 0) {
    lines.push("");
    lines.push("警告:");
    for (const w of s.warnings) lines.push(`  · ${w}`);
  }

  return lines.join("\n");
}

function renderPipeline(p: PipelineSnapshot): string[] {
  const out: string[] = [];
  out.push(`管线: ${p.description} (${p.id})`);
  out.push(`状态: ${p.status}  complexity=${p.complexity}`);

  const isMulti = p.sub_pipelines.length > 1;
  for (const sub of p.sub_pipelines) {
    if (isMulti && !sub.is_current && sub.status !== "in_progress") {
      out.push(...renderSubSummary(sub));
    } else {
      out.push(...renderSubFull(sub));
    }
  }
  return out;
}

function renderSubSummary(sub: SubPipelineSnapshot): string[] {
  const arrow = sub.is_current ? "  ← 当前" : "";
  const blocked =
    sub.blocked_by.length > 0 ? `  (等待 ${sub.blocked_by.join(", ")})` : "";
  return [`▸ ${sub.id}: ${sub.title}  ${sym(sub.status)}  ${sub.status}${blocked}${arrow}`];
}

function renderSubFull(sub: SubPipelineSnapshot): string[] {
  const out: string[] = [];
  const arrow = sub.is_current ? "  ← 当前" : "";
  out.push(`▸ ${sub.id}: ${sub.title}  ${sym(sub.status)}${arrow}`);
  if (sub.state_error) {
    out.push(`  ! state.json 不可读: ${sub.state_error}`);
    return out;
  }
  if (sub.phases.length === 0) {
    out.push("  (无 phase 状态)");
    return out;
  }
  for (const ph of sub.phases) {
    out.push(...renderPhase(ph));
  }
  return out;
}

function renderPhase(ph: PhaseSnapshot): string[] {
  const out: string[] = [];
  const counts = ph.total_count > 0 ? ` (${ph.completed_count}/${ph.total_count} nodes)` : "";
  out.push(`  ${ph.phase}  ${sym(ph.status)}${counts}`);
  for (const n of ph.nodes) {
    out.push(renderNode(n));
  }
  return out;
}

function renderNode(n: NodeSnapshot): string {
  const arrow = n.is_current ? "     ← 当前" : "";
  const agent = n.agent ? `  ${n.agent}` : "";
  const retry =
    n.retry_count > 0 ? `  (retry ${n.retry_count}/${n.max_retries})` : "";
  const blocked =
    n.blocked_by.length > 0 ? `  (等待 ${n.blocked_by.join(", ")})` : "";
  const err = n.error ? `  err=${n.error.type}` : "";
  return `    ${padName(n.name)} ${sym(n.status)}${agent}${retry}${blocked}${err}${arrow}`;
}

function padName(name: string): string {
  return name.length >= 18 ? name : name + " ".repeat(18 - name.length);
}
