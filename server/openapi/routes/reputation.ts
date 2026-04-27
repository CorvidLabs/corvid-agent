import { RecordReputationEventSchema } from '../../lib/validation';
import type { RouteEntry } from './types';

const SCORE_EXAMPLE = {
  agentId: 'agent_a1b2c3d4',
  score: 87.4,
  tier: 'established',
  components: {
    taskSuccess: 92.0,
    responseQuality: 88.5,
    uptime: 99.1,
    collaborationScore: 75.0,
  },
  computedAt: '2026-03-22T06:00:00.000Z',
};

const REPUTATION_EVENT_EXAMPLE = {
  id: 'evt_e1v2t3e4',
  agentId: 'agent_a1b2c3d4',
  type: 'task_completed',
  weight: 1.0,
  note: 'PR #100 merged successfully.',
  createdAt: '2026-03-22T10:00:00.000Z',
};

export const reputationRoutes: RouteEntry[] = [
  {
    method: 'GET',
    path: '/api/reputation/scores',
    summary: 'Get all reputation scores',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: { description: 'All reputation scores', example: { scores: [SCORE_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'POST',
    path: '/api/reputation/scores',
    summary: 'Force-recompute all reputation scores',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: { description: 'Recompute result', example: { recomputed: 3, durationMs: 142 } },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/scores/{agentId}',
    summary: 'Get reputation score for agent',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: { description: 'Agent reputation score', example: SCORE_EXAMPLE },
    },
  },
  {
    method: 'POST',
    path: '/api/reputation/scores/{agentId}',
    summary: 'Force recompute score for agent',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: { description: 'Recomputed score', example: SCORE_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/explain/{agentId}',
    summary: 'Get detailed score explanation with per-component reasoning',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: {
        description: 'Score explanation',
        example: {
          agentId: 'agent_a1b2c3d4',
          score: 87.4,
          reasoning: [
            { component: 'taskSuccess', score: 92.0, reason: '23 of 25 tasks completed successfully.' },
            { component: 'responseQuality', score: 88.5, reason: 'High average quality ratings from peer reviews.' },
          ],
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/reputation/events',
    summary: 'Record reputation event',
    tags: ['Reputation'],
    auth: 'required',
    requestBody: RecordReputationEventSchema,
    requestExample: {
      agentId: 'agent_a1b2c3d4',
      type: 'task_completed',
      weight: 1.0,
      note: 'PR #100 merged successfully.',
    },
    responses: {
      200: { description: 'Recorded event', example: REPUTATION_EVENT_EXAMPLE },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/events/{agentId}',
    summary: 'Get reputation events for agent',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: { description: 'Reputation events', example: { events: [REPUTATION_EVENT_EXAMPLE], total: 1 } },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/attestation/{agentId}',
    summary: 'Get attestation for agent',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: {
        description: 'On-chain attestation',
        example: {
          agentId: 'agent_a1b2c3d4',
          asaId: 987654321,
          txId: 'TXID_ATTESTATION_ABC',
          score: 87.4,
          tier: 'established',
          attestedAt: '2026-03-22T06:00:00.000Z',
        },
      },
    },
  },
  {
    method: 'POST',
    path: '/api/reputation/attestation/{agentId}',
    summary: 'Create attestation for agent',
    tags: ['Reputation'],
    auth: 'required',
    responses: {
      200: {
        description: 'Created attestation',
        example: { txId: 'TXID_ATTESTATION_NEW', asaId: 987654322, score: 87.4 },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/stats/{agentId}',
    summary: 'Get aggregated reputation stats for agent',
    tags: ['Reputation'],
    auth: 'none',
    responses: {
      200: {
        description: 'Aggregated stats',
        example: {
          agentId: 'agent_a1b2c3d4',
          score: 87.4,
          tier: 'established',
          totalTasks: 25,
          successRate: 0.92,
          onChainAttestation: true,
        },
      },
    },
  },
  {
    method: 'GET',
    path: '/api/reputation/audit-guide',
    summary: 'Get on-chain verification guide',
    tags: ['Reputation'],
    auth: 'none',
    responses: {
      200: {
        description: 'Structured guide for independently verifying agent actions on Algorand',
        example: {
          version: '1.0',
          description: 'CorvidAgent publishes cryptographic attestations on Algorand...',
          noteFormats: [{ prefix: 'corvid-reputation', format: 'corvid-reputation:{agentId}:{sha256hex}' }],
          indexerQueries: [
            {
              description: 'Find all reputation attestations',
              method: 'GET',
              path: '/v2/accounts/{walletAddress}/transactions',
            },
          ],
          hashVerification: { algorithm: 'SHA-256', encoding: 'hex (64 lowercase characters)' },
          tools: [{ name: 'AlgoNode Indexer', url: 'https://mainnet-idx.algonode.cloud/v2/transactions' }],
        },
      },
    },
  },
];
