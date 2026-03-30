import { AddAllowlistSchema, UpdateAllowlistSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const ALLOWLIST_ENTRY_EXAMPLE = {
  address: 'ALGO7XK2ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
  label: 'Partner Agent',
  addedAt: '2026-03-22T09:00:00.000Z',
};

export const allowlistRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/allowlist',
    summary: 'List allowlisted addresses',
    tags: ['Allowlist'],
    auth: 'required',
    responses: {
      200: {
        description: 'Allowlisted addresses',
        example: { entries: [ALLOWLIST_ENTRY_EXAMPLE], total: 1 },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/allowlist',
    summary: 'Add address to allowlist',
    tags: ['Allowlist'],
    auth: 'required',
    requestBody: AddAllowlistSchema,
    requestExample: {
      address: 'ALGO7XK2ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
      label: 'Partner Agent',
    },
    responses: {
      201: { description: 'Added to allowlist', example: ALLOWLIST_ENTRY_EXAMPLE },
    },
  },
  {
    method: 'PUT',
    path: '/api/allowlist/{address}',
    summary: 'Update allowlist entry label',
    tags: ['Allowlist'],
    auth: 'required',
    requestBody: UpdateAllowlistSchema,
    requestExample: { label: 'Trusted Partner Agent' },
    responses: {
      200: { description: 'Updated entry', example: { ...ALLOWLIST_ENTRY_EXAMPLE, label: 'Trusted Partner Agent' } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/allowlist/{address}',
    summary: 'Remove from allowlist',
    tags: ['Allowlist'],
    auth: 'required',
    responses: {
      200: { description: 'Removal confirmation', example: { success: true } },
    },
  },
];
