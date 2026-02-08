import { describe, it, expect } from 'bun:test';
import { redactMnemonic, looksLikeMnemonic, sanitizeLogMessage } from '../lib/secure-mnemonic';

// 25-word fake mnemonic (matches Algorand mnemonic shape)
const FAKE_MNEMONIC = 'abandon ability able about above absent absorb abstract absurd abuse access accident account accuse achieve acid acoustic acquire across act action actor actress actual about';

describe('redactMnemonic', () => {
    it('redacts a mnemonic keeping first and last words', () => {
        const result = redactMnemonic(FAKE_MNEMONIC);
        expect(result).toContain('abandon');
        expect(result).toContain('about');
        expect(result).toContain('***');
        expect(result).toContain('25 words');
        expect(result).not.toContain('ability');
    });

    it('redacts short strings as fully masked', () => {
        expect(redactMnemonic('ab')).toBe('***');
        expect(redactMnemonic('a')).toBe('***');
        expect(redactMnemonic('')).toBe('***');
    });

    it('handles whitespace-heavy input', () => {
        const padded = '  abandon   ability   about  ';
        const result = redactMnemonic(padded);
        expect(result).toContain('abandon');
        expect(result).toContain('about');
    });
});

describe('looksLikeMnemonic', () => {
    it('identifies a 25-word lowercase string as a mnemonic', () => {
        expect(looksLikeMnemonic(FAKE_MNEMONIC)).toBe(true);
    });

    it('rejects fewer than 25 words', () => {
        const short = FAKE_MNEMONIC.split(' ').slice(0, 24).join(' ');
        expect(looksLikeMnemonic(short)).toBe(false);
    });

    it('rejects more than 25 words', () => {
        const long = FAKE_MNEMONIC + ' extra';
        expect(looksLikeMnemonic(long)).toBe(false);
    });

    it('rejects words with uppercase letters', () => {
        const upper = FAKE_MNEMONIC.replace('abandon', 'Abandon');
        expect(looksLikeMnemonic(upper)).toBe(false);
    });

    it('rejects words with numbers', () => {
        const withNums = FAKE_MNEMONIC.replace('abandon', 'abc123');
        expect(looksLikeMnemonic(withNums)).toBe(false);
    });

    it('rejects empty string', () => {
        expect(looksLikeMnemonic('')).toBe(false);
    });

    it('handles extra whitespace', () => {
        const padded = '  ' + FAKE_MNEMONIC + '  ';
        expect(looksLikeMnemonic(padded)).toBe(true);
    });
});

describe('sanitizeLogMessage', () => {
    it('redacts a mnemonic embedded in a log message', () => {
        const message = `Account created with mnemonic: ${FAKE_MNEMONIC} and funded`;
        const sanitized = sanitizeLogMessage(message);
        expect(sanitized).not.toContain('ability');
        expect(sanitized).not.toContain('absorb');
    });

    it('leaves normal log messages unchanged', () => {
        const message = 'Server started on port 3000';
        expect(sanitizeLogMessage(message)).toBe(message);
    });

    it('leaves short word sequences unchanged', () => {
        const message = 'this is a normal sentence with several words in it';
        expect(sanitizeLogMessage(message)).toBe(message);
    });
});
