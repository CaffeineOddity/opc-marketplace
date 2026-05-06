/**
 * OPC MCP Tool Handlers
 *
 * Handles all MCP tool calls for the OPC State Server.
 */
export type ToolResult = {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
};
export declare function handleStateRead(cwd: string | undefined): ToolResult;
export declare function handleStateInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleStateClear(cwd: string | undefined): ToolResult;
export declare function handleStateWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleCheckpointCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleCheckpointList(cwd: string | undefined): ToolResult;
export declare function handleCheckpointRollback(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleHandoff(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleMemory(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleSessionsList(cwd: string | undefined): ToolResult;
export declare function handleTaskGroupCreate(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleTaskUpdate(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleTaskGroupStatus(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleWorkflowsPath(cwd: string | undefined): ToolResult;
export declare function handleKnowledgeInit(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeRead(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeWrite(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeExists(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeList(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleKnowledgeDocs(args: Record<string, unknown>, cwd: string | undefined): ToolResult;
export declare function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult>;
