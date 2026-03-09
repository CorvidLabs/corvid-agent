import { describe, test, expect } from 'bun:test';
import { formatApprovalForChain, parseApprovalResponse } from '../algochat/approval-format';
import type { ApprovalRequest } from '../process/approval-types';

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
    return {
        id: 'abcdef1234567890',
        sessionId: 'sess-1',
        toolName: 'Bash',
        toolInput: {},
        description: 'Test description',
        createdAt: Date.now(),
        timeoutMs: 30000,
        source: 'web',
        ...overrides,
    };
}

describe('formatApprovalForChain', () => {
    test('formats a basic approval request with short ID prefix', () => {
        const result = formatApprovalForChain(makeRequest({
            id: 'abcdef1234567890',
            description: 'Deploy new version',
        }));
        expect(result).toContain('[APPROVE?:abcdef12]');
        expect(result).toContain('Deploy new version');
        expect(result).toContain("Reply 'yes abcdef12' or 'no abcdef12'");
    });

    test('uses first 8 characters of id as shortId', () => {
        const result = formatApprovalForChain(makeRequest({
            id: '0123456789abcdef',
            description: 'Test',
        }));
        expect(result).toStartWith('[APPROVE?:01234567]');
    });

    test('truncates descriptions exceeding MAX_DESCRIPTION_BYTES', () => {
        const longDescription = 'A'.repeat(800);
        const result = formatApprovalForChain(makeRequest({
            description: longDescription,
        }));
        expect(result).toContain('...');
        expect(result).not.toContain(longDescription);
    });

    test('does not truncate description within byte limit', () => {
        const shortDescription = 'This is a short description';
        const result = formatApprovalForChain(makeRequest({
            description: shortDescription,
        }));
        expect(result).toContain(shortDescription);
        expect(result).not.toContain('...');
    });

    test('handles multi-byte UTF-8 characters during truncation', () => {
        const emojiDescription = '🚀'.repeat(200); // 800 bytes
        const result = formatApprovalForChain(makeRequest({
            description: emojiDescription,
        }));
        expect(result).toContain('[APPROVE?:abcdef12]');
        expect(result).toContain('...');
    });
});

describe('parseApprovalResponse', () => {
    test('parses "yes" with shortId', () => {
        const result = parseApprovalResponse('yes abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    test('parses "approve" with shortId', () => {
        const result = parseApprovalResponse('approve abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    test('parses "y" with shortId', () => {
        const result = parseApprovalResponse('y abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    test('parses "no" with shortId', () => {
        const result = parseApprovalResponse('no abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    test('parses "deny" with shortId', () => {
        const result = parseApprovalResponse('deny abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    test('parses "n" with shortId', () => {
        const result = parseApprovalResponse('n abcdef12');
        expect(result).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
    });

    test('is case-insensitive', () => {
        expect(parseApprovalResponse('YES abcdef12')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
        expect(parseApprovalResponse('NO abcdef12')).toEqual({ shortId: 'abcdef12', behavior: 'deny' });
        expect(parseApprovalResponse('Approve ABCDEF12')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    test('trims whitespace', () => {
        expect(parseApprovalResponse('  yes abcdef12  ')).toEqual({ shortId: 'abcdef12', behavior: 'allow' });
    });

    test('returns null for unrecognized input', () => {
        expect(parseApprovalResponse('maybe abcdef12')).toBeNull();
        expect(parseApprovalResponse('hello')).toBeNull();
        expect(parseApprovalResponse('')).toBeNull();
    });

    test('returns null when shortId is too short (< 4 hex chars)', () => {
        expect(parseApprovalResponse('yes abc')).toBeNull();
    });

    test('returns null when shortId is too long (> 10 hex chars)', () => {
        expect(parseApprovalResponse('yes abcdef12345')).toBeNull();
    });

    test('returns null for non-hex shortId', () => {
        expect(parseApprovalResponse('yes ghijklmn')).toBeNull();
    });

    test('handles shortId of exactly 4 characters', () => {
        const result = parseApprovalResponse('yes abcd');
        expect(result).toEqual({ shortId: 'abcd', behavior: 'allow' });
    });

    test('handles shortId of exactly 10 characters', () => {
        const result = parseApprovalResponse('yes abcdef1234');
        expect(result).toEqual({ shortId: 'abcdef1234', behavior: 'allow' });
    });
});
