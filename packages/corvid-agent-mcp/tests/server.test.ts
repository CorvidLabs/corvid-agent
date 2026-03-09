import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCorvidMcpServer } from '../src/server.js';

// Mock corvid-agent REST API
let mockServer: ReturnType<typeof Bun.serve> | null = null;
const routes = new Map<string, (req: Request) => Response | Promise<Response>>();

function mockRoute(method: string, path: string, handler: (req: Request) => Response | Promise<Response>) {
  routes.set(`${method} ${path}`, handler);
}

function clearRoutes() {
  routes.clear();
}

const PORT = 19877;

beforeAll(() => {
  mockServer = Bun.serve({
    port: PORT,
    fetch: (req) => {
      const url = new URL(req.url);
      const key = `${req.method} ${url.pathname}`;
      const handler = routes.get(key);
      if (handler) return handler(req);

      // Try pattern matching for parameterized routes
      for (const [routeKey, routeHandler] of routes) {
        const [routeMethod, routePath] = routeKey.split(' ', 2);
        if (routeMethod !== req.method) continue;
        // Simple wildcard: /api/sessions/* matches /api/sessions/abc
        if (routePath.endsWith('/*') && url.pathname.startsWith(routePath.slice(0, -1))) {
          return routeHandler(req);
        }
      }

      return Response.json({ error: 'Not found' }, { status: 404 });
    },
  });
});

afterAll(() => {
  mockServer?.stop(true);
  mockServer = null;
});

async function createTestClient() {
  const mcpServer = createCorvidMcpServer({
    baseUrl: `http://localhost:${PORT}`,
  });

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);

  return { client, mcpServer };
}

describe('corvid-agent MCP server', () => {
  beforeEach(() => clearRoutes());

  describe('tool listing', () => {
    it('exposes all core tools', async () => {
      const { client } = await createTestClient();
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();

      expect(names).toContain('corvid_list_agents');
      expect(names).toContain('corvid_get_agent');
      expect(names).toContain('corvid_create_session');
      expect(names).toContain('corvid_list_sessions');
      expect(names).toContain('corvid_get_session');
      expect(names).toContain('corvid_get_session_messages');
      expect(names).toContain('corvid_stop_session');
      expect(names).toContain('corvid_send_message');
      expect(names).toContain('corvid_create_work_task');
      expect(names).toContain('corvid_list_work_tasks');
      expect(names).toContain('corvid_get_work_task');
      expect(names).toContain('corvid_list_projects');
      expect(names).toContain('corvid_get_project');
      expect(names).toContain('corvid_health');
    });
  });

  describe('corvid_list_agents', () => {
    it('returns agent list from API', async () => {
      mockRoute('GET', '/api/agents', () =>
        Response.json([{ id: 'a1', name: 'architect' }, { id: 'a2', name: 'coder' }]),
      );

      const { client } = await createTestClient();
      const result = await client.callTool({ name: 'corvid_list_agents', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].name).toBe('architect');
    });
  });

  describe('corvid_get_agent', () => {
    it('returns agent details', async () => {
      mockRoute('GET', '/api/agents/*', () =>
        Response.json({ id: 'a1', name: 'architect', model: 'claude-opus-4-6' }),
      );

      const { client } = await createTestClient();
      const result = await client.callTool({ name: 'corvid_get_agent', arguments: { agent_id: 'a1' } });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.name).toBe('architect');
    });
  });

  describe('corvid_create_session', () => {
    it('creates a session', async () => {
      mockRoute('POST', '/api/sessions', async (req) => {
        const body = (await req.json()) as Record<string, unknown>;
        return Response.json({
          id: 's1',
          projectId: body.projectId,
          status: 'running',
        });
      });

      const { client } = await createTestClient();
      const result = await client.callTool({
        name: 'corvid_create_session',
        arguments: { project_id: 'p1', initial_prompt: 'Hello' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.id).toBe('s1');
      expect(parsed.status).toBe('running');
    });
  });

  describe('corvid_list_sessions', () => {
    it('lists sessions with optional filters', async () => {
      mockRoute('GET', '/api/sessions', () =>
        Response.json([{ id: 's1', status: 'running' }]),
      );

      const { client } = await createTestClient();
      const result = await client.callTool({
        name: 'corvid_list_sessions',
        arguments: { status: 'running' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].status).toBe('running');
    });
  });

  describe('corvid_create_work_task', () => {
    it('creates a work task', async () => {
      mockRoute('POST', '/api/work-tasks', async (req) => {
        const body = (await req.json()) as Record<string, unknown>;
        return Response.json({
          id: 'wt1',
          description: body.description,
          status: 'pending',
        });
      });

      const { client } = await createTestClient();
      const result = await client.callTool({
        name: 'corvid_create_work_task',
        arguments: { description: 'Fix the login bug' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.id).toBe('wt1');
      expect(parsed.description).toBe('Fix the login bug');
    });
  });

  describe('corvid_send_message', () => {
    it('sends a message to an agent', async () => {
      mockRoute('POST', '/api/mcp/send-message', async (req) => {
        const body = (await req.json()) as Record<string, unknown>;
        return Response.json({
          response: `Echo: ${body.message}`,
          threadId: 'thread-1',
        });
      });

      const { client } = await createTestClient();
      const result = await client.callTool({
        name: 'corvid_send_message',
        arguments: { to_agent: 'coder', message: 'Hello coder!' },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.response).toContain('Echo');
      expect(parsed.threadId).toBe('thread-1');
    });
  });

  describe('corvid_health', () => {
    it('returns server health', async () => {
      mockRoute('GET', '/api/health', () =>
        Response.json({ status: 'healthy', uptime: 12345 }),
      );

      const { client } = await createTestClient();
      const result = await client.callTool({ name: 'corvid_health', arguments: {} });
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.status).toBe('healthy');
    });
  });

  describe('error handling', () => {
    it('returns isError on API failures', async () => {
      mockRoute('GET', '/api/agents', () =>
        Response.json({ error: 'Unauthorized' }, { status: 401 }),
      );

      const { client } = await createTestClient();
      const result = await client.callTool({ name: 'corvid_list_agents', arguments: {} });

      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toContain('401');
    });

    it('handles network errors gracefully', async () => {
      const mcpServer = createCorvidMcpServer({
        baseUrl: 'http://localhost:19999', // nothing listening
      });
      const client = new Client({ name: 'test', version: '1.0.0' });
      const [ct, st] = InMemoryTransport.createLinkedPair();
      await mcpServer.connect(st);
      await client.connect(ct);

      const result = await client.callTool({ name: 'corvid_list_agents', arguments: {} });
      expect(result.isError).toBe(true);
    });
  });
});
