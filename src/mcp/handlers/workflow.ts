/**
 * Workflow Handler
 *
 * Handles opc_workflows_path tool calls.
 */

import { ensureWorkflowsDir, getWorktreeRoot } from '../paths.js';
import type { ToolResult } from './index.js';

export function handleWorkflowsPath(cwd: string | undefined): ToolResult {
  const workflowsDir = ensureWorkflowsDir(cwd);
  const gitRoot = getWorktreeRoot(cwd);

  return {
    content: [{
      type: 'text',
      text: `## Workflows Directory

**Path:** ${workflowsDir}
**Git Root:** ${gitRoot}

All workflow files should be read from/written to this directory.
This ensures consistency regardless of current working directory.`,
    }],
  };
}