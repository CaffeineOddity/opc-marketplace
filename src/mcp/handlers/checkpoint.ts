/**
 * Checkpoint Handlers
 *
 * Handles opc_checkpoint_* tool calls.
 */

import { getCurrentTask } from '../session.js';
import {
  createCheckpoint,
  readCheckpoint,
  listCheckpoints,
  writeProjectState,
} from '../state.js';
import type { ToolResult } from './index.js';

export function handleCheckpointCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{ type: 'text', text: 'No active task to checkpoint.' }],
      isError: true,
    };
  }

  const checkpoint = createCheckpoint(state, args.description as string, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Checkpoint Created

**Checkpoint ID:** ${checkpoint.checkpoint_id}
**Stage:** ${checkpoint.stage}
**Description:** ${checkpoint.description}
**Can Rollback:** ${checkpoint.can_rollback}

Use \`opc_checkpoint_rollback\` with the checkpoint ID to restore this state.
`,
    }],
  };
}

export function handleCheckpointList(cwd: string | undefined): ToolResult {
  const checkpoints = listCheckpoints(cwd);

  if (checkpoints.length === 0) {
    return { content: [{ type: 'text', text: 'No checkpoints found.' }] };
  }

  const list = checkpoints
    .map(cp => `- **${cp.checkpoint_id}**: ${cp.description} (${cp.stage}) - ${cp.created_at}`)
    .join('\n');

  return {
    content: [{
      type: 'text',
      text: `## Checkpoints (${checkpoints.length})

${list}
`,
    }],
  };
}

export function handleCheckpointRollback(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const checkpoint = readCheckpoint(args.checkpoint_id as string, cwd);

  if (!checkpoint) {
    return {
      content: [{ type: 'text', text: `Checkpoint not found: ${args.checkpoint_id}` }],
      isError: true,
    };
  }

  writeProjectState(checkpoint.state_snapshot, cwd);

  return {
    content: [{
      type: 'text',
      text: `## Rolled Back to Checkpoint

**Checkpoint ID:** ${checkpoint.checkpoint_id}
**Stage:** ${checkpoint.stage}
**Description:** ${checkpoint.description}

The project state has been restored to the checkpoint.
`,
    }],
  };
}