/**
 * TF-IDF vector generation for memory content.
 *
 * Fully local — zero API cost. Produces sparse vectors that can be
 * compared via cosine similarity for semantic-ish search.
 *
 * The vocabulary is built from the corpus of an agent's memories.
 * When a new memory is added, the IDF portion may drift, but this
 * is acceptable for the recall use-case where approximate ranking
 * is sufficient.
 */

// ─── Tokenization ────────────────────────────────────────────────────────────

/** Simple English stop-words to filter out common low-signal tokens. */
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
    'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
    'but', 'and', 'or', 'if', 'because', 'while', 'although', 'this',
    'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
    'what', 'which', 'who', 'whom', 'about', 'up',
]);

/**
 * Tokenize text into lowercase alpha-numeric terms, filtering stop-words
 * and very short tokens.
 */
export function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-_]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

// ─── Term-Frequency ──────────────────────────────────────────────────────────

/** Compute raw term frequencies for a token list. */
export function termFrequency(tokens: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    // Normalize by document length to avoid length bias
    const len = tokens.length || 1;
    for (const [term, count] of tf) {
        tf.set(term, count / len);
    }
    return tf;
}

// ─── IDF Corpus ──────────────────────────────────────────────────────────────

/**
 * A lightweight in-memory IDF corpus tracker.
 *
 * Maintains document-frequency counts for terms across all documents
 * added to the corpus, enabling IDF calculation.
 */
export class IDFCorpus {
    /** term → number of documents containing the term */
    private readonly df = new Map<string, number>();
    /** Total number of documents in the corpus */
    private docCount = 0;

    /** Add a document's unique terms to the corpus. */
    addDocument(tokens: string[]): void {
        const unique = new Set(tokens);
        for (const term of unique) {
            this.df.set(term, (this.df.get(term) ?? 0) + 1);
        }
        this.docCount++;
    }

    /** Remove a document's unique terms from the corpus. */
    removeDocument(tokens: string[]): void {
        const unique = new Set(tokens);
        for (const term of unique) {
            const count = (this.df.get(term) ?? 1) - 1;
            if (count <= 0) {
                this.df.delete(term);
            } else {
                this.df.set(term, count);
            }
        }
        this.docCount = Math.max(0, this.docCount - 1);
    }

    /** Compute IDF for a term: log(N / (1 + df)). */
    idf(term: string): number {
        const docFreq = this.df.get(term) ?? 0;
        return Math.log((this.docCount + 1) / (1 + docFreq));
    }

    /** Get the full vocabulary sorted alphabetically. */
    get vocabulary(): string[] {
        return [...this.df.keys()].sort();
    }

    /** Number of documents in the corpus. */
    get size(): number {
        return this.docCount;
    }

    /**
     * Build a TF-IDF vector for a document against the current vocabulary.
     *
     * Returns a sparse representation: Map<term, tfidf-weight>.
     */
    tfidfVector(tokens: string[]): Map<string, number> {
        const tf = termFrequency(tokens);
        const vector = new Map<string, number>();
        for (const [term, freq] of tf) {
            vector.set(term, freq * this.idf(term));
        }
        return vector;
    }

    /**
     * Build a dense float array for a document, aligned to the given
     * vocabulary index. Useful for storage and cosine similarity.
     */
    tfidfDenseVector(tokens: string[], vocabIndex: string[]): number[] {
        const sparse = this.tfidfVector(tokens);
        return vocabIndex.map((term) => sparse.get(term) ?? 0);
    }
}

// ─── Cosine Similarity ───────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two sparse TF-IDF vectors.
 * Returns a value in [0, 1] where 1 means identical direction.
 */
export function cosineSimilaritySparse(
    a: Map<string, number>,
    b: Map<string, number>,
): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (const [term, val] of a) {
        magA += val * val;
        const bVal = b.get(term);
        if (bVal !== undefined) {
            dot += val * bVal;
        }
    }

    for (const [, val] of b) {
        magB += val * val;
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Compute cosine similarity between two dense vectors.
 */
export function cosineSimilarityDense(a: number[], b: number[]): number {
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}
