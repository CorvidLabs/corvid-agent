import type { RouteEntry } from './types';

export const toolCatalogRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/tools',
    summary: 'List all available MCP tools',
    tags: ['Tools'],
    auth: 'none',
    responses: {
      200: {
        description: 'Tool catalog with categories',
        example: {
          categories: [
            {
              name: 'communication',
              label: 'Communication & Memory',
              description: 'Send messages, save/recall memories',
            },
          ],
          tools: [
            { name: 'corvid_send_message', description: 'Send a message to another agent', category: 'communication' },
          ],
        },
      },
    },
  },
];
