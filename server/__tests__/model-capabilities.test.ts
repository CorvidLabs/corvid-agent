import { describe, it, expect, beforeEach } from 'bun:test';
import { ModelCapabilityDetector } from '../providers/ollama/model-capabilities';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create a detector that doesn't make real HTTP calls.
 * Uses inferFromName for all models.
 */
function createTestDetector(): ModelCapabilityDetector {
    // Use a host that won't respond so fallback inference is used
    return new ModelCapabilityDetector('http://127.0.0.1:1');
}

// ── detectToolSupport (via getCapabilities → inferFromName) ────────────────

describe('Tool support detection via inferFromName', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('detects llama as tool-capable', async () => {
        const caps = await detector.getCapabilities('llama3.1:8b');
        expect(caps.supportsTools).toBe(true);
        expect(caps.family).toBe('llama');
    });

    it('detects qwen as tool-capable', async () => {
        const caps = await detector.getCapabilities('qwen2.5:7b');
        expect(caps.supportsTools).toBe(true);
    });

    it('detects mistral as tool-capable', async () => {
        const caps = await detector.getCapabilities('mistral:7b');
        expect(caps.supportsTools).toBe(true);
        expect(caps.family).toBe('mistral');
    });

    it('detects phi as NOT tool-capable via name inference', async () => {
        const caps = await detector.getCapabilities('phi3:mini');
        expect(caps.supportsTools).toBe(false);
        expect(caps.family).toBe('phi');
    });

    it('detects gemma as NOT tool-capable via name inference', async () => {
        const caps = await detector.getCapabilities('gemma2:9b');
        expect(caps.supportsTools).toBe(false);
        expect(caps.family).toBe('gemma');
    });

    it('detects unknown models as NOT tool-capable', async () => {
        const caps = await detector.getCapabilities('custom-model:latest');
        expect(caps.supportsTools).toBe(false);
        expect(caps.family).toBe('unknown');
    });
});

// ── Embedding model exclusion ──────────────────────────────────────────────

describe('Embedding model exclusion', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('detects nomic-embed as embedding model', async () => {
        const caps = await detector.getCapabilities('nomic-embed-text');
        expect(caps.isEmbeddingModel).toBe(true);
        expect(caps.supportsTools).toBe(false);
    });

    it('detects mxbai as embedding model', async () => {
        const caps = await detector.getCapabilities('mxbai-embed-large');
        expect(caps.isEmbeddingModel).toBe(true);
        expect(caps.supportsTools).toBe(false);
    });

    it('detects all-minilm as embedding model', async () => {
        const caps = await detector.getCapabilities('all-minilm:latest');
        expect(caps.isEmbeddingModel).toBe(true);
    });

    it('detects snowflake as embedding model', async () => {
        const caps = await detector.getCapabilities('snowflake-arctic-embed');
        expect(caps.isEmbeddingModel).toBe(true);
    });

    it('gives embedding models small context', async () => {
        const caps = await detector.getCapabilities('nomic-embed-text');
        expect(caps.contextLength).toBe(512);
    });
});

// ── Vision detection ───────────────────────────────────────────────────────

describe('Vision detection', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('detects llava as vision-capable', async () => {
        const caps = await detector.getCapabilities('llava:13b');
        expect(caps.supportsVision).toBe(true);
    });

    it('detects moondream as vision-capable', async () => {
        const caps = await detector.getCapabilities('moondream:latest');
        expect(caps.supportsVision).toBe(true);
    });

    it('does not detect regular models as vision-capable', async () => {
        const caps = await detector.getCapabilities('llama3.1:8b');
        expect(caps.supportsVision).toBe(false);
    });
});

// ── inferFromName defaults ─────────────────────────────────────────────────

describe('inferFromName defaults', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('defaults to 4096 context for chat models', async () => {
        const caps = await detector.getCapabilities('llama3.1:8b');
        expect(caps.contextLength).toBe(4096);
    });

    it('defaults to 512 context for embedding models', async () => {
        const caps = await detector.getCapabilities('bge-large-en');
        expect(caps.contextLength).toBe(512);
    });

    it('sets parameterSize to unknown when inferring', async () => {
        const caps = await detector.getCapabilities('llama3.1:8b');
        expect(caps.parameterSize).toBe('unknown');
    });
});

// ── Effective context length ───────────────────────────────────────────────

describe('getEffectiveContextLength', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('returns 80% of raw context', async () => {
        const effective = await detector.getEffectiveContextLength('llama3.1:8b');
        const caps = await detector.getCapabilities('llama3.1:8b');
        expect(effective).toBe(Math.floor(caps.contextLength * 0.8));
    });
});

// ── findBestModel ──────────────────────────────────────────────────────────

describe('findBestModel', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('finds first tool-capable model', async () => {
        const result = await detector.findBestModel(
            ['nomic-embed-text', 'phi3:mini', 'llama3.1:8b'],
            { tools: true },
        );
        expect(result).toBe('llama3.1:8b');
    });

    it('returns null when no model matches', async () => {
        const result = await detector.findBestModel(
            ['nomic-embed-text', 'mxbai-embed-large'],
            { tools: true },
        );
        expect(result).toBeNull();
    });

    it('filters by vision requirement', async () => {
        const result = await detector.findBestModel(
            ['llama3.1:8b', 'llava:13b'],
            { vision: true },
        );
        expect(result).toBe('llava:13b');
    });

    it('filters by minimum context', async () => {
        const result = await detector.findBestModel(
            ['nomic-embed-text', 'llama3.1:8b'],
            { minContext: 2048 },
        );
        // nomic has 512, llama has 4096
        expect(result).toBe('llama3.1:8b');
    });

    it('returns first model when no requirements', async () => {
        const result = await detector.findBestModel(
            ['model-a', 'model-b'],
            {},
        );
        expect(result).toBe('model-a');
    });
});

// ── Cache behavior ─────────────────────────────────────────────────────────

describe('Cache behavior', () => {
    let detector: ModelCapabilityDetector;

    beforeEach(() => {
        detector = createTestDetector();
        detector.clearCache();
    });

    it('caches results after first call', async () => {
        const first = await detector.getCapabilities('llama3.1:8b');
        const second = await detector.getCapabilities('llama3.1:8b');
        // Both should have the same cachedAt (same cache entry)
        expect(first.cachedAt).toBe(second.cachedAt);
    });

    it('clearCache removes cached entries', async () => {
        await detector.getCapabilities('llama3.1:8b');
        detector.clearCache();
        const afterClear = await detector.getCapabilities('llama3.1:8b');
        // After clear, should still return valid capabilities
        expect(afterClear).toBeDefined();
        expect(afterClear.family).toBe('llama');
    });
});
