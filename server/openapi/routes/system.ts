/**
 * Route metadata: Health, System, Operational Mode, Database, Self-Test, System Logs, Settings.
 */
import type { RouteEntry } from './types';
import { OperationalModeSchema, SelfTestSchema } from '../../lib/validation';

export const systemRoutes: RouteEntry[] = [
    {
        method: 'GET', path: '/api/health',
        summary: 'Health check',
        description: 'Returns server uptime, active sessions, and service status.',
        tags: ['System'],
        auth: 'none',
        responses: { 200: { description: 'Health status' } },
    },
    {
        method: 'GET', path: '/metrics',
        summary: 'Prometheus metrics',
        description: 'Returns metrics in Prometheus text exposition format.',
        tags: ['System'],
        auth: 'admin',
        responses: { 200: { description: 'Prometheus metrics (text/plain)' } },
    },
    {
        method: 'GET', path: '/api/audit-log',
        summary: 'Query audit log',
        tags: ['System'],
        auth: 'admin',
    },
    {
        method: 'GET', path: '/.well-known/agent-card.json',
        summary: 'A2A agent card',
        description: 'Public A2A Protocol agent card for service discovery.',
        tags: ['A2A'],
        auth: 'none',
    },
    {
        method: 'GET', path: '/api/system-logs',
        summary: 'Aggregated system logs',
        description: 'Filter by type, level, search, with pagination.',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/system-logs/credit-transactions',
        summary: 'Credit ledger transactions',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/settings',
        summary: 'Get all settings',
        tags: ['Settings'],
        auth: 'required',
    },
    {
        method: 'PUT', path: '/api/settings/credits',
        summary: 'Update credit configuration',
        tags: ['Settings'],
        auth: 'required',
    },
    {
        method: 'GET', path: '/api/operational-mode',
        summary: 'Get operational mode',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/operational-mode',
        summary: 'Set operational mode',
        tags: ['System'],
        auth: 'required',
        requestBody: OperationalModeSchema,
    },
    {
        method: 'POST', path: '/api/backup',
        summary: 'Backup database',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/memories/backfill',
        summary: 'Re-send pending memories on-chain',
        tags: ['System'],
        auth: 'required',
    },
    {
        method: 'POST', path: '/api/selftest/run',
        summary: 'Run self-tests',
        tags: ['System'],
        auth: 'required',
        requestBody: SelfTestSchema,
    },
];
