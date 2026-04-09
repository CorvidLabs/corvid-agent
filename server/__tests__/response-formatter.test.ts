import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { type AlgoChatEventCallback, ResponseFormatter } from '../algochat/response-formatter';
import { runMigrations } from '../db/schema';

// --- Helpers ----------------------------------------------------------------

function createMockService() {
  return {
    chatAccount: { addr: 'MOCK_ADDR' },
    algorandService: {
      discoverPublicKey: mock(async () => 'mock-pk'),
      sendMessage: mock(async () => ({ fee: 1000 })),
    },
  } as any;
}

function createMockConfig() {
  return {} as any;
}

// --- Tests ------------------------------------------------------------------

describe('ResponseFormatter', () => {
  let db: Database;
  let formatter: ResponseFormatter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    mockService = createMockService();
    formatter = new ResponseFormatter(db, createMockConfig(), mockService);
  });

  afterEach(() => {
    db.close();
  });

  // ── splitPskContent ──────────────────────────────────────────────

  describe('splitPskContent', () => {
    it('returns single chunk when content fits', () => {
      const chunks = formatter.splitPskContent('Hello', 800);
      expect(chunks).toEqual(['Hello']);
    });

    it('returns single chunk at exact boundary', () => {
      const content = 'x'.repeat(100);
      const chunks = formatter.splitPskContent(content, 100);
      expect(chunks).toEqual([content]);
    });

    it('splits content that exceeds maxBytes', () => {
      const content = 'a'.repeat(500);
      const chunks = formatter.splitPskContent(content, 200);
      expect(chunks.length).toBeGreaterThan(1);

      // All chunks should fit within limit
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(200);
      }

      // Concatenated chunks should equal original
      expect(chunks.join('')).toBe(content);
    });

    it('prefers breaking at newlines', () => {
      const line1 = 'a'.repeat(150);
      const line2 = 'b'.repeat(150);
      const content = `${line1}\n${line2}`;
      const chunks = formatter.splitPskContent(content, 200);

      // First chunk should break at the newline
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0]).toContain('a');
    });

    it('handles multi-byte characters without corruption', () => {
      // Mix of ASCII and multi-byte chars
      const content = '🎉'.repeat(100); // 400 bytes
      const chunks = formatter.splitPskContent(content, 100);

      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(100);
      }

      // Reassembled should be valid (no broken surrogates)
      const reassembled = chunks.join('');
      expect(reassembled).toBe(content);
    });

    it('handles empty content', () => {
      const chunks = formatter.splitPskContent('', 800);
      expect(chunks).toEqual(['']);
    });
  });

  // ── Event callbacks ──────────────────────────────────────────────

  describe('event callbacks', () => {
    it('onEvent registers a callback that fires on emitEvent', () => {
      const calls: Array<{
        participant: string;
        content: string;
        direction: string;
      }> = [];
      const cb: AlgoChatEventCallback = (p, c, d) => {
        calls.push({ participant: p, content: c, direction: d });
      };

      formatter.onEvent(cb);
      formatter.emitEvent('ADDR1', 'hello', 'outbound');

      expect(calls).toHaveLength(1);
      expect(calls[0].participant).toBe('ADDR1');
      expect(calls[0].content).toBe('hello');
      expect(calls[0].direction).toBe('outbound');
    });

    it('offEvent removes a callback', () => {
      const calls: number[] = [];
      const cb: AlgoChatEventCallback = () => calls.push(1);

      formatter.onEvent(cb);
      formatter.offEvent(cb);
      formatter.emitEvent('ADDR1', 'hello', 'outbound');

      expect(calls).toHaveLength(0);
    });

    it('emitEvent fires multiple callbacks', () => {
      let count = 0;
      const cb1: AlgoChatEventCallback = () => count++;
      const cb2: AlgoChatEventCallback = () => count++;

      formatter.onEvent(cb1);
      formatter.onEvent(cb2);
      formatter.emitEvent('ADDR1', 'hello', 'inbound');

      expect(count).toBe(2);
    });

    it('emitEvent continues after callback error', () => {
      let secondCalled = false;
      const badCb: AlgoChatEventCallback = () => {
        throw new Error('callback boom');
      };
      const goodCb: AlgoChatEventCallback = () => {
        secondCalled = true;
      };

      formatter.onEvent(badCb);
      formatter.onEvent(goodCb);
      formatter.emitEvent('ADDR1', 'hello', 'status');

      expect(secondCalled).toBe(true);
    });

    it('emitEvent passes fee to callback', () => {
      let receivedFee: number | undefined;
      const cb: AlgoChatEventCallback = (_p, _c, _d, fee) => {
        receivedFee = fee;
      };
      formatter.onEvent(cb);
      formatter.emitEvent('ADDR1', 'hello', 'outbound', 2000);
      expect(receivedFee).toBe(2000);
    });
  });

  // ── Dependency injection ─────────────────────────────────────────

  describe('dependency injection', () => {
    it('setAgentWalletService stores the service', () => {
      // Should not throw
      formatter.setAgentWalletService({ getAgentChatAccount: mock(async () => null) } as any);
    });

    it('setOnChainTransactor stores the transactor', () => {
      formatter.setOnChainTransactor({ sendToAddress: mock(async () => null) } as any);
    });

    it('setPskManagerLookup stores the lookup function', () => {
      formatter.setPskManagerLookup(() => null);
    });
  });
});
