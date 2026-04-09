import type { RouteEntry } from './types';

export const analyticsRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/bridges/delivery',
    summary: 'Bridge delivery metrics',
    description:
      'Returns delivery receipt metrics (success/failure counts and rates) for all bridge platforms (Discord, Telegram, Slack).',
    tags: ['Bridges'],
    auth: 'required',
    responses: {
      200: {
        description: 'Per-platform delivery metrics',
        example: {
          discord: { success: 142, failed: 3, rate: 0.979 },
          telegram: { success: 88, failed: 1, rate: 0.989 },
          slack: { success: 56, failed: 0, rate: 1.0 },
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/security/overview',
    summary: 'Security configuration overview',
    description:
      'Returns all security settings: protected paths, code scanner patterns, approved domains, governance tiers, and allowlist/blocklist counts.',
    tags: ['Security'],
    auth: 'required',
    responses: {
      200: {
        description: 'Security overview data',
        example: {
          allowlistCount: 5,
          blocklistCount: 2,
          governanceTiers: ['layer0', 'layer1', 'layer2'],
          approvedDomains: ['github.com', 'npmjs.com'],
          protectedPaths: ['/api/admin', '/api/billing'],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/analytics/overview',
    summary: 'Analytics overview',
    tags: ['Analytics'],
    auth: 'required',
    responses: {
      200: {
        description: 'Analytics overview data',
        example: {
          totalSessions: 47,
          activeSessions: 2,
          totalWorkTasks: 31,
          completedWorkTasks: 28,
          totalCreditsSpent: 5840,
          algoSpent: 12.5,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/analytics/spending',
    summary: 'Daily spending over time',
    tags: ['Analytics'],
    auth: 'required',
    responses: {
      200: {
        description: 'Daily spending series',
        example: {
          days: [
            { date: '2026-03-20', creditsSpent: 320, algoSpent: 0.8 },
            { date: '2026-03-21', creditsSpent: 450, algoSpent: 1.1 },
            { date: '2026-03-22', creditsSpent: 210, algoSpent: 0.5 },
          ],
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/analytics/sessions',
    summary: 'Session analytics by agent/source/status',
    tags: ['Analytics'],
    auth: 'required',
    responses: {
      200: {
        description: 'Session analytics breakdown',
        example: {
          byAgent: [{ agentId: 'agent_a1b2c3d4', name: 'DevAgent', count: 25 }],
          byStatus: { completed: 40, failed: 3, running: 2, paused: 2 },
          bySource: { discord: 18, algochat: 12, api: 17 },
        },
      },
    },
  },
];
