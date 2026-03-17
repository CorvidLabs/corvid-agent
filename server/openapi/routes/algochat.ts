import type { RouteEntry } from './types';
import { SwitchNetworkSchema } from '../../lib/validation';

export const algochatRoutes: RouteEntry[] = [
    { method: 'GET', path: '/api/feed/history', summary: 'Get recent agent and AlgoChat messages', description: 'Filter by search, agentId, threadId, with pagination.', tags: ['Feed'], auth: 'required' },
    { method: 'GET', path: '/api/algochat/status', summary: 'Get AlgoChat bridge status', tags: ['AlgoChat'], auth: 'required' },
    { method: 'POST', path: '/api/algochat/network', summary: 'Switch AlgoChat network', tags: ['AlgoChat'], auth: 'required', requestBody: SwitchNetworkSchema },
    { method: 'POST', path: '/api/algochat/conversations', summary: 'List AlgoChat conversations', tags: ['AlgoChat'], auth: 'required' },
    { method: 'GET', path: '/api/algochat/psk-exchange', summary: 'Get PSK exchange URI', tags: ['AlgoChat'], auth: 'required' },
    { method: 'POST', path: '/api/algochat/psk-exchange', summary: 'Generate new PSK exchange URI', tags: ['AlgoChat'], auth: 'required' },
    { method: 'GET', path: '/api/algochat/psk-contacts', summary: 'List PSK contacts', tags: ['AlgoChat'], auth: 'required' },
    { method: 'POST', path: '/api/algochat/psk-contacts', summary: 'Create PSK contact', tags: ['AlgoChat'], auth: 'required' },
    { method: 'PATCH', path: '/api/algochat/psk-contacts/{id}', summary: 'Rename PSK contact', tags: ['AlgoChat'], auth: 'required' },
    { method: 'DELETE', path: '/api/algochat/psk-contacts/{id}', summary: 'Cancel PSK contact', tags: ['AlgoChat'], auth: 'required' },
    { method: 'GET', path: '/api/algochat/psk-contacts/{id}/qr', summary: 'Get QR URI for PSK contact', tags: ['AlgoChat'], auth: 'required' },
    { method: 'GET', path: '/api/wallets/summary', summary: 'Get summary of all external wallets', tags: ['Wallets'], auth: 'required' },
    { method: 'GET', path: '/api/wallets/{address}/messages', summary: 'Get messages for a wallet', tags: ['Wallets'], auth: 'required' },
];
