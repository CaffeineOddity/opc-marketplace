/**
 * OPC MCP Tool Handlers
 *
 * Handles all MCP tool calls for the OPC State Server.
 */

// ============================================================
// Types
// ============================================================

export type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

// ============================================================
// Handler Imports
// ============================================================

import { handleStateRead, handleStateInit, handleStateClear, handleStateWrite } from './state.js';
import { handleHandoff } from './handoff.js';
import { handleSessionsList } from './session.js';
import { handleTaskGroupCreate, handleTaskUpdate, handleTaskGroupStatus } from './task.js';
import { handleWorkflowsPath } from './workflow.js';
import {
  handleKnowledgeInit,
  handleKnowledgeRead,
  handleKnowledgeWrite,
  handleKnowledgeExists,
  handleKnowledgeList,
  handleKnowledgeDocs,
  handleKnowledgeListBrief,
  handleKnowledgeRebuild,
} from './knowledge.js';

// ============================================================
// Handler Registry
// ============================================================

type HandlerFn = (args: Record<string, unknown>, cwd: string | undefined) => ToolResult;

const handlers: Record<string, HandlerFn> = {
  opc_state_read: (_, cwd) => handleStateRead(cwd),
  opc_state_init: (args, cwd) => handleStateInit(args, cwd),
  opc_state_clear: (_, cwd) => handleStateClear(cwd),
  opc_state_write: (args, cwd) => handleStateWrite(args, cwd),
  opc_handoff: (args, cwd) => handleHandoff(args, cwd),
  opc_sessions_list: (_, cwd) => handleSessionsList(cwd),
  opc_task_group_create: (args, cwd) => handleTaskGroupCreate(args, cwd),
  opc_task_update: (args, cwd) => handleTaskUpdate(args, cwd),
  opc_task_group_status: (args, cwd) => handleTaskGroupStatus(args, cwd),
  opc_workflows_path: (_, cwd) => handleWorkflowsPath(cwd),
  opc_knowledge_init: (args, cwd) => handleKnowledgeInit(args, cwd),
  opc_knowledge_read: (args, cwd) => handleKnowledgeRead(args, cwd),
  opc_knowledge_write: (args, cwd) => handleKnowledgeWrite(args, cwd),
  opc_knowledge_exists: (args, cwd) => handleKnowledgeExists(args, cwd),
  opc_knowledge_list: (args, cwd) => handleKnowledgeList(args, cwd),
  opc_knowledge_docs: (args, cwd) => handleKnowledgeDocs(args, cwd),
  opc_knowledge_list_brief: (args, cwd) => handleKnowledgeListBrief(args, cwd),
  opc_knowledge_rebuild_index: (args, cwd) => handleKnowledgeRebuild(args, cwd),
};

// ============================================================
// Main Handler Router
// ============================================================

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const cwd = args.workingDirectory as string | undefined;

  try {
    const handler = handlers[name];
    if (handler) {
      return handler(args, cwd);
    }
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
