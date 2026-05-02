import { describe, expect, test } from 'bun:test';
import {
  assertInteractionToken,
  assertSnowflake,
  buildFooterText,
  buildFooterWithStats,
  ensureDiscordEmbedRenderable,
  extractContentFromEmbed,
  extractMentionsFromEmbed,
  extractUrlsFromEmbed,
  stripUrlsFromEmbed,
} from '../discord/embeds';

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
    expect(() => assertSnowflake('1234', 'user ID')).toThrow('expected snowflake ID (17-20 digit numeric string)');
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
    expect(() => assertInteractionToken('invalid token with spaces!!')).toThrow('Invalid Discord interaction token');
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

  test('shows T:x(n) when cumulative turns exceed active turns', () => {
    const result = buildFooterText({ agentName: 'Corvid', agentModel: 'opus' }, undefined, 5, 23);
    expect(result).toBe('Corvid · opus | T:5(23)');
  });

  test('shows T:x when cumulative equals active turns', () => {
    const result = buildFooterText({ agentName: 'Corvid', agentModel: 'opus' }, undefined, 5, 5);
    expect(result).toBe('Corvid · opus | T:5');
  });

  test('shows T:x when no cumulative turns provided', () => {
    const result = buildFooterText({ agentName: 'Corvid', agentModel: 'opus' }, undefined, 5);
    expect(result).toBe('Corvid · opus | T:5');
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
    const result = buildFooterWithStats({ agentName: 'Corvid', status: 'done' }, { turns: 3, tools: 15 });
    expect(result).toBe('Corvid · done | 3 turns · 15 tools');
  });

  test('shows cumulative turns in stats when greater', () => {
    const result = buildFooterWithStats(
      { agentName: 'Corvid', status: 'done' },
      { turns: 5, tools: 10 },
      undefined,
      23,
    );
    expect(result).toBe('Corvid · done | 5 turns (23 total) · 10 tools');
  });

  test('omits cumulative when equal to active', () => {
    const result = buildFooterWithStats({ agentName: 'Corvid', status: 'done' }, { turns: 5, tools: 10 }, undefined, 5);
    expect(result).toBe('Corvid · done | 5 turns · 10 tools');
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
    expect(extractMentionsFromEmbed({ description: 'Hey <@180715808593281025> check this' })).toBe(
      '<@180715808593281025>',
    );
  });

  test('extracts multiple mentions', () => {
    expect(extractMentionsFromEmbed({ description: '<@111111111111111111> and <@222222222222222222>' })).toBe(
      '<@111111111111111111> <@222222222222222222>',
    );
  });

  test('deduplicates repeated mentions', () => {
    expect(extractMentionsFromEmbed({ description: '<@111111111111111111> said hi to <@111111111111111111>' })).toBe(
      '<@111111111111111111>',
    );
  });

  test('handles nickname-style mentions with !', () => {
    expect(extractMentionsFromEmbed({ description: 'Hey <@!180715808593281025>' })).toBe('<@!180715808593281025>');
  });
});

describe('extractContentFromEmbed (mentions only)', () => {
  test('extracts mentions but not URLs', () => {
    const result = extractContentFromEmbed({
      description: 'Hey <@180715808593281025> check https://unsplash.com/photos/test',
    });
    expect(result).toBe('<@180715808593281025>');
  });

  test('returns undefined when only URLs present', () => {
    expect(extractContentFromEmbed({ description: 'Check https://example.com/a' })).toBeUndefined();
  });

  test('returns undefined when no mentions or URLs', () => {
    expect(extractContentFromEmbed({ description: 'Just plain text' })).toBeUndefined();
  });
});

describe('extractUrlsFromEmbed', () => {
  test('extracts standalone URLs', () => {
    expect(extractUrlsFromEmbed({ description: 'Check this out https://unsplash.com/photos/kA5qHVY5HH0' })).toEqual([
      'https://unsplash.com/photos/kA5qHVY5HH0',
    ]);
  });

  test('extracts multiple URLs', () => {
    expect(extractUrlsFromEmbed({ description: 'Here: https://example.com/a and https://example.com/b' })).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  test('does not extract URLs inside markdown links', () => {
    expect(extractUrlsFromEmbed({ description: 'See [link](https://example.com/hidden)' })).toBeUndefined();
  });

  test('does not extract URLs inside angle brackets', () => {
    expect(extractUrlsFromEmbed({ description: 'See <https://example.com/suppressed>' })).toBeUndefined();
  });

  test('deduplicates repeated URLs', () => {
    expect(extractUrlsFromEmbed({ description: 'https://example.com/a then https://example.com/a again' })).toEqual([
      'https://example.com/a',
    ]);
  });

  test('returns undefined when no URLs', () => {
    expect(extractUrlsFromEmbed({ description: 'Just plain text' })).toBeUndefined();
  });
});

describe('stripUrlsFromEmbed', () => {
  test('removes URLs from description', () => {
    const result = stripUrlsFromEmbed({ description: 'Check this https://example.com/a out' });
    expect(result.description).toBe('Check this  out');
  });

  test('preserves other embed fields', () => {
    const embed = { description: 'URL: https://example.com', title: 'Test', color: 123 };
    const result = stripUrlsFromEmbed(embed);
    expect(result.title).toBe('Test');
    expect(result.color).toBe(123);
  });

  test('collapses triple newlines after URL removal', () => {
    const result = stripUrlsFromEmbed({ description: 'Before\n\nhttps://example.com\n\nAfter' });
    expect(result.description).toBe('Before\n\nAfter');
  });

  test('does not mutate original embed', () => {
    const original = { description: 'https://example.com text' };
    stripUrlsFromEmbed(original);
    expect(original.description).toBe('https://example.com text');
  });
});

describe('ensureDiscordEmbedRenderable', () => {
  test('adds link hint when URL strip removed all description text', () => {
    const stripped = { footer: { text: 'Corvid · opus' } };
    const out = ensureDiscordEmbedRenderable(stripped, { urlStripRemovedAllText: true });
    expect(out.description).toContain('next message');
    expect(out.footer?.text).toBe('Corvid · opus');
  });

  test('adds generic body when footer exists but description is empty', () => {
    const out = ensureDiscordEmbedRenderable({
      description: undefined,
      footer: { text: 'Agent · sid:abcd1234 · working...' },
    });
    expect(out.description).toBe('No text to display.');
  });

  test('leaves embed unchanged when description is present', () => {
    const embed = { description: 'Hello', footer: { text: 'footer' } };
    expect(ensureDiscordEmbedRenderable(embed)).toEqual(embed);
  });

  test('does not add fallback for image-only embeds', () => {
    const embed = { image: { url: 'attachment://x.png' }, footer: { text: 'f' } };
    expect(ensureDiscordEmbedRenderable(embed)).toEqual(embed);
  });
});
