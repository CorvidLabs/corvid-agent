import { describe, expect, test } from 'bun:test';
import { stripConversationHistory, withAuthorContext } from '../discord/message-router';

describe('stripConversationHistory', () => {
  test('returns plain text unchanged', () => {
    expect(stripConversationHistory('hello world')).toBe('hello world');
  });

  test('strips a single conversation_history block', () => {
    const input =
      '<conversation_history>\n[User]: old message\n[Assistant]: old reply\n</conversation_history>\nActual question';
    expect(stripConversationHistory(input)).toBe('Actual question');
  });

  test('strips conversation_history block containing inner tags', () => {
    const input =
      '<conversation_history>\nold history here\n</conversation_history>\n<conversation_history>\nmore old\n</conversation_history>\nreal content';
    expect(stripConversationHistory(input)).toBe('real content');
  });

  test('returns empty string when content is only conversation_history', () => {
    const input = '<conversation_history>\n[User]: old\n</conversation_history>';
    expect(stripConversationHistory(input)).toBe('');
  });

  test('handles content with multiple separate history blocks', () => {
    const input =
      '<conversation_history>block1</conversation_history> middle <conversation_history>block2</conversation_history> end';
    expect(stripConversationHistory(input)).toBe('middle end');
  });

  test('preserves content with angle brackets that are not history tags', () => {
    const input = 'Use <b>bold</b> and <code>code</code>';
    expect(stripConversationHistory(input)).toBe('Use <b>bold</b> and <code>code</code>');
  });
});

describe('withAuthorContext', () => {
  test('returns text unchanged when no author info', () => {
    expect(withAuthorContext('hello')).toBe('hello');
  });

  test('includes both username and id', () => {
    const result = withAuthorContext('hello', '123', 'Alice');
    expect(result).toContain('Alice');
    expect(result).toContain('123');
    expect(result).toContain('hello');
  });

  test('includes channel id when provided', () => {
    const result = withAuthorContext('hello', '123', 'Alice', 'chan-1');
    expect(result).toContain('chan-1');
  });
});
