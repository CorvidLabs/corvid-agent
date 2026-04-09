/**
 * Route metadata: Health, System, Operational Mode, Database, Self-Test, System Logs, Settings.
 */

import { OperationalModeSchema, SelfTestSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

export const systemRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/health',
    summary: 'Health check',
    description: 'Returns server uptime, active sessions, and service status.',
    tags: ['System'],
    auth: 'none',
    responses: {
      200: {
        description: 'Health status',
        example: {
          status: 'ok',
          uptime: 3600,
          activeSessions: 2,
          algochat: { connected: true, network: 'mainnet' },
          version: '1.12.0',
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/metrics',
    summary: 'Prometheus metrics',
    description: 'Returns metrics in Prometheus text exposition format.',
    tags: ['System'],
    auth: 'admin',
    responses: { 200: { description: 'Prometheus metrics (text/plain)' } },
  },
  {
    method: 'GET',
    path: '/api/audit-log',
    summary: 'Query audit log',
    tags: ['System'],
    auth: 'admin',
    responses: {
      200: {
        description: 'Audit log entries',
        example: {
          entries: [
            {
              id: 1,
              action: 'agent.create',
              actorId: 'user_123',
              resourceId: 'agent_a1b2c3d4',
              ts: '2026-03-22T10:00:00.000Z',
            },
          ],
          total: 1,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/.well-known/agent-card.json',
    summary: 'A2A agent card',
    description: 'Public A2A Protocol agent card for service discovery.',
    tags: ['A2A'],
    auth: 'none',
    responses: {
      200: {
        description: 'A2A agent card JSON',
        example: {
          name: 'CorvidAgent',
          description: 'AI agent framework with on-chain identity.',
          url: 'http://localhost:3000/a2a',
          version: '1.0.0',
          capabilities: { streaming: false, pushNotifications: false },
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/system-logs',
    summary: 'Aggregated system logs',
    description: 'Filter by type, level, search, with pagination.',
    tags: ['System'],
    auth: 'required',
    responses: {
      200: {
        description: 'System log entries',
        example: {
          logs: [{ ts: '2026-03-22T10:00:00.000Z', level: 'info', type: 'session', message: 'Session started.' }],
          total: 1,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/system-logs/credit-transactions',
    summary: 'Credit ledger transactions',
    tags: ['System'],
    auth: 'required',
    responses: {
      200: {
        description: 'Credit transaction history',
        example: {
          transactions: [
            {
              id: 1,
              type: 'deduct',
              amount: 10,
              balance: 990,
              ts: '2026-03-22T10:01:00.000Z',
              description: 'Session turn',
            },
          ],
          total: 1,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/settings',
    summary: 'Get all settings',
    tags: ['Settings'],
    auth: 'required',
    responses: {
      200: {
        description: 'All server settings',
        example: {
          credits: { pricePerTurn: 1, freeCreditsOnSignup: 100 },
          algochat: { network: 'mainnet', enabled: true },
        },
      },
    },
  },
  {
    method: 'PUT',
    path: '/api/settings/credits',
    summary: 'Update credit configuration',
    tags: ['Settings'],
    auth: 'required',
    requestExample: { pricePerTurn: 2, freeCreditsOnSignup: 50 },
    responses: {
      200: {
        description: 'Updated credit config',
        example: { pricePerTurn: 2, freeCreditsOnSignup: 50 },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/operational-mode',
    summary: 'Get operational mode',
    tags: ['System'],
    auth: 'required',
    responses: {
      200: {
        description: 'Current operational mode',
        example: { mode: 'normal', updatedAt: '2026-03-22T08:00:00.000Z' },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/operational-mode',
    summary: 'Set operational mode',
    tags: ['System'],
    auth: 'required',
    requestBody: OperationalModeSchema,
    requestExample: { mode: 'maintenance' },
    responses: {
      200: {
        description: 'Updated operational mode',
        example: { mode: 'maintenance', updatedAt: '2026-03-22T10:00:00.000Z' },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/backup',
    summary: 'Backup database',
    tags: ['System'],
    auth: 'required',
    responses: {
      200: {
        description: 'Backup result',
        example: { success: true, path: '/backups/corvid-agent-2026-03-22.db', sizeBytes: 4096000 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/memories/backfill',
    summary: 'Re-send pending memories on-chain',
    tags: ['System'],
    auth: 'required',
    responses: {
      200: {
        description: 'Backfill result',
        example: { submitted: 3, failed: 0 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/selftest/run',
    summary: 'Run self-tests',
    tags: ['System'],
    auth: 'required',
    requestBody: SelfTestSchema,
    requestExample: { categories: ['health', 'algochat', 'github'] },
    responses: {
      200: {
        description: 'Self-test results',
        example: {
          passed: 8,
          failed: 0,
          results: [
            { name: 'health', passed: true, message: 'Server is healthy' },
            { name: 'algochat', passed: true, message: 'AlgoChat connected' },
          ],
        },
      },
    },
  },
];
