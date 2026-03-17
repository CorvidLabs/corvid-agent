import type { RouteEntry } from './types';
import { AddAllowlistSchema, UpdateAllowlistSchema } from '../../lib/validation';

export const allowlistRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/allowlist', summary: 'List allowlisted addresses', tags: ['Allowlist'], auth: 'required' },
    { method: 'POST', path: '/api/allowlist', summary: 'Add address to allowlist', tags: ['Allowlist'], auth: 'required', requestBody: AddAllowlistSchema, responses: { 201: { description: 'Added to allowlist' } } },
    { method: 'PUT', path: '/api/allowlist/{address}', summary: 'Update allowlist entry label', tags: ['Allowlist'], auth: 'required', requestBody: UpdateAllowlistSchema },
    { method: 'DELETE', path: '/api/allowlist/{address}', summary: 'Remove from allowlist', tags: ['Allowlist'], auth: 'required' },
];
