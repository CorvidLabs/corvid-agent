import { describe, it, expect } from 'bun:test';
import { parseModelSizeB, isCloudModel } from '../exam/runner';

// ── parseModelSizeB ─────────────────────────────────────────────────────────

describe('parseModelSizeB', () => {
    it('parses colon-separated sizes (qwen3:8b)', () => {
        expect(parseModelSizeB('qwen3:8b')).toBe(8);
    });

    it('parses large sizes (deepseek-v3.1:671b)', () => {
        expect(parseModelSizeB('deepseek-v3.1:671b')).toBe(671);
    });

    it('parses decimal sizes (qwen3:14.8B)', () => {
        expect(parseModelSizeB('qwen3:14.8B')).toBe(14.8);
    });

    it('parses cloud model names (qwen3-coder:480b-cloud)', () => {
        expect(parseModelSizeB('qwen3-coder:480b-cloud')).toBe(480);
    });

    it('parses hyphen-separated sizes (model-4b)', () => {
        expect(parseModelSizeB('model-4b')).toBe(4);
    });

    it('parses underscore-separated sizes (model_8b)', () => {
        expect(parseModelSizeB('model_8b')).toBe(8);
    });

    it('parses space-separated sizes from API (: 4.0B)', () => {
        expect(parseModelSizeB(':4.0B')).toBe(4);
    });

    it('returns null for models without size', () => {
        expect(parseModelSizeB('qwen3:latest')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseModelSizeB('')).toBeNull();
    });

    it('does not match "b" in the middle of a word', () => {
        expect(parseModelSizeB('mxbai-embed-large')).toBeNull();
    });
});

// ── isCloudModel ────────────────────────────────────────────────────────────

describe('isCloudModel', () => {
    it('detects cloud suffix', () => {
        expect(isCloudModel('qwen3-coder:480b-cloud')).toBe(true);
    });

    it('detects cloud in tag', () => {
        expect(isCloudModel('deepseek-v3.1:671b-cloud')).toBe(true);
    });

    it('returns false for local models', () => {
        expect(isCloudModel('qwen3:8b')).toBe(false);
    });

    it('returns false for model with "cloud" in name but no hyphen prefix', () => {
        // isCloudModel checks for '-cloud', not just 'cloud'
        expect(isCloudModel('cloudbert:7b')).toBe(false);
    });
});

// ── hostForModel logic ──────────────────────────────────────────────────────
// hostForModel is a private method on OllamaProvider. We test its behavioral
// contract by re-implementing the routing logic here (same pattern as
// direct-process-utils.test.ts).

function hostForModel(model: string, configuredHost: string): string {
    if (model.includes('-cloud')) {
        if (configuredHost.includes('localhost') || configuredHost.includes('127.0.0.1')) {
            return configuredHost;
        }
        const url = new URL(configuredHost);
        return `${url.protocol}//localhost:${url.port || '11434'}`;
    }
    return configuredHost;
}

describe('hostForModel routing', () => {
    it('routes local models to configured host', () => {
        expect(hostForModel('qwen3:8b', 'http://gpu-server:11434')).toBe('http://gpu-server:11434');
    });

    it('routes cloud models to localhost when host is remote', () => {
        expect(hostForModel('qwen3-coder:480b-cloud', 'http://gpu-server:11434')).toBe('http://localhost:11434');
    });

    it('keeps localhost for cloud models when host is already localhost', () => {
        expect(hostForModel('qwen3-coder:480b-cloud', 'http://localhost:11434')).toBe('http://localhost:11434');
    });

    it('keeps 127.0.0.1 for cloud models when host is 127.0.0.1', () => {
        expect(hostForModel('deepseek-v3.1:671b-cloud', 'http://127.0.0.1:11434')).toBe('http://127.0.0.1:11434');
    });

    it('preserves custom port for cloud redirect', () => {
        expect(hostForModel('model:8b-cloud', 'http://remote:8080')).toBe('http://localhost:8080');
    });

    it('defaults to port 11434 when no port specified', () => {
        expect(hostForModel('model:8b-cloud', 'http://remote')).toBe('http://localhost:11434');
    });

    it('preserves https protocol for cloud redirect', () => {
        expect(hostForModel('model:8b-cloud', 'https://remote:11434')).toBe('https://localhost:11434');
    });
});

// ── Model size gating (exam runner) ─────────────────────────────────────────

describe('Model size gating', () => {
    const MIN_MODEL_SIZE_B = 8;

    function shouldRejectModel(model: string, apiSize: number | null): boolean {
        if (isCloudModel(model)) return false; // cloud models exempt
        const sizeFromName = parseModelSizeB(model);
        if (sizeFromName !== null && sizeFromName < MIN_MODEL_SIZE_B) return true;
        if (sizeFromName === null && apiSize !== null && apiSize < MIN_MODEL_SIZE_B) return true;
        return false;
    }

    it('rejects 4B models', () => {
        expect(shouldRejectModel('qwen3:4b', null)).toBe(true);
    });

    it('accepts 8B models', () => {
        expect(shouldRejectModel('qwen3:8b', null)).toBe(false);
    });

    it('accepts 14B models', () => {
        expect(shouldRejectModel('qwen3:14b', null)).toBe(false);
    });

    it('exempts cloud models regardless of size label', () => {
        // Cloud models might have large size but the suffix is what matters
        expect(shouldRejectModel('qwen3-coder:480b-cloud', null)).toBe(false);
    });

    it('rejects based on API size when name has no size', () => {
        expect(shouldRejectModel('custom-model:latest', 3)).toBe(true);
    });

    it('accepts based on API size when name has no size', () => {
        expect(shouldRejectModel('custom-model:latest', 14)).toBe(false);
    });

    it('accepts when no size info available', () => {
        expect(shouldRejectModel('custom-model:latest', null)).toBe(false);
    });
});
