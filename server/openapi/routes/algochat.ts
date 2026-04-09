import { SwitchNetworkSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const PSK_CONTACT_EXAMPLE = {
  id: 'psk_p1s2k3c4',
  name: 'Alice',
  address: 'ALGO7XK2ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
  status: 'active',
  createdAt: '2026-03-22T09:00:00.000Z',
};

export const algochatRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/feed/history',
    summary: 'Get recent agent and AlgoChat messages',
    description: 'Filter by search, agentId, threadId, with pagination.',
    tags: ['Feed'],
    auth: 'required',
    responses: {
      200: {
        description: 'Recent message feed',
        example: {
          messages: [
            {
              id: 'msg_001',
              type: 'algochat',
              from: 'ALGO7XK2ABCDEF...',
              content: 'Hello!',
              ts: '2026-03-22T10:00:00.000Z',
            },
            {
              id: 'msg_002',
              type: 'agent',
              agentId: 'agent_a1b2c3d4',
              content: 'Task completed.',
              ts: '2026-03-22T10:01:00.000Z',
            },
          ],
          total: 2,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/algochat/status',
    summary: 'Get AlgoChat bridge status',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: {
        description: 'AlgoChat bridge status',
        example: {
          connected: true,
          network: 'mainnet',
          walletAddress: 'ALGO7XK2ABCDEF1234567890ABCDEF1234567890ABCDEF12345678',
          balance: 5000000,
          lastMessageAt: '2026-03-22T09:58:00.000Z',
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/algochat/network',
    summary: 'Switch AlgoChat network',
    tags: ['AlgoChat'],
    auth: 'required',
    requestBody: SwitchNetworkSchema,
    requestExample: { network: 'testnet' },
    responses: {
      200: { description: 'Network switch result', example: { success: true, network: 'testnet' } },
    },
  },
  {
    method: 'POST',
    path: '/api/algochat/conversations',
    summary: 'List AlgoChat conversations',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: {
        description: 'AlgoChat conversations',
        example: {
          conversations: [
            {
              address: 'ALGO7XK2ABCDEF...',
              name: 'Alice',
              messageCount: 12,
              lastMessageAt: '2026-03-22T09:58:00.000Z',
            },
          ],
          total: 1,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/algochat/psk-exchange',
    summary: 'Get PSK exchange URI',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: {
        description: 'Current PSK exchange URI',
        example: { uri: 'corvid://psk?id=psk_p1s2k3c4&key=BASE64KEY', expiresAt: '2026-03-22T11:00:00.000Z' },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/algochat/psk-exchange',
    summary: 'Generate new PSK exchange URI',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: {
        description: 'New PSK exchange URI',
        example: { uri: 'corvid://psk?id=psk_new1234&key=NEWBASE64KEY', expiresAt: '2026-03-22T11:00:00.000Z' },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/algochat/psk-contacts',
    summary: 'List PSK contacts',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: { description: 'PSK contacts', example: { contacts: [PSK_CONTACT_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/algochat/psk-contacts',
    summary: 'Create PSK contact',
    tags: ['AlgoChat'],
    auth: 'required',
    requestExample: { name: 'Alice', pskUri: 'corvid://psk?id=psk_abc&key=BASE64KEY' },
    responses: {
      200: { description: 'Created PSK contact', example: PSK_CONTACT_EXAMPLE },
    },
  },
  {
    method: 'PATCH',
    path: '/api/algochat/psk-contacts/{id}',
    summary: 'Rename PSK contact',
    tags: ['AlgoChat'],
    auth: 'required',
    requestExample: { name: 'Alice (Partner)' },
    responses: {
      200: { description: 'Updated contact', example: { ...PSK_CONTACT_EXAMPLE, name: 'Alice (Partner)' } },
    },
  },
  {
    method: 'DELETE',
    path: '/api/algochat/psk-contacts/{id}',
    summary: 'Cancel PSK contact',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: { description: 'Cancellation confirmation', example: { success: true } },
    },
  },
  {
    method: 'GET',
    path: '/api/algochat/psk-contacts/{id}/qr',
    summary: 'Get QR URI for PSK contact',
    tags: ['AlgoChat'],
    auth: 'required',
    responses: {
      200: {
        description: 'QR code URI data',
        example: { uri: 'corvid://psk?id=psk_p1s2k3c4&key=BASE64KEY', qrDataUrl: 'data:image/png;base64,...' },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/wallets/summary',
    summary: 'Get summary of all external wallets',
    tags: ['Wallets'],
    auth: 'required',
    responses: {
      200: {
        description: 'Wallet summaries',
        example: {
          wallets: [
            {
              address: 'ALGO7XK2ABCDEF...',
              messageCount: 42,
              firstSeen: '2026-03-01T00:00:00.000Z',
              lastSeen: '2026-03-22T10:00:00.000Z',
            },
          ],
          total: 1,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/wallets/{address}/messages',
    summary: 'Get messages for a wallet',
    tags: ['Wallets'],
    auth: 'required',
    responses: {
      200: {
        description: 'Messages from/to this wallet',
        example: {
          messages: [{ id: 'msg_001', direction: 'inbound', content: 'Hello!', ts: '2026-03-22T10:00:00.000Z' }],
          total: 1,
        },
      },
    },
  },
];
