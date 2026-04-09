import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { condenseMessage } from '../algochat/condenser';
import { LlmProviderRegistry } from '../providers/registry';

// --- Mock the LLM provider registry so tests don't hit real LLMs -----------

// Instead of mock.module (which poisons the module cache for all test files
// in the process), we replace getInstance temporarily and restore it after
// each test. The condenser calls `LlmProviderRegistry.getInstance()` via
// dynamic import, so this intercepts it without replacing the class itself.

let mockProviders: any[] = [];
const _originalGetInstance = LlmProviderRegistry.getInstance;

// --- Helpers ----------------------------------------------------------------

function makeProvider(overrides?: { type?: string; response?: string; shouldThrow?: boolean }) {
  return {
    type: overrides?.type ?? 'mock',
    getInfo: () => ({ defaultModel: 'mock-model' }),
    complete: overrides?.shouldThrow
      ? mock(async () => {
          throw new Error('provider error');
        })
      : mock(async () => ({
          content: overrides?.response ?? 'short summary',
        })),
  };
}

// --- Tests ------------------------------------------------------------------

describe('condenseMessage', () => {
  beforeEach(() => {
    mockProviders = [];
    (LlmProviderRegistry as any).getInstance = () => ({
      getDefault: () => mockProviders[0] ?? undefined,
      getAll: () => mockProviders,
      get: () => undefined,
      register: () => {},
    });
  });

  afterEach(() => {
    // Restore original getInstance so other test files are not affected
    (LlmProviderRegistry as any).getInstance = _originalGetInstance;
  });

  // ── Short content (no condensation needed) ───────────────────────

  it('returns original when content fits within maxBytes', async () => {
    const result = await condenseMessage('Hello world', 800);
    expect(result.wasCondensed).toBe(false);
    expect(result.content).toBe('Hello world');
    expect(result.originalBytes).toBe(result.condensedBytes);
  });

  it('returns original for exact boundary', async () => {
    const content = 'x'.repeat(100);
    const result = await condenseMessage(content, 100);
    expect(result.wasCondensed).toBe(false);
  });

  // ── LLM condensation ─────────────────────────────────────────────

  it('condenses with LLM when content exceeds maxBytes', async () => {
    const provider = makeProvider({ response: 'brief' });
    mockProviders = [provider];

    const longContent = 'a'.repeat(1000);
    const result = await condenseMessage(longContent, 200);

    expect(result.wasCondensed).toBe(true);
    expect(result.content).toContain('[condensed]');
    expect(result.content).toContain('brief');
    expect(result.originalBytes).toBe(1000);
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('appends message ID reference suffix when provided', async () => {
    const provider = makeProvider({ response: 'summary' });
    mockProviders = [provider];

    const longContent = 'b'.repeat(1000);
    const result = await condenseMessage(longContent, 200, 'msg-12345678-abcd');

    expect(result.content).toContain('[condensed]');
    expect(result.content).toContain('id:msg-1234');
  });

  // ── Truncation when LLM output still too large ───────────────────

  it('truncates when LLM output exceeds target', async () => {
    // LLM returns something still too long
    const provider = makeProvider({ response: 'x'.repeat(500) });
    mockProviders = [provider];

    const longContent = 'z'.repeat(1000);
    const result = await condenseMessage(longContent, 200);

    expect(result.wasCondensed).toBe(true);
    expect(result.content).toContain('[condensed]');
    expect(result.content).toContain('...');
  });

  // ── Provider fallback ────────────────────────────────────────────

  it('falls back to next provider when first fails', async () => {
    const failProvider = makeProvider({ type: 'fail', shouldThrow: true });
    const goodProvider = makeProvider({ type: 'good', response: 'ok' });
    mockProviders = [failProvider, goodProvider];

    const longContent = 'c'.repeat(1000);
    const result = await condenseMessage(longContent, 200);

    expect(result.wasCondensed).toBe(true);
    expect(result.content).toContain('ok');
    expect(failProvider.complete).toHaveBeenCalledTimes(1);
    expect(goodProvider.complete).toHaveBeenCalledTimes(1);
  });

  // ── All providers fail → truncation fallback ─────────────────────

  it('truncates as last resort when all providers fail', async () => {
    const failProvider = makeProvider({ shouldThrow: true });
    mockProviders = [failProvider];

    const longContent = 'd'.repeat(1000);
    const result = await condenseMessage(longContent, 200);

    expect(result.wasCondensed).toBe(true);
    expect(result.content).toContain('...');
    expect(result.condensedBytes).toBeLessThanOrEqual(200);
  });

  it('truncates when no providers registered', async () => {
    mockProviders = [];

    const longContent = 'e'.repeat(1000);
    const result = await condenseMessage(longContent, 200);

    expect(result.wasCondensed).toBe(true);
    expect(result.content).toContain('...');
  });

  // ── Multi-byte character handling ────────────────────────────────

  it('handles multi-byte characters correctly in size check', async () => {
    // Each emoji is 4 bytes in UTF-8
    const emojis = '😀'.repeat(50); // 200 bytes
    const result = await condenseMessage(emojis, 200);
    expect(result.wasCondensed).toBe(false);
    expect(result.originalBytes).toBe(200);
  });
});
