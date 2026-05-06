/**
 * Memory Handler
 *
 * Handles opc_memory tool calls.
 */

import type { MemoryEntry } from '../types.js';
import { readProjectMemory, addMemoryEntry, searchMemory } from '../state.js';
import type { ToolResult } from './index.js';

export function handleMemory(args: Record<string, unknown>, cwd: string | undefined): ToolResult {
  const action = args.action as string;

  if (action === 'read') {
    const memory = readProjectMemory(cwd);
    const grouped = memory.entries.reduce((acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    }, {} as Record<string, MemoryEntry[]>);

    const output = Object.entries(grouped)
      .map(([category, entries]) => {
        const items = entries.map(e => `- ${e.content}`).join('\n');
        return `### ${category}\n${items}`;
      })
      .join('\n\n');

    return {
      content: [{
        type: 'text',
        text: `## Project Memory (${memory.entries.length} entries)

${output || 'No entries yet.'}
`,
      }],
    };
  }

  if (action === 'write') {
    if (!args.category || !args.content) {
      return {
        content: [{ type: 'text', text: 'category and content are required for write action.' }],
        isError: true,
      };
    }

    const entry = addMemoryEntry(
      args.category as MemoryEntry['category'],
      args.content as string,
      undefined,
      cwd
    );

    return {
      content: [{ type: 'text', text: `Memory entry added: [${entry.category}] ${entry.content}` }],
    };
  }

  if (action === 'search') {
    const results = searchMemory(args.query as string, cwd);
    const output = results.map(e => `- [${e.category}] ${e.content}`).join('\n');

    return {
      content: [{
        type: 'text',
        text: `## Search Results (${results.length})

${output || 'No matches found.'}
`,
      }],
    };
  }

  return {
    content: [{ type: 'text', text: 'Invalid action. Use read, write, or search.' }],
    isError: true,
  };
}