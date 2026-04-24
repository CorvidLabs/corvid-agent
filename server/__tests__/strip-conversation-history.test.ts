import { describe, expect, test } from 'bun:test';
import { stripConversationHistory } from '../lib/strip-conversation-history';

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
});
