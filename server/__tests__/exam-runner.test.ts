import { describe, test, expect } from 'bun:test';
import { parseModelSizeB, isCloudModel } from '../exam/runner';

describe('parseModelSizeB', () => {
    test('parses colon-prefixed sizes like ":8b"', () => {
        expect(parseModelSizeB('qwen3:8b')).toBe(8);
    });

    test('parses large models like ":671b"', () => {
        expect(parseModelSizeB('deepseek-r1:671b')).toBe(671);
    });

    test('parses decimal sizes like ":14.8B"', () => {
        expect(parseModelSizeB('model:14.8B')).toBe(14.8);
    });

    test('parses space-separated sizes', () => {
        expect(parseModelSizeB('model 4.0B params')).toBe(4.0);
    });

    test('parses hyphen-separated sizes', () => {
        expect(parseModelSizeB('llama-3-8b-instruct')).toBe(8);
    });

    test('returns null for models without size info', () => {
        expect(parseModelSizeB('claude-3-opus')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseModelSizeB('')).toBeNull();
    });

    test('returns null when B is followed by letters (not a size)', () => {
        expect(parseModelSizeB('roberta-base')).toBeNull();
    });
});

describe('isCloudModel', () => {
    test('returns true for cloud models', () => {
        expect(isCloudModel('qwen3-cloud')).toBe(true);
        expect(isCloudModel('deepseek-r1-cloud')).toBe(true);
    });

    test('returns false for non-cloud models', () => {
        expect(isCloudModel('qwen3:8b')).toBe(false);
        expect(isCloudModel('claude-3-opus')).toBe(false);
        expect(isCloudModel('llama3.1:70b')).toBe(false);
    });
});
