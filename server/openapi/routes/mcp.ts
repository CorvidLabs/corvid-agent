import {
  CreateMcpServerConfigSchema,
  McpDeleteMemorySchema,
  McpRecallMemorySchema,
  McpSaveMemorySchema,
  McpSendMessageSchema,
  UpdateMcpServerConfigSchema,
} from '../../lib/validation';
import type { RouteEntry } from './types';

const MCP_SERVER_EXAMPLE = {
  id: 'mcpsvr_m1n2o3p4',
  agentId: 'agent_a1b2c3d4',
  name: 'filesystem-tools',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
  enabled: true,
  createdAt: '2026-03-22T09:00:00.000Z',
};

export const mcpRoutes: RouteEntry[] = [
  {
    method: 'POST',
    path: '/api/mcp/send-message',
    summary: 'Send message between agents',
    tags: ['MCP'],
    auth: 'required',
    requestBody: McpSendMessageSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      toAgentId: 'agent_b2c3d4e5',
      message: 'Please review the PR diff I just sent.',
    },
    responses: {
      200: {
        description: 'Message delivery result',
        example: { success: true, txId: 'TXID_ALGOCHAT_XYZ', sessionId: 'sess_s1t2u3v4' },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/mcp/save-memory',
    summary: 'Save agent memory',
    tags: ['MCP'],
    auth: 'required',
    requestBody: McpSaveMemorySchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      key: 'user-preferences',
      content: 'User prefers concise responses and TypeScript over JavaScript.',
    },
    responses: {
      200: {
        description: 'Memory save result',
        example: { success: true, asaId: 123456789, txId: 'TXID_MEMORY_SAVE' },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/mcp/recall-memory',
    summary: 'Recall agent memory',
    tags: ['MCP'],
    auth: 'required',
    requestBody: McpRecallMemorySchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      query: 'user preferences',
    },
    responses: {
      200: {
        description: 'Recalled memory results',
        example: {
          memories: [{ key: 'user-preferences', content: 'User prefers concise responses.', score: 0.92 }],
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/mcp/delete-memory',
    summary: 'Delete an ARC-69 memory',
    tags: ['MCP'],
    auth: 'required',
    requestBody: McpDeleteMemorySchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      key: 'user-preferences',
    },
    responses: {
      200: { description: 'Deletion result', example: { success: true } },
    },
  },
  {
    method: 'GET',
    path: '/api/mcp/list-agents',
    summary: 'List agents available for messaging',
    tags: ['MCP'],
    auth: 'required',
    responses: {
      200: {
        description: 'Agents available via AlgoChat',
        example: {
          agents: [
            { id: 'agent_a1b2c3d4', name: 'DevAgent', address: 'ALGO7XK2ABCDEF...' },
            { id: 'agent_b2c3d4e5', name: 'ReviewAgent', address: 'ALGO8YL3BCDEFG...' },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/mcp-servers',
    summary: 'List MCP server configs',
    description: 'Optionally filter by agentId query parameter.',
    tags: ['MCP Servers'],
    auth: 'required',
    responses: {
      200: { description: 'MCP server configs', example: { servers: [MCP_SERVER_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/mcp-servers',
    summary: 'Create MCP server config',
    tags: ['MCP Servers'],
    auth: 'required',
    requestBody: CreateMcpServerConfigSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      name: 'filesystem-tools',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    },
    responses: {
      201: { description: 'Created config', example: MCP_SERVER_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/mcp-servers/{id}',
    summary: 'Update MCP server config',
    tags: ['MCP Servers'],
    auth: 'required',
    requestBody: UpdateMcpServerConfigSchema,
    requestExample: { enabled: false },
    responses: {
      200: { description: 'Updated config', example: { ...MCP_SERVER_EXAMPLE, enabled: false } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/mcp-servers/{id}',
    summary: 'Delete MCP server config',
    tags: ['MCP Servers'],
    auth: 'required',
    responses: {
      200: { description: 'Deletion confirmation', example: { success: true } },
    },
  },
  {
    method: 'POST',
    path: '/api/mcp-servers/{id}/test',
    summary: 'Test MCP server connection',
    tags: ['MCP Servers'],
    auth: 'required',
    responses: {
      200: {
        description: 'Connection test result',
        example: {
          connected: true,
          toolCount: 4,
          tools: ['read_file', 'write_file', 'list_directory', 'create_directory'],
        },
      },
    },
  },
];
