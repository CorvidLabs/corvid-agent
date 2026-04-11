import { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { runMigrations } from '../db/schema';
import { handleBlockExplorerRoutes } from '../routes/block-explorer';

// ── Helpers ──────────────────────────────────────────────────────────

function makeReq(method: string, path: string): { req: Request; url: URL } {
  const url = new URL(`http://localhost${path}`);
  return { req: new Request(url, { method }), url };
}

/** Chainable mock that mirrors the indexer/algod SDK query builder pattern. */
function chainable(result: unknown) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'do') return () => Promise.resolve(result);
      // Every other method returns the proxy so chains work
      return () => new Proxy({}, handler);
    },
  };
  return () => new Proxy({}, handler);
}

function makeIndexer(overrides: Record<string, unknown> = {}) {
  return {
    searchForTransactions: chainable(overrides.transactions ?? { transactions: [] }),
    lookupTransactionByID: chainable(overrides.transactionDetail ?? { transaction: null }),
    searchForAssets: chainable(overrides.assets ?? { assets: [] }),
    lookupAssetByID: chainable(overrides.assetDetail ?? { asset: null }),
    lookupAccountCreatedAssets: chainable(overrides.createdAssets ?? { assets: [] }),
    ...(overrides._extra as object),
  };
}

function makeAlgod(overrides: Record<string, unknown> = {}) {
  return {
    status: chainable(overrides.status ?? { lastRound: 100 }),
    accountInformation: chainable(overrides.accountInfo ?? { amount: 1000000, assets: [] }),
  };
}

function makeBridge(indexer?: unknown, algod?: unknown) {
  return {
    getAlgoClients: () => ({
      algodClient: algod ?? makeAlgod(),
      indexerClient: indexer ?? makeIndexer(),
      address: 'TESTADDR',
    }),
  } as unknown as import('../algochat/bridge').AlgoChatBridge;
}

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

// ── Route matching ───────────────────────────────────────────────────

describe('route matching', () => {
  it('returns null for unrelated paths', () => {
    const { req, url } = makeReq('GET', '/api/agents');
    expect(handleBlockExplorerRoutes(req, url, db, makeBridge())).toBeNull();
  });

  it('returns null for non-GET methods', () => {
    const { req, url } = makeReq('POST', '/api/explorer/stats');
    expect(handleBlockExplorerRoutes(req, url, db, makeBridge())).toBeNull();
  });

  it('returns 503 when algochatBridge is null', async () => {
    const { req, url } = makeReq('GET', '/api/explorer/stats');
    const res = await handleBlockExplorerRoutes(req, url, db, null)!;
    expect(res).not.toBeNull();
    expect(res.status).toBe(503);
  });

  it('returns 503 when indexer is null', async () => {
    const bridge = {
      getAlgoClients: () => ({ algodClient: makeAlgod(), indexerClient: null, address: 'X' }),
    } as unknown as import('../algochat/bridge').AlgoChatBridge;
    const { req, url } = makeReq('GET', '/api/explorer/stats');
    const res = await handleBlockExplorerRoutes(req, url, db, bridge)!;
    expect(res).not.toBeNull();
    expect(res.status).toBe(503);
  });
});

// ── GET /api/explorer/stats ──────────────────────────────────────────

describe('GET /api/explorer/stats', () => {
  it('returns stats object', async () => {
    const indexer = makeIndexer({
      assets: { assets: [{ index: 1, params: { 'unit-name': 'CRVMEM' } }] },
    });
    const algod = makeAlgod({ status: { lastRound: 42 } });
    const { req, url } = makeReq('GET', '/api/explorer/stats');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer, algod))!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.latestRound).toBe(42);
    expect(typeof data.crvmemCount).toBe('number');
    expect(typeof data.walletCount).toBe('number');
  });
});

// ── GET /api/explorer/transactions ───────────────────────────────────

describe('GET /api/explorer/transactions', () => {
  it('returns empty list', async () => {
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge())!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactions).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('maps payment transactions', async () => {
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'TX1',
            sender: 'ALICE',
            'tx-type': 'pay',
            'confirmed-round': 10,
            'round-time': 1700000000,
            fee: 1000,
            note: btoa(new Array(100).fill('x').join('')), // 100 bytes → algochat
            'payment-transaction': { receiver: 'BOB', amount: 5000 },
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.transactions.length).toBe(1);
    expect(data.transactions[0].txid).toBe('TX1');
    expect(data.transactions[0].sender).toBe('ALICE');
    expect(data.transactions[0].receiver).toBe('BOB');
    expect(data.transactions[0].amount).toBe(5000);
    expect(data.transactions[0].round).toBe(10);
  });

  it('maps asset config transactions with CRVMEM', async () => {
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'TX2',
            sender: 'CREATOR',
            'tx-type': 'acfg',
            fee: 1000,
            'asset-config-transaction': {
              params: { 'unit-name': 'CRVMEM' },
            },
            'created-asset-index': 99,
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.transactions[0].type).toBe('memory');
    expect(data.transactions[0].unitName).toBe('CRVMEM');
    expect(data.transactions[0].asaId).toBe(99);
  });

  it('filters by type=message', async () => {
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'MSG1',
            sender: 'A',
            'tx-type': 'pay',
            note: btoa(new Array(100).fill('x').join('')),
            'payment-transaction': { receiver: 'B', amount: 0 },
          },
          {
            id: 'OTHER',
            sender: 'A',
            'tx-type': 'pay',
            'payment-transaction': { receiver: 'B', amount: 100 },
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions?type=message');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    // Only the one with algochat note passes the message filter
    expect(data.transactions.length).toBe(1);
    expect(data.transactions[0].txid).toBe('MSG1');
  });
});

// ── GET /api/explorer/transactions/:txid ─────────────────────────────

describe('GET /api/explorer/transactions/:txid', () => {
  it('returns a single transaction', async () => {
    const indexer = makeIndexer({
      transactionDetail: {
        transaction: {
          id: 'TXDETAIL',
          sender: 'ALICE',
          'tx-type': 'pay',
          'payment-transaction': { receiver: 'BOB', amount: 1000 },
        },
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions/TXDETAIL');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transaction.txid).toBe('TXDETAIL');
  });

  it('returns 404 when transaction is not found', async () => {
    const indexer = makeIndexer({ transactionDetail: { transaction: null } });
    const { req, url } = makeReq('GET', '/api/explorer/transactions/NOTFOUND');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    expect(res.status).toBe(404);
  });
});

// ── GET /api/explorer/assets ─────────────────────────────────────────

describe('GET /api/explorer/assets', () => {
  it('returns empty list', async () => {
    const { req, url } = makeReq('GET', '/api/explorer/assets');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge())!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.assets).toEqual([]);
  });

  it('maps assets correctly', async () => {
    const indexer = makeIndexer({
      assets: {
        assets: [
          {
            index: 42,
            params: { 'unit-name': 'CRVMEM', name: 'my-memory', creator: 'CREATOR1', total: 1, decimals: 0 },
            deleted: false,
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/assets');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.assets.length).toBeGreaterThanOrEqual(1);
    const mem = data.assets.find((a: { id: number }) => a.id === 42);
    expect(mem).toBeDefined();
    expect(mem.type).toBe('CRVMEM');
    expect(mem.name).toBe('my-memory');
  });
});

// ── GET /api/explorer/assets/:id ─────────────────────────────────────

describe('GET /api/explorer/assets/:id', () => {
  it('returns asset detail with history', async () => {
    const arc69Note = btoa(JSON.stringify({ standard: 'arc69', description: 'test' }));
    const indexer = makeIndexer({
      assetDetail: {
        asset: {
          index: 7,
          params: { 'unit-name': 'CRVMEM', name: 'test-asset', creator: 'C1', total: 1, decimals: 0 },
        },
      },
      transactions: {
        transactions: [{ id: 'ACFG1', sender: 'C1', 'confirmed-round': 5, note: arc69Note }],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/assets/7');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.asset.id).toBe(7);
    expect(data.asset.history.length).toBe(1);
    expect(data.asset.metadata).toBeDefined();
    expect(data.asset.metadata.standard).toBe('arc69');
  });

  it('returns 404 for non-existent asset', async () => {
    const indexer = makeIndexer({ assetDetail: { asset: null } });
    const { req, url } = makeReq('GET', '/api/explorer/assets/999');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    expect(res.status).toBe(404);
  });
});

// ── GET /api/explorer/wallets ────────────────────────────────────────

describe('GET /api/explorer/wallets', () => {
  it('returns empty list when no wallets', async () => {
    const { req, url } = makeReq('GET', '/api/explorer/wallets');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge())!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wallets).toEqual([]);
    expect(data.total).toBe(0);
  });
});

// ── GET /api/explorer/wallets/:address ───────────────────────────────

describe('GET /api/explorer/wallets/:address', () => {
  it('returns wallet detail', async () => {
    const algod = makeAlgod({ accountInfo: { amount: 5000000, assets: [{ 'asset-id': 1 }] } });
    const indexer = makeIndexer({
      transactions: { transactions: [] },
      createdAssets: { assets: [] },
    });
    const { req, url } = makeReq('GET', '/api/explorer/wallets/TESTADDR123');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer, algod))!;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wallet.address).toBe('TESTADDR123');
    expect(data.wallet.balance).toBe(5000000);
    expect(data.wallet.totalAssets).toBe(1);
  });
});

// ── Note decoding (via transaction mapping) ──────────────────────────

describe('note decoding', () => {
  it('decodes ARC-69 notes', async () => {
    const arc69 = { standard: 'arc69', description: 'A memory', properties: { key: 'k', agent_id: 'a' } };
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'ARC69TX',
            sender: 'S',
            'tx-type': 'acfg',
            note: btoa(JSON.stringify(arc69)),
            'asset-config-transaction': { params: {} },
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.transactions[0].noteType).toBe('arc69');
    expect(data.transactions[0].decodedNote.standard).toBe('arc69');
    // Has memory-like properties → classified as memory
    expect(data.transactions[0].type).toBe('memory');
  });

  it('classifies binary notes as algochat', async () => {
    // 100+ random bytes encoded as base64
    const binaryNote = btoa(String.fromCharCode(...new Array(100).fill(0).map((_, i) => (i * 7 + 13) % 256)));
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'BINTX',
            sender: 'S',
            'tx-type': 'pay',
            note: binaryNote,
            'payment-transaction': { receiver: 'R', amount: 0 },
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.transactions[0].noteType).toBe('algochat');
  });

  it('classifies empty notes as none', async () => {
    const indexer = makeIndexer({
      transactions: {
        transactions: [
          {
            id: 'EMPTYTX',
            sender: 'S',
            'tx-type': 'pay',
            'payment-transaction': { receiver: 'R', amount: 0 },
          },
        ],
      },
    });
    const { req, url } = makeReq('GET', '/api/explorer/transactions');
    const res = await handleBlockExplorerRoutes(req, url, db, makeBridge(indexer))!;
    const data = await res.json();
    expect(data.transactions[0].noteType).toBe('none');
  });
});
