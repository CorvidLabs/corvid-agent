import { test, expect, describe } from 'bun:test';

// We test the normalizeWords and similarity logic directly since
// findSimilarIssues depends on external GitHub API calls.
// The normalizeWords function is private, so we test the behavior via
// a local reimplementation that mirrors the logic.

function normalizeWords(text: string): Set<string> {
    const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with',
        'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
        'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
        'this', 'that', 'these', 'those', 'it', 'its']);

    return new Set(
        text.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 1 && !stopWords.has(w))
    );
}

function jaccardSimilarity(a: string, b: string): number {
    const wordsA = normalizeWords(a);
    const wordsB = normalizeWords(b);
    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
        if (wordsB.has(word)) intersection++;
    }
    const union = new Set([...wordsA, ...wordsB]).size;
    return intersection / union;
}

describe('Issue Dedup — Title Similarity', () => {
    describe('normalizeWords', () => {
        test('strips punctuation and lowercases', () => {
            const words = normalizeWords('Fix: Schedule Coordination!');
            expect(words.has('fix')).toBe(true);
            expect(words.has('schedule')).toBe(true);
            expect(words.has('coordination')).toBe(true);
        });

        test('filters stop words', () => {
            const words = normalizeWords('Add the new feature to the system');
            expect(words.has('the')).toBe(false);
            expect(words.has('to')).toBe(false);
            expect(words.has('add')).toBe(true);
            expect(words.has('new')).toBe(true);
            expect(words.has('feature')).toBe(true);
            expect(words.has('system')).toBe(true);
        });

        test('filters single-character words', () => {
            const words = normalizeWords('A B C fix');
            expect(words.size).toBe(1);
            expect(words.has('fix')).toBe(true);
        });

        test('handles empty string', () => {
            const words = normalizeWords('');
            expect(words.size).toBe(0);
        });
    });

    describe('jaccardSimilarity', () => {
        test('identical titles have similarity 1.0', () => {
            const sim = jaccardSimilarity(
                'Schedule coordination — prevent concurrent work',
                'Schedule coordination — prevent concurrent work',
            );
            expect(sim).toBe(1.0);
        });

        test('very similar titles have high similarity', () => {
            const sim = jaccardSimilarity(
                'Schedule coordination — prevent concurrent work on same repo',
                'Schedule coordination: prevent concurrent work on the same repository',
            );
            expect(sim).toBeGreaterThan(0.5);
        });

        test('unrelated titles have low similarity', () => {
            const sim = jaccardSimilarity(
                'Schedule coordination — prevent concurrent work',
                'Fix TypeScript type errors in dashboard component',
            );
            expect(sim).toBeLessThan(0.2);
        });

        test('partially overlapping titles have moderate similarity', () => {
            const sim = jaccardSimilarity(
                'Fix scheduling bug in cron parser',
                'Cron parser improvements and fixes',
            );
            // "fix" doesn't appear in both since "fixes" != "fix" — but "cron" and "parser" do
            expect(sim).toBeGreaterThan(0.2);
            expect(sim).toBeLessThan(0.8);
        });

        test('empty title returns 0', () => {
            expect(jaccardSimilarity('', 'Something')).toBe(0);
            expect(jaccardSimilarity('Something', '')).toBe(0);
        });
    });
});
