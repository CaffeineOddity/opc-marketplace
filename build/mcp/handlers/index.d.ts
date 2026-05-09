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
export declare function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult>;
