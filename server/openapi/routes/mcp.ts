import type { RouteEntry } from './types';
import { McpSendMessageSchema, McpSaveMemorySchema, McpRecallMemorySchema, CreateMcpServerConfigSchema, UpdateMcpServerConfigSchema } from '../../lib/validation';

export const mcpRoutes: RouteEntry[] = [
    { method: 'POST', path: '/api/mcp/send-message', summary: 'Send message between agents', tags: ['MCP'], auth: 'required', requestBody: McpSendMessageSchema },
    { method: 'POST', path: '/api/mcp/save-memory', summary: 'Save agent memory', tags: ['MCP'], auth: 'required', requestBody: McpSaveMemorySchema },
    { method: 'POST', path: '/api/mcp/recall-memory', summary: 'Recall agent memory', tags: ['MCP'], auth: 'required', requestBody: McpRecallMemorySchema },
    { method: 'GET', path: '/api/mcp/list-agents', summary: 'List agents available for messaging', tags: ['MCP'], auth: 'required' },
    { method: 'GET', path: '/api/mcp-servers', summary: 'List MCP server configs', description: 'Optionally filter by agentId query parameter.', tags: ['MCP Servers'], auth: 'required' },
    { method: 'POST', path: '/api/mcp-servers', summary: 'Create MCP server config', tags: ['MCP Servers'], auth: 'required', requestBody: CreateMcpServerConfigSchema, responses: { 201: { description: 'Created config' } } },
    { method: 'PUT', path: '/api/mcp-servers/{id}', summary: 'Update MCP server config', tags: ['MCP Servers'], auth: 'required', requestBody: UpdateMcpServerConfigSchema },
    { method: 'DELETE', path: '/api/mcp-servers/{id}', summary: 'Delete MCP server config', tags: ['MCP Servers'], auth: 'required' },
    { method: 'POST', path: '/api/mcp-servers/{id}/test', summary: 'Test MCP server connection', tags: ['MCP Servers'], auth: 'required' },
];
