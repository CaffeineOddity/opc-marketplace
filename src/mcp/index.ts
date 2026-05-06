/**
 * OPC State MCP Server (Multi-Task with History)
 *
 * Provides state management tools for OPC Founder agent.
 * Enables cross-session persistence, stage tracking, and agent handoffs.
 *
 * Multi-Task Model:
 * - Each requirement has its own state file (preserves history)
 * - One window = one active task (via session binding)
 * - Session index maps lock_id → requirement_id
 * - All task history is preserved in .opc/state/{requirement_id}_{source}/
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { tools } from './tools.js';
import { handleToolCall } from './handlers.js';

// ============================================================
// Server Setup
// ============================================================

const server = new Server(
  { name: 'opc-state', version: '3.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args || {});
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
