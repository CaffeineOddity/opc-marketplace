#!/usr/bin/env node

// ../../build-in/hud/index.js
var import_node_path = require("node:path");
var import_node_fs = require("node:fs");
var import_node_child_process = require("node:child_process");
async function readStdin() {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    if (chunks.length === 0)
      return null;
    const input = Buffer.concat(chunks).toString("utf-8");
    return JSON.parse(input);
  } catch {
    return null;
  }
}
function getContextPercent(stdin) {
  if (!stdin?.context_window?.used_percentage)
    return 0;
  return Math.round(stdin.context_window.used_percentage);
}
function getModelName(stdin) {
  if (!stdin?.model?.display_name)
    return "Claude";
  const name = stdin.model.display_name;
  if (name.includes("Opus"))
    return "Opus";
  if (name.includes("Sonnet"))
    return "Sonnet";
  if (name.includes("Haiku"))
    return "Haiku";
  return name;
}
function parseTranscript(transcriptPath) {
  if (!transcriptPath || !(0, import_node_fs.existsSync)(transcriptPath)) {
    return { skillCallCount: 0, toolCallCount: 0, agentCallCount: 0, lastSkill: null };
  }
  try {
    const content = (0, import_node_fs.readFileSync)(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    let skillCallCount = 0;
    let toolCallCount = 0;
    let agentCallCount = 0;
    let lastSkill = null;
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.message?.content) {
          const content2 = entry.message.content;
          if (Array.isArray(content2)) {
            for (const block of content2) {
              if (block.type === "tool_use") {
                toolCallCount++;
                if (block.name === "Skill" || block.name === "proxy_Skill") {
                  skillCallCount++;
                  const skillName = block.input?.skill;
                  if (skillName) {
                    lastSkill = skillName.replace(/^opc-founder:/, "").replace(/^oh-my-claudecode:/, "");
                  }
                }
                if (block.name === "Agent" || block.name === "proxy_Task" || block.name === "Task") {
                  agentCallCount++;
                }
              }
            }
          }
        }
      } catch {
      }
    }
    return { skillCallCount, toolCallCount, agentCallCount, lastSkill };
  } catch {
    return { skillCallCount: 0, toolCallCount: 0, agentCallCount: 0, lastSkill: null };
  }
}
function getSessionDuration(transcriptPath) {
  if (!transcriptPath || !(0, import_node_fs.existsSync)(transcriptPath))
    return 0;
  try {
    const content = (0, import_node_fs.readFileSync)(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    if (lines.length === 0)
      return 0;
    const firstEntry = JSON.parse(lines[0]);
    const startTime = new Date(firstEntry.timestamp || Date.now());
    const durationMs = Date.now() - startTime.getTime();
    return Math.floor(durationMs / 6e4);
  } catch {
    return 0;
  }
}
function getGitToplevel(cwd) {
  try {
    const result = (0, import_node_child_process.spawnSync)("git", ["rev-parse", "--show-toplevel"], {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    if (result.status === 0) {
      return result.stdout.trim();
    }
    return cwd || process.cwd();
  } catch {
    return cwd || process.cwd();
  }
}
function findProjectState(cwd) {
  const gitRoot = getGitToplevel(cwd);
  const stateDir = (0, import_node_path.join)(gitRoot, ".opc", "state");
  if (!(0, import_node_fs.existsSync)(stateDir))
    return null;
  try {
    const sessionsPath = (0, import_node_path.join)(stateDir, "sessions.json");
    if (!(0, import_node_fs.existsSync)(sessionsPath))
      return null;
    const sessionsContent = (0, import_node_fs.readFileSync)(sessionsPath, "utf-8");
    const sessionsData = JSON.parse(sessionsContent);
    const sessions = sessionsData.sessions || {};
    const sessionEntries = Object.entries(sessions);
    if (sessionEntries.length === 0)
      return null;
    const sortedSessions = sessionEntries.sort((a, b) => {
      const aTime = new Date(a[1].updated_at || a[1].created_at || 0).getTime();
      const bTime = new Date(b[1].updated_at || b[1].created_at || 0).getTime();
      return bTime - aTime;
    });
    const [lockId, session] = sortedSessions[0];
    const requirementId = session.requirement_id;
    const source = session.source || "auto_assembled";
    const stateFile = (0, import_node_path.join)(stateDir, `${requirementId}_${source}`, "project-state.json");
    if (!(0, import_node_fs.existsSync)(stateFile))
      return null;
    const content = (0, import_node_fs.readFileSync)(stateFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function formatPipelineStatus(state) {
  if (!state?.pipeline?.stages)
    return null;
  const stageOrder = state.pipeline.stage_order || Object.keys(state.pipeline.stages);
  const currentStage = state.pipeline.current_stage;
  const parts = [];
  for (const stage of stageOrder) {
    const stageData = state.pipeline.stages[stage];
    if (!stageData)
      continue;
    const status = stageData.status || "pending";
    const isCurrent = stage === currentStage;
    if (status === "completed") {
      parts.push(`${stage} \u2705`);
    } else if (status === "in_progress") {
      parts.push(`${stage} \u{1F504}`);
    } else if (status === "blocked") {
      parts.push(`${stage} \u{1F6AB}`);
    } else if (isCurrent) {
      parts.push(`${stage} \u23F3`);
    }
  }
  return parts.join(" \u2192 ");
}
function getRequirementId(state) {
  if (!state?.project?.requirement_id)
    return null;
  return state.project.requirement_id;
}
function getOpcVersion(cwd) {
  try {
    return "1.0";
  } catch {
    return null;
  }
}
var colors = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  cyan: "\x1B[36m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  red: "\x1B[31m"
};
function colorize(text, color) {
  if (process.env.OPC_HUD_SAFE === "1" || process.platform === "win32") {
    return text;
  }
  return `${colors[color] || ""}${text}${colors.reset}`;
}
function render(context) {
  const elements = [];
  elements.push(colorize("[OPC]", "bold"));
  if (context.modelName) {
    elements.push(colorize(context.modelName, "cyan"));
  }
  if (context.sessionDuration > 0) {
    const duration = context.sessionDuration;
    const durationStr = duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60}m` : `${duration}m`;
    elements.push(`${durationStr}`);
  }
  const ctxPercent = context.contextPercent;
  let ctxColor = "green";
  if (ctxPercent > 85)
    ctxColor = "red";
  else if (ctxPercent > 70)
    ctxColor = "yellow";
  elements.push(colorize(`ctx:${ctxPercent}%`, ctxColor));
  if (context.lastSkill) {
    elements.push(colorize(context.lastSkill, "cyan"));
  }
  if (context.toolCallCount > 0) {
    elements.push(`\u{1F527}${context.toolCallCount}`);
  }
  if (context.agentCallCount > 0) {
    elements.push(`\u26A1${context.agentCallCount}`);
  }
  if (context.skillCallCount > 0) {
    elements.push(`\u{1F3AF}${context.skillCallCount}`);
  }
  if (context.requirementId && context.pipelineStatus) {
    elements.push(colorize(`${context.requirementId} ${context.pipelineStatus}`, "cyan"));
  } else if (context.requirementId) {
    elements.push(colorize(context.requirementId, "cyan"));
  } else if (context.pipelineStatus) {
    elements.push(colorize(context.pipelineStatus, "cyan"));
  }
  const separator = colorize(" | ", "dim");
  return elements.join(separator);
}
async function main() {
  try {
    const stdin = await readStdin();
    if (!stdin) {
      console.log("[OPC] Starting...");
      return;
    }
    const cwd = stdin.cwd || process.cwd();
    const transcriptPath = stdin.transcript_path;
    const transcriptData = parseTranscript(transcriptPath);
    const sessionDuration = getSessionDuration(transcriptPath);
    const opcState = findProjectState(cwd);
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
      pipelineStatus: formatPipelineStatus(opcState)
    };
    const output = render(context);
    if (process.env.OPC_HUD_SAFE === "1" || process.platform === "win32") {
      console.log(output);
    } else {
      console.log(output.replace(/ /g, "\xA0"));
    }
  } catch (error) {
    console.log("[OPC] HUD error");
    if (process.env.OPC_DEBUG) {
      console.error("[OPC HUD Error]", error.message);
    }
  }
}
main();
