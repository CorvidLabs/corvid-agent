/**
 * Tests for the corvid_check_reputation MCP tool handler.
 *
 * Verifies:
 * - Fallback to ctx.agentId when no agent_id arg provided
 * - Uses explicit agent_id when provided
 * - Graceful error when reputationScorer is not available
 * - Correct formatting of trust level and component breakdown
 * - Graceful handling of scorer errors
 */
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleCheckReputation, type McpToolContext } from '../mcp/tool-handlers';

// ─── Mock Helpers ───────────────────────────────────────────────────────────

function createMockScorer(overrides?: Partial<ReturnType<typeof defaultScoreData>>) {
    const data = { ...defaultScoreData(), ...overrides };
    return {
        computeScore: mock((_agentId: string) => data.score),
        getEvents: mock((_agentId: string, _limit?: number) => data.events),
    };
}

function defaultScoreData() {
    return {
        score: {
            agentId: 'agent-self',
            overallScore: 85,
            trustLevel: 'high' as const,
            components: {
                taskCompletion: 90,
                peerRating: 80,
                creditPattern: 85,
                securityCompliance: 95,
                activityLevel: 75,
            },
            attestationHash: 'abc123hash',
            computedAt: '2026-02-16T00:00:00.000Z',
        },
        events: [
            {
                id: 'evt-1',
                agent_id: 'agent-self',
                event_type: 'task_completed',
                score_impact: 5,
                metadata: '{}',
                created_at: '2026-02-15T12:00:00.000Z',
            },
        ],
    };
}

function createMockContext(overrides?: Partial<McpToolContext>): McpToolContext {
    return {
        agentId: 'agent-self',
        db: {} as McpToolContext['db'],
        agentMessenger: {} as McpToolContext['agentMessenger'],
        agentDirectory: {} as McpToolContext['agentDirectory'],
        agentWalletService: {} as McpToolContext['agentWalletService'],
        ...overrides,
    };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('handleCheckReputation', () => {
    let mockScorer: ReturnType<typeof createMockScorer>;

    beforeEach(() => {
        mockScorer = createMockScorer();
    });

    it('returns reputation for current agent when no agent_id provided', async () => {
        const ctx = createMockContext({ reputationScorer: mockScorer as unknown as McpToolContext['reputationScorer'] });
        const result = await handleCheckReputation(ctx, {});

        expect(mockScorer.computeScore).toHaveBeenCalledWith('agent-self');
        expect(mockScorer.getEvents).toHaveBeenCalledWith('agent-self', 10);

        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Reputation for agent-self:');
        expect(text).toContain('Overall: 85/100');
    });

    it('returns reputation for specified agent_id', async () => {
        const scoreData = defaultScoreData();
        scoreData.score.agentId = 'agent-other';
        scoreData.events[0].agent_id = 'agent-other';
        const scorer = createMockScorer(scoreData);

        const ctx = createMockContext({ reputationScorer: scorer as unknown as McpToolContext['reputationScorer'] });
        const result = await handleCheckReputation(ctx, { agent_id: 'agent-other' });

        expect(scorer.computeScore).toHaveBeenCalledWith('agent-other');
        expect(scorer.getEvents).toHaveBeenCalledWith('agent-other', 10);

        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Reputation for agent-other:');
    });

    it('returns error message when reputationScorer is not available', async () => {
        const ctx = createMockContext({ reputationScorer: undefined });
        const result = await handleCheckReputation(ctx, {});

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Reputation service is not available');
    });

    it('formats trust level and component breakdown correctly', async () => {
        const ctx = createMockContext({ reputationScorer: mockScorer as unknown as McpToolContext['reputationScorer'] });
        const result = await handleCheckReputation(ctx, {});

        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Trust Level: high');
        expect(text).toContain('Task Completion: 90');
        expect(text).toContain('Peer Rating: 80');
        expect(text).toContain('Credit Pattern: 85');
        expect(text).toContain('Security Compliance: 95');
        expect(text).toContain('Activity Level: 75');
        expect(text).toContain('Attestation Hash: abc123hash');
        expect(text).toContain('Computed At: 2026-02-16T00:00:00.000Z');
        // Event line
        expect(text).toContain('task_completed');
        expect(text).toContain('impact: 5');
    });

    it('handles scorer errors gracefully', async () => {
        const failingScorer = {
            computeScore: mock(() => { throw new Error('Database connection lost'); }),
            getEvents: mock(() => []),
        };

        const ctx = createMockContext({ reputationScorer: failingScorer as unknown as McpToolContext['reputationScorer'] });
        const result = await handleCheckReputation(ctx, {});

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { type: 'text'; text: string }).text;
        expect(text).toContain('Failed to check reputation');
        expect(text).toContain('Database connection lost');
    });
});
