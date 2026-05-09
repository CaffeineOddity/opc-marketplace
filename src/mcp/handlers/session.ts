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
  const sessionsDir = ensureOpcDir('state/sessions', cwd);

  const allSessionFiles = existsSync(sessionsDir)
    ? readdirSync(sessionsDir).filter((f: string) => f.endsWith('.json'))
    : [];

  if (allSessionFiles.length === 0) {
    return {
      content: [{ type: 'text', text: 'No tasks found. Use opc_state_init to start a new project.' }],
    };
  }

  const taskList = allSessionFiles
    .map((filename: string) => {
      // requirement_id is the filename without .json
      const requirementId = filename.replace(/\.json$/, '');

      // Parse source from requirement_id (format: YYYYMMDD_XXX_source)
      const sourceMatch = requirementId.match(/_(matched|auto_assembled)$/);
      const source = sourceMatch ? sourceMatch[1] as 'matched' | 'auto_assembled' : 'auto_assembled';

      const state = readProjectState(requirementId, source, cwd);
      if (!state) return null;

      const isCurrent = currentSession &&
        currentSession.requirement_id === requirementId;
      const status = state.pipeline.stages[state.pipeline.current_stage]?.status || 'pending';
      const icon = status === 'in_progress' ? '🔄' :
                   status === 'completed' ? '✅' :
                   status === 'blocked' ? '🚫' : '⏳';
      const currentMarker = isCurrent ? ' ← **current**' : '';
      const workflowTag = state.workflow?.name || source;

      return `${icon} **${requirementId}** [${workflowTag}]: ${state.project.name} (${status})${currentMarker}`;
    })
    .filter(Boolean)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## All Tasks (${allSessionFiles.length})

${taskList}
`,
    }],
  };
}