import { describe, it, expect } from 'bun:test';
import { formatApprovalForChain, parseApprovalResponse } from '../algochat/approval-format';
import type { ApprovalRequest } from '../process/approval-types';

function makeRequest(overrides: Partial<ApprovalRequest> & { id: string; description: string }): ApprovalRequest {
    return {
        sessionId: 'sess-1',
        toolName: 'Bash',
        toolInput: { command: 'echo test' },
        createdAt: Date.now(),
        timeoutMs: 30_000,
        source: 'web',
        ...overrides,
    };
}

describe('formatApprovalForChain', () => {
    it('formats a short approval request with short ID prefix', () => {
        const request = makeRequest({ id: 'abcdef1234567890', description: 'Deploy to production' });
        const result = formatApprovalForChain(request);
        expect(result).toContain('[APPROVE?:abcdef12]');
        expect(result).toContain('Deploy to production');
        expect(result).toContain("Reply 'yes abcdef12' or 'no abcdef12'");
    });

    it('uses the first 8 characters of the request id', () => {
        const request = makeRequest({ id: '0123456789abcdef', description: 'Test' });
        const result = formatApprovalForChain(request);
        expect(result).toContain('[APPROVE?:01234567]');
    });

    it('truncates long descriptions to fit on-chain limit', () => {
        const longDescription = 'A'.repeat(1000);
        const request = makeRequest({ id: 'abcdef1234567890', description: longDescription });
        const result = formatApprovalForChain(request);
        // The description should be truncated with '...'
        expect(result).toContain('...');
        // The description portion should be <= 700 bytes
        expect(result.length).toBeLessThan(1000);
    });

    it('does not truncate descriptions within the byte limit', () => {
        const shortDescription = 'Short approval message';
        const request = makeRequest({ id: 'abcdef1234567890', description: shortDescription });
        const result = formatApprovalForChain(request);
        expect(result).toContain(shortDescription);
        expect(result).not.toContain('...');
    });

    it('handles UTF-8 multi-byte characters in descriptions', () => {
        const emoji = '🎉'; // 4 bytes each
        const description = emoji.repeat(200); // 800 bytes
        const request = makeRequest({ id: 'abcdef1234567890', description });
        const result = formatApprovalForChain(request);
        expect(result).toContain('[APPROVE?:abcdef12]');
        // Should be truncated since 800 bytes > 700 byte limit
        expect(result).toContain('...');
    });
});

describe('parseApprovalResponse', () => {
    it('parses "yes" followed by a short ID', () => {
        const result = parseApprovalResponse('yes abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    it('parses "approve" followed by a short ID', () => {
        const result = parseApprovalResponse('approve abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    it('parses "y" followed by a short ID', () => {
        const result = parseApprovalResponse('y abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    it('parses "no" followed by a short ID', () => {
        const result = parseApprovalResponse('no abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    it('parses "deny" followed by a short ID', () => {
        const result = parseApprovalResponse('deny abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    it('parses "n" followed by a short ID', () => {
        const result = parseApprovalResponse('n abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    it('handles leading/trailing whitespace', () => {
        const result = parseApprovalResponse('  yes abcdef12  ');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    it('is case-insensitive', () => {
        expect(parseApprovalResponse('YES abcdef12')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
        expect(parseApprovalResponse('Yes abcdef12')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
        expect(parseApprovalResponse('NO abcdef12')).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    it('accepts short IDs of 4-10 hex characters', () => {
        expect(parseApprovalResponse('yes abcd')).toEqual({ shortId: 'abcd', behavior: 'allow' });
        expect(parseApprovalResponse('yes abcdef1234')).toEqual({ shortId: 'abcdef1234', behavior: 'allow' });
    });

    it('rejects IDs shorter than 4 hex characters', () => {
        expect(parseApprovalResponse('yes abc')).toBeNull();
    });

    it('rejects IDs longer than 10 hex characters', () => {
        expect(parseApprovalResponse('yes abcdef12345')).toBeNull();
    });

    it('returns null for unrecognized commands', () => {
        expect(parseApprovalResponse('maybe abcdef12')).toBeNull();
        expect(parseApprovalResponse('ok abcdef12')).toBeNull();
    });

    it('returns null for empty input', () => {
        expect(parseApprovalResponse('')).toBeNull();
    });

    it('returns null for just a command with no ID', () => {
        expect(parseApprovalResponse('yes')).toBeNull();
    });

    it('rejects non-hex characters in ID', () => {
        expect(parseApprovalResponse('yes ghijklmn')).toBeNull();
        expect(parseApprovalResponse('yes ZZZZZZZZ')).toBeNull();
    });
});
