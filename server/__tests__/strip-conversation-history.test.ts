import { describe, expect, test } from 'bun:test';
import { extractConversationTopics, stripConversationHistory } from '../lib/strip-conversation-history';

describe('stripConversationHistory', () => {
  test('returns plain text unchanged', () => {
    expect(stripConversationHistory('hello world')).toBe('hello world');
  });

  test('strips a single conversation_history block', () => {
    const input = '<conversation_history>\n[User]: hi\n[Assistant]: hello\n</conversation_history>\nActual question';
    expect(stripConversationHistory(input)).toBe('Actual question');
  });

  test('strips block containing inner tags', () => {
    const input = '<conversation_history><msg>nested</msg></conversation_history> real content';
    expect(stripConversationHistory(input)).toBe('real content');
  });

  test('strips when entire content is a history block', () => {
    const input = '<conversation_history>stuff</conversation_history>';
    expect(stripConversationHistory(input)).toBe('');
  });

  test('strips multiple conversation_history blocks', () => {
    const input =
      '<conversation_history>a</conversation_history> middle <conversation_history>b</conversation_history> end';
    expect(stripConversationHistory(input)).toBe('middle end');
  });

  test('preserves other HTML-like tags', () => {
    const input = '<conversation_history>x</conversation_history> Use <b>bold</b> and <code>code</code>';
    expect(stripConversationHistory(input)).toBe('Use <b>bold</b> and <code>code</code>');
  });

  test('strips trailing whitespace after block', () => {
    const input = '<conversation_history>x</conversation_history>   \n\nfollowing text';
    expect(stripConversationHistory(input)).toBe('following text');
  });

  test('handles nested conversation_history blocks (#2136)', () => {
    const input = [
      '<conversation_history>',
      '[User]: <conversation_history>',
      'channel context here',
      '</conversation_history>',
      'actual user message',
      '[Assistant]: previous response',
      '</conversation_history>',
    ].join('\n');
    expect(stripConversationHistory(input)).toBe('');
  });

  test('preserves text after nested blocks (#2136)', () => {
    const input = [
      '<conversation_history>',
      'outer start',
      '<conversation_history>',
      'inner content',
      '</conversation_history>',
      'outer end',
      '</conversation_history>',
      '',
      'real user message here',
    ].join('\n');
    expect(stripConversationHistory(input)).toBe('real user message here');
  });

  test('strips orphaned closing tags from nesting artifacts', () => {
    const input = 'some text </conversation_history> more text';
    expect(stripConversationHistory(input)).toBe('some text more text');
  });
});

describe('extractConversationTopics', () => {
  test('extracts topics from user messages', () => {
    const messages = [
      { role: 'user', content: 'How does AlgoChat work?' },
      { role: 'assistant', content: 'AlgoChat uses Algorand transactions...' },
      { role: 'user', content: 'Can you explain wallets?' },
    ];
    const topics = extractConversationTopics(messages);
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.length).toBeLessThanOrEqual(3);
  });

  test('returns empty array for no user messages', () => {
    const messages = [{ role: 'assistant', content: 'Hello!' }];
    expect(extractConversationTopics(messages)).toEqual([]);
  });

  test('returns empty array for empty input', () => {
    expect(extractConversationTopics([])).toEqual([]);
  });

  test('skips very short topics', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'ok' },
    ];
    expect(extractConversationTopics(messages)).toEqual([]);
  });

  test('limits to 3 topics max', () => {
    const messages = [
      { role: 'user', content: 'First topic here' },
      { role: 'user', content: 'Second topic here' },
      { role: 'user', content: 'Third topic here' },
      { role: 'user', content: 'Fourth topic here' },
    ];
    const topics = extractConversationTopics(messages);
    expect(topics.length).toBeLessThanOrEqual(3);
  });

  test('strips conversation history tags before extracting', () => {
    const messages = [
      { role: 'user', content: '<conversation_history>old</conversation_history> Deploy the fix now' },
    ];
    const topics = extractConversationTopics(messages);
    expect(topics).toEqual(['Deploy the']);
  });

  test('deduplicates identical topic prefixes', () => {
    const messages = [
      { role: 'user', content: 'Deploy the app' },
      { role: 'user', content: 'Deploy the app again' },
    ];
    const topics = extractConversationTopics(messages);
    expect(topics).toEqual(['Deploy the']);
  });
});
