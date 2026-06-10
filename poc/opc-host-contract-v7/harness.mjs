#!/usr/bin/env node
/**
 * V7 PoC harness — kit-mtime heuristic accuracy.
 *
 * Claim (doc/feature/06-host-contract/00_overview.md §2.7.5):
 *   "mtime > session_started_at → 该 kit 文件在 session 启动后才落盘,
 *    几乎肯定未加载"
 *
 * V7 success criteria (doc §"7-1 PoC 验证清单"):
 *   1. session 启动后装 kit → 返回 KIT_PROBABLY_NOT_LOADED ✓
 *   2. session 启动前装 kit → 不误报 ✓
 *   3. FP rate < 5%
 *
 * This harness synthesizes a sandbox project layout with a controllable
 * `.claude/agents/*.md` mtime and a controllable session_started_at, then
 * exercises 6 scenarios totaling 100 trials each to measure FP/FN rates.
 *
 * Reference impl: the heuristic function is pure (4 lines). The PoC value
 * is in measuring its false-positive rate against realistic timing noise.
 */

import { mkdir, rm, writeFile, utimes, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(tmpdir(), `opc-v7-poc-${process.pid}-${Date.now()}`);

// ---- the heuristic under test (pure function, matches doc §2.7.5) ----

/**
 * @param {{ agent_mtime_ms: number, session_started_at_ms: number,
 *           grace_ms?: number }} input
 * @returns {{ probably_not_loaded: boolean, delta_ms: number }}
 */
function kitProbablyNotLoaded({ agent_mtime_ms, session_started_at_ms, grace_ms = 0 }) {
  const delta_ms = agent_mtime_ms - session_started_at_ms;
  // True iff agent file was modified AFTER session started.
  // grace_ms guards clock skew (default 0 — strict per doc; tunable).
  return { probably_not_loaded: delta_ms > grace_ms, delta_ms };
}

// ---- scenario fixtures ----

async function setupProject(name) {
  const dir = join(ROOT, name);
  await mkdir(join(dir, ".claude/agents"), { recursive: true });
  return dir;
}

async function writeAgent(projectDir, agentName, mtimeMs) {
  const path = join(projectDir, ".claude/agents", `${agentName}.md`);
  await writeFile(path, `---\nname: ${agentName}\n---\nbody\n`);
  const t = mtimeMs / 1000;
  await utimes(path, t, t);
  return path;
}

// ---- scenarios ----

/**
 * Scenario A (TN): kit installed before session start → should NOT warn.
 * Models the happy path: user installed kit yesterday, started claude today.
 */
async function scenarioA_installBeforeSession(trials) {
  let fp = 0;
  for (let i = 0; i < trials; i++) {
    const now = Date.now();
    // kit installed 1h–24h before session start
    const agent_mtime_ms = now - (3600 + Math.floor(Math.random() * 86400)) * 1000;
    const session_started_at_ms = now - 60_000; // session 1min old
    const { probably_not_loaded } = kitProbablyNotLoaded({
      agent_mtime_ms,
      session_started_at_ms,
    });
    if (probably_not_loaded) fp++;
  }
  return { name: "A_install_before_session", trials, fp, fn: 0, expected: "no_warn" };
}

/**
 * Scenario B (TP): kit installed AFTER session start → MUST warn.
 * Models the bug we're trying to catch: user ran `opc-kit install foo` in a
 * separate terminal while their claude session is still running.
 */
async function scenarioB_installDuringSession(trials) {
  let fn = 0;
  for (let i = 0; i < trials; i++) {
    const now = Date.now();
    const session_started_at_ms = now - 1800_000; // session 30min old
    // kit installed 1s–30min ago (after session start)
    const agent_mtime_ms = session_started_at_ms + 1000 + Math.floor(Math.random() * 1800_000);
    const { probably_not_loaded } = kitProbablyNotLoaded({
      agent_mtime_ms,
      session_started_at_ms,
    });
    if (!probably_not_loaded) fn++;
  }
  return { name: "B_install_during_session", trials, fn, fp: 0, expected: "warn" };
}

/**
 * Scenario C (boundary): kit installed at exact session_started_at.
 * Spec says ">" so equality should NOT warn. Tests the strict-vs-loose
 * boundary distinction.
 */
async function scenarioC_installAtBoundary(trials) {
  let fp = 0;
  for (let i = 0; i < trials; i++) {
    const session_started_at_ms = Date.now() - 60_000;
    const { probably_not_loaded } = kitProbablyNotLoaded({
      agent_mtime_ms: session_started_at_ms, // equal
      session_started_at_ms,
    });
    if (probably_not_loaded) fp++;
  }
  return { name: "C_boundary_equal", trials, fp, fn: 0, expected: "no_warn" };
}

/**
 * Scenario D (clock-skew FP risk): kit installed shortly BEFORE session,
 * but with simulated filesystem clock skew of up to 2s ahead.
 * Tests whether realistic NTP drift triggers FP.
 *
 * Without grace_ms, ~50% of these will FP because skew can push agent_mtime
 * past session_started_at. With grace_ms=5000, this should drop to ~0%.
 */
async function scenarioD_clockSkew(trials, grace_ms) {
  let fp = 0;
  for (let i = 0; i < trials; i++) {
    const session_started_at_ms = Date.now();
    // kit installed 0–10s before session, with ±2s clock skew on agent fs
    const real_install_offset_ms = -Math.floor(Math.random() * 10_000);
    const skew_ms = Math.floor((Math.random() - 0.5) * 4000); // ±2s
    const agent_mtime_ms = session_started_at_ms + real_install_offset_ms + skew_ms;
    const { probably_not_loaded } = kitProbablyNotLoaded({
      agent_mtime_ms,
      session_started_at_ms,
      grace_ms,
    });
    // Truth: kit was installed BEFORE session, so any warn is FP.
    if (probably_not_loaded) fp++;
  }
  return { name: `D_clock_skew_grace_${grace_ms}ms`, trials, fp, fn: 0, expected: "no_warn" };
}

/**
 * Scenario E (real filesystem): write a real .claude/agents/*.md and
 * read its mtime through node:fs/promises. Cross-checks that statSync
 * mtime resolution matches what the heuristic assumes (ms precision).
 */
async function scenarioE_realFilesystem() {
  const dir = await setupProject("E_real_fs");
  const session_started_at_ms = Date.now();
  // Wait 50ms then write the agent file. mtime > session.
  await new Promise((r) => setTimeout(r, 50));
  const path = await writeAgent(dir, "backend-engineer", Date.now());
  const { statSync } = await import("node:fs");
  const stat = statSync(path);
  const agent_mtime_ms = stat.mtimeMs;
  const { probably_not_loaded, delta_ms } = kitProbablyNotLoaded({
    agent_mtime_ms,
    session_started_at_ms,
  });
  return {
    name: "E_real_filesystem_write_after_session",
    trials: 1,
    fp: 0,
    fn: probably_not_loaded ? 0 : 1,
    expected: "warn",
    observed: { agent_mtime_ms, session_started_at_ms, delta_ms, probably_not_loaded },
  };
}

/**
 * Scenario F (real filesystem TN): write agent BEFORE we start session.
 * Cross-checks the happy path with real fs mtime.
 */
async function scenarioF_realFilesystemTN() {
  const dir = await setupProject("F_real_fs_tn");
  const path = await writeAgent(dir, "qa-tester", Date.now());
  // Session starts AFTER agent write.
  await new Promise((r) => setTimeout(r, 50));
  const session_started_at_ms = Date.now();
  const { statSync } = await import("node:fs");
  const stat = statSync(path);
  const agent_mtime_ms = stat.mtimeMs;
  const { probably_not_loaded, delta_ms } = kitProbablyNotLoaded({
    agent_mtime_ms,
    session_started_at_ms,
  });
  return {
    name: "F_real_filesystem_write_before_session",
    trials: 1,
    fp: probably_not_loaded ? 1 : 0,
    fn: 0,
    expected: "no_warn",
    observed: { agent_mtime_ms, session_started_at_ms, delta_ms, probably_not_loaded },
  };
}

// ---- runner ----

async function main() {
  await mkdir(ROOT, { recursive: true });
  const results = [];
  const N = 1000;

  results.push(await scenarioA_installBeforeSession(N));
  results.push(await scenarioB_installDuringSession(N));
  results.push(await scenarioC_installAtBoundary(100));
  results.push(await scenarioD_clockSkew(N, 0));
  results.push(await scenarioD_clockSkew(N, 5000));
  results.push(await scenarioE_realFilesystem());
  results.push(await scenarioF_realFilesystemTN());

  // Aggregate
  const totalTrials = results.reduce((a, r) => a + r.trials, 0);
  const totalFP = results.reduce((a, r) => a + (r.fp ?? 0), 0);
  const totalFN = results.reduce((a, r) => a + (r.fn ?? 0), 0);

  // Per V7 success criterion: count FP only against TN scenarios (A, C, D, F).
  const tnScenarios = results.filter((r) => r.expected === "no_warn");
  const tnTrials = tnScenarios.reduce((a, r) => a + r.trials, 0);
  const tnFP = tnScenarios.reduce((a, r) => a + (r.fp ?? 0), 0);
  const fpRate = tnFP / tnTrials;

  const tpScenarios = results.filter((r) => r.expected === "warn");
  const tpTrials = tpScenarios.reduce((a, r) => a + r.trials, 0);
  const tpFN = tpScenarios.reduce((a, r) => a + (r.fn ?? 0), 0);
  const fnRate = tpFN / tpTrials;

  const summary = {
    poc: "V7 — kit-mtime heuristic",
    pid: process.pid,
    ran_at: new Date().toISOString(),
    sandbox: ROOT,
    trials_total: totalTrials,
    tn_scenarios: { trials: tnTrials, fp: tnFP, fp_rate: fpRate },
    tp_scenarios: { trials: tpTrials, fn: tpFN, fn_rate: fnRate },
    success: {
      "1_install_after_session_warns": results.find((r) => r.name === "B_install_during_session").fn === 0,
      "2_install_before_session_quiet": results.find((r) => r.name === "A_install_before_session").fp === 0,
      "3_fp_rate_under_5pct": fpRate < 0.05,
    },
    scenarios: results,
  };

  console.log(JSON.stringify(summary, null, 2));

  // Clean up sandbox unless KEEP=1
  if (!process.env.KEEP) {
    await rm(ROOT, { recursive: true, force: true });
  }

  // Exit non-zero if any success criterion failed
  if (!Object.values(summary.success).every(Boolean)) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error("V7 harness crashed:", err);
  process.exit(1);
});
