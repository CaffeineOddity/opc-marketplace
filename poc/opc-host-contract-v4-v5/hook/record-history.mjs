#!/usr/bin/env node
/**
 * V5 history-inspection helper.
 *
 * V5 asks: does the UserPromptSubmit hook's injected text accumulate
 * inside the user-message history Claude sees on each subsequent turn?
 * If yes, a long session with `loud` intensity slowly burns tokens
 * even when the hook adds nothing new — a regression we must catch
 * before flipping the default.
 *
 * Inputs:
 *   - A path to an exported Claude Code session transcript (JSONL).
 *     Find these under Claude's local session store. The runbook
 *     names the exact path on macOS / Linux.
 *
 * Outputs:
 *   - Counts of marker occurrences per role across the transcript.
 *   - Pass criterion (printed):
 *       PASS — marker appears 0 or 1 times *visible to the model* across
 *              user-message history; subsequent turns have no copies.
 *       FAIL — marker shows up in user-message history of turns N+1,
 *              N+2, ... after turn N where the hook fired (cumulative).
 *
 * Usage:
 *   node record-history.mjs <transcript.jsonl> [--marker OPC-V45-SPIKE-xxx]
 *   # marker defaults to the substring "OPC-V45-SPIKE"
 */

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const path = argv[2];
if (!path) {
  console.error("usage: record-history.mjs <transcript.jsonl> [--marker SUBSTRING]");
  exit(64);
}
const markerIdx = argv.indexOf("--marker");
const marker = markerIdx > 0 ? argv[markerIdx + 1] : "OPC-V45-SPIKE";

const raw = readFileSync(path, "utf8");
const lines = raw.split("\n").filter(Boolean);

let totalEvents = 0;
let userTurns = 0;
let hookFires = 0;
const markerCountsByTurn = []; // [{turn, role, markerOccurrences}]

for (const line of lines) {
  totalEvents += 1;
  let ev;
  try { ev = JSON.parse(line); } catch { continue; }

  // Heuristic role/text extraction — Claude transcript formats vary by version.
  const role = ev.role ?? ev.type ?? ev.message?.role;
  const text =
    typeof ev.text === "string" ? ev.text :
    typeof ev.content === "string" ? ev.content :
    Array.isArray(ev.content) ? ev.content.map((p) => p.text ?? "").join("\n") :
    typeof ev.message?.content === "string" ? ev.message.content :
    Array.isArray(ev.message?.content) ? ev.message.content.map((p) => p.text ?? "").join("\n") :
    "";

  if (!text) continue;

  if (role === "user" || role === "human") {
    userTurns += 1;
    const occ = (text.match(new RegExp(marker, "g")) || []).length;
    if (occ > 0) {
      markerCountsByTurn.push({ turn: userTurns, role, occurrences: occ });
      hookFires += 1;
    }
  } else if (role === "hook" || role === "system_addition") {
    // Some Claude transports represent the hook injection as its own event.
    hookFires += 1;
  }
}

const cumulativeRisk = markerCountsByTurn.some((m) => m.occurrences > 1);
const reappearsAcrossTurns = markerCountsByTurn.length > 1 &&
  // any marker showing in turn T > 1 after first sighting suggests
  // either (a) the hook fired again that turn — fine — or
  // (b) the prior injection was concatenated into the new user message
  // (the FAIL case). Disambiguate by checking the hook fires.tsv:
  // if marker appears in turn T but hook log shows no fire at that turn,
  // it's a cumulative-replay. The harness can't see fires.tsv from here,
  // so report both signals and let the operator combine.
  true;

const verdict = cumulativeRisk ? "FAIL"
  : (reappearsAcrossTurns ? "INCONCLUSIVE — cross-check with hook fires.tsv"
                          : "PASS");

console.log(JSON.stringify({
  poc: "V5 — hook history accumulation",
  transcript: path,
  marker,
  totals: { events: totalEvents, user_turns: userTurns, marker_hits: hookFires },
  marker_occurrences_per_turn: markerCountsByTurn,
  verdict,
  notes: [
    "PASS: marker appears at most once per user turn AND only in the turn(s) where the hook actually fired.",
    "FAIL: any user turn shows marker count > 1 (concatenation), or marker appears in turns where hook log shows no fire.",
    "INCONCLUSIVE means multiple turns contain the marker — check hook fires.tsv against the turn numbers to confirm each is a fresh injection, not a replay.",
  ],
}, null, 2));

if (verdict === "FAIL") exit(2);
