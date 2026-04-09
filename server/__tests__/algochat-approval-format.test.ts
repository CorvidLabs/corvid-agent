import { describe, expect, it } from 'bun:test';
import { formatApprovalForChain, parseApprovalResponse } from '../algochat/approval-format';
import type { ApprovalRequest } from '../process/approval-types';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'abcdef1234567890',
    sessionId: 'session-1',
    toolName: 'Bash',
    toolInput: { command: 'echo hello' },
    description: 'Run a simple echo command',
    createdAt: Date.now(),
    timeoutMs: 30_000,
    source: 'web',
    ...overrides,
  };
}

describe('formatApprovalForChain', () => {
  it('formats a normal approval request', () => {
    const result = formatApprovalForChain(makeRequest());
    expect(result).toBe("[APPROVE?:abcdef12] Run a simple echo command\n\nReply 'yes abcdef12' or 'no abcdef12'");
  });

  it('uses first 8 characters of the id as shortId', () => {
    const result = formatApprovalForChain(makeRequest({ id: '0123456789abcdef' }));
    expect(result).toContain('[APPROVE?:01234567]');
  });

  it('handles empty description', () => {
    const result = formatApprovalForChain(makeRequest({ description: '' }));
    expect(result).toBe("[APPROVE?:abcdef12] \n\nReply 'yes abcdef12' or 'no abcdef12'");
  });

  it('truncates description exceeding 700 bytes', () => {
    const longDesc = 'a'.repeat(800);
    const result = formatApprovalForChain(makeRequest({ description: longDesc }));
    // The description portion should be truncated to 697 chars + '...'
    expect(result).toContain('...');
    // Total encoded description bytes should not exceed 700
    const descPart = result.split('] ')[1].split('\n\n')[0];
    const encoded = new TextEncoder().encode(descPart);
    expect(encoded.length).toBeLessThanOrEqual(700);
  });

  it('does not truncate description at exactly 700 bytes', () => {
    const desc = 'x'.repeat(700);
    const result = formatApprovalForChain(makeRequest({ description: desc }));
    expect(result).not.toContain('...');
    expect(result).toContain(desc);
  });

  it('truncates multibyte UTF-8 descriptions and appends ellipsis', () => {
    // Each emoji is 4 bytes in UTF-8; fill to exceed 700 bytes
    const emoji = '\u{1F600}'; // grinning face, 4 bytes
    const desc = emoji.repeat(200); // 800 bytes
    const result = formatApprovalForChain(makeRequest({ description: desc }));
    expect(result).toContain('...');
    // The truncated description should be significantly shorter than the original
    const descPart = result.split('] ')[1].split('\n\n')[0];
    const originalBytes = new TextEncoder().encode(desc).length;
    const truncatedBytes = new TextEncoder().encode(descPart).length;
    expect(truncatedBytes).toBeLessThan(originalBytes);
    // Should be roughly near the 700-byte limit (within a few bytes for partial chars)
    expect(truncatedBytes).toBeLessThanOrEqual(710);
  });

  it('handles description with mixed ASCII and multibyte characters near boundary', () => {
    // 696 ASCII bytes + a 4-byte emoji (total 700) should not truncate
    const desc = `${'a'.repeat(696)}\u{1F600}`;
    const encoded = new TextEncoder().encode(desc);
    expect(encoded.length).toBe(700);
    const result = formatApprovalForChain(makeRequest({ description: desc }));
    expect(result).not.toContain('...');
  });
});

describe('parseApprovalResponse', () => {
  it('parses "yes" with shortId', () => {
    const result = parseApprovalResponse('yes abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
  });

  it('parses "approve" with shortId', () => {
    const result = parseApprovalResponse('approve abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
  });

  it('parses "y" with shortId', () => {
    const result = parseApprovalResponse('y abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
  });

  it('parses "no" with shortId', () => {
    const result = parseApprovalResponse('no abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
  });

  it('parses "deny" with shortId', () => {
    const result = parseApprovalResponse('deny abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
  });

  it('parses "n" with shortId', () => {
    const result = parseApprovalResponse('n abcdef12');
    expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
  });

  it('is case-insensitive', () => {
    expect(parseApprovalResponse('YES ABCDEF12')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    expect(parseApprovalResponse('No AbCdEf12')).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
  });

  it('trims leading and trailing whitespace', () => {
    expect(parseApprovalResponse('  yes abcdef12  ')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    expect(parseApprovalResponse('\tno abcdef12\n')).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
  });

  it('accepts shortId with exactly 4 hex characters', () => {
    expect(parseApprovalResponse('yes abcd')).toEqual({ shortId: 'abcd', behavior: 'allow' });
  });

  it('accepts shortId with exactly 10 hex characters', () => {
    expect(parseApprovalResponse('yes abcdef0123')).toEqual({ shortId: 'abcdef0123', behavior: 'allow' });
  });

  it('rejects shortId with only 3 hex characters', () => {
    expect(parseApprovalResponse('yes abc')).toBeNull();
  });

  it('rejects shortId with 11 hex characters', () => {
    expect(parseApprovalResponse('yes abcdef01234')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseApprovalResponse('')).toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(parseApprovalResponse('hello world')).toBeNull();
  });

  it('returns null when shortId is missing', () => {
    expect(parseApprovalResponse('yes')).toBeNull();
    expect(parseApprovalResponse('no')).toBeNull();
  });

  it('returns null for non-hex shortId characters', () => {
    expect(parseApprovalResponse('yes ghijklmn')).toBeNull();
    expect(parseApprovalResponse('yes 1234zzzz')).toBeNull();
  });

  it('returns null when there is extra text after shortId', () => {
    expect(parseApprovalResponse('yes abcdef12 extra')).toBeNull();
  });
});
