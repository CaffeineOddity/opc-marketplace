/**
 * Knowledge Handlers
 *
 * Handles opc_knowledge_* tool calls.
 * Knowledge is organized by feature (e.g., "hud", "state-management").
 */
import type { ToolResult } from './index.js';
export declare function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeRead(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeExists(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeList(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeDocs(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeListBrief(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeRebuild(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
