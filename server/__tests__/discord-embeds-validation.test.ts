import { describe, test, expect } from 'bun:test';
import { assertSnowflake, assertInteractionToken, buildFooterText, buildFooterWithStats, extractMentionsFromEmbed } from '../discord/embeds';

describe('assertSnowflake', () => {
    test('accepts valid snowflake IDs', () => {
        expect(() => assertSnowflake('12345678901234567', 'test')).not.toThrow();
        expect(() => assertSnowflake('12345678901234567890', 'test')).not.toThrow();
    });

    test('rejects non-numeric strings', () => {
        expect(() => assertSnowflake('not-a-snowflake', 'channel ID')).toThrow(
            'Invalid Discord channel ID: expected snowflake ID (17-20 digit numeric string)',
        );
    });

    test('rejects too-short numeric strings', () => {
        expect(() => assertSnowflake('1234', 'user ID')).toThrow(
            'expected snowflake ID (17-20 digit numeric string)',
        );
    });
});

describe('assertInteractionToken', () => {
    test('accepts valid interaction tokens', () => {
        const validToken = 'aOf2mdK8w3FlPWkm9GdC';
        expect(() => assertInteractionToken(validToken)).not.toThrow();
    });

    test('rejects tokens that are too short', () => {
        expect(() => assertInteractionToken('short')).toThrow(
            'Invalid Discord interaction token (expected 20-500 alphanumeric characters with dashes, dots, or underscores)',
        );
    });

    test('rejects tokens with invalid characters', () => {
        expect(() => assertInteractionToken('invalid token with spaces!!')).toThrow(
            'Invalid Discord interaction token',
        );
    });
});

describe('buildFooterText', () => {
    test('includes all context segments', () => {
        const result = buildFooterText({
            agentName: 'Corvid',
            agentModel: 'opus',
            projectName: 'my-project',
            sessionId: 'abcdef1234567890',
            status: 'running',
        });
        expect(result).toBe('Corvid · opus · my-project · sid:abcdef12 · running');
    });

    test('returns agent name and model when no other context', () => {
        const result = buildFooterText({ agentName: 'Corvid', agentModel: 'opus' });
        expect(result).toBe('Corvid · opus');
    });

    test('includes projectName', () => {
        const result = buildFooterText({
            agentName: 'Corvid',
            agentModel: 'opus',
            projectName: 'my-project',
        });
        expect(result).toBe('Corvid · opus · my-project');
    });

    test('includes sessionId as truncated sid:', () => {
        const result = buildFooterText({
            agentName: 'Corvid',
            agentModel: 'opus',
            sessionId: 'abcdef1234567890',
        });
        expect(result).toBe('Corvid · opus · sid:abcdef12');
    });

    test('includes status', () => {
        const result = buildFooterText({
            agentName: 'Corvid',
            agentModel: 'opus',
            status: 'completed',
        });
        expect(result).toBe('Corvid · opus · completed');
    });

    test('works without agentModel', () => {
        const result = buildFooterText({
            agentName: 'Corvid',
            status: 'done',
        });
        expect(result).toBe('Corvid · done');
    });
});

describe('buildFooterWithStats', () => {
    test('appends stats after pipe separator', () => {
        const result = buildFooterWithStats(
            { agentName: 'Corvid', agentModel: 'opus', sessionId: 'abcdef1234567890', status: 'done' },
            { filesChanged: 5, turns: 12, commits: 3 },
        );
        expect(result).toBe('Corvid · opus · sid:abcdef12 · done | 5 files · 12 turns · 3 commits');
    });

    test('omits zero stats', () => {
        const result = buildFooterWithStats(
            { agentName: 'Corvid', agentModel: 'opus', status: 'done' },
            { filesChanged: 0, turns: 8, commits: 0 },
        );
        expect(result).toBe('Corvid · opus · done | 8 turns');
    });

    test('returns base footer when all stats are zero', () => {
        const result = buildFooterWithStats(
            { agentName: 'Corvid', agentModel: 'opus', status: 'done' },
            { filesChanged: 0, turns: 0, commits: 0 },
        );
        expect(result).toBe('Corvid · opus · done');
    });

    test('includes tools stat', () => {
        const result = buildFooterWithStats(
            { agentName: 'Corvid', status: 'done' },
            { turns: 3, tools: 15 },
        );
        expect(result).toBe('Corvid · done | 3 turns · 15 tools');
    });
});

describe('extractMentionsFromEmbed', () => {
    test('returns undefined when no description', () => {
        expect(extractMentionsFromEmbed({ title: 'test' })).toBeUndefined();
    });

    test('returns undefined when no mentions in description', () => {
        expect(extractMentionsFromEmbed({ description: 'Hello world' })).toBeUndefined();
    });

    test('extracts a single mention', () => {
        expect(extractMentionsFromEmbed({ description: 'Hey <@180715808593281025> check this' }))
            .toBe('<@180715808593281025>');
    });

    test('extracts multiple mentions', () => {
        expect(extractMentionsFromEmbed({ description: '<@111111111111111111> and <@222222222222222222>' }))
            .toBe('<@111111111111111111> <@222222222222222222>');
    });

    test('deduplicates repeated mentions', () => {
        expect(extractMentionsFromEmbed({ description: '<@111111111111111111> said hi to <@111111111111111111>' }))
            .toBe('<@111111111111111111>');
    });

    test('handles nickname-style mentions with !', () => {
        expect(extractMentionsFromEmbed({ description: 'Hey <@!180715808593281025>' }))
            .toBe('<@!180715808593281025>');
    });
});
