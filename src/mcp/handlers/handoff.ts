/**
 * Handoff Handler
 *
 * Handles opc_handoff tool calls.
 */

import { getCurrentTask } from '../session.js';
import { recordHandoff } from '../state.js';
import type { ToolResult } from './index.js';

export function handleHandoff(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const state = getCurrentTask(cwd);

  if (!state) {
    return {
      content: [{ type: 'text', text: 'No active task for handoff.' }],
      isError: true,
    };
  }

  const handoff = recordHandoff(
    args.from_agent as string,
    args.to_agent as string,
    args.artifacts as string[],
    (args.constraints as string[]) || [],
    (args.context as string) || '',
    state.context.lock_id,
    cwd
  );

  return {
    content: [{
      type: 'text',
      text: `## Handoff Recorded

**From:** ${handoff.from_agent}
**To:** ${handoff.to_agent}
**Artifacts:** ${handoff.artifacts.join(', ')}
**Constraints:** ${handoff.constraints.length > 0 ? handoff.constraints.join(', ') : 'None'}

The receiving agent should check constraints and artifacts before starting work.
`,
    }],
  };
}