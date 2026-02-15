import { test, expect, describe } from 'bun:test';
import {
    tokenize,
    termFrequency,
    IDFCorpus,
    cosineSimilaritySparse,
    cosineSimilarityDense,
} from '../memory/embeddings';

// ─── Tokenization ────────────────────────────────────────────────────────────

describe('tokenize', () => {
    test('lowercases and splits on whitespace', () => {
        const tokens = tokenize('Hello World');
        expect(tokens).toEqual(['hello', 'world']);
    });

    test('removes stop words', () => {
        const tokens = tokenize('this is a test of the system');
        expect(tokens).toEqual(['test', 'system']);
    });

    test('removes punctuation', () => {
        const tokens = tokenize('function() { return true; }');
        expect(tokens).toContain('function');
        expect(tokens).toContain('return');
        expect(tokens).toContain('true');
    });

    test('filters tokens shorter than 2 chars', () => {
        const tokens = tokenize('I am a good developer');
        expect(tokens).not.toContain('i');
        expect(tokens).not.toContain('a');
        expect(tokens).toContain('good');
        expect(tokens).toContain('developer');
    });

    test('handles empty string', () => {
        expect(tokenize('')).toEqual([]);
    });

    test('handles special characters', () => {
        const tokens = tokenize('user@email.com api_key=abc123');
        expect(tokens.length).toBeGreaterThan(0);
    });

    test('preserves hyphens and underscores in tokens', () => {
        const tokens = tokenize('api-key server_config');
        expect(tokens).toContain('api-key');
        expect(tokens).toContain('server_config');
    });
});

// ─── Term Frequency ──────────────────────────────────────────────────────────

describe('termFrequency', () => {
    test('computes normalized term frequencies', () => {
        const tf = termFrequency(['hello', 'world', 'hello']);
        expect(tf.get('hello')).toBeCloseTo(2 / 3);
        expect(tf.get('world')).toBeCloseTo(1 / 3);
    });

    test('handles single token', () => {
        const tf = termFrequency(['single']);
        expect(tf.get('single')).toBeCloseTo(1.0);
    });

    test('handles empty array', () => {
        const tf = termFrequency([]);
        expect(tf.size).toBe(0);
    });
});

// ─── IDFCorpus ───────────────────────────────────────────────────────────────

describe('IDFCorpus', () => {
    test('tracks document count', () => {
        const corpus = new IDFCorpus();
        corpus.addDocument(['hello', 'world']);
        corpus.addDocument(['hello', 'there']);
        expect(corpus.size).toBe(2);
    });

    test('computes IDF correctly', () => {
        const corpus = new IDFCorpus();
        corpus.addDocument(['hello', 'world']);
        corpus.addDocument(['hello', 'there']);

        // 'hello' appears in 2 of 2 docs: log(3 / 3) = 0
        expect(corpus.idf('hello')).toBeCloseTo(0);

        // 'world' appears in 1 of 2 docs: log(3 / 2)
        expect(corpus.idf('world')).toBeCloseTo(Math.log(3 / 2));

        // Unknown term: log(3 / 1)
        expect(corpus.idf('unknown')).toBeCloseTo(Math.log(3));
    });

    test('removeDocument updates counts', () => {
        const corpus = new IDFCorpus();
        corpus.addDocument(['hello', 'world']);
        corpus.addDocument(['hello', 'there']);
        corpus.removeDocument(['hello', 'world']);

        expect(corpus.size).toBe(1);
        // 'world' should be gone from vocabulary
        expect(corpus.idf('world')).toBeCloseTo(Math.log(2)); // log(2/1)
    });

    test('vocabulary returns sorted terms', () => {
        const corpus = new IDFCorpus();
        corpus.addDocument(['zebra', 'apple', 'mango']);
        expect(corpus.vocabulary).toEqual(['apple', 'mango', 'zebra']);
    });

    test('tfidfVector produces correct weights', () => {
        const corpus = new IDFCorpus();
        corpus.addDocument(['typescript', 'code', 'project']);
        corpus.addDocument(['python', 'code', 'script']);

        const vector = corpus.tfidfVector(['typescript', 'code']);

        // 'code' appears in both docs, lower IDF
        // 'typescript' appears in 1 doc, higher IDF
        const codeWeight = vector.get('code') ?? 0;
        const tsWeight = vector.get('typescript') ?? 0;
        expect(tsWeight).toBeGreaterThan(codeWeight);
    });

    test('tfidfDenseVector aligns to vocab index', () => {
        const corpus = new IDFCorpus();
        // Two docs: alpha only appears in the first, giving it non-zero IDF
        corpus.addDocument(['alpha', 'beta']);
        corpus.addDocument(['gamma', 'beta']);

        const vocab = ['alpha', 'beta', 'gamma'];
        const dense = corpus.tfidfDenseVector(['alpha'], vocab);

        expect(dense.length).toBe(3);
        expect(dense[0]).toBeGreaterThan(0); // alpha (only in 1 of 2 docs, high IDF)
        expect(dense[1]).toBe(0);             // beta (not in input)
        expect(dense[2]).toBe(0);             // gamma (not in input)
    });
});

// ─── Cosine Similarity ───────────────────────────────────────────────────────

describe('cosineSimilaritySparse', () => {
    test('identical vectors have similarity 1', () => {
        const v = new Map([['a', 1], ['b', 2]]);
        expect(cosineSimilaritySparse(v, v)).toBeCloseTo(1.0);
    });

    test('orthogonal vectors have similarity 0', () => {
        const a = new Map([['x', 1]]);
        const b = new Map([['y', 1]]);
        expect(cosineSimilaritySparse(a, b)).toBeCloseTo(0.0);
    });

    test('partially overlapping vectors', () => {
        const a = new Map([['x', 1], ['y', 1]]);
        const b = new Map([['y', 1], ['z', 1]]);
        const sim = cosineSimilaritySparse(a, b);
        expect(sim).toBeGreaterThan(0);
        expect(sim).toBeLessThan(1);
    });

    test('empty vectors return 0', () => {
        expect(cosineSimilaritySparse(new Map(), new Map())).toBe(0);
    });
});

describe('cosineSimilarityDense', () => {
    test('identical vectors have similarity 1', () => {
        expect(cosineSimilarityDense([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
    });

    test('opposite vectors have similarity -1', () => {
        expect(cosineSimilarityDense([1, 0], [-1, 0])).toBeCloseTo(-1.0);
    });

    test('orthogonal vectors have similarity 0', () => {
        expect(cosineSimilarityDense([1, 0], [0, 1])).toBeCloseTo(0.0);
    });

    test('zero vectors return 0', () => {
        expect(cosineSimilarityDense([0, 0], [0, 0])).toBe(0);
    });
});
