import { describe, test, expect } from 'bun:test';
import { examCases, getCasesByCategory, getCaseById } from '../exam/cases';
import type { ExamResponse } from '../exam/types';

function makeResponse(overrides: Partial<ExamResponse> = {}): ExamResponse {
    return {
        content: '',
        toolCalls: [],
        turns: 1,
        ...overrides,
    };
}

describe('examCases', () => {
    test('exports a non-empty array of exam cases', () => {
        expect(Array.isArray(examCases)).toBe(true);
        expect(examCases.length).toBeGreaterThan(0);
    });

    test('each case has required properties', () => {
        for (const c of examCases) {
            expect(c.id).toBeTruthy();
            expect(c.category).toBeTruthy();
            expect(c.name).toBeTruthy();
            expect(c.prompt).toBeTruthy();
            expect(typeof c.grade).toBe('function');
        }
    });

    test('all case IDs are unique', () => {
        const ids = examCases.map(c => c.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    test('contains cases across multiple categories', () => {
        const categories = new Set(examCases.map(c => c.category));
        expect(categories.size).toBeGreaterThan(1);
        expect(categories.has('coding')).toBe(true);
    });
});

describe('getCasesByCategory', () => {
    test('returns only cases matching the category', () => {
        const codingCases = getCasesByCategory('coding');
        expect(codingCases.length).toBeGreaterThan(0);
        for (const c of codingCases) {
            expect(c.category).toBe('coding');
        }
    });

    test('returns empty array for unknown category', () => {
        const result = getCasesByCategory('nonexistent-category');
        expect(result).toEqual([]);
    });

    test('returns different results for different categories', () => {
        const coding = getCasesByCategory('coding');
        const context = getCasesByCategory('context');
        expect(coding[0]?.id).not.toBe(context[0]?.id);
    });
});

describe('getCaseById', () => {
    test('returns the correct case by ID', () => {
        const c = getCaseById('coding-01');
        expect(c).toBeDefined();
        expect(c!.id).toBe('coding-01');
        expect(c!.category).toBe('coding');
    });

    test('returns undefined for unknown ID', () => {
        expect(getCaseById('nonexistent-id')).toBeUndefined();
    });

    test('returns a case that can be graded', () => {
        const c = getCaseById('coding-01');
        expect(c).toBeDefined();
        const grade = c!.grade(makeResponse({
            content: 'function fizzBuzz(n) { if (n % 3 === 0 && n % 5 === 0) return "FizzBuzz"; if (n % 3 === 0) return "Fizz"; if (n % 5 === 0) return "Buzz"; return String(n); }',
        }));
        expect(grade).toHaveProperty('passed');
        expect(grade).toHaveProperty('reason');
        expect(grade).toHaveProperty('score');
    });
});

describe('exam case grading', () => {
    test('coding-01 passes for correct FizzBuzz', () => {
        const c = getCaseById('coding-01')!;
        const grade = c.grade(makeResponse({
            content: 'function fizzBuzz(n) { if (n % 3 === 0 && n % 5 === 0) return "FizzBuzz"; if (n % 3 === 0) return "Fizz"; if (n % 5 === 0) return "Buzz"; return String(n); }',
        }));
        expect(grade.passed).toBe(true);
        expect(grade.score).toBeGreaterThan(0);
    });

    test('coding-01 fails for empty response', () => {
        const c = getCaseById('coding-01')!;
        const grade = c.grade(makeResponse({ content: '' }));
        expect(grade.passed).toBe(false);
    });

    test('coding-01 fails on error response', () => {
        const c = getCaseById('coding-01')!;
        const grade = c.grade(makeResponse({ error: 'Provider timeout' }));
        expect(grade.passed).toBe(false);
        expect(grade.reason).toContain('Error');
    });
});
