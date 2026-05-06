/**
 * Session Handler
 *
 * Handles opc_sessions_list tool calls.
 */

import { existsSync, readdirSync } from 'fs';
import { getCurrentLockId } from '../lock.js';
import { ensureOpcDir } from '../paths.js';
import { getCurrentSession } from '../session.js';
import { readProjectState } from '../state.js';
import type { ToolResult } from './index.js';

export function handleSessionsList(cwd: string | undefined): ToolResult {
  const lockId = getCurrentLockId(cwd);
  const currentSession = getCurrentSession(lockId, cwd);
  const stateDir = ensureOpcDir('state', cwd);

  const allTaskDirs = existsSync(stateDir)
    ? readdirSync(stateDir).filter((f: string) =>
        f.match(/^REQ-\d+_(matched|auto_assembled)$/)
      )
    : [];

  if (allTaskDirs.length === 0) {
    return {
      content: [{ type: 'text', text: 'No tasks found. Use opc_state_init to start a new project.' }],
    };
  }

  const taskList = allTaskDirs
    .map((dirName: string) => {
      const match = dirName.match(/^(REQ-\d+)_(matched|auto_assembled)$/);
      if (!match) return null;

      const reqId = match[1];
      const source = match[2] as 'matched' | 'auto_assembled';
      const state = readProjectState(reqId, source, cwd);
      if (!state) return null;

      const isCurrent = currentSession &&
        currentSession.requirement_id === reqId &&
        currentSession.source === source;
      const status = state.pipeline.stages[state.pipeline.current_stage]?.status || 'pending';
      const icon = status === 'in_progress' ? '🔄' :
                   status === 'completed' ? '✅' :
                   status === 'blocked' ? '🚫' : '⏳';
      const currentMarker = isCurrent ? ' ← **current**' : '';
      const workflowTag = state.workflow?.name || source;

      return `${icon} **${reqId}** [${workflowTag}]: ${state.project.name} (${status})${currentMarker}`;
    })
    .filter(Boolean)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## All Tasks (${allTaskDirs.length})

${taskList}

Use \`opc_state_init(requirement_id="REQ-XXX")\` to resume a task.`,
    }],
  };
}