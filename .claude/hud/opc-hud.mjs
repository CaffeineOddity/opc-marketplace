#!/usr/bin/env node
/**
 * OPC HUD - Statusline Script for opc-marketplace
 *
 * Displays: [OPC#version] | session: Xm | skill:name | ctx:X% | 🔧N ⚡N
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

  // [OPC#version] label
  const versionTag = context.opcVersion ? `#${context.opcVersion}` : "";
  elements.push(colorize(`[OPC${versionTag}]`, "bold"));

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
    elements.push(`session:${durationStr}`);
  }

  // Last skill
  if (context.lastSkill) {
    elements.push(colorize(`skill:${context.lastSkill}`, "cyan"));
  }

  // Context percentage with color
  const ctxPercent = context.contextPercent;
  let ctxColor = "green";
  if (ctxPercent > 85) ctxColor = "red";
  else if (ctxPercent > 70) ctxColor = "yellow";
  elements.push(colorize(`ctx:${ctxPercent}%`, ctxColor));

  // Tool/Agent/Skill counts with icons
  const toolIcon = "🔧";
  const agentIcon = "⚡";
  const skillIcon = "🎯";

  // Show counts
  if (context.toolCallCount > 0) {
    elements.push(`${toolIcon}${context.toolCallCount}`);
  }
  if (context.agentCallCount > 0) {
    elements.push(`${agentIcon}${context.agentCallCount}`);
  }
  if (context.skillCallCount > 0) {
    elements.push(`${skillIcon}${context.skillCallCount}`);
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