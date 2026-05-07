#!/usr/bin/env node
/**
 * OPC HUD - Statusline Script for opc-marketplace
 *
 * Displays: [OPC] | taskName 🔄stage | model | duration | ctx:% | counts
 *
 * Stage icons:
 * - ✅ = completed
 * - 🔄 = in_progress
 * - 🚫 = blocked
 * - ⏳ = pending
 *
 * This script receives stdin JSON from Claude Code and outputs a formatted statusline.
 */

import { homedir } from "node:os";
import { join, basename } from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

// ============================================================================
// Stdin Parsing
// ============================================================================

/**
 * Read stdin from Claude Code statusline
 * Claude Code sends JSON with: transcript_path, cwd, model, context_window
 */
async function readStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    if (chunks.length === 0) return null;
    const input = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Get context window percentage from stdin
 */
function getContextPercent(stdin) {
  if (!stdin?.context_window?.used_percentage) return 0;
  return Math.round(stdin.context_window.used_percentage);
}

/**
 * Get model display name
 */
function getModelName(stdin) {
  if (!stdin?.model?.display_name) return "Claude";
  const name = stdin.model.display_name;
  // Shorten model names: "Claude Opus 4.6" -> "Opus"
  if (name.includes("Opus")) return "Opus";
  if (name.includes("Sonnet")) return "Sonnet";
  if (name.includes("Haiku")) return "Haiku";
  return name;
}

// ============================================================================
// Transcript Parsing (Simplified)
// ============================================================================

/**
 * Parse transcript to extract skill calls, tool calls, and agent calls
 */
function parseTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return { skillCallCount: 0, toolCallCount: 0, agentCallCount: 0, lastSkill: null };
  }

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    let skillCallCount = 0;
    let toolCallCount = 0;
    let agentCallCount = 0;
    let lastSkill = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Count tool calls
        if (entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_use") {
                toolCallCount++;
                // Detect skill invocations
                if (block.name === "Skill" || block.name === "proxy_Skill") {
                  skillCallCount++;
                  const skillName = block.input?.skill;
                  if (skillName) {
                    lastSkill = skillName.replace(/^opc-founder:/, "").replace(/^oh-my-claudecode:/, "");
                  }
                }
                // Detect agent invocations
                if (block.name === "Agent" || block.name === "proxy_Task" || block.name === "Task") {
                  agentCallCount++;
                }
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    return { skillCallCount, toolCallCount, agentCallCount, lastSkill };
  } catch {
    return { skillCallCount: 0, toolCallCount: 0, agentCallCount: 0, lastSkill: null };
  }
}

/**
 * Get session duration from transcript
 */
function getSessionDuration(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0;

  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0) return 0;

    // First line has session start timestamp
    const firstEntry = JSON.parse(lines[0]);
    const startTime = new Date(firstEntry.timestamp || Date.now());
    const durationMs = Date.now() - startTime.getTime();
    return Math.floor(durationMs / 60_000); // minutes
  } catch {
    return 0;
  }
}

// ============================================================================
// OPC State Parsing
// ============================================================================

/**
 * Get git toplevel root using spawnSync
 */
function getGitToplevel(cwd) {
  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: cwd || process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return cwd || process.cwd();
  } catch {
    return cwd || process.cwd();
  }
}

/**
 * Find the most recent project state file
 * Supports both old format (pid-XXX) and new format (REQ-XXX_source)
 */
function findProjectState(cwd) {
  const gitRoot = getGitToplevel(cwd);
  const stateDir = join(gitRoot, '.opc', 'state');

  if (!existsSync(stateDir)) return null;

  try {
    // First, try to read sessions.json to get current session
    const sessionsPath = join(stateDir, 'sessions.json');
    if (existsSync(sessionsPath)) {
      const sessionsContent = readFileSync(sessionsPath, 'utf-8');
      const sessionsData = JSON.parse(sessionsContent);
      const sessions = sessionsData.sessions || {};

      // Find the most recent session by updated_at
      const sessionEntries = Object.entries(sessions);
      if (sessionEntries.length > 0) {
        const sortedSessions = sessionEntries.sort((a, b) => {
          const aTime = new Date(a[1].updated_at || a[1].created_at || 0).getTime();
          const bTime = new Date(b[1].updated_at || b[1].created_at || 0).getTime();
          return bTime - aTime;
        });

        const [lockId, session] = sortedSessions[0];
        const requirementId = session.requirement_id;
        const source = session.source || 'auto_assembled';

        // Try new format first: REQ-XXX_source/project-state.json
        const newStateFile = join(stateDir, `${requirementId}_${source}`, 'project-state.json');
        if (existsSync(newStateFile)) {
          const content = readFileSync(newStateFile, 'utf-8');
          return JSON.parse(content);
        }
      }
    }

    // Fallback: scan directories for state files
    const entries = readdirSync(stateDir, { withFileTypes: true });

    // Collect all potential state directories (both old and new format)
    const stateDirs = entries
      .filter(d => d.isDirectory() && (d.name.startsWith('pid-') || d.name.startsWith('REQ-')))
      .map(d => {
        const stateFile = join(stateDir, d.name, 'project-state.json');
        if (!existsSync(stateFile)) return null;
        try {
          const stat = statSync(stateFile);
          return { path: stateFile, mtime: stat.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    if (stateDirs.length === 0) return null;

    const content = readFileSync(stateDirs[0].path, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get stage status icon
 */
function getStageIcon(status) {
  switch (status) {
    case 'completed': return '✅';
    case 'in_progress': return '🔄';
    case 'blocked': return '🚫';
    default: return '⏳';
  }
}

/**
 * Format pipeline status - show pipeline flow with stage status icons
 * Returns: "product → dev ✅ → qa 🔄 → ship" (arrow flow with status icons)
 */
function formatPipelineStatus(state) {
  if (!state?.pipeline?.stages) return null;

  const stages = ['product', 'design', 'dev', 'qa', 'ship', 'growth'];
  const currentStage = state.pipeline.current_stage;

  // Build pipeline flow showing all active stages
  const parts = [];
  let foundCurrent = false;

  for (const stage of stages) {
    const stageData = state.pipeline.stages[stage];
    const status = stageData?.status || 'pending';
    const isCurrent = stage === currentStage;

    // Skip pending stages that are not current and not after current
    if (status === 'pending' && !isCurrent && !foundCurrent) {
      continue;
    }

    // Stop after showing one pending stage after current
    if (foundCurrent && status === 'pending') {
      parts.push(stage);
      break;
    }

    // Show stage with appropriate icon based on actual status
    if (status === 'completed') {
      parts.push(`${stage} ✅`);
      if (isCurrent) foundCurrent = true;
    } else if (status === 'in_progress') {
      parts.push(`${stage} 🔄`);
      foundCurrent = true;
    } else if (status === 'blocked') {
      parts.push(`${stage} 🚫`);
      foundCurrent = true;
    } else if (isCurrent) {
      // Current stage but pending
      parts.push(`${stage} ⏳`);
      foundCurrent = true;
    }
  }

  return parts.join(' → ');
}

/**
 * Get requirement ID for display
 */
function getRequirementId(state) {
  if (!state?.project?.requirement_id) return null;
  return state.project.requirement_id;
}

// ============================================================================
// OPC Version Detection
// ============================================================================

/**
 * Get OPC marketplace version from git or manifest
 */
function getOpcVersion(cwd) {
  try {
    // Try to get version from git tag or commit
    // For now, just return a placeholder
    return "1.0";
  } catch {
    return null;
  }
}

// ============================================================================
// Color Helpers (ANSI)
// ============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function colorize(text, color) {
  // In safe mode, skip colors
  if (process.env.OPC_HUD_SAFE === "1" || process.platform === "win32") {
    return text;
  }
  return `${colors[color] || ""}${text}${colors.reset}`;
}

// ============================================================================
// Render
// ============================================================================

/**
 * Render the statusline
 */
function render(context) {
  const elements = [];

  // [OPC] label
  elements.push(colorize("[OPC]", "bold"));

  // Model name
  if (context.modelName) {
    elements.push(colorize(context.modelName, "cyan"));
  }

  // Session duration
  if (context.sessionDuration > 0) {
    const duration = context.sessionDuration;
    const durationStr = duration >= 60
      ? `${Math.floor(duration / 60)}h${duration % 60}m`
      : `${duration}m`;
    elements.push(`${durationStr}`);
  }

  // Context percentage with color
  const ctxPercent = context.contextPercent;
  let ctxColor = "green";
  if (ctxPercent > 85) ctxColor = "red";
  else if (ctxPercent > 70) ctxColor = "yellow";
  elements.push(colorize(`ctx:${ctxPercent}%`, ctxColor));

  // Last skill (if any)
  if (context.lastSkill) {
    elements.push(colorize(context.lastSkill, "cyan"));
  }

  // Tool/Agent/Skill counts with icons
  if (context.toolCallCount > 0) {
    elements.push(`🔧${context.toolCallCount}`);
  }
  if (context.agentCallCount > 0) {
    elements.push(`⚡${context.agentCallCount}`);
  }
  if (context.skillCallCount > 0) {
    elements.push(`🎯${context.skillCallCount}`);
  }

  // Orchestration info at the end - requirementId | pipeline flow
  if (context.requirementId && context.pipelineStatus) {
    elements.push(colorize(`${context.requirementId} ${context.pipelineStatus}`, "cyan"));
  } else if (context.requirementId) {
    elements.push(colorize(context.requirementId, "cyan"));
  } else if (context.pipelineStatus) {
    elements.push(colorize(context.pipelineStatus, "cyan"));
  }

  // Join with separator
  const separator = colorize(" | ", "dim");
  return elements.join(separator);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    const stdin = await readStdin();

    if (!stdin) {
      console.log("[OPC] Starting...");
      return;
    }

    const cwd = stdin.cwd || process.cwd();
    const transcriptPath = stdin.transcript_path;

    // Parse transcript
    const transcriptData = parseTranscript(transcriptPath);
    const sessionDuration = getSessionDuration(transcriptPath);

    // Parse OPC state for orchestration info
    const opcState = findProjectState(cwd);

    // Build context
    const context = {
      contextPercent: getContextPercent(stdin),
      modelName: getModelName(stdin),
      opcVersion: getOpcVersion(cwd),
      sessionDuration,
      lastSkill: transcriptData.lastSkill,
      toolCallCount: transcriptData.toolCallCount,
      agentCallCount: transcriptData.agentCallCount,
      skillCallCount: transcriptData.skillCallCount,
      // Orchestration info
      requirementId: getRequirementId(opcState),
      pipelineStatus: formatPipelineStatus(opcState),
    };

    // Render and output
    const output = render(context);

    // In safe mode, use regular spaces; otherwise use non-breaking for alignment
    if (process.env.OPC_HUD_SAFE === "1" || process.platform === "win32") {
      console.log(output);
    } else {
      console.log(output.replace(/ /g, " "));
    }
  } catch (error) {
    console.log("[OPC] HUD error");
    if (process.env.OPC_DEBUG) {
      console.error("[OPC HUD Error]", error.message);
    }
  }
}

main();