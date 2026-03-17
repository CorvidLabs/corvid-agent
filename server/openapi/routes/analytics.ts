import type { RouteEntry } from './types';

export const analyticsRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/bridges/delivery', summary: 'Bridge delivery metrics', description: 'Returns delivery receipt metrics (success/failure counts and rates) for all bridge platforms (Discord, Telegram, Slack).', tags: ['Bridges'], auth: 'required', responses: { 200: { description: 'Per-platform delivery metrics' } } },
    { method: 'GET', path: '/api/security/overview', summary: 'Security configuration overview', description: 'Returns all security settings: protected paths, code scanner patterns, approved domains, governance tiers, and allowlist/blocklist counts.', tags: ['Security'], auth: 'required', responses: { 200: { description: 'Security overview data' } } },
    { method: 'GET', path: '/api/analytics/overview', summary: 'Analytics overview', tags: ['Analytics'], auth: 'required' },
    { method: 'GET', path: '/api/analytics/spending', summary: 'Daily spending over time', tags: ['Analytics'], auth: 'required' },
    { method: 'GET', path: '/api/analytics/sessions', summary: 'Session analytics by agent/source/status', tags: ['Analytics'], auth: 'required' },
];
