/**
 * Block Explorer API routes
 *
 * Exposes on-chain Algorand data through the indexer for a block explorer UI.
 * All routes are prefixed with /api/explorer/.
 *
 * Endpoints:
 *   GET /api/explorer/transactions        — paginated transactions with decoded payloads
 *   GET /api/explorer/transactions/:txid  — single transaction detail
 *   GET /api/explorer/assets              — paginated CRVMEM/CRVLIB ASAs with metadata
 *   GET /api/explorer/assets/:id          — single ASA detail with history
 *   GET /api/explorer/wallets             — agent wallets with balances and tx counts
 *   GET /api/explorer/wallets/:address    — wallet detail with balance, transactions, assets
 *   GET /api/explorer/stats               — overview stats
 */
import type { Database } from 'bun:sqlite';
import type { AlgoChatBridge } from '../algochat/bridge';
import { getWalletSummaries } from '../db/algochat-messages';
import { json, safeNumParam } from '../lib/response';

// ── Types ──────────────────────────────────────────────────────────

export interface Arc69Note {
  standard: 'arc69';
  description?: string;
  mime_type?: string;
  properties?: Record<string, unknown>;
}

export type ExplorerTxType = 'message' | 'memory' | 'library' | 'unknown';
export type ExplorerNoteType = 'algochat' | 'arc69' | 'none' | 'other';

export interface ExplorerTransaction {
  txid: string;
  type: ExplorerTxType;
  sender: string;
  receiver?: string;
  round?: number;
  roundTime?: number;
  fee?: number;
  amount?: number;
  noteType: ExplorerNoteType;
  decodedNote?: Arc69Note;
  asaId?: number;
  unitName?: string;
}

export interface ExplorerAsset {
  id: number;
  name?: string;
  unitName?: string;
  type: 'CRVMEM' | 'CRVLIB' | 'other';
  creator?: string;
  total?: number;
  decimals?: number;
  deleted?: boolean;
  metadata?: Arc69Note;
}

export interface ExplorerAssetDetail extends ExplorerAsset {
  history: Array<{
    txid: string;
    round?: number;
    roundTime?: number;
    sender: string;
    metadata?: Arc69Note;
  }>;
}

export interface ExplorerWallet {
  address: string;
  label?: string;
  balance: number;
  minBalance: number;
  totalAssets: number;
  messageCount: number;
}

export interface ExplorerWalletDetail extends ExplorerWallet {
  recentTransactions: ExplorerTransaction[];
  ownedAssets: ExplorerAsset[];
}

export interface ExplorerStats {
  totalTransactions: number;
  crvmemCount: number;
  crvlibCount: number;
  walletCount: number;
  latestRound?: number;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Decode a base64 note field from an indexer transaction. */
function decodeNote(noteB64: string | undefined): { noteType: ExplorerNoteType; decodedNote?: Arc69Note } {
  if (!noteB64) return { noteType: 'none' };

  let bytes: Uint8Array;
  try {
    const raw = atob(noteB64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  } catch {
    return { noteType: 'other' };
  }

  if (bytes.length === 0) return { noteType: 'none' };

  // Try to parse as JSON (ARC-69)
  try {
    const text = new TextDecoder('utf-8').decode(bytes);
    if (text.trim().startsWith('{')) {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.standard === 'arc69') {
        return { noteType: 'arc69', decodedNote: parsed as unknown as Arc69Note };
      }
    }
  } catch {
    // not JSON
  }

  // Binary note — likely an AlgoChat encrypted envelope (96+ bytes starting with version/algo bytes)
  if (bytes.length >= 64) {
    return { noteType: 'algochat' };
  }

  return { noteType: 'other' };
}

/** Map a raw indexer transaction to an ExplorerTransaction. */
function mapTransaction(tx: Record<string, unknown>): ExplorerTransaction {
  const txid = String(tx.id ?? tx['tx-id'] ?? '');
  const sender = String(tx.sender ?? '');
  const txType = String(tx['tx-type'] ?? tx.txType ?? '');
  const round = typeof tx['confirmed-round'] === 'number' ? tx['confirmed-round'] : undefined;
  const roundTime = typeof tx['round-time'] === 'number' ? tx['round-time'] : undefined;
  const fee = typeof tx.fee === 'number' ? tx.fee : undefined;

  const noteB64 = tx.note as string | undefined;
  const { noteType, decodedNote } = decodeNote(noteB64);

  // Payment transaction fields
  const payTx = tx['payment-transaction'] as Record<string, unknown> | undefined;
  const receiver = payTx ? String(payTx.receiver ?? '') : undefined;
  const amount = payTx ? (typeof payTx.amount === 'number' ? payTx.amount : undefined) : undefined;

  // Asset config transaction fields
  const acfgTx = tx['asset-config-transaction'] as Record<string, unknown> | undefined;
  const asaId =
    acfgTx && typeof acfgTx['asset-id'] === 'number'
      ? acfgTx['asset-id']
      : typeof tx['created-asset-index'] === 'number'
        ? (tx['created-asset-index'] as number)
        : undefined;

  const params = acfgTx?.params as Record<string, unknown> | undefined;
  const unitName = params ? String(params['unit-name'] ?? params.unitName ?? '') || undefined : undefined;

  // Classify transaction type
  let explorerType: ExplorerTxType = 'unknown';
  if (txType === 'pay') {
    explorerType = noteType === 'algochat' ? 'message' : 'unknown';
  } else if (txType === 'acfg') {
    if (unitName === 'CRVMEM') explorerType = 'memory';
    else if (unitName === 'CRVLIB') explorerType = 'library';
    // Also check decoded note properties
    if (explorerType === 'unknown' && decodedNote?.properties) {
      const props = decodedNote.properties;
      if (typeof props === 'object' && 'key' in props && 'agent_id' in props) {
        explorerType = 'memory'; // has memory-like properties
      }
    }
  }

  return {
    txid,
    type: explorerType,
    sender,
    receiver: receiver || undefined,
    round,
    roundTime,
    fee,
    amount,
    noteType,
    decodedNote,
    asaId,
    unitName,
  };
}

/** Map a raw indexer asset to an ExplorerAsset. */
function mapAsset(asset: Record<string, unknown>, metadata?: Arc69Note): ExplorerAsset {
  const id = typeof asset.index === 'number' ? asset.index : Number(asset['asset-id'] ?? 0);
  const params = (asset.params ?? {}) as Record<string, unknown>;
  const unitName = String(params['unit-name'] ?? params.unitName ?? '') || undefined;
  const name = String(params.name ?? '') || undefined;
  const creator = String(params.creator ?? '') || undefined;
  const total = typeof params.total === 'number' ? params.total : undefined;
  const decimals = typeof params.decimals === 'number' ? params.decimals : undefined;
  const deleted = Boolean(asset.deleted);

  let assetType: 'CRVMEM' | 'CRVLIB' | 'other' = 'other';
  if (unitName === 'CRVMEM') assetType = 'CRVMEM';
  else if (unitName === 'CRVLIB') assetType = 'CRVLIB';

  return { id, name, unitName, type: assetType, creator, total, decimals, deleted, metadata };
}

type IndexerClient = import('algosdk').default.Indexer;
type AlgodClient = import('algosdk').default.Algodv2;

// ── Route handler ──────────────────────────────────────────────────

export function handleBlockExplorerRoutes(
  req: Request,
  url: URL,
  db: Database,
  algochatBridge: AlgoChatBridge | null,
): Response | Promise<Response> | null {
  if (!url.pathname.startsWith('/api/explorer')) return null;
  if (req.method !== 'GET') return null;

  if (!algochatBridge) {
    return json({ error: 'AlgoChat not configured — block explorer unavailable' }, 503);
  }

  const clients = algochatBridge.getAlgoClients();
  const { algodClient, indexerClient } = clients;

  if (!indexerClient) {
    return json({ error: 'Indexer not configured — block explorer unavailable' }, 503);
  }

  const path = url.pathname;

  // GET /api/explorer/stats
  if (path === '/api/explorer/stats') {
    return handleStats(indexerClient, algodClient, db);
  }

  // GET /api/explorer/transactions
  if (path === '/api/explorer/transactions') {
    return handleTransactionList(url, indexerClient);
  }

  // GET /api/explorer/transactions/:txid
  const txMatch = path.match(/^\/api\/explorer\/transactions\/([^/]+)$/);
  if (txMatch) {
    return handleTransactionDetail(txMatch[1], indexerClient);
  }

  // GET /api/explorer/assets
  if (path === '/api/explorer/assets') {
    return handleAssetList(url, indexerClient);
  }

  // GET /api/explorer/assets/:id
  const assetMatch = path.match(/^\/api\/explorer\/assets\/(\d+)$/);
  if (assetMatch) {
    return handleAssetDetail(parseInt(assetMatch[1], 10), indexerClient);
  }

  // GET /api/explorer/wallets
  if (path === '/api/explorer/wallets') {
    return handleWalletList(url, db, algodClient);
  }

  // GET /api/explorer/wallets/:address
  const walletMatch = path.match(/^\/api\/explorer\/wallets\/([^/]+)$/);
  if (walletMatch) {
    return handleWalletDetail(decodeURIComponent(walletMatch[1]), db, algodClient, indexerClient);
  }

  return null;
}

// ── Endpoint implementations ───────────────────────────────────────

async function handleTransactionList(url: URL, indexer: IndexerClient): Promise<Response> {
  try {
    const limit = Math.min(safeNumParam(url.searchParams.get('limit'), 50), 200);
    const type = url.searchParams.get('type'); // message | memory | library
    const sender = url.searchParams.get('sender');
    const receiver = url.searchParams.get('receiver');
    const fromRound = url.searchParams.get('from_round');
    const toRound = url.searchParams.get('to_round');
    const nextToken = url.searchParams.get('next') ?? undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = indexer.searchForTransactions().limit(limit);

    if (nextToken) query = query.nextToken(nextToken);

    if (sender) query = query.address(sender).addressRole('sender');
    else if (receiver) query = query.address(receiver).addressRole('receiver');

    if (fromRound) query = query.minRound(parseInt(fromRound, 10));
    if (toRound) query = query.maxRound(parseInt(toRound, 10));

    // Filter by type
    if (type === 'message') {
      query = query.txType('pay');
    } else if (type === 'memory' || type === 'library') {
      query = query.txType('acfg');
    }

    const response = await query.do();
    const rawTxns = (response.transactions ?? []) as unknown as Array<Record<string, unknown>>;
    let transactions = rawTxns.map(mapTransaction);

    // Post-filter by type if needed (indexer can't filter CRVMEM vs CRVLIB by type alone)
    if (type === 'memory') {
      transactions = transactions.filter((t) => t.type === 'memory' || t.unitName === 'CRVMEM');
    } else if (type === 'library') {
      transactions = transactions.filter((t) => t.type === 'library' || t.unitName === 'CRVLIB');
    } else if (type === 'message') {
      transactions = transactions.filter((t) => t.type === 'message' || t.noteType === 'algochat');
    }

    return json({
      transactions,
      total: transactions.length,
      limit,
      nextToken: (response['next-token'] as string | undefined) ?? null,
    });
  } catch (err) {
    return json({ error: 'Failed to query transactions', detail: String(err) }, 500);
  }
}

async function handleTransactionDetail(txid: string, indexer: IndexerClient): Promise<Response> {
  try {
    const response = await indexer.lookupTransactionByID(txid).do();
    const tx = response.transaction as unknown as Record<string, unknown> | undefined;
    if (!tx) return json({ error: 'Transaction not found' }, 404);

    const mapped = mapTransaction(tx);
    return json({ transaction: mapped });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return json({ error: 'Transaction not found' }, 404);
    }
    return json({ error: 'Failed to fetch transaction', detail: msg }, 500);
  }
}

async function handleAssetList(url: URL, indexer: IndexerClient): Promise<Response> {
  try {
    const limit = Math.min(safeNumParam(url.searchParams.get('limit'), 50), 200);
    const type = url.searchParams.get('type'); // CRVMEM | CRVLIB
    const creator = url.searchParams.get('creator');
    const search = url.searchParams.get('search');

    const unitNames = type === 'CRVMEM' ? ['CRVMEM'] : type === 'CRVLIB' ? ['CRVLIB'] : ['CRVMEM', 'CRVLIB'];
    const allAssets: ExplorerAsset[] = [];

    for (const unit of unitNames) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = indexer.searchForAssets().unit(unit).limit(limit);
      if (creator) query = query.creator(creator);

      const response = await query.do();
      const rawAssets = (response.assets ?? []) as unknown as Array<Record<string, unknown>>;

      for (const raw of rawAssets) {
        const asset = mapAsset(raw);
        if (search) {
          const haystack = `${asset.name ?? ''} ${asset.unitName ?? ''} ${asset.creator ?? ''}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) continue;
        }
        allAssets.push(asset);
        if (allAssets.length >= limit) break;
      }

      if (allAssets.length >= limit) break;
    }

    return json({ assets: allAssets, total: allAssets.length, limit });
  } catch (err) {
    return json({ error: 'Failed to query assets', detail: String(err) }, 500);
  }
}

async function handleAssetDetail(asaId: number, indexer: IndexerClient): Promise<Response> {
  try {
    const assetResp = await indexer.lookupAssetByID(asaId).do();
    const raw = assetResp.asset as unknown as Record<string, unknown> | undefined;
    if (!raw) return json({ error: 'Asset not found' }, 404);

    // Fetch acfg transaction history for this ASA
    const txnResp = await indexer.searchForTransactions().assetID(asaId).txType('acfg').do();
    const txns = (txnResp.transactions ?? []) as unknown as Array<Record<string, unknown>>;

    // Get metadata from the latest acfg note
    let metadata: Arc69Note | undefined;
    if (txns.length > 0) {
      const latestTx = txns[txns.length - 1];
      const { noteType, decodedNote } = decodeNote(latestTx.note as string | undefined);
      if (noteType === 'arc69') metadata = decodedNote;
    }

    const base = mapAsset(raw, metadata);

    const history = txns.map((tx) => {
      const { decodedNote } = decodeNote(tx.note as string | undefined);
      return {
        txid: String(tx.id ?? tx['tx-id'] ?? ''),
        round: typeof tx['confirmed-round'] === 'number' ? tx['confirmed-round'] : undefined,
        roundTime: typeof tx['round-time'] === 'number' ? tx['round-time'] : undefined,
        sender: String(tx.sender ?? ''),
        metadata: decodedNote,
      };
    });

    const detail: ExplorerAssetDetail = { ...base, history };
    return json({ asset: detail });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
      return json({ error: 'Asset not found' }, 404);
    }
    return json({ error: 'Failed to fetch asset', detail: msg }, 500);
  }
}

async function handleWalletList(url: URL, db: Database, algodClient: AlgodClient): Promise<Response> {
  try {
    const limit = Math.min(safeNumParam(url.searchParams.get('limit'), 50), 200);
    const offset = safeNumParam(url.searchParams.get('offset'), 0);
    const search = url.searchParams.get('search') ?? undefined;

    const summaries = getWalletSummaries(db, { search });
    const page = summaries.slice(offset, offset + limit);

    const wallets: ExplorerWallet[] = await Promise.all(
      page.map(async (s) => {
        let balance = 0;
        let minBalance = 0;
        let totalAssets = 0;
        try {
          const info = await algodClient.accountInformation(s.address).do();
          balance = Number(info.amount ?? 0);
          const assetCount = Array.isArray(info.assets) ? info.assets.length : 0;
          minBalance = (1 + assetCount) * 100_000;
          totalAssets = assetCount;
        } catch {
          // best-effort — leave at 0 if account not found
        }
        return {
          address: s.address,
          label: s.label || undefined,
          balance,
          minBalance,
          totalAssets,
          messageCount: s.messageCount,
        };
      }),
    );

    return json({ wallets, total: summaries.length, limit, offset });
  } catch (err) {
    return json({ error: 'Failed to fetch wallets', detail: String(err) }, 500);
  }
}

async function handleWalletDetail(
  address: string,
  db: Database,
  algodClient: AlgodClient,
  indexer: IndexerClient,
): Promise<Response> {
  try {
    // Fetch on-chain account info
    let balance = 0;
    let minBalance = 0;
    let totalAssets = 0;
    let ownedAssets: ExplorerAsset[] = [];

    try {
      const info = await algodClient.accountInformation(address).do();
      balance = Number(info.amount ?? 0);
      const acctAssets = Array.isArray(info.assets) ? info.assets : [];
      totalAssets = acctAssets.length;
      minBalance = (1 + totalAssets) * 100_000;
    } catch {
      // account may not exist on-chain
    }

    // Fetch assets created by this address
    try {
      const createdResp = await indexer.lookupAccountCreatedAssets(address).do();
      const rawAssets = (createdResp.assets ?? []) as unknown as Array<Record<string, unknown>>;
      ownedAssets = rawAssets
        .map((a) => mapAsset(a))
        .filter((a) => a.type === 'CRVMEM' || a.type === 'CRVLIB')
        .slice(0, 50);
    } catch {
      // best-effort
    }

    // Fetch recent transactions from indexer
    let recentTransactions: ExplorerTransaction[] = [];
    try {
      const txnResp = await indexer.searchForTransactions().address(address).limit(20).do();
      const rawTxns = (txnResp.transactions ?? []) as unknown as Array<Record<string, unknown>>;
      recentTransactions = rawTxns.map(mapTransaction);
    } catch {
      // best-effort
    }

    // DB summary for message count
    const summaries = getWalletSummaries(db, { search: address });
    const dbSummary = summaries.find((s) => s.address === address);

    const detail: ExplorerWalletDetail = {
      address,
      label: dbSummary?.label || undefined,
      balance,
      minBalance,
      totalAssets,
      messageCount: dbSummary?.messageCount ?? 0,
      recentTransactions,
      ownedAssets,
    };

    return json({ wallet: detail });
  } catch (err) {
    return json({ error: 'Failed to fetch wallet detail', detail: String(err) }, 500);
  }
}

async function handleStats(indexer: IndexerClient, algodClient: AlgodClient, db: Database): Promise<Response> {
  try {
    const stats: ExplorerStats = {
      totalTransactions: 0,
      crvmemCount: 0,
      crvlibCount: 0,
      walletCount: 0,
    };

    // Get current round from algod
    try {
      const status = await algodClient.status().do();
      stats.latestRound = Number(status.lastRound ?? status.nextVersionRound ?? 0);
    } catch {
      // best-effort
    }

    // Count CRVMEM and CRVLIB ASAs
    try {
      const crvmemResp = await indexer.searchForAssets().unit('CRVMEM').do();
      stats.crvmemCount = (crvmemResp.assets ?? []).length;
    } catch {
      // best-effort
    }

    try {
      const crvlibResp = await indexer.searchForAssets().unit('CRVLIB').do();
      stats.crvlibCount = (crvlibResp.assets ?? []).length;
    } catch {
      // best-effort
    }

    // Wallet count from DB
    try {
      const wallets = getWalletSummaries(db);
      stats.walletCount = wallets.length;
    } catch {
      // best-effort
    }

    // Total transactions approximation: get from indexer status if possible
    try {
      const txnResp = await indexer.searchForTransactions().limit(1).do();
      // The indexer doesn't give a total count directly, so we leave at 0
      // unless we can get it from the response
      const txnRespAny = txnResp as unknown as Record<string, unknown>;
      if (typeof txnRespAny['current-round'] === 'number') {
        stats.latestRound = stats.latestRound ?? Number(txnRespAny['current-round']);
      }
    } catch {
      // best-effort
    }

    return json(stats);
  } catch (err) {
    return json({ error: 'Failed to fetch stats', detail: String(err) }, 500);
  }
}
